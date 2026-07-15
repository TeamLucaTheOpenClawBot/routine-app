import { useEffect, useMemo, useRef, useState } from 'react';
import { PALETTE, ICON_KEYS, WEEKDAYS, TODAY, addDays, startOfWeek, formatDateKey, evaluateWeek, buildInitialRoutines, createSeedChecks } from './appLogic';

const ICONS = {
  dumbbell: [{ d: 'M6.5 12h11' }, { d: 'M6.5 8.5v7' }, { d: 'M4 10v4' }, { d: 'M17.5 8.5v7' }, { d: 'M20 10v4' }],
  wine: [{ d: 'M8 3.5h8l-.6 4.7a3.4 3.4 0 0 1-6.8 0L8 3.5z' }, { d: 'M12 13.4v5.6' }, { d: 'M8.7 19h6.6' }],
  drop: [{ d: 'M12 3.8c0 0 5.7 6.1 5.7 10.2a5.7 5.7 0 0 1-11.4 0c0-4.1 5.7-10.2 5.7-10.2z' }],
  book: [{ d: 'M12 6.2c-1.7-1.1-3.8-1.6-6.2-1.5v12.6c2.4-.1 4.5.4 6.2 1.5 1.7-1.1 3.8-1.6 6.2-1.5V4.7c-2.4-.1-4.5.4-6.2 1.5z' }, { d: 'M12 6.2v12.6' }],
  moon: [{ d: 'M20 14.8A8 8 0 1 1 9.2 4a6.4 6.4 0 0 0 10.8 10.8z' }],
  leaf: [{ d: 'M5 19c0-7.7 6-13 14-13 0 7.7-6 13-14 13z' }, { d: 'M5.5 18.5c2.8-4 5.8-6.2 9-7.3' }],
  run: [{ c: [15.5, 5, 1.7] }, { d: 'M4 20.5l3.2-4.2 3 1.1 1.8-3.2' }, { d: 'M8.5 10.2l4-1 3 3 3.2 1' }, { d: 'M12.5 9.2l-1.2 4' }],
  pencil: [{ d: 'M4 20l4-1L19 8a2 2 0 0 0-3-3L5 16l-1 4z' }, { d: 'M14.5 6.5l3 3' }],
  trashbin: [{ d: 'M5 7h14' }, { d: 'M9 7V5h6v2' }, { d: 'M6.6 7l.8 12a1 1 0 0 0 1 1h7.2a1 1 0 0 0 1-1l.8-12' }, { d: 'M10 11v6' }, { d: 'M14 11v6' }],
};

const ONBOARD_STEPS = [
  { n: '1', title: '루틴 만들기', desc: '아이콘 · 색 · 주간 목표 설정' },
  { n: '2', title: '매일 탭해서 체크', desc: '날짜를 눌러 완료 표시' },
  { n: '3', title: '주간 목표 달성', desc: '채운 주는 캘린더에 빛나요' },
];

function rgba(hex, alpha) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function Icon({ name, size = 20, color = '#0EA5A4', strokeWidth = 2 }) {
  const defs = ICONS[name] || ICONS.leaf;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
      {defs.map((item, index) =>
        item.c ? <circle key={index} cx={item.c[0]} cy={item.c[1]} r={item.c[2]} /> : <path key={index} d={item.d} />,
      )}
    </svg>
  );
}

