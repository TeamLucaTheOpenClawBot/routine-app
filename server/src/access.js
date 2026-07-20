// Cloudflare Access JWT 검증.
//
// 인증 자체는 Cloudflare Access가 처리하고(구글 로그인·이메일 OTP), 이 API는 엣지가 붙여 보내는
// JWT만 검증한다 — 직접 만드는 인증이 이 프로젝트에서 가장 위험한 부분이라 통째로 우회한다(#7 설계).
//
// 검증 로직은 순수 함수로 둔다: JWKS 조회(네트워크)와 현재 시각은 호출자가 주입하므로
// 테스트가 결정적이다(앱의 `today` 주입 패턴과 같은 이유).

import { createPublicKey, verify as cryptoVerify } from 'node:crypto';

const b64url = (s) => Buffer.from(s, 'base64url');
const fail = (reason) => ({ ok: false, reason });

// JWT를 파싱만 한다(검증 아님). 형태가 어긋나면 null.
export function decodeJwt(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    return {
      header: JSON.parse(b64url(parts[0]).toString('utf8')),
      payload: JSON.parse(b64url(parts[1]).toString('utf8')),
      signingInput: `${parts[0]}.${parts[1]}`,
      signature: b64url(parts[2]),
    };
  } catch {
    return null;
  }
}

// 요청에서 Access 토큰을 꺼낸다. 엣지는 헤더로 넣어주고, 브라우저 직접 접근 시엔 쿠키에 있다.
export function extractAccessToken(headers) {
  const assertion = headers?.['cf-access-jwt-assertion'];
  if (typeof assertion === 'string' && assertion) return assertion;

  const cookie = headers?.cookie;
  if (typeof cookie === 'string') {
    for (const part of cookie.split(';')) {
      const eq = part.indexOf('=');
      if (eq === -1) continue;
      if (part.slice(0, eq).trim() === 'CF_Authorization') return part.slice(eq + 1).trim();
    }
  }
  return null;
}

// 토큰 검증. jwks는 { keys: [...] } 형태의 Cloudflare Access 공개키 묶음.
export function verifyAccessJwt(token, { jwks, aud, issuer, now = Date.now(), leewaySec = 60 } = {}) {
  const decoded = decodeJwt(token);
  if (!decoded) return fail('malformed');
  const { header, payload, signingInput, signature } = decoded;

  // alg를 고정한다. 이 검사가 없으면 `alg: none`이나 HS256으로 바꿔치기해
  // 공개키를 HMAC 비밀키로 쓰는 고전적 우회가 가능하다.
  if (header?.alg !== 'RS256') return fail('unsupported_alg');

  const jwk = (jwks?.keys ?? []).find((k) => k?.kid === header.kid);
  if (!jwk) return fail('unknown_kid');

  let key;
  try {
    key = createPublicKey({ key: jwk, format: 'jwk' });
  } catch {
    return fail('bad_key');
  }
  if (!cryptoVerify('RSA-SHA256', Buffer.from(signingInput), key, signature)) return fail('bad_signature');

  const nowSec = Math.floor(now / 1000);
  if (typeof payload?.exp !== 'number' || nowSec > payload.exp + leewaySec) return fail('expired');
  if (typeof payload?.nbf === 'number' && nowSec + leewaySec < payload.nbf) return fail('not_yet_valid');

  // aud(=Access 애플리케이션 태그)를 확인하지 않으면 같은 팀의 **다른 앱** 토큰으로 들어올 수 있다.
  const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud || !auds.includes(aud)) return fail('aud_mismatch');
  if (!issuer || payload.iss !== issuer) return fail('iss_mismatch');

  return { ok: true, email: payload.email ?? null, sub: payload.sub ?? null, expSec: payload.exp };
}

// JWKS를 TTL 동안 캐시한다. Access는 키를 주기적으로 회전하므로 영구 캐시는 안 되고,
// 매 요청 조회는 지연·레이트리밋 문제가 된다.
//
// getJwks({ force: true })는 TTL을 무시하고 다시 받는다 — 키 회전 직후 새 kid로 서명된
// 토큰이 오면 캐시엔 그 키가 없어 TTL이 끝날 때까지 전부 401이 되기 때문이다.
// 단 **쿨다운을 둔다**: 강제 갱신을 무제한 허용하면 존재하지 않는 kid를 담은 요청을 반복해
// 매번 외부 조회를 유발할 수 있다(우리 서버와 Cloudflare 양쪽에 부하).
export function createJwksCache({
  teamDomain,
  ttlMs = 10 * 60 * 1000,
  minRefreshMs = 60 * 1000,
  fetchImpl = fetch,
  now = () => Date.now(),
}) {
  let cached = null;
  let fetchedAt = 0;
  let lastForcedAt = -Infinity;
  let inflight = null;

  return async function getJwks({ force = false } = {}) {
    const t = now();
    if (!force && cached && t - fetchedAt < ttlMs) return cached;
    // 강제 갱신은 쿨다운 안에서 반복하지 않는다(캐시를 그대로 돌려주면 호출자는 그냥 거부한다).
    if (force && cached && t - lastForcedAt < minRefreshMs) return cached;
    if (force) lastForcedAt = t;

    // 동시 요청이 몰려도 조회는 한 번만.
    if (!inflight) {
      inflight = (async () => {
        const res = await fetchImpl(`${teamDomain}/cdn-cgi/access/certs`);
        if (!res.ok) throw new Error(`JWKS 조회 실패: ${res.status}`);
        const body = await res.json();
        cached = body;
        fetchedAt = now();
        return body;
      })().finally(() => {
        inflight = null;
      });
    }
    return inflight;
  };
}

// 검증 + 키 회전 대응. 모르는 kid면 JWKS를 한 번만 강제 갱신하고 재시도한다.
// (Access가 키를 회전하면 새 kid로 서명된 토큰이 캐시 TTL 동안 전부 거부되는 것을 막는다.)
export async function verifyWithRotation(token, { getJwks, aud, issuer, now = Date.now() }) {
  let jwks;
  try {
    jwks = await getJwks();
  } catch {
    return fail('jwks_unavailable'); // 키를 못 받으면 통과시키지 않는다(fail-closed)
  }

  const first = verifyAccessJwt(token, { jwks, aud, issuer, now });
  if (first.ok || first.reason !== 'unknown_kid') return first;

  try {
    jwks = await getJwks({ force: true });
  } catch {
    return fail('jwks_unavailable');
  }
  return verifyAccessJwt(token, { jwks, aud, issuer, now });
}
