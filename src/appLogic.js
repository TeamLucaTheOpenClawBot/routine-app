// 순수 로직 · 상수 — 뷰(App.jsx)와 분리해 테스트 가능하게 유지.
// 프로토타입 기준: TODAY 고정(2026-07-15), 인메모리 목업(영속화 없음).

export const PALETTE = ['#0EA5A4', '#16A34A', '#2563EB', '#7C3AED', '#E11D48', '#F59E0B', '#0891B2', '#DB2777'];
export const ICON_KEYS = ['activity', 'dumbbell', 'beer', 'drop', 'book', 'moon', 'leaf', 'run', 'pencil'];
export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
export const TODAY = new Date(2026, 6, 15);

export const WEEKS_BACK = 8;
export const WEEKS_FWD = 2;
export const TOTAL_WEEKS = WEEKS_BACK + WEEKS_FWD + 1; // 11

// ---- date / util ----
export function addDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

// weekStart: 0(일요일) | 1(월요일)
export function startOfWeek(date, weekStart = 0) {
  const offset = (date.getDay() - weekStart + 7) % 7;
  return addDays(date, -offset);
}

export function formatDateKey(date) {
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

export function parseDateKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// 캘린더/통계가 다루는 주 범위의 시작(과거 WEEKS_BACK주 전의 주 시작).
export function rangeStart(weekStart = 0) {
  return startOfWeek(addDays(TODAY, -WEEKS_BACK * 7), weekStart);
}

// 결정적 시드 RNG (Math.random 대신 — 프로토타입과 동일한 데모 데이터 재현).
export function mulberry32(seed) {
  let a = seed;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- goal / weekly evaluation ----
export function goalText(routine) {
  return routine.goalType === 'atLeast'
    ? `주 ${routine.goalCount}회 이상`
    : `주 ${routine.goalCount}회 이하`;
}

// 해당 주(weekStart Date 기준 7일) 내 완료 일수.
export function weekCount(weekStart, routineId, checks) {
  let count = 0;
  for (let i = 0; i < 7; i += 1) {
    const key = formatDateKey(addDays(weekStart, i));
    if (checks[key]?.[routineId]) count += 1;
  }
  return count;
}

export function achieved(routine, count) {
  return routine.goalType === 'atLeast'
    ? count >= routine.goalCount
    : count <= routine.goalCount;
}

// 편의 함수: 그 주 달성 여부. weekStart 는 주 시작 Date.
export function evaluateWeek(routine, checks, weekStart) {
  return achieved(routine, weekCount(weekStart, routine.id, checks));
}

// ---- seed / initial state ----
export function buildInitialRoutines() {
  // 실제 기본은 운동·음주 2개면 충분하지만, 밀도 데모를 위해 물·독서를 포함한
  // 프로토타입 시드를 사용한다.
  return [
    { id: 'r1', name: '운동', iconKey: 'activity', color: '#0EA5A4', goalType: 'atLeast', goalCount: 7, visible: true },
    { id: 'r2', name: '음주', iconKey: 'beer', color: '#E11D48', goalType: 'atMost', goalCount: 1, visible: true },
    { id: 'r3', name: '물 마시기', iconKey: 'drop', color: '#2563EB', goalType: 'atLeast', goalCount: 7, visible: true },
    { id: 'r4', name: '독서', iconKey: 'book', color: '#7C3AED', goalType: 'atLeast', goalCount: 3, visible: true },
  ];
}

export function createSeedChecks(routines) {
  const probs = { r1: 0.82, r2: 0.15, r3: 0.88, r4: 0.5 };
  const start = rangeStart(0);
  const checks = {};
  routines.forEach((routine, index) => {
    const rand = mulberry32(1000 + index * 777);
    const prob = probs[routine.id] ?? 0.6;
    for (let offset = 0; offset < 400; offset += 1) {
      const date = addDays(start, offset);
      if (!(date < TODAY)) break;
      if (rand() < prob) {
        const key = formatDateKey(date);
        (checks[key] || (checks[key] = {}))[routine.id] = true;
      }
    }
  });
  return checks;
}

// 다음 새 루틴의 기본값(미사용 색/아이콘 우선).
export function makeNewRoutine(routines, id) {
  const usedColors = new Set(routines.map((r) => r.color));
  const color = PALETTE.find((c) => !usedColors.has(c)) || PALETTE[routines.length % PALETTE.length];
  const usedIcons = new Set(routines.map((r) => r.iconKey));
  const iconKey = ICON_KEYS.find((k) => !usedIcons.has(k)) || 'leaf';
  return { id, name: '새 루틴', iconKey, color, goalType: 'atLeast', goalCount: 3, visible: true };
}

// ---- stats ----
// 완료된(finalized) 주들의 달성 여부 배열 — 오래된 주가 앞.
export function finalizedResults(routine, checks, weekStart) {
  const start = rangeStart(weekStart);
  const results = [];
  for (let w = 0; w < TOTAL_WEEKS; w += 1) {
    const ws = addDays(start, w * 7);
    const we = addDays(ws, 6);
    if (!(we < TODAY)) continue; // 완료된 주만
    results.push(achieved(routine, weekCount(ws, routine.id, checks)));
  }
  return results;
}

export function achievementRate(results) {
  if (!results.length) return 0;
  const ok = results.filter(Boolean).length;
  return Math.round((ok / results.length) * 100);
}

export function currentStreak(results) {
  let streak = 0;
  for (let i = results.length - 1; i >= 0; i -= 1) {
    if (results[i]) streak += 1;
    else break;
  }
  return streak;
}
