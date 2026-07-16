import { useEffect, useMemo, useRef, useState } from 'react';
import {
  PALETTE,
  ICON_KEYS,
  WEEKDAYS,
  TOTAL_WEEKS,
  addDays,
  startOfWeek,
  startOfToday,
  formatDateKey,
  parseDateKey,
  rangeStart,
  weekCount,
  achieved,
  goalText,
  makeNewRoutine,
  finalizedResults,
  achievementRate,
  currentStreak,
  loadState,
  saveState,
  clearState,
} from './appLogic';

// 단색 라인 아이콘(24×24, stroke). 루틴용 + UI용.
const ICONS = {
  activity: [{ d: 'M3 12h3.6l2.2-6.6 4 13.2 2.4-6.6H21' }],
  dumbbell: [{ d: 'M6.5 12h11' }, { d: 'M6.5 8.5v7' }, { d: 'M4 10v4' }, { d: 'M17.5 8.5v7' }, { d: 'M20 10v4' }],
  beer: [{ d: 'M7 9h8v9.6a1.4 1.4 0 0 1-1.4 1.4H8.4A1.4 1.4 0 0 1 7 18.6z' }, { d: 'M15 11h2.1a1.5 1.5 0 0 1 1.5 1.5v2a1.5 1.5 0 0 1-1.5 1.5H15' }, { d: 'M7 9a2 2 0 0 1 .4-3.9 2.1 2.1 0 0 1 3.9-1 2 2 0 0 1 3.3 1.2A1.9 1.9 0 0 1 15 9' }, { d: 'M10 12v5' }, { d: 'M12.4 12v5' }],
  wine: [{ d: 'M8 3.5h8l-.6 4.7a3.4 3.4 0 0 1-6.8 0L8 3.5z' }, { d: 'M12 13.4v5.6' }, { d: 'M8.7 19h6.6' }],
  drop: [{ d: 'M12 3.8c0 0 5.7 6.1 5.7 10.2a5.7 5.7 0 0 1-11.4 0c0-4.1 5.7-10.2 5.7-10.2z' }],
  book: [{ d: 'M12 6.2c-1.7-1.1-3.8-1.6-6.2-1.5v12.6c2.4-.1 4.5.4 6.2 1.5 1.7-1.1 3.8-1.6 6.2-1.5V4.7c-2.4-.1-4.5.4-6.2 1.5z' }, { d: 'M12 6.2v12.6' }],
  moon: [{ d: 'M20 14.8A8 8 0 1 1 9.2 4a6.4 6.4 0 0 0 10.8 10.8z' }],
  leaf: [{ d: 'M5 19c0-7.7 6-13 14-13 0 7.7-6 13-14 13z' }, { d: 'M5.5 18.5c2.8-4 5.8-6.2 9-7.3' }],
  run: [{ c: [15.5, 5, 1.7] }, { d: 'M4 20.5l3.2-4.2 3 1.1 1.8-3.2' }, { d: 'M8.5 10.2l4-1 3 3 3.2 1' }, { d: 'M12.5 9.2l-1.2 4' }],
  pencil: [{ d: 'M4 20l4-1L19 8a2 2 0 0 0-3-3L5 16l-1 4z' }, { d: 'M14.5 6.5l3 3' }],
  trashbin: [{ d: 'M5 7h14' }, { d: 'M9 7V5h6v2' }, { d: 'M6.6 7l.8 12a1 1 0 0 0 1 1h7.2a1 1 0 0 0 1-1l.8-12' }, { d: 'M10 11v6' }, { d: 'M14 11v6' }],
  calendar: [{ d: 'M4.5 6.8a1.6 1.6 0 0 1 1.6-1.6h11.8a1.6 1.6 0 0 1 1.6 1.6v11.6a1.6 1.6 0 0 1-1.6 1.6H6.1a1.6 1.6 0 0 1-1.6-1.6z' }, { d: 'M4.5 9.4h15' }, { d: 'M8.3 3.5v3' }, { d: 'M15.7 3.5v3' }],
  todaycheck: [{ d: 'M4.5 6.8a1.6 1.6 0 0 1 1.6-1.6h11.8a1.6 1.6 0 0 1 1.6 1.6v11.6a1.6 1.6 0 0 1-1.6 1.6H6.1a1.6 1.6 0 0 1-1.6-1.6z' }, { d: 'M4.5 9.4h15' }, { d: 'M8.7 14.7l2.4 2.4 4.4-4.8' }],
  chart: [{ d: 'M5 20V10.5' }, { d: 'M12 20V4.5' }, { d: 'M19 20v-6' }, { d: 'M3.5 20h17' }],
  gear: [{ c: [12, 12, 3] }, { d: 'M12 4.2v2' }, { d: 'M12 17.8v2' }, { d: 'M4.2 12h2' }, { d: 'M17.8 12h2' }, { d: 'M6.6 6.6l1.4 1.4' }, { d: 'M16 16l1.4 1.4' }, { d: 'M17.4 6.6l-1.4 1.4' }, { d: 'M8 16l-1.4 1.4' }],
  plus: [{ d: 'M12 5.5v13' }, { d: 'M5.5 12h13' }],
  chevron: [{ d: 'M9.5 6l6 6-6 6' }],
};

