// Sichere Admin-Deep-Links aus der URL-Query (kaution=<src>:<id>, kaution=list, kunde=<uuid>).
// Einzige Stelle für Web, Push und Service Worker-nahe Logik; unbekannte Werte fallen auf null.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AdminDeepLink =
  | { kind: "deposit"; source: "booking" | "manual"; id: string }
  | { kind: "deposit-list" }
  | { kind: "customer"; id: string }
  | null;

export function parseAdminDeepLink(search: string): AdminDeepLink {
  const q = new URLSearchParams(search);
  const k = q.get("kaution");
  if (k === "list") return { kind: "deposit-list" };
  if (k) {
    const [src, id] = k.split(":");
    if ((src === "booking" || src === "manual") && UUID.test(id ?? "")) return { kind: "deposit", source: src, id };
  }
  const kunde = q.get("kunde");
  if (kunde && UUID.test(kunde)) return { kind: "customer", id: kunde };
  return null;
}
