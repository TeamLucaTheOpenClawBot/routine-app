// 데일리 리마인더 크론 (#6 2b) — 부수효과(발송·타이머). 순수 판정은 reminders.js.
// 1분마다 모든 구독을 훑어, 소유자의 settings(notif·remindHour)와 그 기기 tz의 오늘 미완료로
// shouldRemind면 그 기기에 푸시를 보내고 last_sent를 갱신한다(하루 1회). 발송기 없으면 no-op.
import { localDateParts, incompleteToday, shouldRemind } from './reminders.js';

export function createReminderCron({ store, pushStore, pushSender, nowFn }) {
  const now = nowFn ?? (() => Date.now());

  // 한 틱: 모든 구독 판정·발송. 테스트에서 직접 호출 가능. 보낸 기기 수를 돌려준다.
  async function tick() {
    if (!pushSender) return 0;
    const subs = pushStore.listAll();
    if (!subs.length) return 0;
    const nowMs = now();
    const settingsCache = new Map(); // owner -> { notif, remindHour, routines }
    const incompleteCache = new Map(); // `${owner}\t${dateKey}` -> number
    let sent = 0;
    for (const sub of subs) {
      const { dateKey, hour } = localDateParts(nowMs, sub.tz);
      let s = settingsCache.get(sub.owner);
      if (!s) {
        const settings = store.getDoc(sub.owner, 'settings') || {};
        s = { notif: settings.notif !== false, remindHour: settings.remindHour, routines: store.getDoc(sub.owner, 'routines') };
        settingsCache.set(sub.owner, s);
      }
      const cacheKey = `${sub.owner}\t${dateKey}`;
      let incomplete = incompleteCache.get(cacheKey);
      if (incomplete === undefined) {
        incomplete = incompleteToday(s.routines, store.checkedRoutineIds(sub.owner, dateKey));
        incompleteCache.set(cacheKey, incomplete);
      }
      if (!shouldRemind({ notif: s.notif, remindHour: s.remindHour, localHour: hour, localDateKey: dateKey, lastSent: sub.lastSent, incomplete })) continue;
      const n = await pushSender.sendToAll(
        [{ endpoint: sub.endpoint, keys: sub.keys }],
        { title: '루틴 체크', body: `오늘 루틴 ${incomplete}개 남았어요. 마무리해볼까요?`, url: '/' },
        (endpoint) => pushStore.removeEndpoint(endpoint),
      );
      if (n > 0) {
        pushStore.setLastSent(sub.owner, sub.endpoint, dateKey);
        sent += n;
      }
    }
    return sent;
  }

  let timer = null;
  return {
    tick,
    start(intervalMs = 60000) {
      if (timer) return;
      timer = setInterval(() => {
        tick().catch((err) => console.error('리마인더 tick 실패:', err));
      }, intervalMs);
      if (timer.unref) timer.unref(); // 크론이 프로세스 종료를 막지 않게.
    },
    stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
  };
}
