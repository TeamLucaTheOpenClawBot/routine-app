// Web Push 구독 클라이언트 (#6 2단계). SW의 pushManager로 구독하고 서버(/api/push/*)에 등록한다.
// 순수 헬퍼(base64 변환·VAPID 키 조회 분류)는 테스트하고, 실제 구독(pushManager)은 얇게 감싼다.

// VAPID 공개키(base64url) → applicationServerKey(Uint8Array).
export function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function pushSupported() {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    'PushManager' in window &&
    typeof Notification !== 'undefined'
  );
}

// 서버 VAPID 공개키를 조회한다. 키 미설정(서버 푸시 비활성)·오류면 null.
export async function fetchVapidKey({ fetchImpl } = {}) {
  const doFetch = fetchImpl ?? (typeof fetch !== 'undefined' ? fetch : null);
  if (!doFetch) return null;
  try {
    const res = await doFetch('/api/push/key', { credentials: 'same-origin' });
    if (!res.ok) return null;
    const ctype = res.headers.get('content-type') ?? '';
    if (!ctype.includes('application/json')) return null;
    const data = await res.json();
    return typeof data.publicKey === 'string' && data.publicKey ? data.publicKey : null;
  } catch {
    return null;
  }
}

// 이미 구독돼 있는지.
export async function currentSubscription() {
  if (!pushSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    return reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

// 구독 + 서버 등록. 결과 kind: ok | unsupported | disabled(서버 키 없음) | denied | error.
export async function subscribePush() {
  if (!pushSupported()) return { ok: false, kind: 'unsupported' };
  if (Notification.permission !== 'granted') return { ok: false, kind: 'denied' };
  const key = await fetchVapidKey();
  if (!key) return { ok: false, kind: 'disabled' };
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });
    }
    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(sub.toJSON()),
    });
    if (!res.ok) return { ok: false, kind: 'error' };
    return { ok: true };
  } catch {
    return { ok: false, kind: 'error' };
  }
}

// 서버 등록 해제 + 브라우저 구독 취소. **서버에서 행이 지워진 게 확인된 뒤에만** 브라우저 구독을
// 폐기한다 — 서버 요청이 실패(네트워크/401/500)했는데 구독을 먼저 취소하면 재시도 handle(endpoint)이
// 사라져 서버 행이 다음 발송의 410 전까지 남는다(#35 Codex P2). 실패 시 { ok:false }로 구독을 남긴다.
// force=false(기본): 서버 삭제 확인 뒤에만 브라우저 구독을 폐기(실패 시 유지 → 재시도 가능).
// force=true: 동기화 연결 해제처럼 정리 UI가 곧 사라지는 tear-down에선 서버 실패에도 브라우저 구독을
// 폐기한다 — endpoint가 무효가 돼 다음 서버 발송이 410으로 실패하면 서버가 그 행을 자가 정리한다.
export async function unsubscribePush({ force = false } = {}) {
  const sub = await currentSubscription();
  if (!sub) return { ok: true };
  let serverOk = false;
  try {
    const res = await fetch('/api/push/unsubscribe', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });
    serverOk = res.ok;
  } catch {
    serverOk = false;
  }
  if (serverOk || force) {
    try {
      await sub.unsubscribe();
    } catch {
      /* noop */
    }
  }
  return { ok: serverOk };
}

// 테스트 발송(서버가 이 소유자의 구독에 실제 푸시). 결과 { ok, sent } 또는 { ok:false }.
export async function sendTestPush() {
  try {
    const res = await fetch('/api/push/test', { method: 'POST', credentials: 'same-origin' });
    if (!res.ok) return { ok: false, status: res.status };
    const data = await res.json();
    return { ok: true, sent: data.sent ?? 0 };
  } catch {
    return { ok: false };
  }
}
