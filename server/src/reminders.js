// 데일리 리마인더 판정 로직 (#6 2b) — 순수/결정적. 크론(부수효과·발송)과 분리해 테스트한다.
// Intl(내장)으로 특정 tz의 현재 로컬 시각을 구하므로 DST가 반영된다. now(ms)는 주입해 결정적으로.

// 정각 근처 허용 창(분). 크론 틱은 프로세스 기동 시각에 위상이 잡혀 정확히 :00에 안 떨어지므로,
// 시의 첫 몇 분 안에 든 틱에서만 발송한다 — 그 시간대 아무 때나(예: :30 재기동) 늦게 보내지 않게(#37 Codex P2).
export const REMIND_WINDOW_MIN = 5;

// tz에서의 로컬 날짜(YYYY-MM-DD)·시(0~23)·분(0~59). tz가 잘못됐으면 UTC로 폴백한다.
export function localDateParts(nowMs, tz) {
  let parts;
  try {
    parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(nowMs));
  } catch {
    if (tz === 'UTC' || !tz) return { dateKey: '1970-01-01', hour: 0, minute: 0 };
    return localDateParts(nowMs, 'UTC');
  }
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return { dateKey: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')), minute: Number(get('minute')) };
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
export function shouldRemind({ notif, remindHour, localHour, localMinute, localDateKey, lastSent, incomplete }) {
  if (!notif) return false;
  if (!Number.isInteger(remindHour) || localHour !== remindHour) return false;
  // 정각 근처(첫 REMIND_WINDOW_MIN분)에만 — 그 시간대 아무 때나 늦게 보내지 않게.
  if (!(localMinute >= 0 && localMinute < REMIND_WINDOW_MIN)) return false;
  if (lastSent === localDateKey) return false; // 오늘 이미 발송(하루 1회)
  return incomplete > 0; // 다 했으면 안 보낸다
}
