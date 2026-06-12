import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { computePlanReturn } from "@/lib/booking-rules";

const FROM = process.env.RESEND_FROM_EMAIL || "MyTransporter <info@mytransporter.org>";
const ADMIN_EMAIL = process.env.ADMIN_NOTIFY_EMAIL || "kroega.christian96@gmx.de";

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

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("RESEND_API_KEY missing, Buchungsbestätigung wird nicht versendet");
    return false;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });
  if (!res.ok) {
    console.error("Resend send failed", await res.text());
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

    const sent = await sendEmail(
      email,
      `MyTransporter · Buchungsbestätigung für ${startStr} Uhr`,
      html,
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