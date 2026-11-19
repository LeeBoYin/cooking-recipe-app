self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('push', (e) => {
  let data = { title: '煮啥測試', body: '推播收到了' };
  try { data = e.data.json(); } catch {}
  e.waitUntil(self.registration.showNotification(data.title, { body: data.body, icon: 'icon-192.png' }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.openWindow('./'));
});
