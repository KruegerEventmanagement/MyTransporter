import { bounceReason, bounceTitle, parseGmailBounce, shouldAlert, type GmailMessage } from "@/lib/mail-bounce";

const GATEWAY = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";

/**
 * Liest Unzustellbarkeitsmeldungen im Postfach info@mytransporter.org (nur lesen),
 * ordnet sie der versendeten Outbox-Mail zu und alarmiert den Betreiber einmalig
 * (admin_notifications → Push). Versendet nie selbst eine Mail und wiederholt
 * keine abgewiesene Nachricht automatisch.
 */
export async function scanMailBounces(nowMs = Date.now()): Promise<{ checked: number; recorded: number; alerted: number }> {
  const gatewayKey = process.env.LOVABLE_API_KEY, connKey = process.env.GOOGLE_MAIL_API_KEY;
  if (!gatewayKey || !connKey) return { checked: 0, recorded: 0, alerted: 0 };
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const headers = { Authorization: `Bearer ${gatewayKey}`, "X-Connection-Api-Key": connKey };
  const list = await fetch(`${GATEWAY}/users/me/messages?maxResults=25&q=${encodeURIComponent("from:mailer-daemon newer_than:2d")}`, { headers });
  if (!list.ok) throw new Error(`Bounce-Liste nicht lesbar [${list.status}]`);
  const ids = ((await list.json()) as { messages?: { id: string }[] }).messages?.map((m) => m.id) ?? [];
  if (!ids.length) return { checked: 0, recorded: 0, alerted: 0 };
  const { data: known } = await db.from("mail_bounces").select("dsn_message_id").in("dsn_message_id", ids);
  const seen = new Set((known ?? []).map((k) => k.dsn_message_id));
  let recorded = 0, alerted = 0;
  for (const id of ids.filter((i) => !seen.has(i))) {
    const res = await fetch(`${GATEWAY}/users/me/messages/${id}?format=full`, { headers });
    if (!res.ok) continue;
    const b = parseGmailBounce((await res.json()) as GmailMessage);
    if (!b) continue;
    // Zuordnung: Gmail-Thread der Originalmail = gespeicherte Provider-ID; sonst Empfänger + Zeitfenster.
    let outbox: { id: string; kind: string; source_type: string; source_id: string } | null = null;
    if (b.threadId) {
      const { data } = await db.from("customer_mail_outbox").select("id, kind, source_type, source_id")
        .eq("provider_message_id", b.threadId).maybeSingle();
      outbox = data;
    }
    if (!outbox && b.recipient && b.bouncedAt) {
      const since = new Date(new Date(b.bouncedAt).getTime() - 2 * 3600_000).toISOString();
      const { data } = await db.from("customer_mail_outbox").select("id, kind, source_type, source_id")
        .ilike("recipient_email", b.recipient).gte("sent_at", since).lte("sent_at", b.bouncedAt)
        .order("sent_at", { ascending: false }).limit(1);
      outbox = data?.[0] ?? null;
    }
    const alert = shouldAlert(b, nowMs) && b.permanent;
    const { data: ins, error } = await db.from("mail_bounces").insert({
      dsn_message_id: b.dsnId, original_thread_id: b.threadId, outbox_id: outbox?.id ?? null,
      mail_kind: outbox?.kind ?? null, source_type: outbox?.source_type ?? null, source_id: outbox?.source_id ?? null,
      recipient_email: b.recipient, smtp_status: b.status, diagnostic: b.diagnostic, permanent: b.permanent,
      bounced_at: b.bouncedAt, notified: alert,
    }).select("id");
    if (error || !ins?.length) continue; // paralleler Lauf hat bereits erfasst → kein zweiter Alarm
    recorded++;
    if (!alert) continue;
    const parts: string[] = [];
    let bookingId: string | null = null;
    if (outbox?.source_type === "booking") {
      bookingId = outbox.source_id;
      const { data: bk } = await db.from("bookings").select("vehicle_plate, start_date, start_hour").eq("id", outbox.source_id).maybeSingle();
      if (bk) parts.push(`${bk.vehicle_plate} · Start ${bk.start_date} ${bk.start_hour}:00`);
    } else if (outbox?.source_type === "manual") {
      const { data: mr } = await db.from("manual_reservations").select("vehicle_plate, start_at, customer_name").eq("id", outbox.source_id).maybeSingle();
      if (mr) parts.push(`${mr.customer_name} · ${mr.vehicle_plate} · Start ${new Date(mr.start_at).toLocaleString("de-DE", { timeZone: "Europe/Berlin", dateStyle: "short", timeStyle: "short" })}`);
    }
    parts.push(bounceReason(b));
    if (outbox?.kind === "reminder_30min") {
      const { data: sms } = await db.from("key_code_sms").select("status").eq("source_id", outbox.source_id).maybeSingle();
      parts.push(`Code-SMS: ${sms?.status === "sent" ? "vom SMS-Anbieter angenommen" : sms?.status ?? "keine"}`);
      if (outbox.source_type === "booking") parts.push("Code ist in der Kunden-App sichtbar. Bitte Kunde anrufen.");
      else parts.push("Bitte Kunde anrufen.");
    }
    await db.from("admin_notifications").insert({
      type: "mail_bounce", title: bounceTitle(outbox?.kind ?? null), body: parts.join(" · "), booking_id: bookingId,
    });
    alerted++;
  }
  return { checked: ids.length, recorded, alerted };
}
