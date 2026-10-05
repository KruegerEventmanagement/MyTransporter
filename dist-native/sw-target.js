// Reine Hilfsfunktion für den Service Worker (auch in Tests ausführbar).
// Liefert ein sicheres same-origin Ziel für notificationclick.
(function (root) {
  var TRIP = /^\/trip\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function mtResolveTarget(raw, origin) {
    var fallback = "/";
    if (typeof raw !== "string" || !raw) return fallback;
    var u;
    try {
      u = new URL(raw, origin);
    } catch (e) {
      return fallback;
    }
    if (u.origin !== origin) return fallback;
    if (TRIP.test(u.pathname)) return u.pathname;
    if (u.pathname === "/admin" || u.pathname.indexOf("/admin/") === 0 || u.pathname.indexOf("/admin?") === 0)
      return u.pathname + u.search;
    return fallback;
  }
  root.mtResolveTarget = mtResolveTarget;
  if (typeof module !== "undefined") module.exports = { mtResolveTarget: mtResolveTarget };
})(typeof self !== "undefined" ? self : globalThis);
