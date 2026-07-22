import { describe, expect, it } from 'vitest';
import { urlBase64ToUint8Array, fetchVapidKey } from './pushClient.js';

const res = (status, body, ctype = 'application/json') => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: () => ctype },
  json: async () => body,
});

describe('urlBase64ToUint8Array', () => {
  it('base64url을 Uint8Array로 디코드한다(패딩·치환 처리)', () => {
    // 'aGVsbG8' = base64url("hello"), 패딩 없음
    expect(Array.from(urlBase64ToUint8Array('aGVsbG8'))).toEqual([104, 101, 108, 108, 111]);
  });
});

describe('fetchVapidKey', () => {
  it('publicKey 문자열이면 그 값을 돌려준다', async () => {
    expect(await fetchVapidKey({ fetchImpl: async () => res(200, { publicKey: 'BKx...' }) })).toBe('BKx...');
  });
  it('키 없음(null)·비-JSON·오류·네트워크 실패는 null', async () => {
    expect(await fetchVapidKey({ fetchImpl: async () => res(200, { publicKey: null }) })).toBe(null);
    expect(await fetchVapidKey({ fetchImpl: async () => res(200, '<html>', 'text/html') })).toBe(null);
    expect(await fetchVapidKey({ fetchImpl: async () => res(503, {}) })).toBe(null);
    expect(await fetchVapidKey({ fetchImpl: async () => { throw new Error('net'); } })).toBe(null);
  });
});
