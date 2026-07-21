import { describe, expect, it } from 'vitest';
import { getMe, postSync } from './syncClient.js';

const jsonRes = (status, body) => ({
  status,
  ok: status >= 200 && status < 300,
  headers: { get: () => 'application/json; charset=utf-8' },
  json: async () => body,
});
const htmlRes = (status) => ({
  status,
  ok: status >= 200 && status < 300,
  headers: { get: () => 'text/html' },
  json: async () => {
    throw new Error('not json');
  },
});

describe('postSync 분류', () => {
  it('200 JSON이면 데이터를 돌려준다', async () => {
    const out = await postSync({ cursor: 0 }, { fetchImpl: async () => jsonRes(200, { owner: 's', cursor: 3, cells: [], docs: [] }) });
    expect(out).toEqual({ ok: true, data: { owner: 's', cursor: 3, cells: [], docs: [] } });
  });

  it('401/403은 auth(재인증 필요)', async () => {
    expect((await postSync({}, { fetchImpl: async () => jsonRes(401, {}) })).kind).toBe('auth');
    expect((await postSync({}, { fetchImpl: async () => jsonRes(403, {}) })).kind).toBe('auth');
  });

  it('HTML 200(로그인 리다이렉트)도 auth로 분류', async () => {
    const out = await postSync({}, { fetchImpl: async () => htmlRes(200) });
    expect(out.kind).toBe('auth');
  });

  it('413은 toolarge', async () => {
    expect((await postSync({}, { fetchImpl: async () => jsonRes(413, {}) })).kind).toBe('toolarge');
  });

  it('네트워크 실패는 offline, Abort는 aborted', async () => {
    expect((await postSync({}, { fetchImpl: async () => { throw new Error('net'); } })).kind).toBe('offline');
    const abortErr = Object.assign(new Error('aborted'), { name: 'AbortError' });
    expect((await postSync({}, { fetchImpl: async () => { throw abortErr; } })).kind).toBe('aborted');
  });

  it('JSON인데 5xx면 server', async () => {
    expect((await postSync({}, { fetchImpl: async () => jsonRes(500, { error: 'sync_failed' }) })).kind).toBe('server');
  });
});

describe('getMe — 세션 신원 확인', () => {
  it('200 JSON이면 { email, sub }를 돌려준다', async () => {
    const out = await getMe({ fetchImpl: async () => jsonRes(200, { email: 'me@x.com', sub: 'sub-1' }) });
    expect(out).toEqual({ ok: true, data: { email: 'me@x.com', sub: 'sub-1' } });
  });

  it('401·HTML 리다이렉트는 auth, 네트워크 실패는 offline', async () => {
    expect((await getMe({ fetchImpl: async () => jsonRes(401, {}) })).kind).toBe('auth');
    expect((await getMe({ fetchImpl: async () => htmlRes(200) })).kind).toBe('auth');
    expect((await getMe({ fetchImpl: async () => { throw new Error('net'); } })).kind).toBe('offline');
  });
});
