import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { renderEmail } from "@/lib/email-template";
import { isKeyCodeDue, keyHandoverRows, KEY_HANDOVER_HINTS } from "@/lib/key-handover";

/** Fester Schlüsselkasten-Code des Fahrzeugs (nur serverseitig, nie geloggt). */
async function keyCodeFor(plate: string): Promise<string | null> {
  const { data: v } = await supabaseAdmin.from("vehicles").select("id").eq("plate", plate).maybeSingle();
  if (!v?.id) return null;
  const { data } = await supabaseAdmin.from("vehicle_key_codes").select("key_code").eq("vehicle_id", v.id).maybeSingle();
  return data?.key_code ?? null;
}

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

type ReminderTable = "bookings" | "manual_reservations";

/**
 * Erinnerung über die dauerhafte Outbox (Lease + Token, eingefrorener Inhalt,
 * stabiler Schlüssel, Ablauf zum Abholbeginn). *_sent_at wird erst gesetzt, wenn
 * der Versand abgeschlossen ist – Fehlschläge bleiben im Erinnerungsfenster retrybar.
 */
export async function deliverReminder(
  table: ReminderTable,
  id: string,
  kind: ReminderKind,
  to: string | null,
  subject: string,
  html: string,
  startIso: string,
): Promise<"sent" | "failed" | "pending" | "no_email" | "closed"> {
  const column = kind === "24h" ? "reminder_24h_sent_at" : "reminder_30min_sent_at";
  const markDone = async () => {
    const { data } = await supabaseAdmin.from(table).update({ [column]: new Date().toISOString() } as never)
      .eq("id", id).is(column, null).select("id");
    return (data ?? []).length === 1;
  };
  if (!to) return (await markDone()) ? "no_email" : "pending";
  const { sendReminderViaOutbox } = await import("@/lib/customer-mail-outbox.server");
  const r = await sendReminderViaOutbox({
    source: table === "bookings" ? "booking" : "manual",
    sourceId: id,
    kind: kind === "24h" ? "reminder_24h" : "reminder_30min",
    to, subject, html, expiresAt: startIso,
  });
  if (!r.done) return "pending";
  if (!(await markDone())) return "pending"; // anderer Lauf hat bereits abgeschlossen/protokolliert
  return r.sent ? "sent" : "closed";
}

