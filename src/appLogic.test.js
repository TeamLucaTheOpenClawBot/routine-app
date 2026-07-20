import { describe, expect, it } from 'vitest';
import {
  achieved,
  achievementRate,
  bonusChanceRows,
  bonusChancesLeft,
  chanceSummary,
  chanceUsages,
  clearState,
  cycleCheck,
  currentStreak,
  defaultRoutines,
  evaluateWeek,
  finalizedResults,
  formatDateKey,
  goalText,
  loadState,
  makeNewRoutine,
  monthlyChanceLeft,
  nextBonusId,
  nextRoutineId,
  parseState,
  pickChanceSource,
  purgeRoutineBonuses,
  purgeRoutineChecks,
  rangeStart,
  saveState,
  serializeState,
  startOfToday,
  startOfWeek,
  STORAGE_KEY,
  STORAGE_KEY_V1,
  STORAGE_VERSION,
  weekCount,
  weeklyChanceLeft,
} from './appLogic';

const weekStart = new Date(2026, 6, 12); // 일요일
const TODAY = new Date(2026, 6, 15); // 수요일 — 테스트에 주입하는 고정 '오늘'

describe('weekCount / achieved', () => {
  it('counts completions within the 7-day window from weekStart', () => {
    const checks = {
      '2026-07-12': { r1: true },
      '2026-07-14': { r1: true },
      '2026-07-19': { r1: true }, // 다음 주 → 제외
    };
    expect(weekCount(weekStart, { id: 'r1', goalType: 'atLeast' }, checks)).toBe(2);
  });

  it('atLeast is met when count reaches the goal', () => {
    expect(achieved({ goalType: 'atLeast', goalCount: 3 }, 3)).toBe(true);
    expect(achieved({ goalType: 'atLeast', goalCount: 3 }, 2)).toBe(false);
  });

  it('atMost is met when count stays at or below the limit', () => {
    expect(achieved({ goalType: 'atMost', goalCount: 1 }, 1)).toBe(true);
    expect(achieved({ goalType: 'atMost', goalCount: 1 }, 2)).toBe(false);
  });
});

describe('evaluateWeek', () => {
  it('marks a completed week for atLeast goals', () => {
    const routine = { id: 'r1', goalType: 'atLeast', goalCount: 3 };
    const checks = {
      '2026-07-13': { r1: true },
      '2026-07-14': { r1: true },
      '2026-07-15': { r1: true },
    };
    expect(evaluateWeek(routine, checks, weekStart)).toBe(true);
  });

  it('treats atMost goals as achieved when completion count is below the threshold', () => {
    const routine = { id: 'r2', goalType: 'atMost', goalCount: 1 };
    const checks = { '2026-07-13': { r2: true } };
    expect(evaluateWeek(routine, checks, weekStart)).toBe(true);
  });
});

describe('startOfWeek respects weekStart', () => {
  it('starts on Sunday when weekStart = 0', () => {
    // 2026-07-15 는 수요일 → 그 주 일요일은 07-12
    expect(startOfWeek(new Date(2026, 6, 15), 0).getDate()).toBe(12);
  });

  it('starts on Monday when weekStart = 1', () => {
    // 2026-07-15 는 수요일 → 그 주 월요일은 07-13
    expect(startOfWeek(new Date(2026, 6, 15), 1).getDate()).toBe(13);
  });
});

describe('goalText', () => {
  it('renders atLeast / atMost labels', () => {
    expect(goalText({ goalType: 'atLeast', goalCount: 7 })).toBe('주 7회 이상');
    expect(goalText({ goalType: 'atMost', goalCount: 1 })).toBe('주 1회 이하');
  });
});

describe('makeNewRoutine', () => {
  it('picks the first unused color and icon', () => {
    const routines = [{ color: '#0EA5A4', iconKey: 'activity' }];
    const next = makeNewRoutine(routines, 'r99');
    expect(next.id).toBe('r99');
    expect(next.color).toBe('#16A34A');
    expect(next.iconKey).toBe('dumbbell');
    expect(next.goalType).toBe('atLeast');
  });
});

