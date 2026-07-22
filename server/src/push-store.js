// Web Push 구독 저장소 (#6 2단계). 동기화 store와 같은 SQLite DB를 공유하되, 파일을 나눠
// 관심사를 분리한다. **web-push(암호화·발송)에 의존하지 않는다** — 순수 저장 로직이라 테스트 대상.
// 실제 발송은 push-send.js(런타임 전용, web-push 의존)가 이 목록을 받아 처리한다.
//
// 구독은 소유자(sub) 단위로 묶는다 — 동기화와 같은 신원 키다. 한 소유자가 여러 기기를 쓰면
// 기기마다 endpoint가 하나씩 쌓인다. (owner, endpoint)가 기본키라 같은 기기의 재구독은 덮어쓴다.

const SCHEMA = `
CREATE TABLE IF NOT EXISTS push_subs (
  owner    TEXT    NOT NULL,
  endpoint TEXT    NOT NULL,
  keys     TEXT    NOT NULL,   -- JSON { p256dh, auth }
  ts       INTEGER NOT NULL,   -- 저장 시각(클라이언트 논리 시각). 진단/정리용.
  PRIMARY KEY (owner, endpoint)
);
CREATE INDEX IF NOT EXISTS push_by_owner ON push_subs (owner);
`;

// 발송 시 서버는 endpoint URL로 아웃바운드 요청을 한다(web-push). 임의 endpoint를 저장하면 인증
// 사용자가 그걸 내부 주소로 지정해 **블라인드 SSRF**를 만들 수 있다(클라 PushManager 검증은 서버를
// 보호 못 한다). 그래서 알려진 Web Push 서비스 호스트(https)로만 제한한다(#35 Codex P2).
const PUSH_HOST_SUFFIXES = [
  'fcm.googleapis.com', // Chrome/Chromium(FCM)
  'push.services.mozilla.com', // Firefox (updates.push.services.mozilla.com)
  'notify.windows.com', // Edge/WNS (*.notify.windows.com)
  'push.apple.com', // Safari (web.push.apple.com)
];

export function isAllowedPushEndpoint(endpoint) {
  let u;
  try {
    u = new URL(endpoint);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase();
  return PUSH_HOST_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`));
}

// 들어온 구독을 방어적으로 정규화. 형태가 어긋나거나 승인된 푸시 서비스가 아니면 null(호출자가 400).
export function normalizeSubscription(input) {
  if (!input || typeof input !== 'object') return null;
  if (typeof input.endpoint !== 'string' || !isAllowedPushEndpoint(input.endpoint)) return null;
  const keys = input.keys;
  if (!keys || typeof keys !== 'object') return null;
  if (typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string') return null;
  return { endpoint: input.endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } };
}

export function createPushStore(db) {
  db.exec(SCHEMA);
  const upsert = db.prepare(`
    INSERT INTO push_subs (owner, endpoint, keys, ts)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(owner, endpoint) DO UPDATE SET keys = excluded.keys, ts = excluded.ts
  `);
  const delByEndpoint = db.prepare('DELETE FROM push_subs WHERE owner = ? AND endpoint = ?');
  // 만료(410 Gone) 정리는 소유자 무관하게 endpoint로 지운다 — 발송 측이 어느 소유자든 죽은 구독을 치운다.
  const delEndpointAny = db.prepare('DELETE FROM push_subs WHERE endpoint = ?');
  const listForOwner = db.prepare('SELECT endpoint, keys FROM push_subs WHERE owner = ?');

  return {
    // 구독 저장(멱등 upsert). sub은 normalizeSubscription을 통과한 형태여야 한다.
    add(owner, sub, ts) {
      upsert.run(owner, sub.endpoint, JSON.stringify(sub.keys), Number.isSafeInteger(ts) && ts >= 0 ? ts : 0);
    },
    // 이 소유자의 특정 기기 구독 해제.
    remove(owner, endpoint) {
      delByEndpoint.run(owner, endpoint);
    },
    // 만료된 endpoint를 어느 소유자에게서든 제거(발송 시 410 응답 정리용).
    removeEndpoint(endpoint) {
      delEndpointAny.run(endpoint);
    },
    // 소유자의 모든 구독(발송 대상). keys는 JSON을 파싱해 돌려준다.
    listByOwner(owner) {
      return listForOwner.all(owner).map((r) => ({ endpoint: r.endpoint, keys: JSON.parse(r.keys) }));
    },
    // 소유자 키 이관(재키잉) — cells/docs만 옮기는 store.rekeyOwner가 이 별도 테이블은 못 건드리므로
    // rekey.js가 함께 호출한다. 안 하면 재키잉 후 새 owner의 구독이 비어 푸시를 못 받는다. endpoint는
    // 사실상 유일해 충돌이 거의 없지만, (to, endpoint)가 이미 있으면 OR REPLACE로 안전하게 병합한다.
    rekeyOwner(from, to) {
      if (!from || !to || from === to) return 0;
      const info = db.prepare('UPDATE OR REPLACE push_subs SET owner = ? WHERE owner = ?').run(to, from);
      return info.changes ?? 0;
    },
  };
}
