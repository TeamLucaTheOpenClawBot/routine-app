// 순수 로직 · 상수 — 뷰(App.jsx)와 분리해 테스트 가능하게 유지.
// '오늘'은 고정 상수가 아니라 런타임 계산값(startOfToday)을 인자로 주입한다 —
// 순수 함수는 today 인자를 받아 계산하므로 테스트에서 고정 날짜를 넣을 수 있다.

export const PALETTE = ['#0EA5A4', '#16A34A', '#2563EB', '#7C3AED', '#E11D48', '#F59E0B', '#0891B2', '#DB2777'];
export const ICON_KEYS = ['activity', 'dumbbell', 'beer', 'drop', 'book', 'moon', 'leaf', 'run', 'pencil'];
export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

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

// 자정 기준 '오늘'(시/분/초 제거). 런타임에서 실제 현재 날짜로 계산한다.
// 뷰가 이 값을 계산해 순수 함수들(rangeStart/finalizedResults 등)에 주입한다.
export function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

// 캘린더/통계가 다루는 주 범위의 시작(오늘 기준 과거 WEEKS_BACK주 전의 주 시작).
export function rangeStart(today, weekStart = 0) {
  return startOfWeek(addDays(today, -WEEKS_BACK * 7), weekStart);
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
export function finalizedResults(routine, checks, weekStart, today) {
  const start = rangeStart(today, weekStart);
  const results = [];
  for (let w = 0; w < TOTAL_WEEKS; w += 1) {
    const ws = addDays(start, w * 7);
    const we = addDays(ws, 6);
    if (!(we < today)) continue; // 완료된 주만
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

// ---- persistence (localStorage) ----
// 상태를 localStorage에 저장/복원. 스키마에 version을 포함해 향후 마이그레이션 여지를 둔다.
// 파싱/검증 로직은 순수 함수(serializeState/parseState)로 두어 테스트 가능하게 하고,
// 실제 저장소 접근(load/save/clear)은 그 위의 얇은 래퍼로 감싼다.
export const STORAGE_KEY = 'routine-app:v1';
export const STORAGE_VERSION = 1;

const GOAL_TYPES = new Set(['atLeast', 'atMost']);

export function serializeState(state) {
  return JSON.stringify({
    version: STORAGE_VERSION,
    routines: state.routines,
    checks: state.checks,
    weekStart: state.weekStart,
    notif: state.notif,
    remindHour: state.remindHour,
  });
}

// 저장된 루틴 배열을 방어적으로 정규화. 형태가 어긋나면 null(→ 전체 폴백).
function sanitizeRoutines(input) {
  if (!Array.isArray(input)) return null;
  const out = [];
  for (const r of input) {
    if (!r || typeof r !== 'object') return null;
    if (typeof r.id !== 'string' || typeof r.name !== 'string') return null;
    if (!GOAL_TYPES.has(r.goalType) || !Number.isFinite(r.goalCount)) return null;
    out.push({
      id: r.id,
      name: r.name,
      iconKey: typeof r.iconKey === 'string' ? r.iconKey : 'leaf',
      color: typeof r.color === 'string' ? r.color : PALETTE[0],
      goalType: r.goalType,
      goalCount: r.goalCount,
      visible: r.visible !== false,
    });
  }
  return out;
}

// checks를 { dateKey: { routineId: true } } 형태로 정규화. 존재하지 않는 루틴 id는 버린다.
function sanitizeChecks(input, validIds) {
  if (!input || typeof input !== 'object') return {};
  const out = {};
  for (const [key, day] of Object.entries(input)) {
    if (!day || typeof day !== 'object') continue;
    const kept = {};
    for (const [routineId, value] of Object.entries(day)) {
      if (value === true && validIds.has(routineId)) kept[routineId] = true;
    }
    if (Object.keys(kept).length) out[key] = kept;
  }
  return out;
}

// 저장 문자열 → 검증된 상태. 손상/구버전/형태 불일치면 null을 돌려 뷰가 기본값으로 폴백하게 한다.
export function parseState(raw) {
  if (!raw) return null;
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object' || data.version !== STORAGE_VERSION) return null;
  const routines = sanitizeRoutines(data.routines);
  if (!routines) return null;
  const ids = new Set(routines.map((r) => r.id));
  return {
    routines,
    checks: sanitizeChecks(data.checks, ids),
    weekStart: data.weekStart === 1 ? 1 : 0,
    notif: typeof data.notif === 'boolean' ? data.notif : true,
    remindHour: Number.isInteger(data.remindHour) && data.remindHour >= 0 && data.remindHour <= 23 ? data.remindHour : 21,
  };
}

// SSR/프라이빗 모드/차단 등에서 localStorage 접근이 던질 수 있어 방어한다.
function safeStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function loadState(storage = safeStorage()) {
  if (!storage) return null;
  try {
    return parseState(storage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

export function saveState(state, storage = safeStorage()) {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, serializeState(state));
  } catch {
    /* 용량 초과 등 저장 실패는 조용히 무시 */
  }
}

export function clearState(storage = safeStorage()) {
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    /* noop */
  }
}
