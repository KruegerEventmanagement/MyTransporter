/** Schlüsselcode-SMS über seven.io. Eigener Sweep, unabhängig von der Code-Mail. */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isKeyCodeDue } from "./key-handover";
import { bookingSmsDue, processKeySms, sendSeven, KEY_SMS_BOOKING_STATUSES, type KeySmsStore, type SendFn } from "./key-sms-core";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabaseAdmin as any;

export const keySmsStore: KeySmsStore = {
  async claim(type, id) {
    const { data, error } = await db.rpc("key_sms_claim", { _type: type, _id: id });
    if (error || !data?.result) throw new Error("key_sms_claim fehlgeschlagen");
    return data;
  },
  async markSending(type, id, token) {
    const { data, error } = await db.rpc("key_sms_mark_sending", { _type: type, _id: id, _token: token });
    if (error) throw new Error("key_sms_mark_sending fehlgeschlagen");
    return data === true;
  },
  async finish(type, id, token, status, providerId, err) {
    const { data, error } = await db.rpc("key_sms_finish", { _type: type, _id: id, _token: token, _status: status, _provider_id: providerId, _error: err });
    if (error) throw new Error("key_sms_finish fehlgeschlagen");
    return (data as string | null) ?? null;
  },
  async note(type, id, title, body) {
    await db.from("admin_notifications").insert({ type: "key_sms", title, body, ...(type === "booking" ? { booking_id: id } : {}) });
  },
};

export function sevenSender(apiKey: string): SendFn {
  return (to, text) => sendSeven(fetch, apiKey, to, text);
}

async function keyCodeFor(plate: string): Promise<string | null> {
  const { data: v } = await db.from("vehicles").select("id").eq("plate", plate).maybeSingle();
  if (!v?.id) return null;
  const { data } = await db.from("vehicle_key_codes").select("key_code").eq("vehicle_id", v.id).maybeSingle();
  return data?.key_code ?? null;
}

/** Läuft im Minutenjob. Nur aktiv mit SEVEN_API_KEY und KEY_SMS_ENABLED=true. */
export async function runKeyCodeSms(): Promise<{ enabled: boolean; checked: number }> {
  const apiKey = process.env.SEVEN_API_KEY;
  if (!apiKey || process.env.KEY_SMS_ENABLED !== "true") return { enabled: false, checked: 0 };
  const send = sevenSender(apiKey);
  const now = Date.now();
  let checked = 0;

  const { data: bookings } = await db
    .from("bookings")
    .select("id, user_id, vehicle_plate, start_date, start_hour, status")
    .in("status", [...KEY_SMS_BOOKING_STATUSES])
    .gte("start_date", new Date(now - 86400_000).toISOString().slice(0, 10))
    .lte("start_date", new Date(now + 86400_000).toISOString().slice(0, 10));
  for (const b of bookings ?? []) {
    if (!bookingSmsDue(b, now)) continue;
    try {
      const { data: p } = await db.from("profiles").select("phone, first_name").eq("id", b.user_id).maybeSingle();
      await processKeySms(keySmsStore, send, {
        type: "booking", id: b.id, plate: b.vehicle_plate, rawPhone: p?.phone ?? null, label: p?.first_name ?? "Kunde",
        stillEligible: async () => {
          const { data: cur } = await db.from("bookings").select("status").eq("id", b.id).maybeSingle();
          return !!cur && (KEY_SMS_BOOKING_STATUSES as readonly string[]).includes(cur.status);
        },
        keyCode: () => keyCodeFor(b.vehicle_plate),
      });
    } catch (e) {
      console.error("key sms booking failed", e instanceof Error ? e.message : "unknown");
    }
    checked++;
  }

  const { data: manual } = await db
    .from("manual_reservations")
    .select("id, vehicle_plate, start_at, customer_phone, customer_name, notify_customer")
    .eq("notify_customer", true)
    .gte("start_at", new Date(now - 3600_000).toISOString())
    .lte("start_at", new Date(now + 3600_000).toISOString());
  for (const m of manual ?? []) {
    if (!isKeyCodeDue(new Date(m.start_at).getTime(), now)) continue;
    try {
      await processKeySms(keySmsStore, send, {
        type: "manual", id: m.id, plate: m.vehicle_plate, rawPhone: m.customer_phone, label: m.customer_name,
        stillEligible: async () => {
          const { data: cur } = await db.from("manual_reservations").select("id, notify_customer").eq("id", m.id).maybeSingle();
          return !!cur?.notify_customer;
        },
        keyCode: () => keyCodeFor(m.vehicle_plate),
      });
    } catch (e) {
      console.error("key sms manual failed", e instanceof Error ? e.message : "unknown");
    }
    checked++;
  }
  return { enabled: true, checked };
}
