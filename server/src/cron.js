// 데일리 리마인더 크론 (#6 2b) — 부수효과(발송·타이머). 순수 판정은 reminders.js.
// 1분마다 모든 구독을 훑어, 소유자의 settings(notif·remindHour)와 그 기기 tz의 오늘 미완료로
// shouldRemind면 그 기기에 푸시를 보내고 last_sent를 갱신한다(하루 1회). 발송기 없으면 no-op.
import { localDateParts, incompleteToday, shouldRemind } from './reminders.js';

export function createReminderCron({ store, pushStore, pushSender, nowFn }) {
  const now = nowFn ?? (() => Date.now());

  // 한 틱: 모든 구독 판정·발송. 테스트에서 직접 호출 가능. 보낸 기기 수를 돌려준다.
  // **직렬화**: 느린 발송이 다음 분 틱과 겹치면 둘 다 미설정 last_sent를 읽어 이중 발송된다(#37 Codex P2).
  // 진행 중이면 이번 호출을 건너뛴다(발송 후 last_sent가 기록돼야 다음 틱이 스킵한다).
  let running = false;
  async function tick() {
    if (running || !pushSender) return 0;
    const subs = pushStore.listAll();
    if (!subs.length) return 0;
    running = true;
    try {
      return await tickInner(subs);
    } finally {
      running = false;
    }
  }

  async function tickInner(subs) {
    const nowMs = now();
    const settingsCache = new Map(); // owner -> { notif, remindHour, routines }
    const incompleteCache = new Map(); // `${owner}\t${dateKey}` -> number
    let sent = 0;
    for (const sub of subs) {
      const { dateKey, hour, minute } = localDateParts(nowMs, sub.tz);
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
      if (!shouldRemind({ notif: s.notif, remindHour: s.remindHour, localHour: hour, localMinute: minute, localDateKey: dateKey, lastSent: sub.lastSent, incomplete })) continue;
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
      const run = () => tick().catch((err) => console.error('리마인더 tick 실패:', err));
      run(); // 기동 즉시 1회 — 인터벌 첫 틱(최대 intervalMs 뒤)을 기다리다 그 시간대를 놓치지 않게(#37 Codex P2).
      timer = setInterval(run, intervalMs);
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
