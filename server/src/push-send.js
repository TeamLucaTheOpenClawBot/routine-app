// Web Push 발송 (#6 2단계) — **런타임 전용**. web-push(암호화·VAPID 서명)에 의존하는 유일한 곳이라,
// 테스트(루트 vitest)는 이 파일을 import하지 않는다 → 테스트·CI가 web-push 설치 없이도 그린이다.
// web-push는 순수 JS라 native 빌드가 없어 멀티아치 이미지에서 QEMU를 타지 않는다(0-native 원칙 유지).
//
// node:sqlite와 같은 이유로 createRequire로 런타임 로드한다(정적 분석 대상에서 제외).
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// VAPID 키가 다 있어야 발송기를 만든다. 하나라도 없으면 null — 호출자는 푸시를 비활성으로 둔다
// (fail-safe: 키 미설정이 크래시가 아니라 '푸시 없음'이 되게).
export function createPushSender({ publicKey, privateKey, subject }) {
  if (!publicKey || !privateKey || !subject) return null;
  const webpush = require('web-push');
  webpush.setVapidDetails(subject, publicKey, privateKey);

  return {
    // 한 소유자의 구독 목록에 payload를 병렬 발송. 410/404(만료·해지)면 onExpire(endpoint)로 정리를
    // 위임하고, 그 외 오류는 삼켜 다른 구독 발송을 막지 않는다. 보낸 수를 돌려준다.
    async sendToAll(subs, payload, onExpire) {
      const body = JSON.stringify(payload);
      const results = await Promise.all(
        subs.map(async (s) => {
          try {
            await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, body);
            return true;
          } catch (err) {
            const code = err && err.statusCode;
            if (code === 404 || code === 410) onExpire && onExpire(s.endpoint);
            return false;
          }
        }),
      );
      return results.filter(Boolean).length;
    },
  };
}
