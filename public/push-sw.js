// Web Push 핸들러 (#6 2단계). Workbox가 생성하는 서비스워커에 importScripts로 합쳐진다.
// - push: 서버가 보낸 payload(JSON)로 알림을 표시한다(폰 잠금 상태여도 OS가 띄운다).
// - notificationclick: 이미 열린 앱이 있으면 포커스, 없으면 새 창으로 연다.

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = data.title || '루틴 체크';
  const options = {
    body: data.body || '오늘 루틴을 확인하세요.',
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: data.tag || 'daily-reminder',
    data: { url: data.url || '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) return client.focus();
      }
      return self.clients.openWindow ? self.clients.openWindow(url) : undefined;
    }),
  );
});
