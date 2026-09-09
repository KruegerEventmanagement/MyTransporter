import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { computePlanReturn } from "@/lib/booking-rules";
import { pushToAdmins } from "@/lib/push.functions";
import { renderEmail, noteBlock, listBlock, rawListBlock, esc } from "@/lib/email-template";

const DEFAULT_FROM = "MyTransporter <info@mytransporter.org>";
const DEFAULT_ADMIN_EMAIL = "info@mytransporter.org";

function isValidEmailish(v: string | undefined, max = 200): boolean {
  if (!v) return false;
  if (v.length > max) return false;
  if (!v.includes("@")) return false;
  return true;
}

function getFrom(): string {
  const v = process.env.RESEND_FROM_EMAIL;
  return isValidEmailish(v) ? (v as string) : DEFAULT_FROM;
}

export function getAdminEmail(): string {
  const v = process.env.ADMIN_NOTIFY_EMAIL;
  return isValidEmailish(v, 320) ? (v as string) : DEFAULT_ADMIN_EMAIL;
}

function fmtDate(date: string, hour: number): string {
  return new Date(`${date}T${String(hour).padStart(2, "0")}:00:00`).toLocaleString("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDateObj(d: Date): string {
  return d.toLocaleString("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function cancellationTable(): string {
  return `
    <table style="width:100%;border-collapse:collapse;font-size:13px;margin:8px 0 0;">
      <tr style="background:#f5f5f5;"><td style="padding:6px 10px;border:1px solid #e5e5e5;"><strong>Zeitpunkt der Stornierung</strong></td><td style="padding:6px 10px;border:1px solid #e5e5e5;"><strong>Gebühr</strong></td></tr>
      <tr><td style="padding:6px 10px;border:1px solid #e5e5e5;">Mehr als 13 Stunden vor Abfahrt</td><td style="padding:6px 10px;border:1px solid #e5e5e5;">kostenlos</td></tr>
      <tr><td style="padding:6px 10px;border:1px solid #e5e5e5;">12 Stunden vorher</td><td style="padding:6px 10px;border:1px solid #e5e5e5;">1 €</td></tr>
      <tr><td style="padding:6px 10px;border:1px solid #e5e5e5;">je Stunde näher</td><td style="padding:6px 10px;border:1px solid #e5e5e5;">+1 €</td></tr>
      <tr><td style="padding:6px 10px;border:1px solid #e5e5e5;">1 Stunde vorher oder später</td><td style="padding:6px 10px;border:1px solid #e5e5e5;">12 €</td></tr>
    </table>`;
}

type Attachment = { filename: string; content: string };

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  attachments?: Attachment[],
  /** Stabiler Schlüssel pro Buchung/Aktion – verhindert Doppelversand bei Netzwerk-Ambiguität. */
  idempotencyKey?: string,
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("RESEND_API_KEY missing, Buchungsbestätigung wird nicht versendet");
    return false;
  }
  const from = getFrom();
  const safeTo = isValidEmailish(to, 320) ? to : DEFAULT_ADMIN_EMAIL;
  const body: Record<string, unknown> = { from, to: safeTo, subject, html };
  if (attachments && attachments.length > 0) body.attachments = attachments;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey.slice(0, 256);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers,

    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    console.error("Resend send failed", res.status, errText);
    try {
      await supabaseAdmin.from("admin_notifications").insert({
        type: "email_failed",
        title: "E-Mail-Versand fehlgeschlagen",
        body: `${subject} → ${safeTo} · ${res.status} · ${errText.slice(0, 400)}`,
      });
    } catch {}
    return false;
  }
  return true;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isDuplicateLog(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === "23505" || (err.message ?? "").includes("duplicate key");
}

/**
 * Protokolliert eine ERFOLGREICH abgeschlossene Aktion. Bewusst NACH dem
 * Versand: ein Eintrag bedeutet immer „wirklich erledigt“. Die Exactly-once-
 * Garantie liefert die Action-State-Machine (public.booking_actions).
 */
async function logActionSuccess(params: {
  bookingId: string;
  userId: string | null;
  title: string;
  type: string;
  body: string;
}): Promise<void> {
  const { error } = await supabaseAdmin.from("admin_notifications").insert({
    type: params.type,
    title: params.title,
    body: params.body,
    booking_id: params.bookingId,
    user_id: params.userId,
  });
  if (error && !isDuplicateLog(error)) {
    console.warn("[emails] Protokolleintrag fehlgeschlagen:", error.message);
  }
}

export const CONFIRM_LOG_TITLE = "Buchungsbestätigung versendet";
export const ADMIN_LOG_TITLE = "Admin-Buchungsmail versendet";