describe('defaultRoutines', () => {
  it('seeds 운동·음주 with distinct ids and goal types', () => {
    const routines = defaultRoutines();
    expect(routines.map((r) => r.name)).toEqual(['운동', '음주']);
    expect(routines.map((r) => r.id)).toEqual(['r1', 'r2']);
    expect(routines.map((r) => r.goalType)).toEqual(['atLeast', 'atMost']);
  });
});

describe('nextRoutineId', () => {
  it('derives an id that cannot collide with existing r<n> ids', () => {
    expect(nextRoutineId([])).toBe('r1');
    expect(nextRoutineId(defaultRoutines())).toBe('r3');
    // 복원된 커스텀 id(r101)가 있어도 그 위로 이어간다 — Codex #13 회귀 방지.
    expect(nextRoutineId([{ id: 'r2' }, { id: 'r101' }])).toBe('r102');
    // 비표준 id는 무시.
    expect(nextRoutineId([{ id: 'abc' }, { id: 'r5' }])).toBe('r6');
  });
});

describe('purgeRoutineChecks', () => {
  it('removes all checks for a routine and drops emptied days', () => {
    const checks = {
      '2026-07-15': { r2: true, r3: true },
      '2026-07-16': { r3: true },
    };
    expect(purgeRoutineChecks(checks, 'r3')).toEqual({ '2026-07-15': { r2: true } });
  });

  it('a recycled id inherits no history after purge (Codex #13 P2)', () => {
    // r3를 체크 후 삭제 → 같은 세션에서 새 루틴이 r3를 재사용해도 옛 기록이 붙지 않는다.
    const week = new Date(2026, 6, 12);
    const checks = { '2026-07-15': { r3: true } };
    const purged = purgeRoutineChecks(checks, 'r3');
    expect(nextRoutineId([{ id: 'r1' }, { id: 'r2' }])).toBe('r3'); // id 재활용됨
    expect(weekCount(week, { id: 'r3', goalType: 'atLeast' }, purged)).toBe(0); // 그러나 기록은 없음
  });
});

describe('stats helpers', () => {
  it('computes achievement rate and current streak from finalized weeks', () => {
    expect(achievementRate([true, false, true, true])).toBe(75);
    expect(currentStreak([true, false, true, true])).toBe(2);
    expect(currentStreak([true, true, false])).toBe(0);
  });

  it('only evaluates finalized (past) weeks', () => {
    const routine = { id: 'r1', goalType: 'atLeast', goalCount: 1 };
    const results = finalizedResults(routine, {}, 0, TODAY);
    // 과거 8주만 완료됨(이번 주/미래 2주 제외).
    expect(results.length).toBe(8);
    expect(results.every((r) => r === false)).toBe(true);
  });
});

describe('runtime today injection', () => {
  it('startOfToday strips time to midnight', () => {
    const t = startOfToday();
    expect(t.getHours()).toBe(0);
    expect(t.getMinutes()).toBe(0);
    expect(t.getSeconds()).toBe(0);
    expect(t.getMilliseconds()).toBe(0);
  });

  it('rangeStart anchors to the injected today (8 weeks back, aligned to weekStart)', () => {
    // 2026-07-15(수) 기준 8주 전 주(일요일 시작) = 2026-05-17.
    expect(formatDateKey(rangeStart(TODAY, 0))).toBe('2026-05-17');
    // 월요일 시작이면 2026-05-18.
    expect(formatDateKey(rangeStart(TODAY, 1))).toBe('2026-05-18');
  });

  it('finalization boundary follows the injected today', () => {
    const routine = { id: 'r1', goalType: 'atLeast', goalCount: 1 };
    const checks = { '2026-07-13': { r1: true } }; // 2026-07-12..18 주에 완료 1건
    // 그 주 안(수)이 오늘이면 아직 진행 중인 현재 주 → 완료 집계에서 제외.
    expect(finalizedResults(routine, checks, 0, new Date(2026, 6, 15)).some(Boolean)).toBe(false);
    // 다음 주 일요일이 오늘이면 그 주가 완료됨 → 달성 결과에 반영.
    expect(finalizedResults(routine, checks, 0, new Date(2026, 6, 19)).some(Boolean)).toBe(true);
  });
});

