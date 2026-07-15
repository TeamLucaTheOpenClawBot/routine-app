import { describe, expect, it } from 'vitest';
import {
  achieved,
  achievementRate,
  currentStreak,
  evaluateWeek,
  finalizedResults,
  formatDateKey,
  goalText,
  makeNewRoutine,
  rangeStart,
  startOfToday,
  startOfWeek,
  weekCount,
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
    expect(weekCount(weekStart, 'r1', checks)).toBe(2);
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
