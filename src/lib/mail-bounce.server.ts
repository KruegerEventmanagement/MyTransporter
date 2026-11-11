import { bounceReason, bounceTitle, parseGmailBounce, shouldAlert, type GmailMessage, type ParsedBounce } from "@/lib/mail-bounce";

const GATEWAY = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";
/** Lookback deutlich über Ausfallzeiten des 5-Minuten-Jobs; bekannte DSNs werden per dsn_message_id übersprungen. */
export const BOUNCE_LOOKBACK = "newer_than:7d";
export const BOUNCE_PAGE_SIZE = 100;
export const BOUNCE_MAX_PAGES = 20;

export type OutboxRef = { id: string; kind: string; source_type: string; source_id: string };
export type BounceRow = {
  id: string; outbox_id: string | null; mail_kind: string | null; source_type: string | null; source_id: string | null;
  smtp_status: string | null; diagnostic: string | null;
};
export type GmailResult = { ok: boolean; status: number; json: () => Promise<unknown> };

/** Nur die Operationen, die der Scan braucht – damit Fehlerpfade ohne echte DB testbar sind. */
export interface BounceStore {
  knownIds(ids: string[]): Promise<Set<string>>;
  findOutbox(b: ParsedBounce): Promise<OutboxRef | null>;
  /** "inserted" | "duplicate" (paralleler Lauf); wirft bei anderem DB-Fehler. */
  insertBounce(b: ParsedBounce, outbox: OutboxRef | null, alertDue: boolean): Promise<"inserted" | "duplicate">;
  pendingAlerts(): Promise<BounceRow[]>;
  alertContext(row: BounceRow): Promise<{ parts: string[]; bookingId: string | null }>;
  /** Atomar (RPC): Meldung + Markierung in einer Transaktion; null = schon gemeldet. Wirft bei DB-Fehler. */
  deliverAlert(id: string, title: string, body: string, bookingId: string | null): Promise<string | null>;
  markAlertError(id: string, message: string): Promise<void>;
}

export type ScanStats = { checked: number; recorded: number; alerted: number; pages: number; failed: number; truncated: boolean };

/**
 * Liest DSNs nur lesend (paginiert), erfasst jede genau einmal und meldet fällige Alarme
 * retryfähig: Ein Alarm gilt erst als gemeldet, wenn die DB-Funktion die Admin-Meldung
 * angelegt hat. Versendet nie Mails, wiederholt keine abgewiesene Nachricht und wertet
 * "sent" nie als "zugestellt".
 */
export async function runBounceScan(gmail: (path: string) => Promise<GmailResult>, db: BounceStore, nowMs = Date.now()): Promise<ScanStats> {
  const s: ScanStats = { checked: 0, recorded: 0, alerted: 0, pages: 0, failed: 0, truncated: false };
  const q = encodeURIComponent(`from:mailer-daemon ${BOUNCE_LOOKBACK}`);
  let token: string | undefined;
  do {
    if (s.pages >= BOUNCE_MAX_PAGES) { s.truncated = true; break; }
    const list = await gmail(`/users/me/messages?maxResults=${BOUNCE_PAGE_SIZE}&q=${q}${token ? `&pageToken=${encodeURIComponent(token)}` : ""}`);
    if (!list.ok) throw new Error(`Bounce-Liste nicht lesbar [${list.status}]`);
    const page = (await list.json()) as { messages?: { id: string }[]; nextPageToken?: string };
    s.pages++;
    token = page.nextPageToken;
    const ids = page.messages?.map((m) => m.id) ?? [];
    s.checked += ids.length;
    if (!ids.length) continue;
    const seen = await db.knownIds(ids);
    for (const id of ids.filter((i) => !seen.has(i))) {
      try {
        const res = await gmail(`/users/me/messages/${id}?format=full`);
        if (!res.ok) { s.failed++; continue; } // nicht erfasst → nächster Lauf versucht erneut
        const b = parseGmailBounce((await res.json()) as GmailMessage);
        if (!b) continue;
        const outbox = await db.findOutbox(b);
        const due = shouldAlert(b, nowMs) && b.permanent;
        if ((await db.insertBounce(b, outbox, due)) === "inserted") s.recorded++;
      } catch (e) {
        s.failed++;
        console.error("bounce record failed", String((e as Error)?.message ?? e).slice(0, 200));
      }
    }
  } while (token);

  // Offene Alarme (auch aus früheren Läufen mit DB-Fehler) zustellen.
  for (const row of await db.pendingAlerts()) {
    try {
      const { parts, bookingId } = await db.alertContext(row);
      parts.push(bounceReason({ diagnostic: row.diagnostic, status: row.smtp_status }));
      if (await db.deliverAlert(row.id, bounceTitle(row.mail_kind), parts.join(" · "), bookingId)) s.alerted++;
    } catch (e) {
      s.failed++;
      const msg = String((e as Error)?.message ?? e).slice(0, 200);
      console.error("bounce alert failed", msg);
      await db.markAlertError(row.id, msg).catch(() => {});
    }
  }
  return s;
}

type Admin = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];

