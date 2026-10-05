/**
 * Übersetzt eingehende Universal/App Links (https://mytransporter.org/...) und
 * das eigene Schema (mytransporter://...) in einen internen App-Pfad.
 * Fremde Hosts und unbekannte Schemata werden verworfen (null).
 */
const HOSTS = new Set(["mytransporter.org", "www.mytransporter.org", "mytransporter.lovable.app"]);
export const APP_SCHEME = "mytransporter";

const ALLOWED = [
  /^\/$/,
  /^\/trip\/[A-Za-z0-9-]{1,64}$/,
  /^\/buchung\/[A-Za-z0-9-]{1,64}$/,
  /^\/checkout\/return$/,
  /^\/auth\/confirm$/,
  /^\/profil$/,
  /^\/(preise|faq|kontakt|agb|datenschutz|impressum|langzeitmiete|umzugstransporter-mieten|transporter-mieten-pforzheim-calw|partner|werbung|ueber-uns)$/,
];

export function deepLinkToPath(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  let path: string;
  if (url.protocol === "https:") {
    if (!HOSTS.has(url.hostname)) return null;
    path = url.pathname || "/";
  } else if (url.protocol === `${APP_SCHEME}:`) {
    // mytransporter://trip/abc → host "trip", pathname "/abc"
    path = "/" + [url.hostname, url.pathname.replace(/^\//, "")].filter(Boolean).join("/");
  } else {
    return null;
  }
  path = path.replace(/\/+$/, "") || "/";
  if (!ALLOWED.some((r) => r.test(path))) return null;
  // Auth-Tokens stehen im Hash, Zahlungs-IDs in der Query – beides unverändert weiterreichen.
  return path + url.search + url.hash;
}