describe('persistence (serialize / parse)', () => {
  const routine = { id: 'r1', name: '운동', iconKey: 'activity', color: '#0EA5A4', goalType: 'atLeast', goalCount: 7, visible: true };
  const state = { routines: [routine], checks: { '2026-07-15': { r1: true } }, bonusChances: {}, weekStart: 1, notif: false, remindHour: 8 };

  it('round-trips state through serialize → parse with a version field', () => {
    const raw = serializeState(state);
    expect(JSON.parse(raw).version).toBe(STORAGE_VERSION);
    expect(parseState(raw)).toEqual(state);
  });

  it('returns null on corrupt JSON, empty input, or a version mismatch', () => {
    expect(parseState('{not json')).toBe(null);
    expect(parseState('')).toBe(null);
    expect(parseState(null)).toBe(null);
    expect(parseState(JSON.stringify({ version: 999, routines: [] }))).toBe(null);
  });

  it('rejects malformed routines but keeps an empty routine list valid', () => {
    expect(parseState(JSON.stringify({ version: STORAGE_VERSION, routines: 'nope' }))).toBe(null);
    expect(parseState(JSON.stringify({ version: STORAGE_VERSION, routines: [{ id: 'r1' }] }))).toBe(null);
    const empty = parseState(JSON.stringify({ version: STORAGE_VERSION, routines: [] }));
    expect(empty).toEqual({ routines: [], checks: {}, bonusChances: {}, weekStart: 0, notif: true, remindHour: 21 });
  });

  it('drops checks for unknown routine ids and non-true values', () => {
    const raw = JSON.stringify({
      version: STORAGE_VERSION,
      routines: [routine],
      checks: { '2026-07-15': { r1: true, ghost: true, r1x: false } },
    });
    expect(parseState(raw).checks).toEqual({ '2026-07-15': { r1: true } });
  });

  it('falls back to defaults for out-of-range weekStart / notif / remindHour', () => {
    const raw = JSON.stringify({ version: STORAGE_VERSION, routines: [routine], weekStart: 5, notif: 'yes', remindHour: 99 });
    const parsed = parseState(raw);
    expect(parsed.weekStart).toBe(0);
    expect(parsed.notif).toBe(true);
    expect(parsed.remindHour).toBe(21);
  });
});

describe('persistence (storage wrappers)', () => {
  // 주입 가능한 인메모리 storage 목 — 실제 localStorage 없이 검증.
  function memStorage() {
    const map = new Map();
    return {
      getItem: (k) => (map.has(k) ? map.get(k) : null),
      setItem: (k, v) => map.set(k, String(v)),
      removeItem: (k) => map.delete(k),
      _map: map,
    };
  }
  const state = { routines: [{ id: 'r1', name: '운동', iconKey: 'activity', color: '#0EA5A4', goalType: 'atLeast', goalCount: 7, visible: true }], checks: {}, bonusChances: {}, weekStart: 0, notif: true, remindHour: 21 };

  it('save then load round-trips through the storage key', () => {
    const store = memStorage();
    saveState(state, store);
    expect(store._map.has(STORAGE_KEY)).toBe(true);
    expect(loadState(store)).toEqual(state);
  });

  it('loadState returns null when nothing is stored', () => {
    expect(loadState(memStorage())).toBe(null);
  });

  it('clearState removes the stored entry', () => {
    const store = memStorage();
    saveState(state, store);
    clearState(store);
    expect(loadState(store)).toBe(null);
  });
});