function App() {
  const [routines, setRoutines] = useState(() => buildInitialRoutines());
  const [checks, setChecks] = useState(() => createSeedChecks(buildInitialRoutines()));
  const [sheetDay, setSheetDay] = useState(null);
  const [showManager, setShowManager] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const target = node.querySelector('[data-current="1"]');
    if (target) {
      node.scrollTop = Math.max(0, target.offsetTop - 96);
    }
  }, [routines]);

  const visibleRoutines = routines.filter((routine) => routine.visible);
  const currentWeekStart = startOfWeek(TODAY);

  const weeks = useMemo(() => {
    const rangeStart = startOfWeek(addDays(TODAY, -8 * 7));
    const result = [];
    let prevMonthKey = null;
    for (let weekIndex = 0; weekIndex < 11; weekIndex += 1) {
      const start = addDays(rangeStart, weekIndex * 7);
      const end = addDays(start, 6);
      const isCurrent = start <= TODAY && TODAY <= end;
      const finalized = end < TODAY;
      const achieved = [];
      visibleRoutines.forEach((routine) => {
        let count = 0;
        for (let day = 0; day < 7; day += 1) {
          const key = formatDateKey(addDays(start, day));
          if (checks[key]?.[routine.id]) count += 1;
        }
        const success = finalized && (routine.goalType === 'atLeast' ? count >= routine.goalCount : count <= routine.goalCount);
        if (success) achieved.push(routine);
      });
      const days = [];
      for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
        const date = addDays(start, dayIndex);
        const key = formatDateKey(date);
        const isToday = key === formatDateKey(TODAY);
        const isFuture = date > TODAY;
        const icons = isFuture ? [] : visibleRoutines.map((routine) => {
          const done = Boolean(checks[key]?.[routine.id]);
          const glow = finalized && done && Boolean(achieved.find((item) => item.id === routine.id));
          return {
            done,
            glow,
            routine,
          };
        });
        days.push({ date, key, isToday, isFuture, icons });
      }
      const monthKey = `${start.getFullYear()}-${start.getMonth()}`;
      const hasDivider = prevMonthKey === null || monthKey !== prevMonthKey;
      prevMonthKey = monthKey;
      result.push({ start, end, isCurrent, finalized, achieved, days, hasDivider, dividerLabel: `${start.getMonth() + 1}월`, rangeLabel: `${start.getMonth() + 1}.${start.getDate()} – ${end.getMonth() + 1}.${end.getDate()}` });
    }
    return result;
  }, [checks, visibleRoutines]);

  const headerStatText = useMemo(() => {
    if (routines.length === 0) return '루틴을 추가해 시작하세요';
    if (visibleRoutines.length === 0) return '표시된 루틴이 없어요';
    let completed = 0;
    visibleRoutines.forEach((routine) => {
      let count = 0;
      for (let day = 0; day < 7; day += 1) {
        const key = formatDateKey(addDays(currentWeekStart, day));
        if (checks[key]?.[routine.id]) count += 1;
      }
      const success = routine.goalType === 'atLeast' ? count >= routine.goalCount : count <= routine.goalCount;
      if (success) completed += 1;
    });
    return `이번 주 ${completed}/${visibleRoutines.length} 순항 중`;
  }, [checks, currentWeekStart, routines.length, visibleRoutines]);

  const sheetRows = useMemo(() => {
    if (!sheetDay) return [];
    return visibleRoutines.map((routine) => ({
      routine,
      done: Boolean(checks[sheetDay]?.[routine.id]),
    }));
  }, [checks, sheetDay, visibleRoutines]);

  const statsRows = useMemo(() => visibleRoutines.map((routine) => {
    const results = [];
    for (let weekIndex = 0; weekIndex < 8; weekIndex += 1) {
      const start = addDays(startOfWeek(addDays(TODAY, -8 * 7)), weekIndex * 7);
      let count = 0;
      for (let day = 0; day < 7; day += 1) {
        const key = formatDateKey(addDays(start, day));
        if (checks[key]?.[routine.id]) count += 1;
      }
      const success = routine.goalType === 'atLeast' ? count >= routine.goalCount : count <= routine.goalCount;
      results.push(success);
    }
    const achieved = results.filter(Boolean).length;
    const rate = Math.round((achieved / results.length) * 100);
    let streak = 0;
    for (let index = results.length - 1; index >= 0; index -= 1) {
      if (!results[index]) break;
      streak += 1;
    }
    return { routine, rate, streak };
  }), [checks, visibleRoutines]);

  const toggleCheck = (key, routineId) => {
    setChecks((prev) => {
      const next = { ...prev };
      const day = { ...(next[key] || {}) };
      if (day[routineId]) delete day[routineId]; else day[routineId] = true;
      if (Object.keys(day).length) next[key] = day; else delete next[key];
      return next;
    });
  };

  const updateRoutine = (routineId, patch) => {
    setRoutines((prev) => prev.map((routine) => (routine.id === routineId ? { ...routine, ...patch } : routine)));
  };

  const toggleVisible = (routineId) => {
    setRoutines((prev) => prev.map((routine) => (routine.id === routineId ? { ...routine, visible: !routine.visible } : routine)));
  };

  const setGoalType = (routineId, goalType) => {
    setRoutines((prev) => prev.map((routine) => {
      if (routine.id !== routineId) return routine;
      const nextCount = goalType === 'atLeast' ? Math.max(1, routine.goalCount) : Math.max(0, routine.goalCount);
      return { ...routine, goalType, goalCount: nextCount };
    }));
  };

  const adjustGoal = (routineId, delta) => {
    setRoutines((prev) => prev.map((routine) => {
      if (routine.id !== routineId) return routine;
      const min = routine.goalType === 'atLeast' ? 1 : 0;
      return { ...routine, goalCount: Math.max(min, Math.min(7, routine.goalCount + delta)) };
    }));
  };

  const addRoutine = () => {
    if (routines.length >= 5) return;
    const usedColors = new Set(routines.map((routine) => routine.color));
    const color = PALETTE.find((item) => !usedColors.has(item)) || PALETTE[routines.length % PALETTE.length];
    const usedIcons = new Set(routines.map((routine) => routine.iconKey));
    const iconKey = ICON_KEYS.find((item) => !usedIcons.has(item)) || 'leaf';
    const next = {
      id: `r${Date.now()}`,
      name: '새 루틴',
      iconKey,
      color,
      goalType: 'atLeast',
      goalCount: 3,
      visible: true,
    };
    setRoutines((prev) => [...prev, next]);
  };

  const deleteRoutine = (routineId) => {
    if (routines.length <= 1) return;
    setRoutines((prev) => prev.filter((routine) => routine.id !== routineId));
  };

  const goalLabel = (routine) => routine.goalType === 'atLeast' ? `주 ${routine.goalCount}회 이상` : `주 ${routine.goalCount}회 이하`;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '32px 20px 64px', background: 'var(--color-bg)' }}>
      <div style={{ width: 390, height: 844, background: 'var(--color-bg)', borderRadius: 44, border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-lg)', overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-sans)', color: 'var(--color-text)' }}>
        <div style={{ height: 44, flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 26px', fontSize: 13, fontWeight: 700, color: 'var(--color-text)', background: 'var(--color-surface)' }}>
          <span>9:41</span>
          <span style={{ display: 'flex', gap: 7, alignItems: 'center', fontSize: 12, fontWeight: 800 }}>5G</span>
        </div>
        <div style={{ flex: '0 0 auto', padding: '8px 18px 12px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8, background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em' }}>{TODAY.getFullYear()}년 {TODAY.getMonth() + 1}월</div>
            <div style={{ fontSize: 12.5, color: 'var(--color-muted)', marginTop: 3, fontWeight: 600 }}>{headerStatText}</div>
          </div>
          <div style={{ display: 'flex', gap: 7, flex: '0 0 auto' }}>
            <button type="button" onClick={() => { setShowStats(true); setShowManager(false); setSheetDay(null); }} style={{ cursor: 'pointer', padding: '8px 12px', borderRadius: 10, background: 'var(--color-bg)', color: 'var(--color-muted)', fontSize: 13, fontWeight: 700 }}>통계</button>
            <button type="button" onClick={() => { setShowManager(true); setShowStats(false); setSheetDay(null); }} style={{ cursor: 'pointer', padding: '8px 13px', borderRadius: 10, background: 'var(--color-primary)', color: '#fff', fontSize: 13, fontWeight: 700 }}>관리</button>
          </div>
        </div>
        <div ref={scrollRef} style={{ flex: '1 1 auto', overflowY: 'auto', position: 'relative', paddingBottom: 20 }}>
          {routines.length === 0 ? (
            <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '32px 30px', gap: 18 }}>
              <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>매일의 루틴,<br />한 눈에 채워보세요</div>
              <div style={{ fontSize: 13.5, color: 'var(--color-muted)', lineHeight: 1.5 }}>루틴을 만들고 체크하면 주간 목표가 캘린더에 쌓여요</div>
              {ONBOARD_STEPS.map((step) => (
                <div key={step.n} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 16, padding: '13px 15px', textAlign: 'left' }}>
                  <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--color-primary-50)', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14 }}>{step.n}</div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{step.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 1 }}>{step.desc}</div>
                  </div>
                </div>
              ))}
              <button type="button" onClick={addRoutine} style={{ width: '100%', minHeight: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--gradient-brand, linear-gradient(135deg, #0ea5a4, #16a34a))', color: '#fff', fontSize: 17, fontWeight: 800, borderRadius: 16, boxShadow: 'var(--shadow-md)' }}>첫 루틴 만들기</button>
            </div>
          ) : (
            <div style={{ padding: '12px 12px 26px', display: 'flex', flexDirection: 'column', gap: 11 }}>
              {weeks.map((week) => (
                <div key={`${week.start.toISOString()}-${week.end.toISOString()}`} data-current={week.isCurrent ? '1' : '0'} style={{ background: 'var(--color-surface)', border: week.isCurrent ? '1.5px solid var(--color-primary)' : '1px solid var(--color-border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-sm)', padding: '13px 13px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 11 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 800 }}>{week.rangeLabel}</span>
                    {week.isCurrent && <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--color-primary)', background: 'var(--color-primary-50)', padding: '2px 8px', borderRadius: 999 }}>이번 주</span>}
                    <div style={{ flex: 1 }} />
                    <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                      {week.achieved.map((routine) => (
                        <div key={routine.id} style={{ width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: rgba(routine.color, 0.16), boxShadow: `0 0 0 1.5px ${rgba(routine.color, 0.85)}, 0 0 9px ${rgba(routine.color, 0.5)}`, animation: 'glowPulse 2.6s ease-in-out infinite' }}>
                          <Icon name={routine.iconKey} size={13} color={routine.color} strokeWidth={2.2} />
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
                    {week.days.map((day) => (
                      <div key={day.key} onClick={() => !day.isFuture && setSheetDay(day.key)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, padding: '4px 0 6px', borderRadius: 10, cursor: day.isFuture ? 'default' : 'pointer', background: day.isToday ? 'var(--color-primary-50)' : 'transparent' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: day.isFuture ? '#CBD5E1' : (day.date.getDay() === 0 ? '#E11D48' : (day.date.getDay() === 6 ? '#2563EB' : 'var(--color-muted)')) }}>{WEEKDAYS[day.date.getDay()]}</span>
                        <div style={{ width: 22, height: 22, borderRadius: '50%', background: day.isToday ? 'var(--color-primary)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '1px 0' }}>
                          <span style={{ fontSize: 12.5, fontWeight: 800, color: day.isToday ? '#fff' : (day.isFuture ? '#CBD5E1' : (day.date.getDay() === 0 ? '#E11D48' : (day.date.getDay() === 6 ? '#2563EB' : 'var(--color-text)'))) }}>{day.date.getDate()}</span>
                        </div>
                        {day.icons.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, justifyContent: 'center', alignContent: 'flex-start', marginTop: 2, width: '100%' }}>
                          {day.icons.map((icon) => (
                            <div key={icon.routine.id} style={{ width: 18, height: 18, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', background: icon.done ? rgba(icon.routine.color, 0.15) : 'transparent', boxShadow: icon.glow ? `0 0 0 1.5px ${rgba(icon.routine.color, 0.9)}, 0 0 8px ${rgba(icon.routine.color, 0.5)}` : 'none', animation: icon.glow ? 'glowPulse 2.6s ease-in-out infinite' : 'none' }}>
                              <Icon name={icon.routine.iconKey} size={12} color={icon.done ? icon.routine.color : '#CBD5E1'} strokeWidth={2} />
                            </div>
                          ))}
                        </div>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        {sheetDay && (
          <>
            <div onClick={() => setSheetDay(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(15, 23, 42, 0.34)', zIndex: 15 }} />
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, background: 'var(--color-surface)', borderTopLeftRadius: 26, borderTopRightRadius: 26, boxShadow: 'var(--shadow-lg)', zIndex: 20, padding: '10px 18px 22px', display: 'flex', flexDirection: 'column', maxHeight: '84%' }}>
              <div style={{ width: 40, height: 4, borderRadius: 999, background: 'var(--color-border)', margin: '2px auto 12px' }} />
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 19, fontWeight: 800 }}>{new Date(sheetDay).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--color-muted)', marginTop: 2, fontWeight: 600 }}>{new Date(sheetDay).toLocaleDateString('ko-KR', { weekday: 'long' })}</div>
                </div>
                <button type="button" onClick={() => setSheetDay(null)} style={{ cursor: 'pointer', width: 32, height: 32, borderRadius: '50%', background: 'var(--color-bg)', color: 'var(--color-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700 }}>✕</button>
              </div>
              <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {sheetRows.map(({ routine, done }) => (
                  <div key={routine.id} onClick={() => toggleCheck(sheetDay, routine.id)} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '12px 13px', borderRadius: 16, border: '1px solid var(--color-border)', background: done ? rgba(routine.color, 0.07) : 'var(--color-surface)', cursor: 'pointer' }}>
                    <div style={{ width: 40, height: 40, borderRadius: 12, flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', background: rgba(routine.color, done ? 0.16 : 0.1) }}>
                      <Icon name={routine.iconKey} size={22} color={routine.color} strokeWidth={2} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15.5, fontWeight: 700 }}>{routine.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 1 }}>{goalLabel(routine)}</div>
                    </div>
                    <div style={{ width: 30, height: 30, borderRadius: '50%', flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', background: done ? 'var(--color-primary)' : 'transparent', border: done ? 'none' : '2px solid var(--color-field-border)', color: done ? '#fff' : 'transparent' }}>
                      {done && <span style={{ fontSize: 15, fontWeight: 800, lineHeight: 1 }}>✓</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
        {showManager && (
          <>
            <div onClick={() => setShowManager(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(15, 23, 42, 0.34)', zIndex: 15 }} />
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, background: 'var(--color-surface)', borderTopLeftRadius: 26, borderTopRightRadius: 26, boxShadow: 'var(--shadow-lg)', zIndex: 20, padding: '10px 16px 20px', display: 'flex', flexDirection: 'column', maxHeight: '90%' }}>
              <div style={{ width: 40, height: 4, borderRadius: 999, background: 'var(--color-border)', margin: '2px auto 12px' }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ fontSize: 19, fontWeight: 800 }}>루틴 관리</div>
                <button type="button" onClick={() => setShowManager(false)} style={{ cursor: 'pointer', width: 32, height: 32, borderRadius: '50%', background: 'var(--color-bg)', color: 'var(--color-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700 }}>✕</button>
              </div>
              <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 4 }}>
                {routines.map((routine) => (
                  <div key={routine.id} style={{ border: '1px solid var(--color-border)', borderRadius: 16, padding: '13px 13px 14px', background: 'var(--color-surface)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 44, height: 44, borderRadius: 12, flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', background: rgba(routine.color, 0.15) }}><Icon name={routine.iconKey} size={24} color={routine.color} strokeWidth={2} /></div>
                      <input value={routine.name} onChange={(event) => updateRoutine(routine.id, { name: event.target.value })} style={{ flex: 1, minWidth: 0, fontSize: 15.5, fontWeight: 700, color: 'var(--color-text)', border: 'none', background: 'transparent', padding: '4px 0' }} />
                      <button type="button" onClick={() => toggleVisible(routine.id)} style={{ cursor: 'pointer', padding: '6px 10px', borderRadius: 9, fontSize: 12, fontWeight: 700, background: routine.visible ? 'var(--color-primary-50)' : 'var(--color-bg)', color: routine.visible ? 'var(--color-primary)' : 'var(--color-muted)' }}>{routine.visible ? '표시' : '숨김'}</button>
                      <button type="button" onClick={() => deleteRoutine(routine.id)} style={{ cursor: routines.length > 1 ? 'pointer' : 'default', width: 34, height: 34, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg)', opacity: routines.length > 1 ? 1 : 0.35 }}><Icon name="trashbin" size={16} color="#94A3B8" strokeWidth={2} /></button>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
                      <div style={{ display: 'flex', background: 'var(--color-bg)', borderRadius: 10, padding: 3, gap: 2 }}>
                        <button type="button" onClick={() => setGoalType(routine.id, 'atLeast')} style={{ padding: '6px 14px', borderRadius: 8, fontSize: 12.5, fontWeight: 800, cursor: 'pointer', background: routine.goalType === 'atLeast' ? 'var(--color-primary)' : 'transparent', color: routine.goalType === 'atLeast' ? '#fff' : 'var(--color-muted)' }}>이상</button>
                        <button type="button" onClick={() => setGoalType(routine.id, 'atMost')} style={{ padding: '6px 14px', borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', background: routine.goalType === 'atMost' ? 'var(--color-primary)' : 'transparent', color: routine.goalType === 'atMost' ? '#fff' : 'var(--color-muted)' }}>이하</button>
                      </div>
                      <div style={{ flex: 1 }} />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'var(--color-bg)', borderRadius: 10, padding: '4px 6px' }}>
                        <button type="button" onClick={() => adjustGoal(routine.id, -1)} style={{ width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-surface)', border: '1px solid var(--color-border)', fontSize: 17, fontWeight: 800, color: routine.goalCount > (routine.goalType === 'atLeast' ? 1 : 0) ? 'var(--color-text)' : 'var(--color-field-border)', cursor: routine.goalCount > (routine.goalType === 'atLeast' ? 1 : 0) ? 'pointer' : 'default' }}>−</button>
                        <span style={{ fontSize: 15, fontWeight: 800, minWidth: 56, textAlign: 'center', color: 'var(--color-text)' }}>주 {routine.goalCount}회</span>
                        <button type="button" onClick={() => adjustGoal(routine.id, 1)} style={{ width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-surface)', border: '1px solid var(--color-border)', fontSize: 17, fontWeight: 800, color: routine.goalCount < 7 ? 'var(--color-text)' : 'var(--color-field-border)', cursor: routine.goalCount < 7 ? 'pointer' : 'default' }}>+</button>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 7, marginTop: 12, flexWrap: 'wrap' }}>
                      {PALETTE.map((color) => (
                        <button key={color} type="button" onClick={() => updateRoutine(routine.id, { color })} style={{ width: 26, height: 26, borderRadius: '50%', background: color, flex: '0 0 auto', boxShadow: routine.color === color ? `0 0 0 2px #fff, 0 0 0 4px ${color}` : 'none' }} />
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                      {ICON_KEYS.map((iconKey) => (
                        <button key={iconKey} type="button" onClick={() => updateRoutine(routine.id, { iconKey })} style={{ width: 34, height: 34, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flex: '0 0 auto', background: routine.iconKey === iconKey ? rgba(routine.color, 0.15) : 'var(--color-bg)', boxShadow: routine.iconKey === iconKey ? `0 0 0 1.5px ${routine.color}` : 'none' }}><Icon name={iconKey} size={20} color={routine.iconKey === iconKey ? routine.color : '#94A3B8'} strokeWidth={2} /></button>
                      ))}
                    </div>
                  </div>
                ))}
                <button type="button" onClick={addRoutine} disabled={routines.length >= 5} style={{ cursor: routines.length >= 5 ? 'default' : 'pointer', minHeight: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 14, border: '1.5px dashed var(--color-field-border)', color: routines.length >= 5 ? 'var(--color-field-border)' : 'var(--color-primary)', fontSize: 15, fontWeight: 800, background: routines.length >= 5 ? 'var(--color-bg)' : 'var(--color-primary-50)' }}>＋ 루틴 추가 ({routines.length}/5)</button>
              </div>
            </div>
          </>
        )}
        {showStats && (
          <>
            <div onClick={() => setShowStats(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(15, 23, 42, 0.34)', zIndex: 15 }} />
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, background: 'var(--color-surface)', borderTopLeftRadius: 26, borderTopRightRadius: 26, boxShadow: 'var(--shadow-lg)', zIndex: 20, padding: '10px 18px 22px', display: 'flex', flexDirection: 'column', maxHeight: '84%' }}>
              <div style={{ width: 40, height: 4, borderRadius: 999, background: 'var(--color-border)', margin: '2px auto 12px' }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ fontSize: 19, fontWeight: 800 }}>통계</div>
                <button type="button" onClick={() => setShowStats(false)} style={{ cursor: 'pointer', width: 32, height: 32, borderRadius: '50%', background: 'var(--color-bg)', color: 'var(--color-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700 }}>✕</button>
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--color-muted)', marginBottom: 14, fontWeight: 600 }}>최근 8주 기준 · 달성률과 현재 연속</div>
              <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
                {statsRows.map(({ routine, rate, streak }) => (
                  <div key={routine.id}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 9, flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', background: rgba(routine.color, 0.15) }}><Icon name={routine.iconKey} size={18} color={routine.color} strokeWidth={2} /></div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14.5, fontWeight: 700 }}>{routine.name}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--color-muted)', marginTop: 1 }}>{goalLabel(routine)}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 16, fontWeight: 800, color: routine.color }}>{rate}%</div>
                        <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 1 }}>연속 {streak}주</div>
                      </div>
                    </div>
                    <div style={{ height: 8, borderRadius: 999, background: 'var(--color-bg)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${rate}%`, background: routine.color, borderRadius: 999 }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default App;
