import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { computePlanReturn } from "@/lib/booking-rules";
import { pushToAdmins } from "@/lib/push.functions";

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

function getAdminEmail(): string {
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

async function sendEmail(to: string, subject: string, html: string, attachments?: Attachment[]): Promise<boolean> {
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

export const sendBookingConfirmation = createServerFn({ method: "POST" })
  .inputValidator((data: { bookingId: string }) => {
    if (!data?.bookingId || typeof data.bookingId !== "string") {
      throw new Error("bookingId fehlt");
    }
    return data;
  })
  .handler(async ({ data }) => {
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

    const html = `
      <div style="font-family:system-ui,-apple-system,sans-serif;max-width:600px;margin:auto;padding:24px;color:#111;">
        <h2 style="margin:0 0 16px;">Buchung bestätigt ✅</h2>
        <p>${greeting}</p>
        <p>vielen Dank für deine Buchung bei MyTransporter. Hier deine Übersicht:</p>

        <div style="background:#f7f7f7;border-radius:12px;padding:16px 20px;margin:20px 0;">
          <p style="margin:0 0 4px;"><strong>${booking.vehicle_name}</strong> · ${booking.vehicle_plate}</p>
          <p style="margin:0 0 4px;">${booking.plan_label}</p>
          <p style="margin:0 0 4px;"><strong>Abholung:</strong> ${startStr} Uhr</p>
          <p style="margin:0;"><strong>Rückgabe spätestens:</strong> ${returnStr} Uhr</p>
        </div>

        ${(() => {
          const addons = Array.isArray(booking.addons) ? (booking.addons as Array<{ id: string; label: string; price_cents: number }>) : [];
          if (addons.length === 0) return "";
          const totalEur = ((booking.addons_total_cents ?? 0) / 100).toFixed(2);
          const items = addons
            .map((a) => `<li>${a.label} · <strong>${(a.price_cents / 100).toFixed(2)} €</strong></li>`)
            .join("");
          return `
            <h3 style="margin:24px 0 8px;font-size:16px;">Gebuchtes Zubehör</h3>
            <ul style="padding-left:20px;line-height:1.6;margin:0 0 8px;">${items}</ul>
            <p style="margin:0;font-size:13px;color:#555;">Summe Zubehör: <strong>${totalEur} €</strong>. Bitte vollständig &amp; unbeschädigt zurückgeben.</p>
          `;
        })()}

        <h3 style="margin:24px 0 8px;font-size:16px;">So geht es weiter</h3>
        <ol style="padding-left:20px;line-height:1.6;">
          <li>Dein <strong>Schlüssel-Code</strong> wird automatisch <strong>30 Minuten vor Abholung</strong> in der App freigeschaltet.</li>
          <li>Du bekommst rechtzeitig eine Erinnerung per E-Mail, einmal <strong>24 Stunden</strong> vorher und nochmal <strong>30 Minuten</strong> vor Start.</li>
          <li>Über den Button unten kommst du jederzeit zu deiner Buchung.</li>
        </ol>

        <p style="margin:24px 0;">
          <a href="${tripUrl}" style="background:#000;color:#fff;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:600;display:inline-block;">Zur Buchung</a>
        </p>

        <h3 style="margin:32px 0 8px;font-size:16px;">Stornierung</h3>
        <p style="margin:0 0 8px;">Du kannst deine Fahrt jederzeit kostenlos im <a href="${profilUrl}" style="color:#000;">Profil</a> stornieren, bis 13 Stunden vor Abfahrt fallen keine Gebühren an.</p>
        ${cancellationTable()}
        <p style="font-size:12px;color:#666;margin:8px 0 0;">Die Kaution wird in jedem Fall vollständig zurückerstattet.</p>

        <hr style="border:none;border-top:1px solid #eee;margin:32px 0 16px;" />
        <p style="color:#888;font-size:12px;margin:0;">MyTransporter · info@mytransporter.org</p>
      </div>`;

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

    const sent = await sendEmail(
      email,
      `MyTransporter · Buchungsbestätigung für ${startStr} Uhr`,
      html,
      invoiceAttachment ? [invoiceAttachment] : undefined,
    );

    await supabaseAdmin.from("admin_notifications").insert({
      type: "booking_created",
      title: "Buchungsbestätigung versendet",
      body: `${booking.vehicle_name} · Start ${booking.start_date} ${booking.start_hour}:00${sent ? " (E-Mail gesendet)" : " (E-Mail fehlgeschlagen)"}`,
      booking_id: booking.id,
      user_id: booking.user_id,
    });

    return { sent };
  });

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export const sendAdminBookingNotification = createServerFn({ method: "POST" })
  .inputValidator((data: { bookingId: string }) => {
    if (!data?.bookingId || typeof data.bookingId !== "string") {
      throw new Error("bookingId fehlt");
    }
    return data;
  })
  .handler(async ({ data }) => {
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

    return { sent };
  });

export const sendAdminRegistrationNotification = createServerFn({ method: "POST" })
  .inputValidator((data: { email: string; firstName?: string; lastName?: string; phone?: string; accountType?: "private" | "business"; companyName?: string; vatId?: string }) => {
    if (!data?.email || typeof data.email !== "string") {
      throw new Error("email fehlt");
    }
    return data;
  })
  .handler(async ({ data }) => {
    const name = [data.firstName, data.lastName].filter(Boolean).join(" ") || "Unbekannt";
    const isBusiness = data.accountType === "business";
    const html = `
      <div style="font-family:system-ui,-apple-system,sans-serif;max-width:600px;margin:auto;padding:24px;color:#111;">
        <h2 style="margin:0 0 16px;">${isBusiness ? "🏢" : "👤"} Neue Registrierung ${isBusiness ? "(Firma)" : "(Privat)"}</h2>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          ${isBusiness ? `<tr><td style="padding:6px 0;color:#666;width:140px;">Firma</td><td><strong>${escapeHtml(data.companyName ?? "-")}</strong></td></tr>` : ""}
          ${isBusiness && data.vatId ? `<tr><td style="padding:6px 0;color:#666;">USt-IdNr.</td><td>${escapeHtml(data.vatId)}</td></tr>` : ""}
          <tr><td style="padding:6px 0;color:#666;width:140px;">Name</td><td><strong>${escapeHtml(name)}</strong></td></tr>
          <tr><td style="padding:6px 0;color:#666;">E-Mail</td><td>${escapeHtml(data.email)}</td></tr>
          <tr><td style="padding:6px 0;color:#666;">Telefon</td><td>${escapeHtml(data.phone ?? "-")}</td></tr>
        </table>
        <p style="margin:24px 0;">
          <a href="https://www.mytransporter.org/admin" style="background:#000;color:#fff;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:600;display:inline-block;">Im Admin öffnen</a>
        </p>
      </div>`;
    const sent = await sendEmail(
      getAdminEmail(),
      `${isBusiness ? "🏢" : "👤"} Neue Registrierung · ${isBusiness ? (data.companyName || name) : name}`,
      html,
    );

    await pushToAdmins({
      title: "Neue Registrierung",
      body: `${name} · ${data.email}`,
      url: "/admin",
      tag: `signup-${data.email}`,
    }).catch((e) => console.warn("Admin-Push (Registrierung) fehlgeschlagen:", e));

    return { sent };
  });