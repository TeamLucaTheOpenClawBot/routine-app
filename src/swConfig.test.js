import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// SW 설정은 코드가 아니라 빌드 설정이라 단위 테스트로 잡히지 않는다. 그런데 여기서 한 줄이
// 빠지면 증상이 앱과 한참 떨어진 곳에서 나타난다(로그인이 조용히 성립하지 않고, origin 로그에도
// 아무것도 안 남는다). 그래서 설정 파일 자체를 읽어 두 denylist 패턴이 살아 있는지 지킨다.
// jsdom 환경에선 import.meta.url이 http URL이라 파일 경로로 못 쓴다 → cwd(레포 루트) 기준으로 읽는다.
const config = readFileSync(`${process.cwd()}/vite.config.js`, 'utf8');

describe('PWA navigateFallbackDenylist', () => {
  it('동기화 API를 앱 셸로 폴백시키지 않는다 (#7)', () => {
    expect(config).toMatch(/navigateFallbackDenylist:[^\]]*\/\^\\\/api\\\/\//);
  });

  // Cloudflare Access 콜백(/cdn-cgi/access/authorized)이 SW에 가로채이면 세션 쿠키가 심어지지
  // 않아 로그인이 영원히 안 된다(#56). 설치한 PWA에서 특히 치명적이다 — 앱 안에서 로그인할
  // 다른 경로가 없다.
  it('Cloudflare Access 콜백을 앱 셸로 폴백시키지 않는다 (#56)', () => {
    expect(config).toMatch(/navigateFallbackDenylist:[^\]]*\/\^\\\/cdn-cgi\\\/\//);
  });
});