// ---- 찬스(#16) ----
// 잔여를 카운터가 아니라 사용 기록에서 파생하므로, 아래 테스트는 대부분
// "사용을 넣으면 줄고, 빼면 저절로 돌아온다"를 확인한다.
const GYM = { id: 'r1', goalType: 'atLeast', goalCount: 6 };   // 운동 — 늘리는 습관
const BEER = { id: 'r2', goalType: 'atMost', goalCount: 1 };   // 음주 — 줄이는 습관
const W = { chance: 'weekly' };
const M = { chance: 'monthly' };

describe('찬스 — 목표 집계(goalType 분기)', () => {
  it('완료 기준: 운동 주 6회 이상을 5일만 하고 하루를 찬스로 킵하면 그 주는 성공', () => {
    const checks = {};
    for (let i = 0; i < 5; i += 1) checks[formatDateKey(new Date(2026, 6, 12 + i))] = { r1: true };
    checks['2026-07-17'] = { r1: W }; // 6일차를 찬스로

    expect(weekCount(weekStart, GYM, checks)).toBe(6); // atLeast → 찬스가 +1
    expect(evaluateWeek(GYM, checks, weekStart)).toBe(true);
  });

  it('완료 기준: 음주 주 1회 이하에서 2일 마셨어도 하루를 찬스로 킵하면 성공', () => {
    // 이틀 마셨지만 하루는 찬스로 면제 → 카운트에 잡히는 건 1일
    const checks = { '2026-07-13': { r2: true }, '2026-07-15': { r2: M } };

    expect(weekCount(weekStart, BEER, checks)).toBe(1); // atMost → 찬스는 카운트 제외
    expect(evaluateWeek(BEER, checks, weekStart)).toBe(true);
  });

  it('atMost에서 찬스가 +1로 새지 않는다 (분기 누락 시 이 테스트가 깨진다)', () => {
    const checks = { '2026-07-13': { r2: W }, '2026-07-14': { r2: M } };
    expect(weekCount(weekStart, BEER, checks)).toBe(0);
  });
});

describe('찬스 — 잔여 파생과 리필', () => {
  const d = (s) => new Date(...s);

  it('기본 보유는 주 1 + 월 1이고, 사용하면 그 주기 안에서 0이 된다', () => {
    expect(chanceSummary({}, 'r1', TODAY, [], 0)).toEqual({ weekly: 1, monthly: 1, bonus: 0 });

    const used = { '2026-07-15': { r1: W } };
    expect(chanceSummary(used, 'r1', TODAY, [], 0)).toEqual({ weekly: 0, monthly: 1, bonus: 0 });
  });

  it('주가 바뀌면 주찬스가 자동으로 돌아온다 (타이머 없이 날짜만으로)', () => {
    const used = { '2026-07-15': { r1: W } }; // 7/12~7/18 주
    expect(weeklyChanceLeft(used, 'r1', TODAY, 0)).toBe(0);
    expect(weeklyChanceLeft(used, 'r1', d([2026, 6, 20]), 0)).toBe(1); // 다음 주
  });

  it('달이 바뀌면 월찬스가 자동으로 돌아온다', () => {
    const used = { '2026-07-15': { r1: M } };
    expect(monthlyChanceLeft(used, 'r1', TODAY)).toBe(0);
    expect(monthlyChanceLeft(used, 'r1', d([2026, 7, 3]))).toBe(1); // 8월
  });

  it('이월·스택이 없다 — 안 쓰고 여러 주가 지나도 잔여는 최대 1', () => {
    expect(weeklyChanceLeft({}, 'r1', d([2026, 8, 1]), 0)).toBe(1);
    expect(monthlyChanceLeft({}, 'r1', d([2026, 11, 1]))).toBe(1);
  });

  it('주 시작 요일(weekStart) 설정을 따른다', () => {
    const used = { '2026-07-12': { r1: W } }; // 일요일
    // 일요일 시작이면 7/12~7/18이 같은 주 → 7/15에서 소진 상태
    expect(weeklyChanceLeft(used, 'r1', TODAY, 0)).toBe(0);
    // 월요일 시작이면 7/12는 직전 주(7/6~7/12)에 속함 → 7/15 기준으론 잔여 1
    expect(weeklyChanceLeft(used, 'r1', TODAY, 1)).toBe(1);
  });

  it('소급 체크는 그 날짜가 속한 주/월 기준으로 판정된다', () => {
    const used = { '2026-06-10': { r1: W } }; // 지난달
    expect(weeklyChanceLeft(used, 'r1', TODAY, 0)).toBe(1);
    expect(monthlyChanceLeft(used, 'r1', TODAY)).toBe(1);
    expect(weeklyChanceLeft(used, 'r1', d([2026, 5, 11]), 0)).toBe(0);
  });

  it('찬스 잔여는 루틴별로 독립이다', () => {
    const used = { '2026-07-15': { r1: W } };
    expect(weeklyChanceLeft(used, 'r1', TODAY, 0)).toBe(0);
    expect(weeklyChanceLeft(used, 'r2', TODAY, 0)).toBe(1);
  });
});

