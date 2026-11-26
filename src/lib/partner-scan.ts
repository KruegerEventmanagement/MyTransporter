import { buildPartnerRedirect, isPartnerSlug } from "@/lib/partner-tracking";

/**
 * Dauerhafter QR-Link /q/<slug>. Zählt einen anonymen Aufruf und leitet
 * immer relativ auf die eigene Website weiter – auch bei unbekanntem Slug
 * oder Trackingfehler. Keine IP, kein User-Agent, keine Cookies.
 */
export async function handlePartnerScan(slug: string, deps: { lookup: (slug: string) => Promise<{ id: string; target_path: string; name?: string; slug?: string } | null>; recordVisit: (partnerId: string) => Promise<string | null>; afterVisit?: (visitId: string, partner: { id: string; name?: string; slug?: string }) => Promise<unknown> }): Promise<Response> {
  let location = "/";
  try {
    if (isPartnerSlug(slug)) {
      const partner = await deps.lookup(slug);
      if (partner) {
        let visitId: string | null = null;
        try { visitId = await deps.recordVisit(partner.id); } catch { visitId = null; }
        location = buildPartnerRedirect(partner.target_path, visitId);
        // Interne Scan-Mail nur einreihen; max. 1,5 s, Fehler nie blockierend.
        if (visitId && deps.afterVisit) {
          try { await Promise.race([deps.afterVisit(visitId, partner).catch(() => null), new Promise((r) => setTimeout(r, 1500))]); } catch { /* Redirect geht vor */ }
        }
      }
    }
  } catch {
    location = "/";
  }
  return new Response(null, {
    status: 302,
    headers: { Location: location, "Cache-Control": "no-store", "X-Robots-Tag": "noindex", "Referrer-Policy": "no-referrer" },
  });
}

