/**
 * Outbox-Läufer und Einreihung für interne Partner-Benachrichtigungen.
 * Idempotenz: event_key UNIQUE + Gmail-Fence (Schlüssel je Ereignis).
 * Fehler werfen nie nach außen (Redirect/Signup/Checkout dürfen nie blockieren).
 */
import {
  buildPartnerNotification, MAX_NOTIFY_ATTEMPTS, PARTNER_ADMIN_URL, PARTNER_NOTIFY_RECIPIENT,
  partnerEventKey, retryDelaySeconds, type PartnerNotifyKind, type PartnerNotifyPayload,
} from "@/lib/partner-notifications";
import { computePartnerCommission, COMMISSIONABLE_STATUSES, isUuid } from "@/lib/partner-tracking";
import type { DetailedSendResult } from "@/lib/mail-provider";

type Db = { from: (t: string) => any; rpc: (f: string, a: Record<string, unknown>) => any };
export type NotifyRow = { id: string; kind: PartnerNotifyKind; event_key: string; payload: PartnerNotifyPayload; attempts: number; lease_token: string };

export type ProcessDeps = {
  claim: (limit: number, id?: string) => Promise<NotifyRow[]>;
  finish: (id: string, token: string, status: "sent" | "failed" | "needs_review", providerId: string | null, error: string | null, retrySeconds: number) => Promise<boolean>;
  send: (args: { to: string; subject: string; html: string; idempotencyKey: string }) => Promise<DetailedSendResult>;
  render: (kind: PartnerNotifyKind, p: PartnerNotifyPayload) => string;
};

export async function processPartnerNotifications(deps: ProcessDeps, opts: { limit?: number; id?: string } = {}) {
  const out = { sent: 0, failed: 0, review: 0 };
  const rows = await deps.claim(opts.limit ?? 20, opts.id);
  for (const r of rows) {
    let res: DetailedSendResult;
    try {
      const m = buildPartnerNotification(r.kind, r.payload);
      res = await deps.send({ to: PARTNER_NOTIFY_RECIPIENT, subject: m.subject, html: deps.render(r.kind, r.payload), idempotencyKey: `partner-notify-${r.event_key}` });
    } catch (e) {
      res = { ok: false, kind: "other", ambiguous: false, status: null, error: String((e as Error)?.message ?? e).slice(0, 200) };
    }
    if (res.ok) { await deps.finish(r.id, r.lease_token, "sent", res.providerId, null, 0); out.sent++; continue; }
    // Unklar angenommen ⇒ nie automatisch erneut senden.
    if (res.ambiguous || r.attempts >= MAX_NOTIFY_ATTEMPTS) { await deps.finish(r.id, r.lease_token, "needs_review", null, res.error, 0); out.review++; continue; }
    await deps.finish(r.id, r.lease_token, "failed", null, `${res.kind}: ${res.error}`, retryDelaySeconds(r.attempts));
    out.failed++;
  }
  return out;
}

async function realDeps(): Promise<ProcessDeps> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { sendEmailDetailed } = await import("@/lib/mail-provider.server");
  const { renderEmail } = await import("@/lib/email-template");
  const db = supabaseAdmin as unknown as Db;
  return {
    claim: async (limit, id) => {
      const { data, error } = await db.rpc("claim_partner_notifications", { _limit: limit, _lease_seconds: 120, ...(id ? { _id: id } : {}) });
      if (error) throw new Error(String(error.message));
      return (data ?? []) as NotifyRow[];
    },
    finish: async (id, token, status, providerId, error, retrySeconds) => {
      const { data, error: e } = await db.rpc("finish_partner_notification", { _id: id, _lease_token: token, _status: status, _provider_id: providerId, _error: error, _retry_seconds: retrySeconds });
      return !e && data === true;
    },
    send: ({ to, subject, html, idempotencyKey }) =>
      sendEmailDetailed({ provider: "gmail", from: process.env["RESEND_FROM_EMAIL"] || "MyTransporter <info@mytransporter.org>", to, subject, html, idempotencyKey }),
    render: (kind, p) => {
      const m = buildPartnerNotification(kind, p);
      return renderEmail({ heading: m.heading, intro: m.intro, rows: m.rows, rowsTitle: "Details", button: { label: "Partner & QR im Admin öffnen", url: PARTNER_ADMIN_URL }, omitSignature: true });
    },
  };
}

/** Sofortversuch nach dem Einreihen; Fehler bleiben retrybar (Wiederholungsjob). */
export async function runPartnerNotifications(opts: { limit?: number; id?: string } = {}) {
  return processPartnerNotifications(await realDeps(), opts);
}

async function insertNotification(db: Db, kind: PartnerNotifyKind, id: string, partnerId: string | null, payload: PartnerNotifyPayload) {
  const { data, error } = await db.from("partner_notifications")
    .upsert({ event_key: partnerEventKey(kind, id), kind, partner_id: partnerId, payload }, { onConflict: "event_key", ignoreDuplicates: true })
    .select("id");
  if (error) throw new Error(String(error.message));
  return ((data ?? []) as { id: string }[])[0]?.id ?? null;
}

