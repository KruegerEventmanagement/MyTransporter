/**
 * Rückgabe-Erinnerung per E-Mail 60 min vor Mietende – genau einmal je Buchung
 * über die Kunden-Mail-Outbox (eindeutig je Buchung+Art, Lease/Fencing, Erfolg nur mit Provider-ID).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isLegacyOpenTrip } from "@/lib/active-trip";
import { REMINDER_STATUSES } from "@/lib/return-reminder";
import { resolveTripWindow, formatBerlin } from "@/lib/trip-time";
import { renderEmail, noteBlock, APP_ORIGIN } from "@/lib/email-template";
import { returnMailDue, RETURN_NOTICE_FAST, RETURN_NOTICE_SLOW, DEPOSIT_BANK_NOTE } from "@/lib/return-notice";

const MAIL_STATUSES = ["paid", ...REMINDER_STATUSES];

export function buildReturnReminderMail(a: { firstName: string | null; endText: string; vehicle: string; url: string }) {
  const subject = "Deine Rückgabe steht an – bitte Fahrt mit Fotos abschließen";
  const html = renderEmail({
    firstName: a.firstName,
    heading: "Deine Rückgabe steht an",
    intro: [`deine Miete (${a.vehicle}) endet am ${a.endText} Uhr.`, RETURN_NOTICE_FAST],
    button: { label: "Zur Rückgabe mit Fotos", url: a.url },
    extraHtml: noteBlock(`${RETURN_NOTICE_SLOW} ${DEPOSIT_BANK_NOTE}`),
  });
  return { subject, html };
}

export async function processReturnReminderMails(nowMs = Date.now()): Promise<{ due: number; sent: number }> {
  const { data, error } = await supabaseAdmin
    .from("bookings")
    .select("id, user_id, status, start_date, start_hour, plan_id, vehicle_name, vehicle_plate")
    .in("status", MAIL_STATUSES);
  if (error) throw new Error("Buchungen konnten nicht geladen werden.");
  const { sendReminderViaOutbox } = await import("@/lib/customer-mail-outbox.server");
  let due = 0;
  let sent = 0;
  for (const b of data ?? []) {
    if (isLegacyOpenTrip(b)) continue;
    const { endMs } = resolveTripWindow(b);
    if (!returnMailDue(nowMs, endMs)) continue;
    const { data: existing } = await supabaseAdmin
      .from("customer_mail_outbox").select("id").eq("source_type", "booking").eq("source_id", b.id).eq("kind", "return_reminder").maybeSingle();
    if (existing) continue;
    const { data: p } = await supabaseAdmin.from("profiles").select("email, first_name").eq("id", b.user_id).maybeSingle();
    if (!p?.email) continue;
    due++;
    const mail = buildReturnReminderMail({
      firstName: p.first_name,
      endText: formatBerlin(endMs),
      vehicle: `${b.vehicle_name} (${b.vehicle_plate})`,
      url: `${APP_ORIGIN}/trip/${b.id}`,
    });
    try {
      const r = await sendReminderViaOutbox({
        source: "booking", sourceId: b.id, kind: "return_reminder", to: p.email,
        subject: mail.subject, html: mail.html, expiresAt: new Date(endMs).toISOString(),
      });
      if (r.sent) sent++;
    } catch (e) {
      console.error("return reminder mail failed", e instanceof Error ? e.message.slice(0, 200) : "unknown");
    }
  }
  return { due, sent };
}
