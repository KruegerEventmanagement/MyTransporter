/**
 * Serverseitige Partner-Zuordnung. Die vom Browser gemerkte Aufruf-ID wird
 * hier gegen die Datenbank geprüft (existiert, Partner aktiv, Aufruf innerhalb
 * des Fensters – Zeitpunkt aus der DB, nicht vom Client). Fehler blockieren
 * niemals Checkout oder Buchung.
 */
import { isUuid, isWithinAttributionWindow } from "@/lib/partner-tracking";

type Db = { from: (t: string) => any };

export type ValidVisit = { visitId: string; partnerId: string; slug: string; rateBp: number; visitedAt: string };

export async function validatePartnerVisit(db: Db, visitId: unknown, now: Date = new Date()): Promise<ValidVisit | null> {
  if (!isUuid(visitId)) return null;
  try {
    const { data, error } = await db
      .from("partner_visits")
      .select("id, visited_at, partners!inner(id, slug, active, commission_rate_bp)")
      .eq("id", visitId)
      .maybeSingle();
    if (error || !data) return null;
    const p = Array.isArray(data.partners) ? data.partners[0] : data.partners;
    if (!p || p.active !== true) return null;
    if (!isWithinAttributionWindow(data.visited_at, now)) return null;
    return { visitId: data.id, partnerId: p.id, slug: p.slug, rateBp: Number(p.commission_rate_bp), visitedAt: data.visited_at };
  } catch {
    return null;
  }
}

/**
 * Hängt die Zuordnung genau einmal an die Buchung (PK booking_id; Retries und
 * doppelte Webhooks sind No-ops). Der Provisionssatz wird hier eingefroren.
 */
export async function attachPartnerAttribution(db: Db, bookingId: string, visitId: unknown, sessionCreatedAt: Date): Promise<"attached" | "skipped" | "exists" | "error"> {
  if (!isUuid(visitId)) return "skipped";
  const v = await validatePartnerVisit(db, visitId, sessionCreatedAt);
  if (!v) return "skipped";
  const { error } = await db.from("booking_partner_attributions").upsert(
    {
      booking_id: bookingId,
      partner_id: v.partnerId,
      visit_id: v.visitId,
      partner_slug: v.slug,
      commission_rate_bp: v.rateBp,
      visited_at: v.visitedAt,
    },
    { onConflict: "booking_id", ignoreDuplicates: true },
  );
  if (error) {
    console.error("[partner] Zuordnung fehlgeschlagen", bookingId, String(error.message ?? error).slice(0, 200));
    return "error";
  }
  return "attached";
}