const safe = async (label: string, fn: () => Promise<unknown>) => {
  try { await fn(); } catch (e) { console.error(`[partner-notify] ${label}`, String((e as Error)?.message ?? e).slice(0, 200)); }
};

/** Scan: nur einreihen (gedeckelt), Versand übernimmt der geweckte Läufer. */
export async function enqueueScanNotification(db: Db, visitId: string, partner: { name: string; slug: string }): Promise<string> {
  try {
    const payload: PartnerNotifyPayload = { partnerName: partner.name, slug: partner.slug, occurredAt: new Date().toISOString(), ref: `Aufruf ${visitId}` };
    const { data, error } = await db.rpc("enqueue_partner_scan_notification", { _visit_id: visitId, _payload: payload });
    return error ? "error" : String(data);
  } catch { return "error"; }
}

/**
 * Registrierung: nur für den angemeldeten Benutzer, nur wenn das Konto NACH dem
 * Scan angelegt und bestätigt wurde (Bestandskunden-Logins zählen nie).
 */
export async function claimPartnerSignup(db: Db & { auth: any }, userId: string, ref: unknown): Promise<"attached" | "skipped" | "exists"> {
  if (!isUuid(userId) || !isUuid(ref)) return "skipped";
  const { validatePartnerVisit } = await import("@/lib/partner-attribution.server");
  const v = await validatePartnerVisit(db, ref);
  if (!v) return "skipped";
  const { data: u } = await db.auth.admin.getUserById(userId);
  const user = u?.user;
  if (!user?.created_at || !(user.email_confirmed_at || user.confirmed_at)) return "skipped";
  if (new Date(user.created_at).getTime() < new Date(v.visitedAt).getTime() - 5 * 60_000) return "skipped";
  const { data, error } = await db.from("partner_signups")
    .upsert({ user_id: userId, partner_id: v.partnerId, visit_id: v.visitId, partner_slug: v.slug, visited_at: v.visitedAt, user_created_at: user.created_at }, { onConflict: "user_id", ignoreDuplicates: true })
    .select("user_id");
  if (error) return "skipped";
  if (!(data ?? []).length) return "exists";
  await safe("signup", async () => {
    const { data: p } = await db.from("partners").select("name").eq("id", v.partnerId).single();
    const id = await insertNotification(db, "signup", userId, v.partnerId, { partnerName: p?.name ?? v.slug, slug: v.slug, occurredAt: new Date().toISOString(), ref: `Benutzer ${userId} · Aufruf ${v.visitId}` });
    if (id) await runPartnerNotifications({ id, limit: 1 });
  });
  return "attached";
}

/** Bezahlte, zugeordnete Buchung melden (Webhook-Retries ⇒ gleicher event_key). */
export async function notifyPaidPartnerBooking(db: Db, bookingId: string) {
  await safe("booking", async () => {
    const { data: a } = await db.from("booking_partner_attributions").select("partner_id, partner_slug, commission_rate_bp, visit_id").eq("booking_id", bookingId).maybeSingle();
    if (!a) return;
    const { data: b } = await db.from("bookings").select("pickup_code, status, plan_price, addons_total_cents").eq("id", bookingId).single();
    if (!b || !(COMMISSIONABLE_STATUSES as readonly string[]).includes(b.status)) return;
    const { data: p } = await db.from("partners").select("name").eq("id", a.partner_id).single();
    const c = computePartnerCommission(b, [], a.commission_rate_bp);
    const id = await insertNotification(db, "booking_paid", bookingId, a.partner_id, {
      partnerName: p?.name ?? a.partner_slug, slug: a.partner_slug, occurredAt: new Date().toISOString(),
      ref: `Buchung ${bookingId} · Aufruf ${a.visit_id}`, bookingReference: b.pickup_code, status: b.status,
      rentCents: c.rentCents, commissionCents: c.commissionCents, ratePercent: a.commission_rate_bp / 100,
    });
    if (id) await runPartnerNotifications({ id, limit: 1 });
  });
}

/** Klar gekennzeichnete Testmail (Admin). */
export async function enqueueTestNotification(db: Db, partner: { id: string; name: string; slug: string }) {
  const testId = crypto.randomUUID();
  const id = await insertNotification(db, "test", testId, partner.id, {
    partnerName: partner.name, slug: partner.slug, occurredAt: new Date().toISOString(), ref: `TEST ${testId}`,
    bookingReference: "TEST", status: "paid", rentCents: 10000, commissionCents: 1000, ratePercent: 10,
  });
  return id ? runPartnerNotifications({ id, limit: 1 }) : { sent: 0, failed: 0, review: 0 };
}
