/* global self */
// Loaded by the generated service worker. A tap on a notification brings the app forward, on
// the workout; nothing else happens here.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if ('focus' in client) return client.focus();
      }
      return self.clients.openWindow(`${self.registration.scope}#/workout`);
    }),
  );
});