/**
 * Server-only Implementierung. MUSS aus Server-Routen (Webhook) direkt
 * aufgerufen werden – nie über den createServerFn-Wrapper, da dessen
 * Aufruf auf dem Server ein RPC-Stub ist und fehlschlägt.
 *
 * Exactly-once wird NICHT hier entschieden, sondern von der Action-State-
 * Machine (public.booking_actions). Diese Funktion meldet ehrlich zurück,
 * ob wirklich versendet wurde, und wirft bei harten Fehlern.
 */
export async function sendBookingConfirmationImpl(data: {
  bookingId: string;
  force?: boolean;
}): Promise<{ sent: boolean; reason?: string }> {
  const { data: booking, error } = await supabaseAdmin
    .from("bookings")
    .select(
      "id, user_id, vehicle_name, vehicle_plate, plan_id, plan_label, start_date, start_hour, pickup_code, addons, addons_total_cents",
    )
    .eq("id", data.bookingId)
    .maybeSingle();
  if (error || !booking) throw new Error("Buchung nicht gefunden");

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("email, first_name")
    .eq("id", booking.user_id)
    .maybeSingle();
  const email = profile?.email;
  if (!email) return { sent: false, reason: "no_email" };

  const greeting = profile?.first_name ? `Hallo ${profile.first_name},` : "Hallo,";
  const startStr = fmtDate(booking.start_date, booking.start_hour);
  const startDateObj = new Date(`${booking.start_date}T00:00:00`);
  const returnDateObj = computePlanReturn(booking.plan_id, startDateObj, booking.start_hour);
  const returnStr = fmtDateObj(returnDateObj);
  const tripUrl = `https://www.mytransporter.org/trip/${booking.id}`;
  const profilUrl = `https://www.mytransporter.org/profil`;

  const addons = Array.isArray(booking.addons)
    ? (booking.addons as Array<{ id: string; label: string; price_cents: number }>)
    : [];
  const addonsHtmlBlock =
    addons.length === 0
      ? ""
      : rawListBlock(
          "Gebuchtes Zubehör",
          addons.map(
            (a) => `${esc(a.label)} · <strong>${(a.price_cents / 100).toFixed(2)} €</strong>`,
          ),
        ) +
        noteBlock(
          `Summe Zubehör: <strong>${(((booking.addons_total_cents ?? 0) as number) / 100).toFixed(2)} €</strong>. Bitte vollständig &amp; unbeschädigt zurückgeben.`,
        );

  const html = renderEmail({
    firstName: profile?.first_name,
    heading: "Deine Buchung ist bestätigt",
    intro: [
      "vielen Dank für deine Buchung bei MyTransporter. Hier findest du alle Mietdaten auf einen Blick.",
    ],
    rowsTitle: "Deine Mietdaten",
    rows: [
      { label: "Fahrzeug", value: `${booking.vehicle_name} · ${booking.vehicle_plate}` },
      { label: "Tarif", value: booking.plan_label },
      { label: "Abholung", value: `${startStr} Uhr` },
      { label: "Rückgabe spätestens", value: `${returnStr} Uhr` },
    ],
    button: { label: "Zur Buchung", url: tripUrl },
    extraHtml:
      addonsHtmlBlock +
      listBlock("So geht es weiter", [
        "Dein Schlüssel-Code wird automatisch 30 Minuten vor der Abholung in der App freigeschaltet.",
        "Du bekommst eine Erinnerung 24 Stunden vorher und nochmal 30 Minuten vor Start.",
        "Über den Button oben kommst du jederzeit zu deiner Buchung.",
      ]) +
      noteBlock(
        `<strong>Stornierung:</strong> Du kannst deine Fahrt jederzeit im <a href="${profilUrl}" style="color:#000;">Profil</a> stornieren. Bis 13 Stunden vor Abfahrt ist das kostenlos.${cancellationTable()}<br />Die Kaution wird in jedem Fall vollständig zurückerstattet.`,
      ),
  });

  // Die Rechnung ist Bestandteil der Kundenbestätigung: schlägt das PDF fehl,
  // wird NICHT gesendet und die Aktion bleibt retrybar.
  let invoiceAttachment: Attachment;
  try {
    const { generateBookingInvoicePdf } = await import("@/lib/invoice-pdf.server");
    const inv = await generateBookingInvoicePdf(booking.id);
    invoiceAttachment = { filename: inv.filename, content: inv.pdfBase64 };
  } catch (e) {
    const msg = String((e as Error)?.message ?? e).slice(0, 300);
    console.warn("Rechnungs-PDF konnte nicht erzeugt werden:", msg);
    try {
      await supabaseAdmin.from("admin_notifications").insert({
        type: "invoice_failed",
        title: "Rechnungs-PDF fehlgeschlagen",
        body: `Buchung ${booking.id}: ${msg}`,
        booking_id: booking.id,
      });
    } catch {}
    throw new Error(`Rechnungs-PDF fehlgeschlagen: ${msg}`);
  }

  const sent = await sendEmail(
    email,
    `MyTransporter · Buchungsbestätigung für ${startStr} Uhr`,
    html,
    [invoiceAttachment],
    `booking-confirmation-${booking.id}`,
  );

  if (sent) {
    await logActionSuccess({
      bookingId: booking.id,
      userId: booking.user_id,
      title: CONFIRM_LOG_TITLE,
      type: "booking_created",
      body: `${booking.vehicle_name} · Start ${booking.start_date} ${booking.start_hour}:00 (E-Mail inkl. Rechnung gesendet)`,
    });
  }

  return { sent, ...(sent ? {} : { reason: "send_failed" }) };
}

