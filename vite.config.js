import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // 배포는 서브도메인 루트(routine.chillingdaisy.org → 컨테이너 nginx)로 서빙 → base는 '/'.
  plugins: [
    react(),
    VitePWA({
      // 새 배포 시 서비스워커가 자동 갱신(사용자 프롬프트 없이).
      registerType: 'autoUpdate',
      // public/의 비-빌드 자산도 precache에 포함.
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'logo.svg'],
      manifest: {
        id: '/',
        name: '루틴 체크 — Routine Tracker',
        short_name: '루틴 체크',
        description: '주간 습관을 매일 체크하는 루틴 트래커',
        lang: 'ko',
        theme_color: '#0B1220',
        background_color: '#0B1220',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // 앱 셸(js/css/html)만 glob으로 precache. 아이콘/favicon 등은 매니페스트·includeAssets가
        // 이미 precache에 추가하므로, 여기서 png/svg/ico를 매칭하면 URL 중복(→ Workbox가 서로 다른
        // revision 충돌로 SW install 거부)이 발생한다. glob은 앱 셸로 한정한다.
        globPatterns: ['**/*.{js,css,html}'],
        // 생성 SW에 푸시 핸들러를 합친다(#6 2단계) — generateSW를 injectManifest로 바꾸지 않고
        // push/notificationclick만 얹어 PWA 셸 설정을 그대로 둔다. 파일은 public/push-sw.js.
        importScripts: ['push-sw.js'],
        navigateFallback: 'index.html',
        // /api/*는 앱 셸로 폴백시키지 않는다(#7). 이게 없으면 동기화 요청이 오프라인·SW 경유 시
        // index.html을 받아 클라이언트가 HTML을 JSON으로 파싱하려 들고, 실패가 '동기화 오류'로
        // 뭉개져 원인을 못 찾는다. 네트워크 오류로 정직하게 실패하는 편이 낫다.
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
      },
      // 개발 서버에선 SW 비활성(캐시로 인한 개발 혼선 방지).
      devOptions: {
        enabled: false,
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    // 서버 코드(server/)는 node 환경에서 돈다 — jsdom을 씌울 이유가 없다.
    environmentMatchGlobs: [['server/**', 'node']],
  },
});
