import { describe, expect, it } from 'vitest';
import {
  achieved,
  achievementRate,
  currentStreak,
  evaluateWeek,
  finalizedResults,
  goalText,
  makeNewRoutine,
  startOfWeek,
  weekCount,
} from './appLogic';

const weekStart = new Date(2026, 6, 12); // 일요일

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
    const results = finalizedResults(routine, {}, 0);
    // 과거 8주만 완료됨(이번 주/미래 2주 제외).
    expect(results.length).toBe(8);
    expect(results.every((r) => r === false)).toBe(true);
  });
});
