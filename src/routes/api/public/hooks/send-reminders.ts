import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

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

function startTsOf(b: BookingRow): number {
  return new Date(`${b.start_date}T${String(b.start_hour).padStart(2, "0")}:00:00`).getTime();
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

function buildEmail(kind: ReminderKind, b: BookingRow): { subject: string; html: string; title: string } {
  const dateStr = new Date(`${b.start_date}T${String(b.start_hour).padStart(2, "0")}:00:00`)
    .toLocaleString("de-DE", { dateStyle: "full", timeStyle: "short" });
  const tripUrl = `https://www.mytransporter.org/trip/${b.id}`;
  if (kind === "24h") {
    return {
      title: `Erinnerung: Deine Fahrt morgen um ${b.start_hour}:00`,
      subject: `MyTransporter · Deine Abholung morgen um ${b.start_hour}:00 Uhr`,
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:560px;margin:auto;padding:24px;color:#111;">
          <h2 style="margin:0 0 12px;">Erinnerung: Deine Fahrt morgen</h2>
          <p>Hallo,</p>
          <p>nur eine kurze Erinnerung: Deine Buchung startet am <strong>${dateStr}</strong>.</p>
          <p><strong>${b.vehicle_name}</strong> · ${b.vehicle_plate}<br/>${b.plan_label}</p>
          <p>Du erhältst deinen Schlüssel-Code automatisch 30 Minuten vor der Abholung in der App.</p>
          <p style="margin-top:24px;"><a href="${tripUrl}" style="background:#000;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none;">Buchung öffnen</a></p>
          <p style="color:#888;font-size:12px;margin-top:32px;">MyTransporter</p>
        </div>`,
    };
  }
  return {
    title: `Dein Schlüssel-Code ist jetzt freigeschaltet`,
    subject: `MyTransporter · Schlüssel-Code freigeschaltet`,
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:560px;margin:auto;padding:24px;color:#111;">
        <h2 style="margin:0 0 12px;">Es geht gleich los 🚐</h2>
        <p>Deine Fahrt startet um <strong>${b.start_hour}:00 Uhr</strong>.</p>
        <p>Der Schlüssel-Code ist jetzt in der App freigeschaltet.</p>
        <p style="margin-top:24px;"><a href="${tripUrl}" style="background:#000;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none;">Zur Buchung</a></p>
        <p style="color:#888;font-size:12px;margin-top:32px;">MyTransporter</p>
      </div>`,
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
    const { subject, html, title } = buildEmail(kind, b);

    let sent = false;
    if (email) sent = await sendEmail(email, subject, html);

    await supabaseAdmin.from("admin_notifications").insert({
      type: kind === "24h" ? "reminder_24h" : "reminder_30min",
      title,
      body: `${b.vehicle_name} · ${b.vehicle_plate} · Start ${b.start_date} ${b.start_hour}:00${sent ? " (E-Mail gesendet)" : email ? " (E-Mail fehlgeschlagen)" : " (keine E-Mail-Adresse)"}`,
      booking_id: b.id,
      user_id: b.user_id,
    });

    await supabaseAdmin
      .from("bookings")
      .update({ [column]: new Date().toISOString() })
      .eq("id", b.id);

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
          return new Response(
            JSON.stringify({ ok: true, reminders_24h: r24, reminders_30min: r30 }),
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