// MyTransporter Service Worker: Push-Benachrichtigungen + Offline-Hinweis.
// Bewusst KEIN Caching von App-HTML, API-Antworten oder privaten Daten
// (nichts kontenübergreifend). Gecacht wird nur die statische offline.html.
importScripts("/sw-target.js");

var OFFLINE_CACHE = "mt-offline-v1";
var OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(OFFLINE_CACHE)
      .then((c) => c.add(new Request(OFFLINE_URL, { cache: "reload" })))
      .catch(() => {})
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith("mt-offline-") && k !== OFFLINE_CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

// Nur Seiten-Navigationen ohne Netz bekommen den statischen Hinweis.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.mode !== "navigate" || req.method !== "GET") return;
  event.respondWith(
    fetch(req).catch(async () => (await caches.match(OFFLINE_URL)) || new Response("Offline", { status: 503 })),
  );
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
    vibrate: [400, 150, 400, 150, 400, 150, 600],
  };

  event.waitUntil(self.registration.showNotification(payload.title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const origin = self.location.origin;
  const target = self.mtResolveTarget(event.notification.data && event.notification.data.url, origin);
  const isAdmin = target.indexOf("/admin") === 0;

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // 1) Fenster, das genau dieses Ziel zeigt
      for (const client of allClients) {
        try {
          const url = new URL(client.url);
          if (url.origin === origin && url.pathname === target.split("?")[0]) {
            await client.focus();
            return;
          }
        } catch (e) {}
      }
      // 2) Admin: vorhandenes Admin-Fenster wiederverwenden (bisheriges Verhalten)
      if (isAdmin) {
        for (const client of allClients) {
          try {
            const url = new URL(client.url);
            if (url.origin === origin && url.pathname.startsWith("/admin")) {
              await client.focus();
              if ("navigate" in client) {
                try { await client.navigate(target); } catch (e) {}
              }
              return;
            }
          } catch (e) {}
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(target);
    })(),
  );
});