describe('찬스 — 소진 순서와 기타찬스', () => {
  const bonuses = [
    { id: 'b1', reason: '장염', createdAt: '2026-07-01T00:00:00.000Z' },
    { id: 'b2', reason: '출장', createdAt: '2026-07-05T00:00:00.000Z' },
  ];

  it('주 → 월 → 기타(오래된 것부터) 순으로 소진한다', () => {
    let checks = {};
    expect(pickChanceSource(checks, 'r1', TODAY, bonuses, 0)).toEqual(W);

    checks = { '2026-07-15': { r1: W } };
    expect(pickChanceSource(checks, 'r1', TODAY, bonuses, 0)).toEqual(M);

    checks = { '2026-07-15': { r1: W }, '2026-07-16': { r1: M } };
    expect(pickChanceSource(checks, 'r1', TODAY, bonuses, 0)).toEqual({ chance: 'bonus', bonusId: 'b1' });

    checks['2026-07-17'] = { r1: { chance: 'bonus', bonusId: 'b1' } };
    expect(pickChanceSource(checks, 'r1', TODAY, bonuses, 0)).toEqual({ chance: 'bonus', bonusId: 'b2' });
  });

  it('보유가 전부 소진되면 null', () => {
    const checks = {
      '2026-07-15': { r1: W },
      '2026-07-16': { r1: M },
      '2026-07-17': { r1: { chance: 'bonus', bonusId: 'b1' } },
      '2026-07-18': { r1: { chance: 'bonus', bonusId: 'b2' } },
    };
    expect(pickChanceSource(checks, 'r1', TODAY, bonuses, 0)).toBe(null);
    expect(bonusChancesLeft(checks, 'r1', bonuses)).toEqual([]);
  });

  it('기타찬스는 개수 제한이 없고 쓰지 않은 것만 남는다', () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ id: `b${i + 1}`, reason: `사유${i}`, createdAt: `2026-07-0${i + 1}T00:00:00.000Z` }));
    const checks = { '2026-07-15': { r1: { chance: 'bonus', bonusId: 'b3' } } };
    expect(bonusChancesLeft(checks, 'r1', many).map((b) => b.id)).toEqual(['b1', 'b2', 'b4', 'b5']);
  });

  it('nextBonusId는 기존 id와 충돌하지 않는다', () => {
    expect(nextBonusId([])).toBe('b1');
    expect(nextBonusId(bonuses)).toBe('b3');
    expect(nextBonusId([{ id: 'weird' }, { id: 'b7' }])).toBe('b8');
  });

  it('chanceUsages는 날짜 오름차순으로 사용을 모은다', () => {
    const checks = { '2026-07-18': { r1: M }, '2026-07-13': { r1: W } };
    expect(chanceUsages(checks, 'r1').map((u) => u.dateKey)).toEqual(['2026-07-13', '2026-07-18']);
  });

  it('루틴 삭제 시 기타찬스도 함께 정리된다', () => {
    const store = { r1: bonuses, r2: [{ id: 'b1', reason: 'x', createdAt: '2026-07-01T00:00:00.000Z' }] };
    expect(purgeRoutineBonuses(store, 'r1')).toEqual({ r2: store.r2 });
  });
});

