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

export async function sendEmail(to: string, subject: string, html: string, attachments?: Attachment[]): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("RESEND_API_KEY missing, Buchungsbestätigung wird nicht versendet");
    return false;
  }
  const from = getFrom();
  const safeTo = isValidEmailish(to, 320) ? to : DEFAULT_ADMIN_EMAIL;
  const body: Record<string, unknown> = { from, to: safeTo, subject, html };
  if (attachments && attachments.length > 0) body.attachments = attachments;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
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
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Idempotenz: wurde fuer diese Buchung bereits eine Bestaetigung protokolliert? */
async function alreadyLogged(bookingId: string, title: string): Promise<boolean> {
  try {
    const { data } = await supabaseAdmin
      .from("admin_notifications")
      .select("id")
      .eq("booking_id", bookingId)
      .eq("title", title)
      .limit(1)
      .maybeSingle();
    return !!data?.id;
  } catch {
    return false;
  }
}

function isDuplicateLog(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === "23505" || (err.message ?? "").includes("duplicate key");
}

/**
 * Exactly-once-Reservierung: legt den Protokolleintrag VOR dem Versand an.
 * Der Unique-Index (booking_id, title) macht parallele Doppelversendungen
 * (z. B. Stripe-Retries) unmoeglich. Gibt false zurueck, wenn bereits belegt.
 */
async function reserveActionLog(params: {
  bookingId: string;
  userId: string | null;
  title: string;
  type: string;
}): Promise<boolean> {
  const { error } = await supabaseAdmin.from("admin_notifications").insert({
    type: params.type,
    title: params.title,
    body: "wird verarbeitet …",
    booking_id: params.bookingId,
    user_id: params.userId,
  });
  if (!error) return true;
  if (isDuplicateLog(error)) return false;
  // Protokoll nicht moeglich (z. B. temporaerer DB-Fehler): Versand trotzdem
  // zulassen, damit der Kunde seine Bestaetigung erhaelt.
  console.warn("[emails] Protokolleintrag fehlgeschlagen, sende trotzdem:", error.message);
  return true;
}

async function finishActionLog(bookingId: string, title: string, body: string): Promise<void> {
  try {
    await supabaseAdmin
      .from("admin_notifications")
      .update({ body })
      .eq("booking_id", bookingId)
      .eq("title", title);
  } catch (e) {
    console.warn("[emails] Protokoll-Update fehlgeschlagen:", e);
  }
}

const CONFIRM_LOG_TITLE = "Buchungsbestaetigung versendet";
const ADMIN_LOG_TITLE = "Admin-Buchungsmail versendet";

/**
 * Server-only Implementierung. MUSS aus Server-Routen (Webhook) direkt
 * aufgerufen werden – nie ueber den createServerFn-Wrapper, da dessen
 * Aufruf auf dem Server ein RPC-Stub ist und fehlschlaegt.
 */
