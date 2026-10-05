import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { renderEmail } from "@/lib/email-template";

type ReminderKind = "24h" | "30min";

interface BookingRow {
  id: string;
  user_id: string;
  vehicle_name: string;
  vehicle_plate: string;
  plan_label: string;
  start_date: string;
  start_hour: number;
  reminder_24h_sent_at: string | null;
  reminder_30min_sent_at: string | null;
}

// start_date + start_hour represent Europe/Berlin wall time. The Worker
// runtime is UTC, so a naive Date parse skews reminders by 1–2 hours and
// they miss the send window. Compute the correct UTC instant by asking
// Intl what the given wall time maps to in Berlin, then subtracting the
// offset for that instant.
function startTsOf(b: BookingRow): number {
  const [y, m, d] = b.start_date.split("-").map(Number);
  const h = b.start_hour;
  const utcGuess = Date.UTC(y, m - 1, d, h, 0, 0);
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Berlin",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(new Date(utcGuess));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asBerlin = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  const offset = asBerlin - utcGuess;
  return utcGuess - offset;
}

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL || "MyTransporter <noreply@mytransporter.org>";
  if (!apiKey) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, html }),
    });
    return res.ok;
  } catch (e) {
    console.error("Resend send failed", e);
    return false;
  }
}

function buildEmail(
  kind: ReminderKind,
  b: BookingRow,
  firstName?: string | null,
): { subject: string; html: string; title: string } {
  const dateStr = new Date(`${b.start_date}T${String(b.start_hour).padStart(2, "0")}:00:00`)
    .toLocaleString("de-DE", { dateStyle: "full", timeStyle: "short" });
  const tripUrl = `https://www.mytransporter.org/trip/${b.id}`;
  const rows = [
    { label: "Fahrzeug", value: `${b.vehicle_name} · ${b.vehicle_plate}` },
    { label: "Tarif", value: b.plan_label },
    { label: "Abholung", value: `${dateStr} Uhr` },
  ];
  if (kind === "24h") {
    return {
      title: `Erinnerung: Deine Fahrt morgen um ${b.start_hour}:00`,
      subject: `MyTransporter · Deine Abholung morgen um ${b.start_hour}:00 Uhr`,
      html: renderEmail({
        firstName,
        heading: "Erinnerung: Deine Fahrt startet morgen",
        intro: ["nur eine kurze Erinnerung an deine Abholung. Hier noch einmal alle Mietdaten:"],
        rowsTitle: "Deine Mietdaten",
        rows,
        button: { label: "Buchung öffnen", url: tripUrl },
        outro: ["Deinen Schlüssel-Code schalten wir automatisch 30 Minuten vor der Abholung in der App frei."],
      }),
    };
  }
  return {
    title: `Dein Schlüssel-Code ist jetzt freigeschaltet`,
    subject: `MyTransporter · Schlüssel-Code freigeschaltet`,
    html: renderEmail({
      firstName,
      heading: "Es geht gleich los",
      intro: [`deine Fahrt startet um ${b.start_hour}:00 Uhr. Dein Schlüssel-Code ist jetzt in der App freigeschaltet.`],
      rowsTitle: "Deine Mietdaten",
      rows,
      button: { label: "Zur Buchung", url: tripUrl },
      outro: ["Bitte prüfe das Fahrzeug vor der Fahrt und lade die Fotos direkt in der App hoch."],
    }),
  };
}


async function processBatch(kind: ReminderKind) {
  const now = Date.now();
  const windowStart = kind === "24h" ? now + 23 * 3600_000 : now + 25 * 60_000;
  const windowEnd = kind === "24h" ? now + 25 * 3600_000 : now + 35 * 60_000;

  const column = kind === "24h" ? "reminder_24h_sent_at" : "reminder_30min_sent_at";

  const { data, error } = await supabaseAdmin
    .from("bookings")
    .select("id, user_id, vehicle_name, vehicle_plate, plan_label, start_date, start_hour, reminder_24h_sent_at, reminder_30min_sent_at")
    .in("status", ["paid", "active", "in_progress", "picked_up"])
    .is(column, null);
  if (error) {
    console.error("Booking query failed", error);
    return { processed: 0, error: error.message };
  }

  const candidates = (data ?? []).filter((b) => {
    const t = startTsOf(b as BookingRow);
    return t >= windowStart && t <= windowEnd;
  }) as BookingRow[];

  let processed = 0;
  for (const b of candidates) {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("email, first_name")
      .eq("id", b.user_id)
      .maybeSingle();
    const email = profile?.email;
    const { subject, html, title } = buildEmail(kind, b, profile?.first_name);

    let sent = false;
    if (email) sent = await sendEmail(email, subject, html);

    await supabaseAdmin.from("admin_notifications").insert({
      type: kind === "24h" ? "reminder_24h" : "reminder_30min",
      title,
      body: `${b.vehicle_name} · ${b.vehicle_plate} · Start ${b.start_date} ${b.start_hour}:00${sent ? " (E-Mail gesendet)" : email ? " (E-Mail fehlgeschlagen)" : " (keine E-Mail-Adresse)"}`,
      booking_id: b.id,
      user_id: b.user_id,
    });

    const nowIso = new Date().toISOString();
    if (kind === "24h") {
      await supabaseAdmin.from("bookings").update({ reminder_24h_sent_at: nowIso }).eq("id", b.id);
    } else {
      await supabaseAdmin.from("bookings").update({ reminder_30min_sent_at: nowIso }).eq("id", b.id);
    }

    processed++;
  }
  return { processed };
}

