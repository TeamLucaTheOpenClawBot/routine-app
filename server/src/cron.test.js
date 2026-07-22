import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, createStore } from './store.js';
import { createPushStore } from './push-store.js';
import { createReminderCron } from './cron.js';

const ME = 'user-1';
const KEYS = { p256dh: 'p', auth: 'a' };
const FCM = (n) => `https://fcm.googleapis.com/fcm/send/${n}`;
// 2026-07-22T12:00:00Z = 서울 21:00 (UTC+9) — remindHour 21과 맞물리게.
const AT_2100_SEOUL = Date.UTC(2026, 6, 22, 12, 0);

let db;
let store;
let pushStore;
let sends;
let sender;

beforeEach(() => {
  db = openDatabase(':memory:');
  store = createStore(db);
  pushStore = createPushStore(db);
  sends = [];
  sender = {
    async sendToAll(subs, payload) {
      sends.push({ subs, payload });
      return subs.length; // 모두 성공
    },
  };
  // 소유자 데이터: 루틴 2개, 설정(알림 켜짐·21시). 오늘 체크 없음 → 미완료 2.
  store.sync(ME, {
    cursor: 0,
    docs: [
      { key: 'routines', value: [{ id: 'r1', visible: true }, { id: 'r2', visible: true }], ts: 1 },
      { key: 'settings', value: { notif: true, remindHour: 21, weekStart: 0 }, ts: 1 },
    ],
  });
  pushStore.add(ME, { endpoint: FCM(1), keys: KEYS }, 1, 'Asia/Seoul');
});

const cron = () => createReminderCron({ store, pushStore, pushSender: sender, nowFn: () => AT_2100_SEOUL });

describe('reminder cron tick', () => {
  it('로컬 21시·미완료·미발송이면 보내고 last_sent를 기록한다', async () => {
    const n = await cron().tick();
    expect(n).toBe(1);
    expect(sends).toHaveLength(1);
    expect(sends[0].payload.body).toContain('2개');
    // 같은 날 다시 tick하면 last_sent 때문에 안 보낸다
    sends = [];
    expect(await cron().tick()).toBe(0);
    expect(sends).toHaveLength(0);
  });

  it('알림이 꺼져 있으면 안 보낸다', async () => {
    store.sync(ME, { cursor: 0, docs: [{ key: 'settings', value: { notif: false, remindHour: 21 }, ts: 2 }] });
    expect(await cron().tick()).toBe(0);
  });

  it('로컬 시가 remindHour가 아니면 안 보낸다', async () => {
    const c = createReminderCron({ store, pushStore, pushSender: sender, nowFn: () => Date.UTC(2026, 6, 22, 3, 0) }); // 서울 12:00
    expect(await c.tick()).toBe(0);
  });

  it('오늘 모두 완료했으면 안 보낸다', async () => {
    store.sync(ME, {
      cursor: 0,
      cells: [
        { dateKey: '2026-07-22', routineId: 'r1', value: true, ts: 2 },
        { dateKey: '2026-07-22', routineId: 'r2', value: { chance: 'weekly' }, ts: 2 },
      ],
    });
    expect(await cron().tick()).toBe(0);
  });

  it('발송기가 없으면 no-op', async () => {
    const c = createReminderCron({ store, pushStore, pushSender: null, nowFn: () => AT_2100_SEOUL });
    expect(await c.tick()).toBe(0);
  });
});