describe('찬스 — 3-상태 토글과 복원', () => {
  const bonuses = [];

  it('안함 → 했음 → 찬스 → 안함 순으로 순환한다', () => {
    const a = cycleCheck({}, GYM, '2026-07-15', bonuses, 0);
    expect(a.checks['2026-07-15'].r1).toBe(true);

    const b = cycleCheck(a.checks, GYM, '2026-07-15', bonuses, 0);
    expect(b.checks['2026-07-15'].r1).toEqual(W);

    const c = cycleCheck(b.checks, GYM, '2026-07-15', bonuses, 0);
    expect(c.checks['2026-07-15']).toBeUndefined(); // 빈 날짜는 삭제
  });

  it('찬스를 되돌리면 소진됐던 잔여가 복원된다 (사용 기록이 곧 잔여)', () => {
    const used = cycleCheck(cycleCheck({}, GYM, '2026-07-15', bonuses, 0).checks, GYM, '2026-07-15', bonuses, 0);
    expect(weeklyChanceLeft(used.checks, 'r1', TODAY, 0)).toBe(0);

    const undone = cycleCheck(used.checks, GYM, '2026-07-15', bonuses, 0);
    expect(weeklyChanceLeft(undone.checks, 'r1', TODAY, 0)).toBe(1);
  });

  it('보유 0이면 찬스 단계를 건너뛰고 blocked로 알린다', () => {
    const spent = { '2026-07-13': { r1: W }, '2026-07-14': { r1: M }, '2026-07-15': { r1: true } };
    const next = cycleCheck(spent, GYM, '2026-07-15', [], 0);
    expect(next.blocked).toBe(true);
    expect(next.checks['2026-07-15']).toBeUndefined(); // 했음 → 안함으로 건너뜀
  });

  it('다른 루틴의 같은 날 체크를 건드리지 않는다', () => {
    const start = { '2026-07-15': { r2: true } };
    const next = cycleCheck(start, GYM, '2026-07-15', bonuses, 0);
    expect(next.checks['2026-07-15']).toEqual({ r2: true, r1: true });
  });
});