interface ManualRow {
  id: string;
  vehicle_plate: string;
  vehicle_name: string | null;
  start_at: string;
  end_at: string;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  note: string | null;
  notify_customer: boolean;
  reminder_24h_sent_at: string | null;
  reminder_30min_sent_at: string | null;
}

function fmtBerlin(iso: string): string {
  return new Date(iso).toLocaleString("de-DE", {
    timeZone: "Europe/Berlin",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** Erinnerungen für manuell im Adminkalender eingetragene Termine. */
async function processManualBatch(kind: ReminderKind) {
  const now = Date.now();
  const windowStart = kind === "24h" ? now + 23 * 3600_000 : now + 25 * 60_000;
  const windowEnd = kind === "24h" ? now + 25 * 3600_000 : now + 35 * 60_000;
  const column = kind === "24h" ? "reminder_24h_sent_at" : "reminder_30min_sent_at";

  const { data, error } = await supabaseAdmin
    .from("manual_reservations")
    .select(
      "id, vehicle_plate, vehicle_name, start_at, end_at, customer_name, customer_phone, customer_email, note, notify_customer, reminder_24h_sent_at, reminder_30min_sent_at",
    )
    .eq("reminder_enabled", true)
    .is(column, null);
  if (error) {
    console.error("Manual reservation query failed", error);
    return { processed: 0, error: error.message };
  }

  const candidates = ((data ?? []) as ManualRow[]).filter((m) => {
    const t = new Date(m.start_at).getTime();
    return t >= windowStart && t <= windowEnd;
  });

  let processed = 0;
  for (const m of candidates) {
    const when = fmtBerlin(m.start_at);
    const vehicle = [m.vehicle_name, m.vehicle_plate].filter(Boolean).join(" · ");
    const title =
      kind === "24h"
        ? `Erinnerung: Termin morgen – ${m.customer_name}`
        : `Termin startet in 30 Minuten – ${m.customer_name}`;
    const bodyParts = [
      vehicle,
      `Start ${when}`,
      `Ende ${fmtBerlin(m.end_at)}`,
      m.customer_phone ? `Tel. ${m.customer_phone}` : null,
      m.note,
    ].filter(Boolean);

    let customerMailed: boolean | null = null;
    if (m.notify_customer && m.customer_email) {
      customerMailed = await sendEmail(
        m.customer_email,
        kind === "24h"
          ? "MyTransporter · Erinnerung an deinen Termin morgen"
          : "MyTransporter · Dein Termin startet in Kürze",
        renderEmail({
          firstName: m.customer_name,
          heading: kind === "24h" ? "Erinnerung an deinen Termin morgen" : "Dein Termin startet in Kürze",
          intro: ["hier noch einmal die Daten zu deinem Termin bei MyTransporter:"],
          rowsTitle: "Deine Mietdaten",
          rows: [
            { label: "Fahrzeug", value: vehicle || "Transporter" },
            { label: "Beginn", value: `${when} Uhr` },
            { label: "Ende", value: `${fmtBerlin(m.end_at)} Uhr` },
          ],
          button: { label: "MyTransporter öffnen", url: "https://www.mytransporter.org" },
        }),
      );
    }

    await supabaseAdmin.from("admin_notifications").insert({
      type: kind === "24h" ? "manual_reminder_24h" : "manual_reminder_30min",
      title,
      body:
        bodyParts.join(" · ") +
        (customerMailed === null ? "" : customerMailed ? " (Kunden-E-Mail gesendet)" : " (Kunden-E-Mail fehlgeschlagen)"),
    });

    await supabaseAdmin
      .from("manual_reservations")
      .update(
        kind === "24h"
          ? { reminder_24h_sent_at: new Date().toISOString() }
          : { reminder_30min_sent_at: new Date().toISOString() },
      )
      .eq("id", m.id);


    processed++;
  }
  return { processed };
}

export const Route = createFileRoute("/api/public/hooks/send-reminders")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const r24 = await processBatch("24h");
          const r30 = await processBatch("30min");
          const m24 = await processManualBatch("24h");
          const m30 = await processManualBatch("30min");

          // Hinweis: Die Wiederholung der Owner-Benachrichtigungen läuft
          // bewusst NICHT hier, sondern ausschließlich hinter dem
          // token-geschützten Endpunkt /api/public/hooks/process-manual-notifications.



          return new Response(
            JSON.stringify({
              ok: true,
              reminders_24h: r24,
              reminders_30min: r30,
              manual_24h: m24,
              manual_30min: m30,
              return_10min: ret,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );

        } catch (e) {
          console.error("send-reminders failed", e);
          return new Response(JSON.stringify({ ok: false, error: String(e) }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});