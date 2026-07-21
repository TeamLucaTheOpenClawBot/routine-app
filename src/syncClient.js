// 동기화 HTTP 왕복 — 얇은 fetch 래퍼. 순수 로직(appLogic)과 분리해 둔다.
// 결과를 분류한다: ok(데이터) / auth(재인증 필요) / offline(네트워크) / toolarge / aborted / server.
// 이 분류가 있어야 App이 '세션 만료'와 '일시 오프라인'과 '서버 오류'를 다르게 다룰 수 있다
// (#7 설계의 함정 — Access 세션 만료는 조용한 동기화 중단이 되기 쉽다).

export const SYNC_ENDPOINT = '/api/sync';

export async function postSync(request, { fetchImpl, signal } = {}) {
  const doFetch = fetchImpl ?? (typeof fetch !== 'undefined' ? fetch : null);
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

  // Access 세션 만료 시 엣지가 JSON이 아니라 로그인으로 응답한다(401/403 또는 HTML 리다이렉트).
  if (res.status === 401 || res.status === 403) return { ok: false, kind: 'auth', status: res.status };
  if (res.status === 413) return { ok: false, kind: 'toolarge', status: res.status };

  const ctype = res.headers.get('content-type') ?? '';
  if (!ctype.includes('application/json')) {
    // HTML(로그인 페이지 등)이 200으로 돌아오는 경우 — 세션 만료로 본다. 이걸 JSON으로
    // 파싱하려 들면 앱이 조용히 깨지므로 여기서 auth로 분류해 재인증을 안내한다.
    return { ok: false, kind: 'auth', status: res.status };
  }
  if (!res.ok) return { ok: false, kind: 'server', status: res.status };

  try {
    return { ok: true, data: await res.json() };
  } catch {
    return { ok: false, kind: 'server', status: res.status };
  }
}
