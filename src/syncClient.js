// 동기화 HTTP 왕복 — 얇은 fetch 래퍼. 순수 로직(appLogic)과 분리해 둔다.
// 결과를 분류한다: ok(데이터) / auth(재인증 필요) / offline(네트워크) / toolarge / aborted / server.
// 이 분류가 있어야 App이 '세션 만료'와 '일시 오프라인'과 '서버 오류'를 다르게 다룰 수 있다
// (#7 설계의 함정 — Access 세션 만료는 조용한 동기화 중단이 되기 쉽다).

export const SYNC_ENDPOINT = '/api/sync';
export const ME_ENDPOINT = '/api/me';

const pickFetch = (fetchImpl) => fetchImpl ?? (typeof fetch !== 'undefined' ? fetch : null);

// 응답을 공통 분류한다. Access 세션 만료 시 엣지는 JSON이 아니라 로그인으로 응답한다
// (401/403 또는 HTML 200 리다이렉트) → 둘 다 auth로 본다. HTML을 JSON으로 파싱하려 들면
// 앱이 조용히 깨지므로 content-type이 JSON이 아니면 여기서 걸러 재인증을 안내하게 한다.
async function classify(res) {
  if (res.status === 401 || res.status === 403) return { ok: false, kind: 'auth', status: res.status };
  if (res.status === 413) return { ok: false, kind: 'toolarge', status: res.status };
  const ctype = res.headers.get('content-type') ?? '';
  if (!ctype.includes('application/json')) return { ok: false, kind: 'auth', status: res.status };
  if (!res.ok) return { ok: false, kind: 'server', status: res.status };
  try {
    return { ok: true, data: await res.json() };
  } catch {
    return { ok: false, kind: 'server', status: res.status };
  }
}

// 현재 세션의 검증된 신원({ email, sub })을 가져온다. 동기화 전에 outbox·커서가 지금 세션의
// 소유자(sub) 것인지 확인하는 용도 — 계정이 바뀐 채로 밀면 남의 계정에 데이터가 쓰인다.
export async function getMe({ fetchImpl, signal } = {}) {
  const doFetch = pickFetch(fetchImpl);
  if (!doFetch) return { ok: false, kind: 'offline' };
  let res;
  try {
    res = await doFetch(ME_ENDPOINT, { method: 'GET', signal, credentials: 'same-origin' });
  } catch (err) {
    if (err && err.name === 'AbortError') return { ok: false, kind: 'aborted' };
    return { ok: false, kind: 'offline' };
  }
  return classify(res);
}

export async function postSync(request, { fetchImpl, signal } = {}) {
  const doFetch = pickFetch(fetchImpl);
  if (!doFetch) return { ok: false, kind: 'offline' };

  let res;
  try {
    res = await doFetch(SYNC_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
      signal,
      credentials: 'same-origin',
    });
  } catch (err) {
    // 네트워크 실패·오프라인·중단. AbortError는 우리가 취소한 것이라 오류로 취급하지 않는다.
    if (err && err.name === 'AbortError') return { ok: false, kind: 'aborted' };
    return { ok: false, kind: 'offline' };
  }

  return classify(res);
}