function buildEmail(
  kind: ReminderKind,
  b: BookingRow,
  firstName?: string | null,
  keyCode: string | null = null,
): { subject: string; html: string; title: string } {
  const dateStr = new Date(`${b.start_date}T${String(b.start_hour).padStart(2, "0")}:00:00`)
    .toLocaleString("de-DE", { dateStyle: "full", timeStyle: "short" });
  const tripUrl = `https://mytransporter.org/trip/${b.id}`;
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
        outro: ["Deinen Schlüsselcode bekommst du automatisch 15 Minuten vor der Abholung per E-Mail."],
      }),
    };
  }
  return {
    title: `Schlüsselcode versendet`,
    subject: `MyTransporter · Dein Schlüsselcode für ${b.vehicle_plate}`,
    html: renderEmail({
      firstName,
      heading: "Dein Schlüsselcode",
      intro: [`deine Fahrt startet um ${b.start_hour}:00 Uhr. Hier ist dein Schlüsselcode und wo du alles findest:`],
      rowsTitle: "Schlüssel & Abholung",
      rows: [...keyHandoverRows(keyCode, b.vehicle_plate), ...rows],
      button: { label: "Zur Buchung", url: tripUrl },
      outro: [...KEY_HANDOVER_HINTS, "Bitte prüfe das Fahrzeug vor der Fahrt und lade die Fotos direkt in der App hoch."],
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
    return kind === "24h" ? t >= windowStart && t <= windowEnd : isKeyCodeDue(t, now);
  }) as BookingRow[];

  let processed = 0;
  for (const b of candidates) {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("email, first_name")
      .eq("id", b.user_id)
      .maybeSingle();
    const email = profile?.email ?? null;
    const code = kind === "30min" ? await keyCodeFor(b.vehicle_plate) : null;
    const { subject, html, title } = buildEmail(kind, b, profile?.first_name, code);

    const r = await deliverReminder("bookings", b.id, kind, email, subject, html, new Date(startTsOf(b)).toISOString());
    if (r === "pending") continue;
    const sent = r === "sent";

    await supabaseAdmin.from("admin_notifications").insert({
      type: kind === "24h" ? "reminder_24h" : "reminder_30min",
      title,
      body: `${b.vehicle_name} · ${b.vehicle_plate} · Start ${b.start_date} ${b.start_hour}:00${sent ? " (E-Mail gesendet)" : email ? " (E-Mail fehlgeschlagen)" : " (keine E-Mail-Adresse)"}`,
      booking_id: b.id,
      user_id: b.user_id,
    });

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
    return kind === "24h" ? t >= windowStart && t <= windowEnd : isKeyCodeDue(t, now);
  });

  let processed = 0;
  for (const m of candidates) {
    const when = fmtBerlin(m.start_at);
    const vehicle = [m.vehicle_name, m.vehicle_plate].filter(Boolean).join(" · ");
    const title =
      kind === "24h"
        ? `Erinnerung: Termin morgen – ${m.customer_name}`
        : `Schlüsselcode versendet – ${m.customer_name}`;
    const bodyParts = [
      vehicle,
      `Start ${when}`,
      `Ende ${fmtBerlin(m.end_at)}`,
      m.customer_phone ? `Tel. ${m.customer_phone}` : null,
      m.note,
    ].filter(Boolean);

    const wantsMail = m.notify_customer && !!m.customer_email;
    const code = kind === "30min" && wantsMail ? await keyCodeFor(m.vehicle_plate) : null;
    const r = await deliverReminder(
        "manual_reservations",
        m.id,
        kind,
        wantsMail ? m.customer_email : null,
        kind === "24h"
          ? "MyTransporter · Erinnerung an deinen Termin morgen"
          : `MyTransporter · Dein Schlüsselcode für ${m.vehicle_plate}`,
        renderEmail({
          firstName: m.customer_name,
          heading: kind === "24h" ? "Erinnerung an deinen Termin morgen" : "Dein Schlüsselcode",
          intro: [kind === "24h" ? "hier noch einmal die Daten zu deinem Termin bei MyTransporter:" : "dein Termin startet gleich. Hier ist dein Schlüsselcode und wo du alles findest:"],
          rowsTitle: kind === "24h" ? "Deine Mietdaten" : "Schlüssel & Abholung",
          ...(kind === "24h" ? { outro: ["Deinen Schlüsselcode bekommst du automatisch 15 Minuten vor Beginn per E-Mail."] } : { outro: KEY_HANDOVER_HINTS }),
          rows: [
            ...(kind === "30min" ? keyHandoverRows(code, m.vehicle_plate) : []),
            { label: "Fahrzeug", value: vehicle || "Transporter" },
            { label: "Beginn", value: `${when} Uhr` },
            { label: "Ende", value: `${fmtBerlin(m.end_at)} Uhr` },
          ],
          button: { label: "MyTransporter öffnen", url: "https://mytransporter.org" },
        }),
        m.start_at,
      );
    if (r === "pending") continue;
    const customerMailed: boolean | null = wantsMail ? r === "sent" : null;

    await supabaseAdmin.from("admin_notifications").insert({
      type: kind === "24h" ? "manual_reminder_24h" : "manual_reminder_30min",
      title,
      body:
        bodyParts.join(" · ") +
        (customerMailed === null ? "" : customerMailed ? " (Kunden-E-Mail gesendet)" : " (Kunden-E-Mail fehlgeschlagen)"),
    });



    processed++;
  }
  return { processed };
}

/** Schlüsselcode-Mails (Online + manuell); läuft zusätzlich im Minutenjob, damit genau 15 Min. vorher versendet wird. */
export async function runKeyCodeReminders() {
  return { bookings: await processBatch("30min"), manual: await processManualBatch("30min") };
}

export const Route = createFileRoute("/api/public/hooks/send-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Gleiches Schutzmuster wie return-reminders: Cron ruft über private.run_send_reminders_hook() mit Token.
        const token = process.env.NOTIFY_HOOK_TOKEN;
        const provided =
          new URL(request.url).searchParams.get("token") ?? request.headers.get("x-hook-token") ?? "";
        if (!token || provided !== token) return new Response("Unauthorized", { status: 401 });
        let bookingEmails: Record<string, number> | { failed: boolean };
        try {
          const { runBookingEmailRecovery } = await import("@/lib/booking-email-recovery.server");
          bookingEmails = await runBookingEmailRecovery();
        } catch { bookingEmails = { failed: true }; }
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
              booking_emails: bookingEmails,
              reminders_24h: r24,
              reminders_30min: r30,
              manual_24h: m24,
              manual_30min: m30,
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