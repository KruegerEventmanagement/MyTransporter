/** Schlüsselcode-SMS über seven.io. Eigener Sweep, unabhängig von der Code-Mail. */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isKeyCodeDue } from "./key-handover";
import { buildKeySms, normalizePhone, KEY_SMS_SENDER } from "./key-sms";

type Src = "booking" | "manual";

function berlinStartMs(date: string, hour: number): number {
  const [y, m, d] = date.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, hour);
  const berlin = new Date(new Date(guess).toLocaleString("en-US", { timeZone: "Europe/Berlin" }));
  const utc = new Date(new Date(guess).toLocaleString("en-US", { timeZone: "UTC" }));
  return guess - (berlin.getTime() - utc.getTime());
}

async function keyCodeFor(plate: string): Promise<string | null> {
  const { data: v } = await supabaseAdmin.from("vehicles").select("id").eq("plate", plate).maybeSingle();
  if (!v?.id) return null;
  const { data } = await supabaseAdmin.from("vehicle_key_codes").select("key_code").eq("vehicle_id", v.id).maybeSingle();
  return data?.key_code ?? null;
}

async function sendSeven(apiKey: string, to: string, text: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const res = await fetch("https://gateway.seven.io/api/sms", {
      method: "POST",
      headers: { "X-Api-Key": apiKey, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ to, text, from: KEY_SMS_SENDER }),
    });
    const body = await res.text();
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}: ${body.slice(0, 200)}` };
    let j: { success?: string; messages?: { id?: string | number; success?: boolean; error_text?: string | null }[] } = {};
    try { j = JSON.parse(body); } catch { return { ok: false, error: `Antwort unlesbar: ${body.slice(0, 100)}` }; }
    const msg = j.messages?.[0];
    if (j.success !== "100" || !msg?.id) return { ok: false, error: `seven.io Code ${j.success ?? "?"} ${msg?.error_text ?? ""}`.trim() };
    return { ok: true, id: String(msg.id) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message.slice(0, 200) : "Netzwerkfehler" };
  }
}

async function handle(apiKey: string, type: Src, id: string, plate: string, rawPhone: string | null, label: string) {
  const { data: claimed } = await supabaseAdmin.rpc("claim_key_code_sms", { _type: type, _id: id });
  if (!claimed) return;
  const phone = normalizePhone(rawPhone);
  const code = phone ? await keyCodeFor(plate) : null;
  const text = code ? buildKeySms(plate, code) : null;
  if (!phone || !text) {
    await supabaseAdmin.from("key_code_sms").update({ status: "no_phone", last_error: !phone ? "keine gültige Handynummer" : "kein Code/Tresor", updated_at: new Date().toISOString() }).eq("source_type", type).eq("source_id", id);
    return;
  }
  const r = await sendSeven(apiKey, phone, text);
  if (r.ok) {
    await supabaseAdmin.from("key_code_sms").update({ status: "sent", provider_id: r.id, last_error: null, updated_at: new Date().toISOString() }).eq("source_type", type).eq("source_id", id);
    return;
  }
  const { data: row } = await supabaseAdmin.from("key_code_sms").select("attempts").eq("source_type", type).eq("source_id", id).maybeSingle();
  const final = (row?.attempts ?? 3) >= 3;
  await supabaseAdmin.from("key_code_sms").update({ status: final ? "gave_up" : "failed", last_error: r.error, updated_at: new Date().toISOString() }).eq("source_type", type).eq("source_id", id);
  if (final) {
    await supabaseAdmin.from("admin_notifications").insert({ type: "key_sms_failed", title: `Schlüssel-SMS fehlgeschlagen – ${label}`, body: `${plate}: ${r.error}`, ...(type === "booking" ? { booking_id: id } : {}) });
  }
}

/** Läuft im Minutenjob. Nur aktiv mit SEVEN_API_KEY und KEY_SMS_ENABLED=true. */
export async function runKeyCodeSms(): Promise<{ enabled: boolean; checked: number }> {
  const apiKey = process.env.SEVEN_API_KEY;
  if (!apiKey || process.env.KEY_SMS_ENABLED !== "true") return { enabled: false, checked: 0 };
  const now = Date.now();
  let checked = 0;

  const { data: bookings } = await supabaseAdmin
    .from("bookings")
    .select("id, user_id, vehicle_plate, start_date, start_hour")
    .in("status", ["paid", "active", "in_progress", "picked_up"])
    .gte("start_date", new Date(now - 86400_000).toISOString().slice(0, 10))
    .lte("start_date", new Date(now + 86400_000).toISOString().slice(0, 10));
  for (const b of bookings ?? []) {
    if (!isKeyCodeDue(berlinStartMs(b.start_date, b.start_hour), now)) continue;
    const { data: p } = await supabaseAdmin.from("profiles").select("phone, first_name").eq("id", b.user_id).maybeSingle();
    await handle(apiKey, "booking", b.id, b.vehicle_plate, p?.phone ?? null, p?.first_name ?? "Kunde");
    checked++;
  }

  const { data: manual } = await supabaseAdmin
    .from("manual_reservations")
    .select("id, vehicle_plate, start_at, customer_phone, customer_name, notify_customer")
    .eq("notify_customer", true)
    .gte("start_at", new Date(now - 3600_000).toISOString())
    .lte("start_at", new Date(now + 3600_000).toISOString());
  for (const m of manual ?? []) {
    if (!isKeyCodeDue(new Date(m.start_at).getTime(), now)) continue;
    await handle(apiKey, "manual", m.id, m.vehicle_plate, m.customer_phone, m.customer_name);
    checked++;
  }
  return { enabled: true, checked };
}
