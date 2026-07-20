import { describe, expect, it, vi } from 'vitest';
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign as cryptoSign, randomUUID } from 'node:crypto';
import { createJwksCache, decodeJwt, extractAccessToken, verifyAccessJwt, verifyWithRotation } from './access.js';

// 실제 RS256 서명으로 검증한다 — 서명 검사를 모킹하면 이 모듈에서 정작 중요한 부분이 안 덮인다.
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const KID = 'test-kid';
const AUD = 'aud-tag-abc';
const ISS = 'https://team.cloudflareaccess.com';

const jwk = { ...publicKey.export({ format: 'jwk' }), kid: KID, alg: 'RS256', use: 'sig' };
const JWKS = { keys: [jwk] };

const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
const NOW = Date.UTC(2026, 6, 20) ; // 고정 '현재' — 만료 판정을 결정적으로

function makeToken({ alg = 'RS256', kid = KID, aud = AUD, iss = ISS, exp, nbf, email = 'me@example.com', key = privateKey } = {}) {
  const nowSec = Math.floor(NOW / 1000);
  const header = b64({ alg, kid, typ: 'JWT' });
  const payload = b64({ aud, iss, exp: exp ?? nowSec + 3600, nbf, email, sub: 'user-1' });
  const signingInput = `${header}.${payload}`;
  const sig = alg === 'RS256' ? cryptoSign('RSA-SHA256', Buffer.from(signingInput), key).toString('base64url') : 'x';
  return `${signingInput}.${sig}`;
}

const verify = (token, over = {}) => verifyAccessJwt(token, { jwks: JWKS, aud: AUD, issuer: ISS, now: NOW, ...over });

describe('decodeJwt', () => {
  it('파싱만 하고 검증하지 않는다', () => {
    const decoded = decodeJwt(makeToken());
    expect(decoded.header.alg).toBe('RS256');
    expect(decoded.payload.email).toBe('me@example.com');
  });

  it('형태가 어긋나면 null', () => {
    expect(decodeJwt('a.b')).toBe(null);
    expect(decodeJwt('not-a-jwt')).toBe(null);
    expect(decodeJwt(null)).toBe(null);
    expect(decodeJwt('!!!.!!!.!!!')).toBe(null); // base64/JSON 파싱 실패
  });
});

describe('verifyAccessJwt — 통과 조건', () => {
  it('서명·aud·iss·만료가 모두 맞으면 신원을 돌려준다', () => {
    expect(verify(makeToken())).toEqual({ ok: true, email: 'me@example.com', sub: 'user-1', expSec: expect.any(Number) });
  });
});

describe('verifyAccessJwt — 거부 조건', () => {
  it('alg를 RS256으로 고정한다 (alg=none·HS256 바꿔치기 차단)', () => {
    // 이 검사가 없으면 공개키를 HMAC 비밀키로 쓰는 고전적 우회가 가능하다.
    expect(verify(makeToken({ alg: 'none' })).reason).toBe('unsupported_alg');
    expect(verify(makeToken({ alg: 'HS256' })).reason).toBe('unsupported_alg');
  });

  it('서명이 다른 키로 만들어졌으면 거부', () => {
    const other = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
    expect(verify(makeToken({ key: other })).reason).toBe('bad_signature');
  });

  it('페이로드가 변조되면 거부', () => {
    const [h, , s] = makeToken().split('.');
    const tampered = `${h}.${b64({ aud: AUD, iss: ISS, exp: 99999999999, email: 'attacker@example.com' })}.${s}`;
    expect(verify(tampered).reason).toBe('bad_signature');
  });

  it('모르는 kid는 거부', () => {
    expect(verify(makeToken({ kid: 'other-kid' })).reason).toBe('unknown_kid');
  });

  it('만료된 토큰은 거부 (leeway 밖)', () => {
    const nowSec = Math.floor(NOW / 1000);
    expect(verify(makeToken({ exp: nowSec - 3600 })).reason).toBe('expired');
    // leeway(60초) 안쪽은 통과 — 기기 시계 오차 허용
    expect(verify(makeToken({ exp: nowSec - 30 })).ok).toBe(true);
  });

  it('아직 유효하지 않은 토큰은 거부', () => {
    const nowSec = Math.floor(NOW / 1000);
    expect(verify(makeToken({ nbf: nowSec + 3600 })).reason).toBe('not_yet_valid');
  });

  it('aud가 다르면 거부 — 같은 팀의 다른 앱 토큰 차단', () => {
    expect(verify(makeToken({ aud: 'another-app' })).reason).toBe('aud_mismatch');
    // 설정 누락 시에도 통과시키지 않는다
    expect(verify(makeToken(), { aud: undefined }).reason).toBe('aud_mismatch');
  });

  it('iss가 다르면 거부 — 다른 팀 발급 토큰 차단', () => {
    expect(verify(makeToken({ iss: 'https://evil.cloudflareaccess.com' })).reason).toBe('iss_mismatch');
    expect(verify(makeToken(), { issuer: undefined }).reason).toBe('iss_mismatch');
  });
});

describe('extractAccessToken', () => {
  it('엣지가 넣는 헤더를 우선 읽는다', () => {
    expect(extractAccessToken({ 'cf-access-jwt-assertion': 'tok' })).toBe('tok');
  });

  it('헤더가 없으면 CF_Authorization 쿠키에서 읽는다', () => {
    expect(extractAccessToken({ cookie: 'a=1; CF_Authorization=tok; b=2' })).toBe('tok');
  });

  it('토큰이 없으면 null — 다른 쿠키에 속지 않는다', () => {
    expect(extractAccessToken({ cookie: 'CF_Authorization_other=nope; a=1' })).toBe(null);
    expect(extractAccessToken({})).toBe(null);
    expect(extractAccessToken(undefined)).toBe(null);
  });
});

