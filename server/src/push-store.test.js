import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from './store.js';
import { createPushStore, normalizeSubscription, isAllowedPushEndpoint } from './push-store.js';

const FCM = 'https://fcm.googleapis.com/fcm/send/abc123';

const A = 'user-a';
const B = 'user-b';
const sub = (endpoint) => ({ endpoint, keys: { p256dh: 'p', auth: 'a' } });

let push;
beforeEach(() => {
  push = createPushStore(openDatabase(':memory:'));
});

describe('normalizeSubscription', () => {
  it('승인된 푸시 서비스 구독은 endpoint·keys만 추려 통과', () => {
    expect(normalizeSubscription({ endpoint: FCM, keys: { p256dh: 'p', auth: 'a', extra: 1 } })).toEqual({
      endpoint: FCM,
      keys: { p256dh: 'p', auth: 'a' },
    });
  });
  it('endpoint·keys가 어긋나면 null', () => {
    expect(normalizeSubscription(null)).toBe(null);
    expect(normalizeSubscription({ keys: { p256dh: 'p', auth: 'a' } })).toBe(null);
    expect(normalizeSubscription({ endpoint: FCM, keys: { p256dh: 'p' } })).toBe(null);
    expect(normalizeSubscription({ endpoint: FCM })).toBe(null);
  });
  it('승인되지 않은/내부 endpoint는 거부한다(SSRF 방지)', () => {
    const keys = { p256dh: 'p', auth: 'a' };
    expect(normalizeSubscription({ endpoint: 'http://fcm.googleapis.com/x', keys })).toBe(null); // http
    expect(normalizeSubscription({ endpoint: 'https://169.254.169.254/latest/meta-data', keys })).toBe(null);
    expect(normalizeSubscription({ endpoint: 'https://localhost:8081/api/push/test', keys })).toBe(null);
    expect(normalizeSubscription({ endpoint: 'https://evil.example.com/x', keys })).toBe(null);
    expect(normalizeSubscription({ endpoint: 'not-a-url', keys })).toBe(null);
  });
});

describe('isAllowedPushEndpoint', () => {
  it('알려진 푸시 서비스 호스트(https)만 허용', () => {
    expect(isAllowedPushEndpoint('https://fcm.googleapis.com/fcm/send/x')).toBe(true);
    expect(isAllowedPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/x')).toBe(true);
    expect(isAllowedPushEndpoint('https://abc.notify.windows.com/w/?token=x')).toBe(true);
    expect(isAllowedPushEndpoint('https://web.push.apple.com/x')).toBe(true);
  });
  it('내부·비https·유사 호스트는 거부', () => {
    expect(isAllowedPushEndpoint('http://web.push.apple.com/x')).toBe(false); // http
    expect(isAllowedPushEndpoint('https://push.apple.com.evil.com/x')).toBe(false); // 서픽스 위장
    expect(isAllowedPushEndpoint('https://127.0.0.1/x')).toBe(false);
    expect(isAllowedPushEndpoint('ftp://fcm.googleapis.com/x')).toBe(false);
  });
});

describe('push-store', () => {
  it('소유자별로 구독을 저장·조회한다', () => {
    push.add(A, sub('e1'), 100);
    push.add(A, sub('e2'), 100);
    push.add(B, sub('e3'), 100);
    expect(push.listByOwner(A).map((s) => s.endpoint).sort()).toEqual(['e1', 'e2']);
    expect(push.listByOwner(B).map((s) => s.endpoint)).toEqual(['e3']);
    expect(push.listByOwner(A)[0].keys).toEqual({ p256dh: 'p', auth: 'a' });
  });

  it('같은 (owner, endpoint) 재구독은 덮어쓴다(멱등)', () => {
    push.add(A, { endpoint: 'e1', keys: { p256dh: 'p1', auth: 'a1' } }, 100);
    push.add(A, { endpoint: 'e1', keys: { p256dh: 'p2', auth: 'a2' } }, 200);
    expect(push.listByOwner(A)).toHaveLength(1);
    expect(push.listByOwner(A)[0].keys).toEqual({ p256dh: 'p2', auth: 'a2' });
  });

  it('remove는 그 소유자의 그 기기만 지운다', () => {
    push.add(A, sub('e1'), 100);
    push.add(A, sub('e2'), 100);
    push.remove(A, 'e1');
    expect(push.listByOwner(A).map((s) => s.endpoint)).toEqual(['e2']);
  });

  it('removeEndpoint는 만료된 endpoint를 소유자 무관하게 지운다', () => {
    push.add(A, sub('dead'), 100);
    push.add(B, sub('dead'), 100); // 이론상 다른 소유자에 같은 endpoint는 드물지만 방어
    push.removeEndpoint('dead');
    expect(push.listByOwner(A)).toEqual([]);
    expect(push.listByOwner(B)).toEqual([]);
  });

  it('rekeyOwner는 구독을 새 소유자로 이관한다(재키잉 동반)', () => {
    push.add(A, sub('e1'), 100);
    push.add(A, sub('e2'), 100);
    const moved = push.rekeyOwner(A, B);
    expect(moved).toBe(2);
    expect(push.listByOwner(A)).toEqual([]);
    expect(push.listByOwner(B).map((s) => s.endpoint).sort()).toEqual(['e1', 'e2']);
  });

  it('rekeyOwner는 from===to·빈 값이면 아무것도 안 한다', () => {
    push.add(A, sub('e1'), 100);
    expect(push.rekeyOwner(A, A)).toBe(0);
    expect(push.rekeyOwner('', B)).toBe(0);
    expect(push.listByOwner(A)).toHaveLength(1);
  });
});
