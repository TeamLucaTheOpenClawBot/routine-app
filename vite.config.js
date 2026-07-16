import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
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
        navigateFallback: 'index.html',
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
  },
});
