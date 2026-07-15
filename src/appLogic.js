export const PALETTE = ['#0EA5A4', '#16A34A', '#2563EB', '#7C3AED', '#E11D48', '#F59E0B', '#0891B2', '#DB2777'];
export const ICON_KEYS = ['dumbbell', 'wine', 'drop', 'book', 'moon', 'leaf', 'run', 'pencil'];
export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
export const TODAY = new Date(2026, 6, 15);

export function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function startOfWeek(date) {
  const result = new Date(date);
  result.setDate(result.getDate() - result.getDay());
  return result;
}

export function formatDateKey(date) {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseDateKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function evaluateWeek(routine, checks, weekStart) {
  let count = 0;
  for (let i = 0; i < 7; i += 1) {
    const key = formatDateKey(addDays(weekStart, i));
    if (checks[key]?.[routine.id]) count += 1;
  }
  if (routine.goalType === 'atLeast') return count >= routine.goalCount;
  return count <= routine.goalCount;
}

export function buildInitialRoutines() {
  return [
    { id: 'r1', name: '운동', iconKey: 'dumbbell', color: '#0EA5A4', goalType: 'atLeast', goalCount: 7, visible: true },
    { id: 'r2', name: '음주', iconKey: 'wine', color: '#E11D48', goalType: 'atMost', goalCount: 1, visible: true },
  ];
}

export function createSeedChecks(routines) {
  const checks = {};
  routines.forEach((routine) => {
    for (let offset = 0; offset < 60; offset += 1) {
      const date = addDays(startOfWeek(addDays(TODAY, -30)), offset);
      if (date > TODAY) continue;
      if (Math.random() < 0.7) {
        const key = formatDateKey(date);
        if (!checks[key]) checks[key] = {};
        checks[key][routine.id] = true;
      }
    }
  });
  return checks;
}