describe('createJwksCache', () => {
  const res = (body) => ({ ok: true, json: async () => body });

  it('TTL 안에서는 한 번만 조회한다', async () => {
    const fetchImpl = vi.fn(async () => res(JWKS));
    let t = 0;
    const get = createJwksCache({ teamDomain: ISS, ttlMs: 1000, fetchImpl, now: () => t });

    expect(await get()).toEqual(JWKS);
    await get();
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    // TTL이 지나면 다시 조회한다 — Access가 키를 회전하므로 영구 캐시는 안 된다.
    t = 2000;
    await get();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('동시 요청이 몰려도 조회는 한 번', async () => {
    let resolve;
    const fetchImpl = vi.fn(() => new Promise((r) => { resolve = () => r(res(JWKS)); }));
    const get = createJwksCache({ teamDomain: ISS, fetchImpl, now: () => 0 });

    const all = Promise.all([get(), get(), get()]);
    resolve();
    expect(await all).toEqual([JWKS, JWKS, JWKS]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('조회가 실패하면 던진다 — 호출자가 fail-closed로 처리한다', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 503 }));
    const get = createJwksCache({ teamDomain: ISS, fetchImpl, now: () => 0 });
    await expect(get()).rejects.toThrow('JWKS 조회 실패: 503');
  });
});

describe('verifyWithRotation — 키 회전 대응', () => {
  // 회전 시나리오: 캐시엔 옛 키만 있고, 토큰은 새 키(kid=new)로 서명돼 있다.
  const rotated = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const NEW_KID = 'rotated-kid';
  const newJwk = { ...rotated.publicKey.export({ format: 'jwk' }), kid: NEW_KID, alg: 'RS256', use: 'sig' };
  const OLD_ONLY = { keys: [jwk] };
  const AFTER_ROTATION = { keys: [jwk, newJwk] };
  const rotatedToken = () => makeToken({ kid: NEW_KID, key: rotated.privateKey });

  it('모르는 kid면 JWKS를 강제 갱신하고 재시도해 통과시킨다', async () => {
    const getJwks = vi.fn(async ({ force } = {}) => (force ? AFTER_ROTATION : OLD_ONLY));
    const out = await verifyWithRotation(rotatedToken(), { getJwks, aud: AUD, issuer: ISS, now: NOW });

    expect(out.ok).toBe(true);
    expect(getJwks).toHaveBeenCalledTimes(2);
    expect(getJwks).toHaveBeenLastCalledWith({ force: true });
  });

  it('갱신해도 없는 kid면 거부한다 (무한 재시도 없음)', async () => {
    const getJwks = vi.fn(async () => OLD_ONLY);
    const out = await verifyWithRotation(makeToken({ kid: 'never-exists' }), { getJwks, aud: AUD, issuer: ISS, now: NOW });

    expect(out).toEqual({ ok: false, reason: 'unknown_kid' });
    expect(getJwks).toHaveBeenCalledTimes(2); // 최초 + 강제 1회뿐
  });

  it('kid 외의 실패는 갱신하지 않는다 — 만료·aud 불일치로 조회를 유발할 수 없다', async () => {
    const getJwks = vi.fn(async () => AFTER_ROTATION);
    const nowSec = Math.floor(NOW / 1000);

    expect((await verifyWithRotation(makeToken({ exp: nowSec - 9999 }), { getJwks, aud: AUD, issuer: ISS, now: NOW })).reason).toBe('expired');
    expect((await verifyWithRotation(makeToken({ aud: 'other' }), { getJwks, aud: AUD, issuer: ISS, now: NOW })).reason).toBe('aud_mismatch');
    expect(getJwks).toHaveBeenCalledTimes(2); // 각 호출당 1회씩, 강제 갱신 없음
  });

  it('JWKS를 못 받으면 통과시키지 않는다', async () => {
    const getJwks = vi.fn(async () => { throw new Error('down'); });
    expect(await verifyWithRotation(makeToken(), { getJwks, aud: AUD, issuer: ISS, now: NOW })).toEqual({ ok: false, reason: 'jwks_unavailable' });
  });
});

describe('createJwksCache — 강제 갱신 쿨다운', () => {
  const res = (body) => ({ ok: true, json: async () => body });

  it('force는 TTL을 무시하고 다시 받는다', async () => {
    const fetchImpl = vi.fn(async () => res(JWKS));
    let t = 0;
    const get = createJwksCache({ teamDomain: ISS, ttlMs: 999999, minRefreshMs: 1000, fetchImpl, now: () => t });

    await get();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    t = 10;
    await get({ force: true }); // TTL 한참 남았지만 강제
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('쿨다운 안에서는 강제 갱신을 반복하지 않는다 — 임의 kid 요청으로 조회를 유발할 수 없다', async () => {
    const fetchImpl = vi.fn(async () => res(JWKS));
    let t = 0;
    const get = createJwksCache({ teamDomain: ISS, ttlMs: 999999, minRefreshMs: 1000, fetchImpl, now: () => t });

    await get();
    t = 10;
    await get({ force: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    // 쿨다운(1000ms) 안에서 100번 강제해도 조회는 늘지 않는다
    for (let i = 0; i < 100; i += 1) { t += 1; await get({ force: true }); }
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    // 쿨다운이 지나면 다시 허용
    t = 5000;
    await get({ force: true });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});
