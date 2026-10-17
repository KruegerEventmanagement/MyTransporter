/**
 * Rückgabe-Erinnerung per E-Mail 30 min vor Mietende – genau einmal je Buchung
 * über die Kunden-Mail-Outbox (eindeutig je Buchung+Art, Lease/Fencing, Erfolg nur mit Provider-ID).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isLegacyOpenTrip } from "@/lib/active-trip";
import { REMINDER_STATUSES } from "@/lib/return-reminder";
import { resolveTripWindow, formatBerlin } from "@/lib/trip-time";
import { renderEmail, noteBlock, APP_ORIGIN } from "@/lib/email-template";
import { DOCUMENTATION_FEE_EUR } from "@/lib/documentation-fee";
import { RETURN_MAIL_LEAD_MS, returnMailDue, RETURN_NOTICE_FAST, DEPOSIT_BANK_NOTE } from "@/lib/return-notice";

const MAIL_STATUSES = ["paid", ...REMINDER_STATUSES];

export function buildReturnReminderMail(a: { firstName: string | null; endText: string; vehicle: string; url: string }) {
  const subject = "Deine Rückgabe steht an – bitte Fahrt mit Fotos abschließen";
  const html = renderEmail({
    firstName: a.firstName,
    heading: "Deine Rückgabe steht an",
    intro: [`deine Miete (${a.vehicle}) endet am ${a.endText} Uhr. Bitte bring das Fahrzeug rechtzeitig zurück und schließe anschließend die Rückgabe in der App ab.`, "Bitte dokumentiere außen vorn, hinten, links und rechts sowie den Innenraum. Dazu gehören ein Tachofoto mit Kilometerstand und Tankanzeige bei eingeschalteter Zündung sowie der Tankbeleg.", RETURN_NOTICE_FAST],
    button: { label: "Zur Rückgabe mit Fotos", url: a.url },
    extraHtml: noteBlock(`Vollständige Rückgabedokumentation ist nötig. Fehlende oder nicht verwertbare Pflichtfotos können nach manueller Prüfung eine Bearbeitungspauschale für fehlende Fahrzeugdokumentation von ${DOCUMENTATION_FEE_EUR} € auslösen. Technische Kamera-, Upload- oder Netzfehler lösen diese Pauschale nicht aus. ${DEPOSIT_BANK_NOTE}`),
  });
  const text = `Hallo${a.firstName ? ` ${a.firstName}` : ""},
Deine Miete (${a.vehicle}) endet am ${a.endText} Uhr. Bitte bring das Fahrzeug rechtzeitig zurück und schließe die Rückgabe in der App ab.
Pflichtfotos: außen vorn, hinten, links, rechts; Innenraum; Tachofoto mit Kilometerstand und Tankanzeige bei eingeschalteter Zündung; Tankbeleg.
${RETURN_NOTICE_FAST}
Fehlende Pflichtfotos können nach manueller Prüfung die bestehende Bearbeitungspauschale von ${DOCUMENTATION_FEE_EUR} € auslösen. Technische Fehler lösen sie nicht aus.
${a.url}
Christian Krüger – MyTransporter`;
  return { subject, html, text };
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
    const { data: existing, error: existingError } = await supabaseAdmin
      .from("customer_mail_outbox").select("id").eq("source_type", "booking").eq("source_id", b.id).eq("kind", "return_reminder").maybeSingle();
    if (existingError) throw new Error("Versandstatus nicht prüfbar");
    if (existing) continue;
    const { data: p, error: profileError } = await supabaseAdmin.from("profiles").select("email, first_name").eq("id", b.user_id).maybeSingle();
    if (profileError) throw new Error("Profil nicht prüfbar");
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
        subject: mail.subject, html: mail.html, text: mail.text, dueAt: new Date(endMs - RETURN_MAIL_LEAD_MS).toISOString(), expiresAt: new Date(endMs).toISOString(),
      });
      if (r.sent) sent++;
    } catch (e) {
      console.error("return reminder mail failed", e instanceof Error ? e.message.slice(0, 200) : "unknown");
    }
  }
  // Existing manual customer confirmation intent distinguishes actual customer
  // rentals from internal calendar blocks. Never infer a paid status.
  const { data: manuals, error: manualError } = await supabaseAdmin.from("manual_reservations")
    .select("id, customer_name, customer_email, vehicle_name, vehicle_plate, end_at")
    .eq("confirmation_requested", true).gt("end_at", new Date(nowMs).toISOString())
    .lte("end_at", new Date(nowMs + RETURN_MAIL_LEAD_MS).toISOString());
  if (manualError) throw new Error("Manuelle Rückgabe-Erinnerungen nicht prüfbar");
  for (const r of manuals ?? []) {
    const endMs = new Date(r.end_at).getTime();
    if (!returnMailDue(nowMs, endMs) || !r.customer_email) continue;
    const { data: existing, error } = await supabaseAdmin.from("customer_mail_outbox").select("id")
      .eq("source_type", "manual").eq("source_id", r.id).eq("kind", "return_reminder").maybeSingle();
    if (error) throw new Error("Manueller Mailstatus nicht prüfbar");
    if (existing) continue;
    due++;
    const mail = buildReturnReminderMail({ firstName: r.customer_name, endText: formatBerlin(endMs),
      vehicle: [r.vehicle_name, r.vehicle_plate].filter(Boolean).join(" · "), url: APP_ORIGIN });
    try {
      const result = await sendReminderViaOutbox({ source: "manual", sourceId: r.id, kind: "return_reminder",
        to: r.customer_email, ...mail, dueAt: new Date(endMs - RETURN_MAIL_LEAD_MS).toISOString(), expiresAt: r.end_at });
      if (result.sent) sent++;
    } catch { console.error("manual return reminder mail failed"); }
  }
  return { due, sent };
}
