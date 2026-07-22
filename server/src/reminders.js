// 데일리 리마인더 판정 로직 (#6 2b) — 순수/결정적. 크론(부수효과·발송)과 분리해 테스트한다.
// Intl(내장)으로 특정 tz의 현재 로컬 시각을 구하므로 DST가 반영된다. now(ms)는 주입해 결정적으로.

// tz에서의 로컬 날짜(YYYY-MM-DD)와 시(0~23). tz가 잘못됐으면 UTC로 폴백한다.
export function localDateParts(nowMs, tz) {
  let parts;
  try {
    parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(nowMs));
  } catch {
    if (tz === 'UTC' || !tz) return { dateKey: '1970-01-01', hour: 0 };
    return localDateParts(nowMs, 'UTC');
  }
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return { dateKey: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) };
}

// 오늘 미완료 루틴 수 — 클라이언트 remainingToday의 서버판. checkedIds = 그 날짜에 non-null 셀이 있는
// 루틴 id(했음·찬스 모두 '처리함'으로 침, 클라 checkState!=='none'과 동일). 숨김 루틴은 제외.
export function incompleteToday(routines, checkedIds) {
  if (!Array.isArray(routines)) return 0;
  const checked = new Set(checkedIds);
  return routines.filter((r) => r && typeof r.id === 'string' && r.visible !== false && !checked.has(r.id)).length;
}

// 지금 이 소유자/기기에 리마인더를 보내야 하는가(순수). 크론이 1분마다 돌며 각 구독에 대해 판정한다.
// 조건: 알림 켜짐 · 로컬 시가 remindHour · 오늘 아직 안 보냄 · 미완료가 있음.
export function shouldRemind({ notif, remindHour, localHour, localDateKey, lastSent, incomplete }) {
  if (!notif) return false;
  if (!Number.isInteger(remindHour) || localHour !== remindHour) return false;
  if (lastSent === localDateKey) return false; // 오늘 이미 발송(하루 1회)
  return incomplete > 0; // 다 했으면 안 보낸다
}
