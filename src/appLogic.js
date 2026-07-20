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

// 해당 주(weekStart Date 기준 7일) 내 목표 집계 일수.
// 찬스로 킵한 날은 목표에 유리하게 처리하므로 goalType으로 분기한다 —
// atLeast는 한 것으로 +1, atMost는 카운트에서 제외(+0). 이 분기가 없으면
// atMost(줄이는 습관)에서 찬스가 오히려 +1로 새어 목표를 해친다.
export function weekCount(weekStart, routine, checks) {
  let count = 0;
  for (let i = 0; i < 7; i += 1) {
    const key = formatDateKey(addDays(weekStart, i));
    const value = checks[key]?.[routine.id];
    if (value === true) count += 1;
    else if (chanceOf(value) && routine.goalType === 'atLeast') count += 1;
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
  return achieved(routine, weekCount(weekStart, routine, checks));
}

// ---- 찬스(chance) ----
// 잔여 개수를 별도 카운터로 저장하지 않고 '사용 기록'에서 파생한다. 사용이 사라지면 잔여가
// 저절로 복원되므로 취소·복원이 공짜이고, 주/월 리필에 자정·경계 타이머가 필요 없다
// ('오늘'을 주입받는 기존 패턴과도 일치). 소급 체크도 그 날짜가 속한 주/월로 자연히 판정된다.
export const CHANCE_WEEKLY = 'weekly';
export const CHANCE_MONTHLY = 'monthly';
export const CHANCE_BONUS = 'bonus';

// 체크 값은 true(했음) | { chance, bonusId? }(찬스). 찬스면 그 객체를, 아니면 null.
export function chanceOf(value) {
  return value && typeof value === 'object' && typeof value.chance === 'string' ? value : null;
}

// 특정 루틴의 찬스 사용 전부 — 날짜 오름차순. dateKey가 YYYY-MM-DD라 사전순=시간순.
export function chanceUsages(checks, routineId) {
  const out = [];
  for (const [dateKey, day] of Object.entries(checks)) {
    const c = chanceOf(day?.[routineId]);
    if (c) out.push({ dateKey, chance: c.chance, bonusId: c.bonusId });
  }
  return out.sort((a, b) => (a.dateKey < b.dateKey ? -1 : a.dateKey > b.dateKey ? 1 : 0));
}

// 주찬스 잔여(0|1) — 그 날짜가 속한 주에 weekly 사용이 없으면 1. 이월·스택 없음.
export function weeklyChanceLeft(checks, routineId, date, weekStart = 0) {
  const ws = startOfWeek(date, weekStart);
  const from = formatDateKey(ws);
  const to = formatDateKey(addDays(ws, 6));
  const used = chanceUsages(checks, routineId).some(
    (u) => u.chance === CHANCE_WEEKLY && u.dateKey >= from && u.dateKey <= to,
  );
  return used ? 0 : 1;
}

// 월찬스 잔여(0|1) — 그 날짜가 속한 달에 monthly 사용이 없으면 1.
export function monthlyChanceLeft(checks, routineId, date) {
  const prefix = formatDateKey(date).slice(0, 7); // YYYY-MM
  const used = chanceUsages(checks, routineId).some(
    (u) => u.chance === CHANCE_MONTHLY && u.dateKey.slice(0, 7) === prefix,
  );
  return used ? 0 : 1;
}

// 아직 쓰이지 않은 기타찬스들(등록 순). bonuses는 그 루틴의 기타찬스 목록.
export function bonusChancesLeft(checks, routineId, bonuses) {
  const usedIds = new Set(
    chanceUsages(checks, routineId)
      .filter((u) => u.chance === CHANCE_BONUS)
      .map((u) => u.bonusId),
  );
  return (bonuses ?? []).filter((b) => !usedIds.has(b.id));
}

// 보유 현황 배지용 요약.
export function chanceSummary(checks, routineId, date, bonuses, weekStart = 0) {
  return {
    weekly: weeklyChanceLeft(checks, routineId, date, weekStart),
    monthly: monthlyChanceLeft(checks, routineId, date),
    bonus: bonusChancesLeft(checks, routineId, bonuses).length,
  };
}

// 소진 순서: 주 → 월 → 기타(오래된 것부터). 사용자가 고르지 않고 자동 선택한다.
// 보유가 없으면 null.
export function pickChanceSource(checks, routineId, date, bonuses, weekStart = 0) {
  if (weeklyChanceLeft(checks, routineId, date, weekStart)) return { chance: CHANCE_WEEKLY };
  if (monthlyChanceLeft(checks, routineId, date)) return { chance: CHANCE_MONTHLY };
  const left = bonusChancesLeft(checks, routineId, bonuses);
  if (!left.length) return null;
  const oldest = left.reduce((a, b) => (a.createdAt <= b.createdAt ? a : b));
  return { chance: CHANCE_BONUS, bonusId: oldest.id };
}

// 기존 b<n>과 충돌하지 않는 다음 기타찬스 id(루틴 단위). nextRoutineId와 같은 파생 방식.
export function nextBonusId(bonuses) {
  const max = (bonuses ?? []).reduce((m, b) => {
    const match = /^b(\d+)$/.exec(b.id);
    return match ? Math.max(m, Number(match[1])) : m;
  }, 0);
  return `b${max + 1}`;
}

// 체크 3-상태 순환: 안함 → 했음 → 찬스 → 안함.
// 보유 찬스가 0이면 찬스 단계를 건너뛰어 '했음 → 안함'으로 간다(blocked로 알려 UI가 안내).
// 새 checks를 돌려주는 순수 함수 — 사용 기록이 곧 소진이므로 별도 차감이 없다.
export function cycleCheck(checks, routine, dateKey, bonuses, weekStart = 0) {
  const current = checks[dateKey]?.[routine.id];
  const setValue = (value) => {
    const day = { ...(checks[dateKey] ?? {}) };
    if (value === undefined) delete day[routine.id];
    else day[routine.id] = value;
    const out = { ...checks };
    if (Object.keys(day).length) out[dateKey] = day;
    else delete out[dateKey];
    return out;
  };

  if (current === undefined) return { checks: setValue(true), blocked: false };
  if (current === true) {
    const source = pickChanceSource(checks, routine.id, parseDateKey(dateKey), bonuses, weekStart);
    if (!source) return { checks: setValue(undefined), blocked: true };
    return { checks: setValue(source), blocked: false };
  }
  return { checks: setValue(undefined), blocked: false };
}

// 첫 방문(저장 데이터 없음) 기본 루틴 — 운동(늘리기)·음주(줄이기) 2개.
export function defaultRoutines() {
  return [
    { id: 'r1', name: '운동', iconKey: 'activity', color: '#0EA5A4', goalType: 'atLeast', goalCount: 6, visible: true },
    { id: 'r2', name: '음주', iconKey: 'beer', color: '#E11D48', goalType: 'atMost', goalCount: 1, visible: true },
  ];
}

// 기존 r<n> id와 절대 충돌하지 않는 다음 루틴 id. 라이브 목록에서 매번 파생하므로
// 영속화 복원 후 모듈 카운터가 리셋돼도 안전(비표준 id는 무시).
export function nextRoutineId(routines) {
  const max = routines.reduce((m, r) => {
    const match = /^r(\d+)$/.exec(r.id);
    return match ? Math.max(m, Number(match[1])) : m;
  }, 0);
  return `r${max + 1}`;
}

// 다음 새 루틴의 기본값(미사용 색/아이콘 우선).
export function makeNewRoutine(routines, id) {
  const usedColors = new Set(routines.map((r) => r.color));
  const color = PALETTE.find((c) => !usedColors.has(c)) || PALETTE[routines.length % PALETTE.length];
  const usedIcons = new Set(routines.map((r) => r.iconKey));
  const iconKey = ICON_KEYS.find((k) => !usedIcons.has(k)) || 'leaf';
  return { id, name: '새 루틴', iconKey, color, goalType: 'atLeast', goalCount: 3, visible: true };
}

// 특정 루틴의 모든 체크를 제거(빈 날짜는 삭제). 루틴 삭제 시 고아 체크가 남으면
// nextRoutineId가 그 id를 재활용할 때 옛 기록이 새 루틴에 붙으므로, 삭제 시 함께 정리한다.
export function purgeRoutineChecks(checks, routineId) {
  const out = {};
  for (const [key, day] of Object.entries(checks)) {
    const kept = {};
    for (const [rid, value] of Object.entries(day)) {
      if (rid !== routineId) kept[rid] = value;
    }
    if (Object.keys(kept).length) out[key] = kept;
  }
  return out;
}

// 루틴 삭제 시 그 루틴의 기타찬스도 함께 정리 — checks와 같은 이유로(재활용된 id에
// 옛 기록이 붙는 것 방지) 고아를 남기지 않는다.
export function purgeRoutineBonuses(bonusChances, routineId) {
  const out = { ...bonusChances };
  delete out[routineId];
  return out;
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
    results.push(achieved(routine, weekCount(ws, routine, checks)));
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
// v2는 **새 키**에 쓰고 v1 키는 건드리지 않는다. 구버전 앱의 parseState는 version이 다르면
// null을 돌려 기본값으로 폴백하므로, 같은 키를 덮어썼다면 이미지 롤백(deploy/README.md의
// `:previous`) 시 사용자 기록이 소실된다. 키를 나눠두면 롤백해도 구버전이 v1을 그대로 읽는다.
export const STORAGE_KEY_V1 = 'routine-app:v1';
export const STORAGE_KEY = 'routine-app:v2';
export const STORAGE_VERSION = 2;

const GOAL_TYPES = new Set(['atLeast', 'atMost']);
const CHANCE_KINDS = new Set([CHANCE_WEEKLY, CHANCE_MONTHLY, CHANCE_BONUS]);

export function serializeState(state) {
  return JSON.stringify({
    version: STORAGE_VERSION,
    routines: state.routines,
    checks: state.checks,
    bonusChances: state.bonusChances,
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

// checks를 { dateKey: { routineId: true | {chance,bonusId?} } } 형태로 정규화.
// 존재하지 않는 루틴 id와 알 수 없는 찬스 종류는 버린다.
function sanitizeChecks(input, validIds) {
  if (!input || typeof input !== 'object') return {};
  const out = {};
  for (const [key, day] of Object.entries(input)) {
    if (!day || typeof day !== 'object') continue;
    const kept = {};
    for (const [routineId, value] of Object.entries(day)) {
      if (!validIds.has(routineId)) continue;
      if (value === true) {
        kept[routineId] = true;
        continue;
      }
      const c = chanceOf(value);
      if (!c || !CHANCE_KINDS.has(c.chance)) continue;
      if (c.chance === CHANCE_BONUS) {
        if (typeof c.bonusId !== 'string') continue;
        kept[routineId] = { chance: CHANCE_BONUS, bonusId: c.bonusId };
      } else {
        kept[routineId] = { chance: c.chance };
      }
    }
    if (Object.keys(kept).length) out[key] = kept;
  }
  return out;
}

// 기타찬스 목록을 { routineId: [{ id, reason, createdAt }] }로 정규화.
// 사유는 필수이므로 빈 사유는 버린다. 존재하지 않는 루틴 id도 버린다.
function sanitizeBonusChances(input, validIds) {
  if (!input || typeof input !== 'object') return {};
  const out = {};
  for (const [routineId, list] of Object.entries(input)) {
    if (!validIds.has(routineId) || !Array.isArray(list)) continue;
    const kept = [];
    const seen = new Set();
    for (const b of list) {
      if (!b || typeof b !== 'object') continue;
      if (typeof b.id !== 'string' || seen.has(b.id)) continue;
      if (typeof b.reason !== 'string' || !b.reason.trim()) continue;
      if (typeof b.createdAt !== 'string') continue;
      seen.add(b.id);
      kept.push({ id: b.id, reason: b.reason, createdAt: b.createdAt });
    }
    if (kept.length) out[routineId] = kept;
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
  // v1도 받아들여 v2로 올린다(전진 마이그레이션). v1의 checks는 전부 boolean이라
  // v2 형태의 부분집합이고, 기타찬스는 없던 개념이므로 빈 목록으로 시작한다.
  if (!data || typeof data !== 'object') return null;
  if (data.version !== STORAGE_VERSION && data.version !== 1) return null;
  const routines = sanitizeRoutines(data.routines);
  if (!routines) return null;
  const ids = new Set(routines.map((r) => r.id));
  return {
    routines,
    checks: sanitizeChecks(data.checks, ids),
    bonusChances: sanitizeBonusChances(data.bonusChances, ids),
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

// v2 키를 먼저 보고, 없으면 v1 키를 읽어 마이그레이션한다. v1 키는 지우지 않는다 —
// 롤백 안전망(STORAGE_KEY 주석 참조). 첫 저장에서 v2 키가 생기고 이후로는 v2만 읽힌다.
export function loadState(storage = safeStorage()) {
  if (!storage) return null;
  try {
    return parseState(storage.getItem(STORAGE_KEY)) ?? parseState(storage.getItem(STORAGE_KEY_V1));
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

// 두 키를 모두 지운다. v2만 지우면 loadState의 v1 폴백이 옛 기록을 되살려
// "데이터 초기화"가 새로고침 한 번에 무효가 된다.
export function clearState(storage = safeStorage()) {
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_KEY);
    storage.removeItem(STORAGE_KEY_V1);
  } catch {
    /* noop */
  }
}
