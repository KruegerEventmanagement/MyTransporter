import { buildPartnerRedirect, isPartnerSlug } from "@/lib/partner-tracking";

/**
 * Dauerhafter QR-Link /q/<slug>. Zählt einen anonymen Aufruf und leitet
 * immer relativ auf die eigene Website weiter – auch bei unbekanntem Slug
 * oder Trackingfehler. Keine IP, kein User-Agent, keine Cookies.
 */
export async function handlePartnerScan(slug: string, deps: { lookup: (slug: string) => Promise<{ id: string; target_path: string } | null>; recordVisit: (partnerId: string) => Promise<string | null> }): Promise<Response> {
  let location = "/";
  try {
    if (isPartnerSlug(slug)) {
      const partner = await deps.lookup(slug);
      if (partner) {
        let visitId: string | null = null;
        try { visitId = await deps.recordVisit(partner.id); } catch { visitId = null; }
        location = buildPartnerRedirect(partner.target_path, visitId);
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

