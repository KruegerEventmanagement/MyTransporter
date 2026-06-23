// MyTransporter Push-Notification Service Worker.
// Reagiert nur auf Push-Events und Klicks auf die Benachrichtigung.
// Macht KEIN Caching, kein App-Shell, keine Offline-Logik.

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = { title: "MyTransporter", body: "Neue Benachrichtigung", url: "/admin" };
  try {
    if (event.data) {
      const parsed = event.data.json();
      payload = { ...payload, ...parsed };
    }
  } catch (e) {
    // ignore parse errors, fallback payload bleibt
  }

  const options = {
    body: payload.body,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: payload.tag || "mytransporter",
    renotify: true,
    requireInteraction: true,
    silent: false,
    data: { url: payload.url || "/admin" },
    vibrate: [200, 100, 200],
  };

  event.waitUntil(self.registration.showNotification(payload.title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/admin";

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of allClients) {
        try {
          const url = new URL(client.url);
          if (url.pathname.startsWith("/admin")) {
            await client.focus();
            if ("navigate" in client) {
              try { await client.navigate(targetUrl); } catch (e) {}
            }
            return;
          }
        } catch (e) {}
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl);
      }
    })(),
  );
});