const ONBOARD_STEPS = [
  { n: '1', title: '루틴 만들기', desc: '아이콘 · 색 · 주간 목표 설정' },
  { n: '2', title: '매일 탭해서 체크', desc: '오늘·캘린더에서 완료 표시' },
  { n: '3', title: '주간 목표 달성', desc: '채운 주는 캘린더에 빛나요' },
];

const TABS = [
  { key: 'calendar', label: '캘린더', icon: 'calendar' },
  { key: 'today', label: '오늘', icon: 'todaycheck' },
  { key: 'stats', label: '통계', icon: 'chart' },
  { key: 'settings', label: '설정', icon: 'gear' },
];

const HEAT_EMPTY = 'rgba(148, 163, 184, 0.22)';

function rgba(hex, alpha) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function weekendColor(dow) {
  if (dow === 0) return 'var(--color-sun)';
  if (dow === 6) return 'var(--color-sat)';
  return null;
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

let uidCounter = 100;

function App() {
  // 새로고침 시 복원. 저장 데이터가 없으면(첫 방문) 빈 상태 → 온보딩.
  const [persisted] = useState(loadState);
  const [today, setToday] = useState(() => startOfToday());
  const [routines, setRoutines] = useState(() => persisted?.routines ?? []);
  const [checks, setChecks] = useState(() => persisted?.checks ?? {});
  const [activeTab, setActiveTab] = useState('today');
  const [sheetDay, setSheetDay] = useState(null);
  const [form, setForm] = useState(null); // { mode: 'add'|'edit', id }
  const [notif, setNotif] = useState(() => persisted?.notif ?? true);
  const [remindHour] = useState(() => persisted?.remindHour ?? 21);
  const [weekStart, setWeekStart] = useState(() => persisted?.weekStart ?? 0);
  const scrollRef = useRef(null);

  // 상태 변경 시 localStorage에 동기화(오늘/탭 등 뷰 전용 상태는 저장하지 않는다).
  useEffect(() => {
    saveState({ routines, checks, weekStart, notif, remindHour });
  }, [routines, checks, weekStart, notif, remindHour]);

  const visibleRoutines = useMemo(() => routines.filter((r) => r.visible), [routines]);
  const isEmpty = routines.length === 0;
  const todayKey = formatDateKey(today);
  const currentWeekStart = useMemo(() => startOfWeek(today, weekStart), [today, weekStart]);

  // 앱이 열린 채 날짜가 바뀌면 '오늘'을 갱신 — 자정 타이머 + 포커스/가시성 복귀 시 재계산.
  useEffect(() => {
    const refresh = () =>
      setToday((prev) => {
        const next = startOfToday();
        return next.getTime() === prev.getTime() ? prev : next;
      });
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const timer = setTimeout(refresh, nextMidnight.getTime() - now.getTime() + 500);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [today]);

  // 캘린더 탭 진입 시 오늘 주로 자동 스크롤(레이아웃 안정화 대비 재시도).
  useEffect(() => {
    if (activeTab !== 'calendar') return undefined;
    const timers = [0, 60, 160, 320].map((delay) =>
      setTimeout(() => {
        const node = scrollRef.current;
        const target = node?.querySelector('[data-current="1"]');
        if (node && target) node.scrollTop = Math.max(0, target.offsetTop - 96);
      }, delay),
    );
    return () => timers.forEach(clearTimeout);
  }, [activeTab, weekStart, routines.length]);

  // ---- derived view models ----
  const weeks = useMemo(() => {
    const start = rangeStart(today, weekStart);
    const result = [];
    for (let w = 0; w < TOTAL_WEEKS; w += 1) {
      const ws = addDays(start, w * 7);
      const we = addDays(ws, 6);
      const finalized = we < today;
      const isCurrent = ws <= today && today <= we;
      const achievedIds = new Set();
      const chips = [];
      visibleRoutines.forEach((routine) => {
        if (finalized && achieved(routine, weekCount(ws, routine.id, checks))) {
          achievedIds.add(routine.id);
          chips.push(routine);
        }
      });
      const days = [];
      for (let i = 0; i < 7; i += 1) {
        const date = addDays(ws, i);
        const key = formatDateKey(date);
        const isFuture = date > today;
        const icons = isFuture
          ? []
          : visibleRoutines.map((routine) => {
              const done = Boolean(checks[key]?.[routine.id]);
              return { routine, done, glow: finalized && done && achievedIds.has(routine.id) };
            });
        days.push({ key, date, dateNum: date.getDate(), dow: date.getDay(), isToday: key === todayKey, isFuture, icons });
      }
      result.push({
        key: formatDateKey(ws),
        isCurrent,
        rangeLabel: `${ws.getMonth() + 1}.${ws.getDate()} – ${we.getMonth() + 1}.${we.getDate()}`,
        chips,
        days,
      });
    }
    return result;
  }, [checks, visibleRoutines, weekStart, today, todayKey]);

  const calStatText = useMemo(() => {
    if (!visibleRoutines.length) return '표시된 루틴이 없어요';
    let n = 0;
    visibleRoutines.forEach((routine) => {
      if (achieved(routine, weekCount(currentWeekStart, routine.id, checks))) n += 1;
    });
    return `이번 주 ${n}/${visibleRoutines.length} 순항 중`;
  }, [checks, currentWeekStart, visibleRoutines]);

  const todayRows = useMemo(
    () =>
      visibleRoutines.map((routine) => {
        const done = Boolean(checks[todayKey]?.[routine.id]);
        const cnt = weekCount(currentWeekStart, routine.id, checks);
        const prog = routine.goalType === 'atLeast' ? `이번 주 ${cnt}/${routine.goalCount}회` : `이번 주 ${cnt}회 · 한도 ${routine.goalCount}`;
        return { routine, done, prog };
      }),
    [checks, currentWeekStart, visibleRoutines, todayKey],
  );
  const todayDone = todayRows.filter((r) => r.done).length;
  const todayPct = todayRows.length ? Math.round((todayDone / todayRows.length) * 100) : 0;

  const stats = useMemo(() => {
    const perRoutine = visibleRoutines.map((routine) => {
      const results = finalizedResults(routine, checks, weekStart, today);
      return {
        routine,
        pct: achievementRate(results),
        streak: currentStreak(results),
        heat: results.slice(-10),
      };
    });
    let meet = 0;
    visibleRoutines.forEach((routine) => {
      if (achieved(routine, weekCount(currentWeekStart, routine.id, checks))) meet += 1;
    });
    const bestStreak = perRoutine.reduce((m, x) => Math.max(m, x.streak), 0);
    const avg = perRoutine.length ? Math.round(perRoutine.reduce((s, x) => s + x.pct, 0) / perRoutine.length) : 0;
    return {
      perRoutine,
      summary: [
        { label: '이번 주 달성', value: `${meet}/${visibleRoutines.length}`, accent: 'var(--color-primary)' },
        { label: '최고 연속', value: `${bestStreak}주`, accent: '#22C55E' },
        { label: '평균 달성률', value: `${avg}%`, accent: '#60A5FA' },
      ],
    };
  }, [checks, currentWeekStart, visibleRoutines, weekStart, today]);

  const editing = form ? routines.find((r) => r.id === form.id) : null;

  // ---- mutations ----
  const toggleCheck = (key, routineId) => {
    setChecks((prev) => {
      const next = { ...prev };
      const day = { ...(next[key] || {}) };
      if (day[routineId]) delete day[routineId];
      else day[routineId] = true;
      if (Object.keys(day).length) next[key] = day;
      else delete next[key];
      return next;
    });
  };

  const updateRoutine = (routineId, patch) => {
    setRoutines((prev) => prev.map((r) => (r.id === routineId ? { ...r, ...patch } : r)));
  };
  const toggleVisible = (routineId) => {
    setRoutines((prev) => prev.map((r) => (r.id === routineId ? { ...r, visible: !r.visible } : r)));
  };
  const setGoalType = (routineId, goalType) => {
    setRoutines((prev) =>
      prev.map((r) => {
        if (r.id !== routineId) return r;
        let goalCount = r.goalCount;
        if (goalType === 'atLeast' && goalCount < 1) goalCount = 1;
        if (goalType === 'atMost' && goalCount > 6) goalCount = 6;
        return { ...r, goalType, goalCount };
      }),
    );
  };
  const adjustGoal = (routineId, delta) => {
    setRoutines((prev) =>
      prev.map((r) => {
        if (r.id !== routineId) return r;
        const min = r.goalType === 'atLeast' ? 1 : 0;
        return { ...r, goalCount: Math.max(min, Math.min(7, r.goalCount + delta)) };
      }),
    );
  };

  const openAddForm = () => {
    if (routines.length >= 5) return;
    uidCounter += 1;
    const next = makeNewRoutine(routines, `r${uidCounter}`);
    setRoutines((prev) => [...prev, next]);
    setForm({ mode: 'add', id: next.id });
  };
  const openEditForm = (routineId) => setForm({ mode: 'edit', id: routineId });
  const saveForm = () => setForm(null);
  const cancelForm = () => {
    if (form?.mode === 'add') {
      const id = form.id;
      setRoutines((prev) => prev.filter((r) => r.id !== id));
    }
    setForm(null);
  };
  const deleteRoutine = (routineId) => {
    if (routines.length <= 1) return;
    setRoutines((prev) => prev.filter((r) => r.id !== routineId));
    setForm(null);
  };

  const selectTab = (key) => {
    setActiveTab(key);
    setSheetDay(null);
  };

  // 모든 루틴·기록을 지우고 첫 방문 상태(온보딩)로 되돌린다.
  const resetAll = () => {
    if (typeof window !== 'undefined' && !window.confirm('모든 루틴과 기록을 삭제할까요? 되돌릴 수 없어요.')) return;
    clearState();
    setRoutines([]);
    setChecks({});
    setWeekStart(0);
    setNotif(true);
    setForm(null);
    setSheetDay(null);
    setActiveTab('today');
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '32px 20px 64px', background: '#070B14' }}>
      <div style={{ width: 390, height: 844, background: 'var(--color-bg)', borderRadius: 44, border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-lg)', overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-sans)', color: 'var(--color-text)' }}>
        {/* status bar */}
        <div style={{ height: 44, flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 26px', fontSize: 13, fontWeight: 700, background: 'var(--color-surface)' }}>
          <span>9:41</span>
          <span style={{ display: 'flex', gap: 7, alignItems: 'center', fontSize: 12, fontWeight: 800 }}>
            <span>5G</span>
            <span style={{ display: 'inline-block', width: 23, height: 12, border: '1.5px solid var(--color-text)', borderRadius: 3, position: 'relative' }}>
              <span style={{ position: 'absolute', top: 1.5, bottom: 1.5, left: 1.5, right: 6, background: 'var(--color-text)', borderRadius: 1 }} />
              <span style={{ position: 'absolute', top: 3.5, bottom: 3.5, right: -2.5, width: 2, background: 'var(--color-text)', borderRadius: 1 }} />
            </span>
          </span>
        </div>

        {/* content */}
        <div ref={scrollRef} data-scroll="1" style={{ flex: '1 1 auto', overflowY: 'auto', position: 'relative' }}>
          {isEmpty && <Onboarding onAdd={openAddForm} />}
          {!isEmpty && activeTab === 'calendar' && (
            <CalendarScreen weeks={weeks} weekStart={weekStart} monthTitle={`${today.getFullYear()}년 ${today.getMonth() + 1}월`} statText={calStatText} onAdd={openAddForm} onOpenDay={setSheetDay} />
          )}
          {!isEmpty && activeTab === 'today' && (
            <TodayScreen today={today} rows={todayRows} doneN={todayDone} total={todayRows.length} pct={todayPct} onToggle={(rid) => toggleCheck(todayKey, rid)} />
          )}
          {!isEmpty && activeTab === 'stats' && <StatsScreen summary={stats.summary} rows={stats.perRoutine} />}
          {!isEmpty && activeTab === 'settings' && (
            <SettingsScreen
              routines={routines}
              onEdit={openEditForm}
              onToggleVisible={toggleVisible}
              onAdd={openAddForm}
              notif={notif}
              remindHour={remindHour}
              onToggleNotif={() => setNotif((v) => !v)}
              weekStart={weekStart}
              onSetWeekStart={setWeekStart}
              onReset={resetAll}
            />
          )}
        </div>

        {/* tab bar */}
        <div style={{ flex: '0 0 auto', display: 'flex', background: 'var(--color-surface)', borderTop: '1px solid var(--color-border)', padding: '8px 6px 14px' }}>
          {TABS.map((tab) => {
            const on = tab.key === activeTab;
            return (
              <button key={tab.key} type="button" onClick={() => selectTab(tab.key)} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, cursor: 'pointer', padding: '2px 0' }}>
                <Icon name={tab.icon} size={23} color={on ? '#0EA5A4' : '#94A3B8'} strokeWidth={on ? 2.3 : 2} />
                <span style={{ fontSize: 10.5, fontWeight: on ? 800 : 600, color: on ? 'var(--color-primary)' : '#94A3B8' }}>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* day check sheet */}
        {sheetDay && <CheckSheet dayKey={sheetDay} routines={visibleRoutines} checks={checks} onToggle={toggleCheck} onClose={() => setSheetDay(null)} />}

        {/* add / edit form (full screen) */}
        {editing && (
          <RoutineForm
            routine={editing}
            mode={form.mode}
            canDelete={form.mode === 'edit' && routines.length > 1}
            onCancel={cancelForm}
            onSave={saveForm}
            onUpdate={updateRoutine}
            onSetGoalType={setGoalType}
            onAdjustGoal={adjustGoal}
            onDelete={deleteRoutine}
          />
        )}
      </div>
    </div>
  );
}

function Onboarding({ onAdd }) {
  return (
    <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '32px 30px', gap: 18 }}>
      <div style={{ width: 64, height: 64, borderRadius: 20, background: 'var(--color-primary-50)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="todaycheck" size={34} color="var(--color-primary)" strokeWidth={2.2} />
      </div>
      <div>
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>
          매일의 루틴,
          <br />한 눈에 채워보세요
        </div>
        <div style={{ fontSize: 13.5, color: 'var(--color-muted)', marginTop: 8, lineHeight: 1.5, fontWeight: 500 }}>
          루틴을 만들고 하루하루 체크하면
          <br />주간 목표 달성이 캘린더에 쌓여요
        </div>
      </div>
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
        {ONBOARD_STEPS.map((step) => (
          <div key={step.n} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 16, padding: '13px 15px', textAlign: 'left' }}>
            <div style={{ flex: '0 0 auto', width: 30, height: 30, borderRadius: '50%', background: 'var(--color-primary-50)', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14 }}>{step.n}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{step.title}</div>
              <div style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 1 }}>{step.desc}</div>
            </div>
          </div>
        ))}
      </div>
      <button type="button" onClick={onAdd} style={{ cursor: 'pointer', marginTop: 6, width: '100%', minHeight: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--gradient-brand)', color: '#fff', fontSize: 17, fontWeight: 800, borderRadius: 16, boxShadow: 'var(--shadow-md)' }}>첫 루틴 만들기</button>
    </div>
  );
}

