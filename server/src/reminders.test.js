import { describe, expect, it } from 'vitest';
import { localDateParts, incompleteToday, shouldRemind } from './reminders.js';

describe('localDateParts', () => {
  it('tz의 로컬 날짜·시를 구한다(DST tz는 Intl이 처리)', () => {
    // 2026-07-22T00:30:00Z → 서울(UTC+9)은 09:30, 같은 날짜
    const ms = Date.UTC(2026, 6, 22, 0, 30);
    expect(localDateParts(ms, 'Asia/Seoul')).toEqual({ dateKey: '2026-07-22', hour: 9 });
    // 뉴욕(UTC-4, DST)은 전날 20:30
    expect(localDateParts(ms, 'America/New_York')).toEqual({ dateKey: '2026-07-21', hour: 20 });
  });
  it('잘못된 tz는 UTC로 폴백', () => {
    const ms = Date.UTC(2026, 6, 22, 5, 0);
    expect(localDateParts(ms, 'Not/AZone')).toEqual({ dateKey: '2026-07-22', hour: 5 });
  });
});

describe('incompleteToday', () => {
  const routines = [
    { id: 'r1', visible: true },
    { id: 'r2', visible: true },
    { id: 'r3', visible: false }, // 숨김 → 제외
  ];
  it('보이는 루틴 중 오늘 체크 안 된 수', () => {
    expect(incompleteToday(routines, [])).toBe(2);
    expect(incompleteToday(routines, ['r1'])).toBe(1);
    expect(incompleteToday(routines, ['r1', 'r2'])).toBe(0);
    expect(incompleteToday(routines, ['r3'])).toBe(2); // 숨김 체크는 무의미
  });
  it('루틴이 배열이 아니면 0', () => {
    expect(incompleteToday(null, [])).toBe(0);
  });
});

describe('shouldRemind', () => {
  const base = { notif: true, remindHour: 21, localHour: 21, localDateKey: '2026-07-22', lastSent: null, incomplete: 2 };
  it('알림 켜짐·정시·미발송·미완료면 true', () => {
    expect(shouldRemind(base)).toBe(true);
  });
  it('알림 꺼짐이면 false', () => {
    expect(shouldRemind({ ...base, notif: false })).toBe(false);
  });
  it('로컬 시가 remindHour가 아니면 false', () => {
    expect(shouldRemind({ ...base, localHour: 20 })).toBe(false);
  });
  it('오늘 이미 보냈으면 false', () => {
    expect(shouldRemind({ ...base, lastSent: '2026-07-22' })).toBe(false);
    // 어제 보낸 것은 오늘 다시 보낸다
    expect(shouldRemind({ ...base, lastSent: '2026-07-21' })).toBe(true);
  });
  it('미완료가 없으면 false', () => {
    expect(shouldRemind({ ...base, incomplete: 0 })).toBe(false);
  });
});