export async function sendAdminBookingNotificationImpl(data: {
  bookingId: string;
  force?: boolean;
}): Promise<{ sent: boolean; reason?: string }> {
  const { data: booking } = await supabaseAdmin
    .from("bookings")
    .select(
      "id, user_id, vehicle_name, vehicle_plate, plan_label, plan_price, start_date, start_hour, pickup_code, addons, addons_total_cents",
    )
    .eq("id", data.bookingId)
    .maybeSingle();
  if (!booking) return { sent: false, reason: "booking_not_found" };

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("email, first_name, last_name, phone")
    .eq("id", booking.user_id)
    .maybeSingle();

  const startStr = fmtDate(booking.start_date, booking.start_hour);
  const customerName =
    [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "Unbekannt";
  const addons = Array.isArray(booking.addons)
    ? (booking.addons as Array<{ id: string; label: string; price_cents: number }>)
    : [];
  const addonsHtml =
    addons.length === 0
      ? "<em>keins</em>"
      : addons
          .map((a) => `${escapeHtml(a.label)} (${(a.price_cents / 100).toFixed(2)} €)`)
          .join(", ");

  const html = `
      <div style="font-family:system-ui,-apple-system,sans-serif;max-width:600px;margin:auto;padding:24px;color:#111;">
        <h2 style="margin:0 0 16px;">🚐 Neue Buchung</h2>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr><td style="padding:6px 0;color:#666;width:140px;">Kunde</td><td><strong>${escapeHtml(customerName)}</strong></td></tr>
          <tr><td style="padding:6px 0;color:#666;">E-Mail</td><td>${escapeHtml(profile?.email ?? "-")}</td></tr>
          <tr><td style="padding:6px 0;color:#666;">Telefon</td><td>${escapeHtml(profile?.phone ?? "-")}</td></tr>
          <tr><td style="padding:6px 0;color:#666;">Fahrzeug</td><td>${escapeHtml(booking.vehicle_name)} · ${escapeHtml(booking.vehicle_plate)}</td></tr>
          <tr><td style="padding:6px 0;color:#666;">Tarif</td><td>${escapeHtml(booking.plan_label)} · ${Number(booking.plan_price).toFixed(2)} €</td></tr>
          <tr><td style="padding:6px 0;color:#666;">Abholung</td><td><strong>${startStr} Uhr</strong></td></tr>
          <tr><td style="padding:6px 0;color:#666;">Abhol-Code</td><td><code style="background:#f5f5f5;padding:2px 6px;border-radius:4px;">${escapeHtml(booking.pickup_code)}</code></td></tr>
          <tr><td style="padding:6px 0;color:#666;">Zubehör</td><td>${addonsHtml}</td></tr>
        </table>
        <p style="margin:24px 0;">
          <a href="https://www.mytransporter.org/admin" style="background:#000;color:#fff;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:600;display:inline-block;">Im Admin öffnen</a>
        </p>
      </div>`;

  const sent = await sendEmail(
    getAdminEmail(),
    `🚐 Neue Buchung · ${customerName} · ${startStr}`,
    html,
    undefined,
    `admin-booking-${booking.id}`,
  );

  // Push an alle Admin-Geräte. Ein Push-Fehler darf die erfolgreich
  // versendete Admin-E-Mail NICHT in einen Fehlzustand versetzen.
  await pushToAdmins({
    title: "Neue Buchung",
    body: `${customerName} · ${booking.plan_label} · ${startStr}`,
    url: "/admin",
    tag: `booking-${booking.id}`,
  }).catch((e) => console.warn("Admin-Push (Buchung) fehlgeschlagen:", e));

  if (sent) {
    await logActionSuccess({
      bookingId: booking.id,
      userId: booking.user_id,
      title: ADMIN_LOG_TITLE,
      type: "booking_created",
      body: `${customerName} · ${booking.plan_label} · ${startStr} (E-Mail gesendet)`,
    });
  }

  return { sent, ...(sent ? {} : { reason: "send_failed" }) };
}