describe('찬스 — 스키마 v2 마이그레이션', () => {
  const routine = { id: 'r1', name: '운동', iconKey: 'activity', color: '#0EA5A4', goalType: 'atLeast', goalCount: 6, visible: true };

  it('v1 저장 데이터를 손실 없이 v2로 읽는다', () => {
    const v1 = JSON.stringify({
      version: 1,
      routines: [routine],
      checks: { '2026-07-15': { r1: true } },
      weekStart: 1,
      notif: false,
      remindHour: 8,
    });
    expect(parseState(v1)).toEqual({
      routines: [routine],
      checks: { '2026-07-15': { r1: true } },
      bonusChances: {},
      weekStart: 1,
      notif: false,
      remindHour: 8,
    });
  });

  it('v2 키가 없으면 v1 키에서 읽고, v1 키는 롤백 안전망으로 남긴다', () => {
    const map = new Map();
    const store = {
      getItem: (k) => (map.has(k) ? map.get(k) : null),
      setItem: (k, v) => map.set(k, String(v)),
      removeItem: (k) => map.delete(k),
    };
    map.set(STORAGE_KEY_V1, JSON.stringify({ version: 1, routines: [routine], checks: { '2026-07-15': { r1: true } }, weekStart: 0, notif: true, remindHour: 21 }));

    const loaded = loadState(store);
    expect(loaded.checks).toEqual({ '2026-07-15': { r1: true } });

    saveState(loaded, store);
    expect(map.has(STORAGE_KEY)).toBe(true);
    expect(map.has(STORAGE_KEY_V1)).toBe(true); // 롤백해도 구버전이 읽을 수 있어야 한다
    expect(JSON.parse(map.get(STORAGE_KEY)).version).toBe(STORAGE_VERSION);
  });

  it('clearState는 두 키를 모두 지운다 — 안 그러면 v1 폴백이 옛 기록을 되살린다', () => {
    const map = new Map();
    const store = {
      getItem: (k) => (map.has(k) ? map.get(k) : null),
      setItem: (k, v) => map.set(k, String(v)),
      removeItem: (k) => map.delete(k),
    };
    map.set(STORAGE_KEY_V1, JSON.stringify({ version: 1, routines: [routine], checks: { '2026-07-15': { r1: true } }, weekStart: 0, notif: true, remindHour: 21 }));
    saveState(loadState(store), store);

    clearState(store);
    expect(loadState(store)).toBe(null);
  });

  it('찬스 체크를 직렬화 → 파싱해도 형태가 유지된다', () => {
    const state = {
      routines: [routine],
      checks: { '2026-07-15': { r1: W }, '2026-07-16': { r1: { chance: 'bonus', bonusId: 'b1' } } },
      bonusChances: { r1: [{ id: 'b1', reason: '장염', createdAt: '2026-07-01T00:00:00.000Z' }] },
      weekStart: 0,
      notif: true,
      remindHour: 21,
    };
    expect(parseState(serializeState(state))).toEqual(state);
  });

  it('알 수 없는 찬스 종류·사유 없는 기타찬스는 버린다', () => {
    const raw = JSON.stringify({
      version: STORAGE_VERSION,
      routines: [routine],
      checks: { '2026-07-15': { r1: { chance: 'yearly' } }, '2026-07-16': { r1: { chance: 'bonus' } } },
      bonusChances: { r1: [{ id: 'b1', reason: '  ', createdAt: '2026-07-01T00:00:00.000Z' }, { id: 'b2', reason: '출장', createdAt: '2026-07-02T00:00:00.000Z' }] },
      weekStart: 0,
      notif: true,
      remindHour: 21,
    });
    const parsed = parseState(raw);
    expect(parsed.checks).toEqual({}); // 알 수 없는 종류, bonusId 없는 bonus 모두 제거
    expect(parsed.bonusChances.r1.map((b) => b.id)).toEqual(['b2']); // 빈 사유 제거
  });
});

describe('찬스 — 기타찬스 목록 파생', () => {
  const bonuses = [
    { id: 'b1', reason: '장염', createdAt: '2026-07-01T00:00:00.000Z' },
    { id: 'b2', reason: '출장', createdAt: '2026-07-05T00:00:00.000Z' },
  ];

  it('사용한 기타찬스에 사용일을 붙이고, 안 쓴 것은 null', () => {
    const checks = { '2026-07-16': { r1: { chance: 'bonus', bonusId: 'b2' } } };
    expect(bonusChanceRows(checks, 'r1', bonuses)).toEqual([
      { id: 'b1', reason: '장염', createdAt: '2026-07-01T00:00:00.000Z', usedOn: null },
      { id: 'b2', reason: '출장', createdAt: '2026-07-05T00:00:00.000Z', usedOn: '2026-07-16' },
    ]);
  });

  it('목록이 없으면 빈 배열', () => {
    expect(bonusChanceRows({}, 'r1', undefined)).toEqual([]);
  });
});