function CalendarScreen({ weeks, weekStart, monthTitle, statText, onAdd, onOpenDay }) {
  const weekdayHeader = [0, 1, 2, 3, 4, 5, 6].map((i) => (weekStart + i) % 7);
  return (
    <>
      <div style={{ padding: '8px 18px 10px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em' }}>{monthTitle}</div>
          <div style={{ fontSize: 12.5, color: 'var(--color-muted)', fontWeight: 600, marginTop: 2 }}>{statText}</div>
        </div>
        <button type="button" onClick={onAdd} style={{ cursor: 'pointer', width: 38, height: 38, borderRadius: 11, background: 'var(--color-primary-50)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="plus" size={20} color="var(--color-primary)" strokeWidth={2.4} />
        </button>
      </div>
      <div style={{ position: 'sticky', top: 0, zIndex: 5, background: 'var(--color-bg)', display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 5, padding: '6px 14px' }}>
        {weekdayHeader.map((dow, i) => (
          <div key={i} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: weekendColor(dow) || 'var(--color-muted)' }}>{WEEKDAYS[dow]}</div>
        ))}
      </div>
      <div style={{ padding: '2px 12px 20px', display: 'flex', flexDirection: 'column', gap: 11 }}>
        {weeks.map((week) => (
          <div key={week.key} data-current={week.isCurrent ? '1' : '0'} style={{ background: 'var(--color-surface)', border: week.isCurrent ? '1.5px solid var(--color-primary)' : '1px solid var(--color-border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-sm)', padding: '13px 13px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 11 }}>
              <span style={{ fontSize: 13.5, fontWeight: 800 }}>{week.rangeLabel}</span>
              {week.isCurrent && <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--color-primary)', background: 'var(--color-primary-50)', padding: '2px 8px', borderRadius: 999 }}>이번 주</span>}
              <div style={{ flex: 1 }} />
              {week.chips.length > 0 && (
                <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                  {week.chips.map((routine) => (
                    <div key={routine.id} style={{ width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto', background: rgba(routine.color, 0.16), boxShadow: `0 0 0 1.5px ${rgba(routine.color, 0.85)}, 0 0 9px ${rgba(routine.color, 0.5)}`, animation: 'glowPulse 2.6s ease-in-out infinite' }}>
                      <Icon name={routine.iconKey} size={13} color={routine.color} strokeWidth={2.2} />
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
              {week.days.map((day) => {
                const wc = weekendColor(day.dow);
                return (
                  <div key={day.key} onClick={day.isFuture ? undefined : () => onOpenDay(day.key)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, padding: '4px 0 6px', borderRadius: 10, cursor: day.isFuture ? 'default' : 'pointer', background: day.isToday ? 'var(--color-primary-50)' : 'transparent' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: day.isFuture ? 'var(--color-field-border)' : wc || 'var(--color-muted)', marginBottom: 1 }}>{WEEKDAYS[day.dow]}</span>
                    <div style={{ width: 22, height: 22, borderRadius: '50%', background: day.isToday ? 'var(--color-primary)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '1px 0' }}>
                      <span style={{ fontSize: day.isToday ? 12 : 12.5, fontWeight: day.isToday ? 800 : 700, color: day.isToday ? '#fff' : day.isFuture ? 'var(--color-field-border)' : wc || 'var(--color-text)' }}>{day.dateNum}</span>
                    </div>
                    {day.icons.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, justifyContent: 'center', alignContent: 'flex-start', width: '100%', marginTop: 2 }}>
                        {day.icons.map((icon) => (
                          <div key={icon.routine.id} style={{ width: 18, height: 18, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto', background: icon.done ? rgba(icon.routine.color, 0.15) : 'transparent', boxShadow: icon.glow ? `0 0 0 1.5px ${rgba(icon.routine.color, 0.9)}, 0 0 8px ${rgba(icon.routine.color, 0.5)}` : 'none', animation: icon.glow ? 'glowPulse 2.6s ease-in-out infinite' : 'none' }}>
                            <Icon name={icon.routine.iconKey} size={12} color={icon.done ? icon.routine.color : 'var(--color-field-border)'} strokeWidth={2} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function TodayScreen({ today, rows, doneN, total, pct, onToggle }) {
  const dateLabel = `${today.getMonth() + 1}월 ${today.getDate()}일 ${WEEKDAYS[today.getDay()]}요일`;
  return (
    <>
      <div style={{ padding: '22px 18px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
        <div>
          <div style={{ fontSize: 25, fontWeight: 800, letterSpacing: '-0.02em' }}>오늘</div>
          <div style={{ fontSize: 13, color: 'var(--color-muted)', fontWeight: 600, marginTop: 4 }}>{dateLabel}</div>
        </div>
        <div style={{ width: 96, height: 96, borderRadius: '50%', flex: '0 0 auto', background: `conic-gradient(var(--color-primary) ${pct * 3.6}deg, var(--color-border) 0)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 76, height: 76, borderRadius: '50%', background: 'var(--color-surface)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ fontSize: 23, fontWeight: 800, lineHeight: 1 }}>
              {doneN}
              <span style={{ fontSize: 14, color: 'var(--color-muted)', fontWeight: 700 }}>/{total}</span>
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--color-muted)', fontWeight: 700, marginTop: 2 }}>완료</div>
          </div>
        </div>
      </div>
      <div style={{ padding: '4px 16px 24px', display: 'flex', flexDirection: 'column', gap: 11 }}>
        {rows.map(({ routine, done, prog }) => (
          <div key={routine.id} onClick={() => onToggle(routine.id)} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 15px', borderRadius: 18, border: '1px solid var(--color-border)', background: done ? rgba(routine.color, 0.07) : 'var(--color-surface)', boxShadow: 'var(--shadow-sm)', cursor: 'pointer' }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', background: rgba(routine.color, done ? 0.16 : 0.1) }}>
              <Icon name={routine.iconKey} size={26} color={routine.color} strokeWidth={2} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16.5, fontWeight: 700 }}>{routine.name}</div>
              <div style={{ fontSize: 12.5, color: 'var(--color-muted)', marginTop: 2, fontWeight: 600 }}>{prog}</div>
            </div>
            <CheckMark done={done} size={30} tick={16} />
          </div>
        ))}
      </div>
    </>
  );
}

function StatsScreen({ summary, rows }) {
  return (
    <>
      <div style={{ padding: '22px 18px 10px' }}>
        <div style={{ fontSize: 25, fontWeight: 800, letterSpacing: '-0.02em' }}>통계</div>
        <div style={{ fontSize: 13, color: 'var(--color-muted)', fontWeight: 600, marginTop: 4 }}>최근 8주 인사이트</div>
      </div>
      <div style={{ padding: '6px 16px 8px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 9 }}>
        {summary.map((card) => (
          <div key={card.label} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 16, padding: '13px 10px', textAlign: 'center', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ fontSize: 21, fontWeight: 800, color: card.accent, lineHeight: 1 }}>{card.value}</div>
            <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 5, fontWeight: 600 }}>{card.label}</div>
          </div>
        ))}
      </div>
      <div style={{ padding: '8px 16px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {rows.map(({ routine, pct, streak, heat }) => (
          <div key={routine.id} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 18, padding: '14px 15px', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <div style={{ width: 36, height: 36, borderRadius: 11, flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', background: rgba(routine.color, 0.15) }}>
                <Icon name={routine.iconKey} size={20} color={routine.color} strokeWidth={2} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{routine.name}</div>
                <div style={{ fontSize: 11.5, color: 'var(--color-muted)', marginTop: 1 }}>{goalText(routine)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: routine.color }}>{pct}%</div>
                <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 1 }}>연속 {streak}주</div>
              </div>
            </div>
            <div style={{ height: 8, borderRadius: 999, background: 'var(--color-bg)', overflow: 'hidden', margin: '11px 0 12px' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: routine.color, borderRadius: 999 }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 10.5, color: 'var(--color-muted)', fontWeight: 700, flex: '0 0 auto' }}>최근</span>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {heat.map((ok, i) => (
                  <div key={i} style={{ width: 13, height: 13, borderRadius: 4, flex: '0 0 auto', background: ok ? routine.color : HEAT_EMPTY }} />
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function SettingsScreen({ routines, onEdit, onToggleVisible, onAdd, notif, remindHour, onToggleNotif, weekStart, onSetWeekStart, onReset }) {
  const full = routines.length >= 5;
  const seg = (on) => ({ padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: on ? 800 : 700, cursor: 'pointer', background: on ? 'var(--color-primary)' : 'transparent', color: on ? '#fff' : 'var(--color-muted)' });
  const sectionLabel = { fontSize: 12, fontWeight: 800, color: 'var(--color-muted)', letterSpacing: '0.04em', padding: '0 4px 8px' };
  return (
    <>
      <div style={{ padding: '22px 18px 10px' }}>
        <div style={{ fontSize: 25, fontWeight: 800, letterSpacing: '-0.02em' }}>설정</div>
      </div>
      <div style={{ padding: '6px 16px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* 루틴 관리 */}
        <div>
          <div style={sectionLabel}>루틴 관리</div>
          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 16, overflow: 'hidden' }}>
            {routines.map((routine) => (
              <div key={routine.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderBottom: '1px solid var(--color-border)', opacity: routine.visible ? 1 : 0.55 }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', background: rgba(routine.color, routine.visible ? 0.15 : 0.08) }}>
                  <Icon name={routine.iconKey} size={22} color={routine.visible ? routine.color : '#94A3B8'} strokeWidth={2} />
                </div>
                <div onClick={() => onEdit(routine.id)} style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{routine.name}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--color-muted)', marginTop: 1 }}>{goalText(routine)}</div>
                </div>
                <button type="button" onClick={() => onToggleVisible(routine.id)} style={{ cursor: 'pointer', padding: '6px 11px', borderRadius: 9, fontSize: 12, fontWeight: 700, background: routine.visible ? 'var(--color-primary-50)' : 'var(--color-bg)', color: routine.visible ? 'var(--color-primary)' : 'var(--color-muted)' }}>{routine.visible ? '표시' : '숨김'}</button>
                <button type="button" onClick={() => onEdit(routine.id)} style={{ cursor: 'pointer', flex: '0 0 auto', display: 'flex' }}>
                  <Icon name="chevron" size={18} color="var(--color-field-border)" strokeWidth={2.4} />
                </button>
              </div>
            ))}
            <button type="button" onClick={onAdd} disabled={full} style={{ cursor: full ? 'default' : 'pointer', width: '100%', minHeight: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 14, border: '1.5px dashed var(--color-field-border)', color: full ? 'var(--color-field-border)' : 'var(--color-primary)', fontSize: 15, fontWeight: 800, background: full ? 'var(--color-bg)' : 'var(--color-primary-50)' }}>
              <Icon name="plus" size={18} color={full ? 'var(--color-field-border)' : 'var(--color-primary)'} strokeWidth={2.4} /> 루틴 추가 ({routines.length}/5)
            </button>
          </div>
        </div>

        {/* 알림 */}
        <div>
          <div style={sectionLabel}>알림</div>
          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 16, padding: '14px 15px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>매일 리마인더</div>
              <div style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 2 }}>매일 {remindHour}:00 알림</div>
            </div>
            <button type="button" onClick={onToggleNotif} style={{ width: 46, height: 27, borderRadius: 999, flex: '0 0 auto', background: notif ? 'var(--color-primary)' : 'var(--color-field-border)', position: 'relative', cursor: 'pointer', transition: 'background .18s', padding: 0 }}>
              <span style={{ position: 'absolute', top: 3, left: notif ? 22 : 3, width: 21, height: 21, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.2)', transition: 'left .18s' }} />
            </button>
          </div>
        </div>

        {/* 캘린더 */}
        <div>
          <div style={sectionLabel}>캘린더</div>
          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 16, padding: '14px 15px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1, fontSize: 15, fontWeight: 700 }}>주 시작 요일</div>
            <div style={{ display: 'flex', background: 'var(--color-bg)', borderRadius: 10, padding: 3, gap: 2 }}>
              <button type="button" onClick={() => onSetWeekStart(0)} style={seg(weekStart === 0)}>일요일</button>
              <button type="button" onClick={() => onSetWeekStart(1)} style={seg(weekStart === 1)}>월요일</button>
            </div>
          </div>
        </div>

        {/* 데이터 */}
        <div>
          <div style={sectionLabel}>데이터</div>
          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 16, padding: '14px 15px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>데이터 초기화</div>
              <div style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 2 }}>모든 루틴과 기록을 삭제해요</div>
            </div>
            <button type="button" onClick={onReset} style={{ cursor: 'pointer', flex: '0 0 auto', padding: '8px 14px', borderRadius: 10, fontSize: 13, fontWeight: 800, background: 'var(--color-expired-bg)', color: 'var(--color-expired-text)' }}>초기화</button>
          </div>
        </div>
      </div>
    </>
  );
}

function CheckSheet({ dayKey, routines, checks, onToggle, onClose }) {
  const d = parseDateKey(dayKey);
  return (
    <>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(15, 23, 42, 0.34)', zIndex: 25 }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, background: 'var(--color-surface)', borderTopLeftRadius: 26, borderTopRightRadius: 26, boxShadow: 'var(--shadow-lg)', zIndex: 30, padding: '10px 18px 22px', display: 'flex', flexDirection: 'column', maxHeight: '84%' }}>
        <div style={{ width: 40, height: 4, borderRadius: 999, background: 'var(--color-border)', margin: '2px auto 12px' }} />
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.01em' }}>{d.getMonth() + 1}월 {d.getDate()}일</div>
            <div style={{ fontSize: 12.5, color: 'var(--color-muted)', marginTop: 2, fontWeight: 600 }}>{WEEKDAYS[d.getDay()]}요일</div>
          </div>
          <button type="button" onClick={onClose} style={{ cursor: 'pointer', width: 32, height: 32, borderRadius: '50%', background: 'var(--color-bg)', color: 'var(--color-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700 }}>✕</button>
        </div>
        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {routines.map((routine) => {
            const done = Boolean(checks[dayKey]?.[routine.id]);
            return (
              <div key={routine.id} onClick={() => onToggle(dayKey, routine.id)} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '12px 13px', borderRadius: 16, border: '1px solid var(--color-border)', background: done ? rgba(routine.color, 0.07) : 'var(--color-surface)', cursor: 'pointer' }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', background: rgba(routine.color, done ? 0.16 : 0.1) }}>
                  <Icon name={routine.iconKey} size={22} color={routine.color} strokeWidth={2} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15.5, fontWeight: 700 }}>{routine.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 1 }}>{goalText(routine)}</div>
                </div>
                <CheckMark done={done} size={30} tick={15} />
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function RoutineForm({ routine, mode, canDelete, onCancel, onSave, onUpdate, onSetGoalType, onAdjustGoal, onDelete }) {
  const isAtLeast = routine.goalType === 'atLeast';
  const minCount = isAtLeast ? 1 : 0;
  const seg = (on) => ({ flex: 1, textAlign: 'center', padding: '11px 0', borderRadius: 9, fontSize: 14.5, fontWeight: on ? 800 : 700, cursor: 'pointer', background: on ? 'var(--color-primary)' : 'transparent', color: on ? '#fff' : 'var(--color-muted)' });
  const stepBase = { width: 40, height: 40, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-surface)', border: '1px solid var(--color-border)', fontSize: 22, fontWeight: 800 };
  const stepStyle = (enabled) => ({ ...stepBase, color: enabled ? 'var(--color-text)' : 'var(--color-field-border)', cursor: enabled ? 'pointer' : 'default' });
  const label = { fontSize: 12.5, fontWeight: 800, color: 'var(--color-muted)', letterSpacing: '0.03em', marginBottom: 10 };
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'var(--color-surface)', zIndex: 40, display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px 12px', borderBottom: '1px solid var(--color-border)' }}>
        <button type="button" onClick={onCancel} style={{ cursor: 'pointer', fontSize: 15, fontWeight: 700, color: 'var(--color-muted)' }}>취소</button>
        <div style={{ fontSize: 16.5, fontWeight: 800 }}>{mode === 'add' ? '루틴 추가' : '루틴 편집'}</div>
        <button type="button" onClick={onSave} style={{ cursor: 'pointer', fontSize: 15, fontWeight: 800, color: 'var(--color-primary)' }}>저장</button>
      </div>
      <div data-scroll="1" style={{ flex: '1 1 auto', overflowY: 'auto', padding: '22px 18px 24px' }}>
        <div style={{ width: 76, height: 76, borderRadius: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', background: rgba(routine.color, 0.15), margin: '0 auto' }}>
          <Icon name={routine.iconKey} size={40} color={routine.color} strokeWidth={2} />
        </div>
        <input
          className="rp-input"
          value={routine.name}
          onChange={(e) => onUpdate(routine.id, { name: e.target.value })}
          style={{ display: 'block', width: '100%', boxSizing: 'border-box', textAlign: 'center', fontFamily: 'var(--font-sans)', fontSize: 20, fontWeight: 800, color: 'var(--color-text)', border: 'none', borderBottom: '1.5px solid var(--color-border)', padding: '12px 0 10px', margin: '16px 0 24px', background: 'transparent' }}
        />

        <div style={label}>아이콘</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 24 }}>
          {ICON_KEYS.map((key) => {
            const on = routine.iconKey === key;
            return (
              <button key={key} type="button" onClick={() => onUpdate(routine.id, { iconKey: key })} style={{ height: 52, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: on ? rgba(routine.color, 0.15) : 'var(--color-bg)', boxShadow: on ? `0 0 0 2px ${routine.color}` : 'none' }}>
                <Icon name={key} size={24} color={on ? routine.color : '#94A3B8'} strokeWidth={2} />
              </button>
            );
          })}
        </div>

        <div style={label}>색</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 24 }}>
          {PALETTE.map((color) => (
            <button key={color} type="button" onClick={() => onUpdate(routine.id, { color })} style={{ width: 34, height: 34, borderRadius: '50%', background: color, cursor: 'pointer', flex: '0 0 auto', boxShadow: routine.color === color ? `0 0 0 2px var(--color-surface), 0 0 0 4px ${color}` : 'none' }} />
          ))}
        </div>

        <div style={label}>주간 목표</div>
        <div style={{ display: 'flex', background: 'var(--color-bg)', borderRadius: 12, padding: 4, gap: 3, marginBottom: 12 }}>
          <button type="button" onClick={() => onSetGoalType(routine.id, 'atLeast')} style={seg(isAtLeast)}>이상 (늘리기)</button>
          <button type="button" onClick={() => onSetGoalType(routine.id, 'atMost')} style={seg(!isAtLeast)}>이하 (줄이기)</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--color-bg)', borderRadius: 12, padding: '10px 14px' }}>
          <button type="button" onClick={() => onAdjustGoal(routine.id, -1)} style={stepStyle(routine.goalCount > minCount)}>−</button>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 800 }}>주 {routine.goalCount}회</div>
            <div style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 1, fontWeight: 600 }}>{goalText(routine)}</div>
          </div>
          <button type="button" onClick={() => onAdjustGoal(routine.id, 1)} style={stepStyle(routine.goalCount < 7)}>+</button>
        </div>

        {canDelete && (
          <button type="button" onClick={() => onDelete(routine.id)} style={{ cursor: 'pointer', width: '100%', marginTop: 28, minHeight: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 14, background: 'var(--color-expired-bg)', color: 'var(--color-expired-text)', fontSize: 15, fontWeight: 800 }}>루틴 삭제</button>
        )}
      </div>
    </div>
  );
}

function CheckMark({ done, size, tick }) {
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', background: done ? 'var(--color-primary)' : 'transparent', border: done ? 'none' : '2px solid var(--color-field-border)', color: done ? '#fff' : 'transparent' }}>
      {done && <span style={{ fontSize: tick, fontWeight: 800, lineHeight: 1 }}>✓</span>}
    </div>
  );
}

export default App;
