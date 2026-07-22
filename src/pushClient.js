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

// 서버 등록 해제 + 브라우저 구독 취소.
export async function unsubscribePush() {
  const sub = await currentSubscription();
  if (!sub) return;
  try {
    await fetch('/api/push/unsubscribe', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });
  } catch {
    /* 서버 정리 실패는 무시 — 브라우저 구독은 어차피 취소한다 */
  }
  try {
    await sub.unsubscribe();
  } catch {
    /* noop */
  }
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