export async function sendBookingConfirmationImpl(
  data: { bookingId: string; force?: boolean },
): Promise<{ sent: boolean; reason?: string }> {
  if (!data.force) {
    if (await alreadyLogged(data.bookingId, CONFIRM_LOG_TITLE)) {
      return { sent: false, reason: "already_sent" };
    }
  }
    const { data: booking, error } = await supabaseAdmin
      .from("bookings")
      .select("id, user_id, vehicle_name, vehicle_plate, plan_id, plan_label, start_date, start_hour, pickup_code, addons, addons_total_cents")
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
            addons.map((a) => `${esc(a.label)} · <strong>${(a.price_cents / 100).toFixed(2)} €</strong>`),
          ) +
          noteBlock(
            `Summe Zubehör: <strong>${(((booking.addons_total_cents ?? 0) as number) / 100).toFixed(2)} €</strong>. Bitte vollständig &amp; unbeschädigt zurückgeben.`,
          );

    const html = renderEmail({
      firstName: profile?.first_name,
      heading: "Deine Buchung ist bestätigt",
      intro: ["vielen Dank für deine Buchung bei MyTransporter. Hier findest du alle Mietdaten auf einen Blick."],
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


    let invoiceAttachment: Attachment | undefined;
    try {
      const { generateBookingInvoicePdf } = await import("@/lib/invoice-pdf.server");
      const inv = await generateBookingInvoicePdf(booking.id);
      invoiceAttachment = { filename: inv.filename, content: inv.pdfBase64 };
    } catch (e) {
      console.warn("Rechnungs-PDF konnte nicht erzeugt werden:", e);
      try {
        await supabaseAdmin.from("admin_notifications").insert({
          type: "invoice_failed",
          title: "Rechnungs-PDF fehlgeschlagen",
          body: `Buchung ${booking.id}: ${String((e as Error)?.message ?? e).slice(0, 300)}`,
          booking_id: booking.id,
        });
      } catch {}
    }

    // Exactly-once: Platz im Protokoll VOR dem Versand belegen.
    if (!data.force) {
      const reserved = await reserveActionLog({
        bookingId: booking.id,
        userId: booking.user_id,
        title: CONFIRM_LOG_TITLE,
        type: "booking_created",
      });
      if (!reserved) return { sent: false, reason: "already_sent" };
    }

    const sent = await sendEmail(
      email,
      `MyTransporter · Buchungsbestätigung für ${startStr} Uhr`,
      html,
      invoiceAttachment ? [invoiceAttachment] : undefined,
    );

    await finishActionLog(
      booking.id,
      CONFIRM_LOG_TITLE,
      `${booking.vehicle_name} · Start ${booking.start_date} ${booking.start_hour}:00${sent ? " (E-Mail gesendet)" : " (E-Mail fehlgeschlagen)"}`,
    );

    return { sent };
}

export async function sendAdminBookingNotificationImpl(
  data: { bookingId: string; force?: boolean },
): Promise<{ sent: boolean; reason?: string }> {
  if (!data.force && (await alreadyLogged(data.bookingId, ADMIN_LOG_TITLE))) {
    return { sent: false, reason: "already_sent" };
  }
    const { data: booking } = await supabaseAdmin
      .from("bookings")
      .select("id, user_id, vehicle_name, vehicle_plate, plan_label, plan_price, start_date, start_hour, pickup_code, addons, addons_total_cents")
      .eq("id", data.bookingId)
      .maybeSingle();
    if (!booking) return { sent: false, reason: "booking_not_found" };

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("email, first_name, last_name, phone")
      .eq("id", booking.user_id)
      .maybeSingle();

    const startStr = fmtDate(booking.start_date, booking.start_hour);
    const customerName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "Unbekannt";
    const addons = Array.isArray(booking.addons)
      ? (booking.addons as Array<{ id: string; label: string; price_cents: number }>)
      : [];
    const addonsHtml = addons.length === 0
      ? "<em>keins</em>"
      : addons.map((a) => `${escapeHtml(a.label)} (${(a.price_cents / 100).toFixed(2)} €)`).join(", ");

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
    );

    // Push an alle Admin-Geräte (still im Hintergrund, Fehler werden in admin_notifications geloggt)
    await pushToAdmins({
      title: "Neue Buchung",
      body: `${customerName} · ${booking.plan_label} · ${startStr}`,
      url: "/admin",
      tag: `booking-${booking.id}`,
    }).catch((e) => console.warn("Admin-Push (Buchung) fehlgeschlagen:", e));

    await supabaseAdmin.from("admin_notifications").insert({
      type: "booking_created",
      title: ADMIN_LOG_TITLE,
      body: `${customerName} · ${booking.plan_label} · ${startStr}${sent ? " (E-Mail gesendet)" : " (E-Mail fehlgeschlagen)"}`,
      booking_id: booking.id,
      user_id: booking.user_id,
    });

    return { sent };
}