export function supabaseBounceStore(db: Admin): BounceStore {
  const cols = "id, kind, source_type, source_id";
  return {
    async knownIds(ids) {
      const { data, error } = await db.from("mail_bounces").select("dsn_message_id").in("dsn_message_id", ids);
      if (error) throw new Error(`mail_bounces lesen: ${error.message}`);
      return new Set((data ?? []).map((k) => k.dsn_message_id));
    },
    async findOutbox(b) {
      if (b.threadId) {
        const { data } = await db.from("customer_mail_outbox").select(cols).eq("provider_message_id", b.threadId).maybeSingle();
        if (data) return data;
      }
      if (!b.recipient || !b.bouncedAt) return null;
      const since = new Date(new Date(b.bouncedAt).getTime() - 2 * 3600_000).toISOString();
      const { data } = await db.from("customer_mail_outbox").select(cols)
        .ilike("recipient_email", b.recipient).gte("sent_at", since).lte("sent_at", b.bouncedAt)
        .order("sent_at", { ascending: false }).limit(1);
      return data?.[0] ?? null;
    },
    async insertBounce(b, o, due) {
      const { error } = await db.from("mail_bounces").insert({
        dsn_message_id: b.dsnId, original_thread_id: b.threadId, outbox_id: o?.id ?? null,
        mail_kind: o?.kind ?? null, source_type: o?.source_type ?? null, source_id: o?.source_id ?? null,
        recipient_email: b.recipient, smtp_status: b.status, diagnostic: b.diagnostic, permanent: b.permanent,
        bounced_at: b.bouncedAt, alert_due: due, notified: false,
      });
      if (!error) return "inserted";
      if (error.code === "23505") return "duplicate";
      throw new Error(`mail_bounces speichern: ${error.message}`);
    },
    async pendingAlerts() {
      const { data, error } = await db.from("mail_bounces")
        .select("id, outbox_id, mail_kind, source_type, source_id, smtp_status, diagnostic")
        .eq("alert_due", true).is("alert_notification_id", null).order("created_at").limit(50);
      if (error) throw new Error(`offene Alarme lesen: ${error.message}`);
      return data ?? [];
    },
    async alertContext(row) {
      const parts: string[] = [];
      let bookingId: string | null = null;
      if (row.source_type === "booking" && row.source_id) {
        bookingId = row.source_id;
        const { data: bk } = await db.from("bookings").select("vehicle_plate, start_date, start_hour").eq("id", row.source_id).maybeSingle();
        if (bk) parts.push(`${bk.vehicle_plate} · Start ${bk.start_date} ${bk.start_hour}:00`);
      } else if (row.source_type === "manual" && row.source_id) {
        const { data: mr } = await db.from("manual_reservations").select("vehicle_plate, start_at, customer_name").eq("id", row.source_id).maybeSingle();
        if (mr) parts.push(`${mr.customer_name} · ${mr.vehicle_plate} · Start ${new Date(mr.start_at).toLocaleString("de-DE", { timeZone: "Europe/Berlin", dateStyle: "short", timeStyle: "short" })}`);
      }
      if (row.mail_kind === "reminder_30min" && row.source_id) {
        const { data: sms } = await db.from("key_code_sms").select("status").eq("source_id", row.source_id).maybeSingle();
        parts.push(`__SMS__${sms?.status ?? "keine"}`);
      }
      return { parts: finalizeParts(parts, row), bookingId };
    },
    async deliverAlert(id, title, body, bookingId) {
      const { data, error } = await db.rpc("deliver_mail_bounce_alert", { p_bounce_id: id, p_title: title, p_body: body, p_booking_id: bookingId as string });
      if (error) throw new Error(`Alarm anlegen: ${error.message}`);
      return (data as string | null) ?? null;
    },
    async markAlertError(id, message) {
      const { data } = await db.from("mail_bounces").select("alert_attempts").eq("id", id).maybeSingle();
      await db.from("mail_bounces").update({ alert_attempts: (data?.alert_attempts ?? 0) + 1, alert_last_error: message }).eq("id", id);
    },
  };
}

/** SMS-Hinweis nach dem Grund einordnen; "sent" heißt nur "vom Anbieter angenommen". */
function finalizeParts(parts: string[], row: BounceRow): string[] {
  const sms = parts.find((p) => p.startsWith("__SMS__"));
  const rest = parts.filter((p) => p !== sms);
  if (sms) {
    const st = sms.slice(7);
    rest.push(`Code-SMS: ${st === "sent" ? "vom SMS-Anbieter angenommen" : st}`);
    rest.push(row.source_type === "booking" ? "Code ist in der Kunden-App sichtbar. Bitte Kunde anrufen." : "Bitte Kunde anrufen.");
  }
  return rest;
}

export async function scanMailBounces(nowMs = Date.now()): Promise<ScanStats | { checked: 0; recorded: 0; alerted: 0 }> {
  const gatewayKey = process.env.LOVABLE_API_KEY, connKey = process.env.GOOGLE_MAIL_API_KEY;
  if (!gatewayKey || !connKey) return { checked: 0, recorded: 0, alerted: 0 };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const headers = { Authorization: `Bearer ${gatewayKey}`, "X-Connection-Api-Key": connKey };
  return runBounceScan((p) => fetch(`${GATEWAY}${p}`, { headers }), supabaseBounceStore(supabaseAdmin), nowMs);
}
