import { describe, expect, it } from 'vitest';
import { evaluateWeek } from './appLogic';

describe('evaluateWeek', () => {
  it('marks a completed week for atLeast goals and a reduced week for atMost goals', () => {
    const routine = { id: 'r1', goalType: 'atLeast', goalCount: 3 };
    const checks = {
      '2026-07-13': { r1: true },
      '2026-07-14': { r1: true },
      '2026-07-15': { r1: true },
    };

    expect(evaluateWeek(routine, checks, '2026-07-12')).toBe(true);
  });

  it('treats atMost goals as achieved when completion count is below the threshold', () => {
    const routine = { id: 'r2', goalType: 'atMost', goalCount: 1 };
    const checks = {
      '2026-07-12': { r2: true },
    };

    expect(evaluateWeek(routine, checks, '2026-07-12')).toBe(true);
  });
});
