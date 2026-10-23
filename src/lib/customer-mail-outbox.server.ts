/**
 * Server-Anbindung der Kunden-Mail-Outbox (public.customer_mail_outbox).
 * Nur aus Server-Routen/Server-Funktionen verwenden.
 */
import {
  buildInvoiceMail,
  buildReviewMail,
  buildFeedbackMail,
  berlinDateTime,
  outboxIdempotencyKey,
  processOutboxRow,
  reviewDueAt,
  validateGoogleReviewUrl,
  effectiveReviewUrl,
  OUTBOX_LEASE_SECONDS,
  OUTBOX_SAFE_SECONDS,
  type FrozenOutboxMail,
  type OutboxDeps,
  type OutboxOutcome,
  type OutboxRow,
  type OutboxSource,
  type OutboxKind,
} from "@/lib/customer-mail-outbox";
import { APP_ORIGIN } from "@/lib/email-template";

const BOOKED = ["paid", "active", "in_progress", "picked_up", "returning", "completed"];
const ROW_COLS = "id, source_type, source_id, kind, status, idempotency_key, recipient_email, payload, mail_provider";

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

export type MailSettings = {
  google_review_url: string | null;
  review_requests_from: string | null;
  invoice_outbox_from: string;
};

export async function loadMailSettings(): Promise<MailSettings> {
  const db = await admin();
  const { data, error } = await db
    .from("customer_mail_settings")
    .select("google_review_url, review_requests_from, invoice_outbox_from")
    .eq("id", true)
    .maybeSingle();
  if (error || !data) throw new Error(`Mail-Einstellungen nicht lesbar: ${error?.message ?? "fehlt"}`);
  return data as MailSettings;
}

/** Serverseitige Kontoprüfung. is_account_active vergleicht mit auth.uid() und
 * ist im Dienstkontext immer false – daher hier direkt: Nutzer existiert,
 * nicht gelöscht, keine abgeschlossene Kontolöschung. Fehler ⇒ Fehler (nie „aktiv“). */
export async function isAccountActiveForMail(
  userId: string,
  deps?: { getUser: (id: string) => Promise<{ exists: boolean; deleted: boolean }>; hasCompletedDeletion: (id: string) => Promise<boolean> },
): Promise<boolean> {
  const d = deps ?? (await defaultActiveDeps());
  const u = await d.getUser(userId);
  if (!u.exists || u.deleted) return false;
  return !(await d.hasCompletedDeletion(userId));
}

async function defaultActiveDeps() {
  const db = await admin();
  return {
    getUser: async (id: string) => {
      const { data, error } = await db.auth.admin.getUserById(id);
      if (error && /not.?found/i.test(error.message)) return { exists: false, deleted: false };
      if (error) throw new Error(`Konto nicht prüfbar: ${error.message}`);
      const user = data.user as unknown as { deleted_at?: string | null } | null;
      return { exists: !!user, deleted: !!user?.deleted_at };
    },
    hasCompletedDeletion: async (id: string) => {
      const { data, error } = await db.from("account_deletions").select("id").eq("former_user_id", id).eq("status", "completed").limit(1);
      if (error) throw new Error(`Kontolöschung nicht prüfbar: ${error.message}`);
      return (data ?? []).length > 0;
    },
  };
}

const isActive = (userId: string) => isAccountActiveForMail(userId);

async function isOptedOut(email: string): Promise<boolean> {
  const db = await admin();
  const { data, error } = await db
    .from("email_opt_outs")
    .select("email_lower")
    .eq("email_lower", email.trim().toLowerCase())
    .eq("scope", "review_request")
    .maybeSingle();
  // Nicht prüfbar ⇒ Fehler (Aufrufer bricht ab, bleibt retrybar) – nie als „nicht abgemeldet“ werten.
  if (error) throw new Error(`Abmeldestatus nicht prüfbar: ${error.message}`);
  return !!data;
}

async function getRow(source: OutboxSource, id: string, kind: OutboxKind): Promise<OutboxRow | null> {
  const db = await admin();
  const { data, error } = await db
    .from("customer_mail_outbox")
    .select(ROW_COLS)
    .eq("source_type", source)
    .eq("source_id", id)
    .eq("kind", kind)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as unknown as OutboxRow) ?? null;
}

export async function insertRow(r: {
  source_type: OutboxSource;
  source_id: string;
  kind: OutboxKind;
  due_at: string;
  recipient_email: string | null;
  payload: FrozenOutboxMail | null;
  archive_id?: string | null;
  status?: string;
  blocked_reason?: string | null;
  opt_out_token?: string;
  expires_at?: string | null;
}): Promise<OutboxRow> {
  const db = await admin();
  const { error } = await db.from("customer_mail_outbox").upsert(
    { ...r, mail_provider: "gmail", idempotency_key: outboxIdempotencyKey(r.source_type, r.source_id, r.kind) } as never,
    { onConflict: "source_type,source_id,kind", ignoreDuplicates: true },
  );
  if (error) throw new Error(error.message);
  const row = await getRow(r.source_type, r.source_id, r.kind);
  if (!row) throw new Error("Outbox-Eintrag nicht gefunden");
  return row;
}

export type EnqueueResult =
  | { state: "queued"; rowId: string }
  | { state: "legacy_sent" | "before_activation" | "cancelled" | "blocked" | "disabled" | "not_found" | "no_consent" };

/** Aktuelle, dokumentierte Einwilligung für genau diese Buchung. DB-Fehler ⇒ Fehler (nie „ja“). */
export async function hasReviewConsent(source: OutboxSource, sourceId: string): Promise<boolean> {
  const db = await admin();
  const { data, error } = await db
    .from("review_mail_consents").select("granted").eq("source_type", source).eq("source_id", sourceId).maybeSingle();
  if (error) throw new Error(`Einwilligung nicht prüfbar: ${error.message}`);
  return data?.granted === true;
}

/** Einwilligung dokumentieren (idempotent, unveränderlich). Nur bei aktiver Zustimmung. */
export async function recordReviewConsent(r: {
  source: OutboxSource;
  sourceId: string;
  userId?: string | null;
  email?: string | null;
  origin: "online_checkout" | "admin_manual";
  version: string;
  recordedBy?: string | null;
  grantedAt: string;
}): Promise<void> {
  const { REVIEW_CONSENT_TEXT, REVIEW_CONSENT_VERSION } = await import("@/lib/customer-mail-outbox");
  if (r.version !== REVIEW_CONSENT_VERSION) throw new Error("Unbekannte Einwilligungsversion");
  const db = await admin();
  const { error } = await db.from("review_mail_consents").upsert(
    {
      source_type: r.source, source_id: r.sourceId, user_id: r.userId ?? null,
      email_lower: r.email ? r.email.trim().toLowerCase() : null, granted: true,
      consent_version: r.version, consent_text: REVIEW_CONSENT_TEXT, origin: r.origin,
      recorded_by: r.recordedBy ?? null, granted_at: r.grantedAt,
    } as never,
    { onConflict: "source_type,source_id", ignoreDuplicates: true },
  );
  if (error) throw new Error(error.message);
}

/** Rechnung zu einer bezahlten Onlinebuchung (PDF aus dem Belegarchiv). */
export async function enqueueBookingInvoice(bookingId: string): Promise<EnqueueResult> {
  const existing = await getRow("booking", bookingId, "invoice");
  if (existing) return { state: "queued", rowId: existing.id };
  const db = await admin();
  const { data: legacy, error: legacyError } = await db
    .from("admin_notifications")
    .select("id")
    .eq("booking_id", bookingId)
    .eq("title", "Rechnung versendet")
    .limit(1)
    .maybeSingle();
  if (legacyError) throw new Error("Bisheriger Rechnungsversand nicht prüfbar");
  if (legacy) return { state: "legacy_sent" };

  const { data: b, error } = await db
    .from("bookings")
    .select("id, user_id, created_at, status, vehicle_name, vehicle_plate, start_date, start_hour")
    .eq("id", bookingId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!b) return { state: "not_found" };
  const settings = await loadMailSettings();
  // Kein ungefragter Altbestands-Replay: nur Buchungen ab Aktivierung.
  if (new Date(b.created_at) < new Date(settings.invoice_outbox_from)) return { state: "before_activation" };
  if (!BOOKED.includes(b.status)) return { state: "cancelled" };

  const { data: p, error: pErr } = await db.from("profiles").select("email, first_name").eq("id", b.user_id).maybeSingle();
  if (pErr) throw new Error(`Profil nicht lesbar: ${pErr.message}`);
  const email = p?.email?.trim() ?? "";
  if (!email || !(await isActive(b.user_id))) {
    await insertRow({
      source_type: "booking", source_id: b.id, kind: "invoice", due_at: new Date().toISOString(),
      recipient_email: null, payload: null, status: "blocked",
      blocked_reason: email ? "Konto nicht aktiv" : "Keine E-Mail-Adresse",
    });
    return { state: "blocked" };
  }

  const { generateBookingInvoicePdf } = await import("@/lib/invoice-pdf.server");
  const inv = await generateBookingInvoicePdf(b.id);
  // Nie ohne archivierten Beleg einreihen – sonst später kein identischer Anhang.
  if (!inv.archiveId) throw new Error("Rechnung nicht archiviert – Versand wird später wiederholt");
  const startIso = berlinWallToIso(b.start_date, b.start_hour);
  const { data: doc } = await db.from("issued_documents").select("total_cents").eq("id", inv.archiveId).maybeSingle();
  const payload = buildInvoiceMail({
    firstName: p?.first_name ?? null,
    to: email,
    invoiceNo: inv.invoiceNo,
    vehicle: `${b.vehicle_name} · ${b.vehicle_plate}`,
    start: berlinDateTime(startIso),
    totalCents: (doc?.total_cents as number | undefined) ?? null,
    paid: true,
    bookingUrl: `${APP_ORIGIN}/trip/${b.id}`,
    archiveId: inv.archiveId,
    filename: inv.filename,
  });
  const row = await insertRow({
    source_type: "booking", source_id: b.id, kind: "invoice", due_at: new Date().toISOString(),
    recipient_email: email, payload, archive_id: inv.archiveId,
  });
  return { state: "queued", rowId: row.id };
}

/** Berlin-Wandzeit → UTC-ISO (DST-sicher). */
export function berlinWallToIso(date: string, hour: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, hour, 0, 0);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Berlin", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(guess));
  const g = (t: string) => Number(parts.find((x) => x.type === t)?.value);
  const asBerlin = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second"));
  return new Date(guess - (asBerlin - guess)).toISOString();
}

/** Rechnung zu einer bestätigten manuellen Kundenbuchung (Zahlungsstatus offen). */
export async function enqueueManualInvoice(reservationId: string): Promise<EnqueueResult> {
  const existing = await getRow("manual", reservationId, "invoice");
  if (existing) return { state: "queued", rowId: existing.id };
  const db = await admin();
  const { data: r, error } = await db
    .from("manual_reservations")
    .select("id, created_at, customer_name, customer_email, customer_street, customer_city, vehicle_name, vehicle_plate, start_at, end_at, total_price_cents, confirmation_requested")
    .eq("id", reservationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!r) return { state: "not_found" };
  const settings = await loadMailSettings();
  if (new Date(r.created_at) < new Date(settings.invoice_outbox_from)) return { state: "before_activation" };
  // Interne Sperrtermine (ohne Kunde/Bestätigung/Preis) werden nie zu Rechnungen.
  const email = (r.customer_email ?? "").trim();
  if (!r.confirmation_requested || !email.includes("@") || r.total_price_cents == null || r.total_price_cents <= 0) {
    return { state: "disabled" };
  }
  const created = new Date(r.created_at);
  const ym = `${created.getUTCFullYear()}${String(created.getUTCMonth() + 1).padStart(2, "0")}`;
  const number = `MT-M-${ym}-${r.id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
  const docDate = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
  const vehicle = [r.vehicle_name, r.vehicle_plate].filter(Boolean).join(" · ") || "Transporter";
  const doc = {
    kind: "invoice" as const,
    number,
    date: docDate,
    recipient: { attention: r.customer_name ?? undefined, street: r.customer_street ?? undefined, city: r.customer_city ?? undefined, email },
    service: { vehicle, pickup: berlinDateTime(r.start_at), ret: berlinDateTime(r.end_at) },
    items: [{ label: `Transportermiete · ${vehicle}`, amount: r.total_price_cents / 100, mode: "gross" as const, vat: true }],
    note: "Zahlung wie mit MyTransporter vereinbart.",
  };
  const { generateCustomDocumentPdf } = await import("@/lib/custom-document-pdf.server");
  const { computeDocTotals, VAT_RATE } = await import("@/lib/doc-totals");
  const { archiveIssuedDocument } = await import("@/lib/document-archive.server");
  const pdf = await generateCustomDocumentPdf(doc as never);
  const t = computeDocTotals(doc.items as never);
  const archive = await archiveIssuedDocument({
    kind: "invoice", source: "manual", documentNumber: number, documentDate: docDate,
    customerName: r.customer_name ?? null, customerEmail: email,
    billingAddress: { street: r.customer_street ?? null, city: r.customer_city ?? null },
    items: t.rows.map((x: { label: string; netC: number | null; vatC: number | null; grossC: number }) => ({
      label: x.label, net_cents: x.netC, vat_cents: x.vatC, gross_cents: x.grossC, vat_rate: x.netC == null ? null : VAT_RATE,
    })),
    netCents: t.vatNetC, vatRate: VAT_RATE, vatCents: t.vatVatC, grossCents: t.vatGrossC,
    nonTaxableCents: t.plainC, totalCents: t.totalC, paymentStatus: "open",
    snapshot: { input: doc, totals: t, manual_reservation_id: r.id },
    pdfBase64: pdf.pdfBase64, filename: pdf.filename,
  });
  const payload = buildInvoiceMail({
    firstName: r.customer_name, to: email, invoiceNo: number, vehicle, start: berlinDateTime(r.start_at),
    totalCents: r.total_price_cents, paid: false, bookingUrl: null, archiveId: archive.id, filename: pdf.filename,
  });
  const row = await insertRow({
    source_type: "manual", source_id: r.id, kind: "invoice", due_at: new Date().toISOString(),
    recipient_email: email, payload, archive_id: archive.id,
  });
  return { state: "queued", rowId: row.id };
}

/** Bewertungsanfrage, fällig 24 h nach Buchungsabschluss. Gesperrt ohne gültigen Link. */
export async function enqueueReviewRequest(source: OutboxSource, sourceId: string, settings?: MailSettings): Promise<EnqueueResult> {
  const existing = await getRow(source, sourceId, "review_request");
  if (existing) return { state: "queued", rowId: existing.id };
  const s = settings ?? (await loadMailSettings());
  const url = effectiveReviewUrl(s.google_review_url);
  // Start nur nach ausdrücklicher Aktivierung (review_requests_from) – nie rückwirkend.
  if (!s.review_requests_from) return { state: "disabled" };
  const db = await admin();
  let createdAt: string, email: string, firstName: string | null;
  if (source === "booking") {
    const { data: b, error: bErr } = await db.from("bookings").select("id, user_id, created_at, status").eq("id", sourceId).maybeSingle();
    if (bErr) throw new Error(bErr.message);
    if (!b) return { state: "not_found" };
    if (!BOOKED.includes(b.status)) return { state: "cancelled" };
    if (!(await isActive(b.user_id))) return { state: "cancelled" };
    const { data: p, error: pErr } = await db.from("profiles").select("email, first_name").eq("id", b.user_id).maybeSingle();
    if (pErr) throw new Error(pErr.message);
    createdAt = b.created_at; email = p?.email?.trim() ?? ""; firstName = p?.first_name ?? null;
  } else {
    const { data: r, error: rErr } = await db.from("manual_reservations").select("id, created_at, customer_email, customer_name, confirmation_requested").eq("id", sourceId).maybeSingle();
    if (rErr) throw new Error(rErr.message);
    if (!r || !r.confirmation_requested) return { state: "not_found" };
    createdAt = r.created_at; email = (r.customer_email ?? "").trim(); firstName = r.customer_name ?? null;
  }
  if (new Date(createdAt) < new Date(s.review_requests_from)) return { state: "before_activation" };
  if (!email.includes("@") || (await isOptedOut(email))) return { state: "cancelled" };
  if (!(await hasReviewConsent(source, sourceId))) return { state: "no_consent" };
  const token = crypto.randomUUID();
  const payload = buildReviewMail({ firstName, to: email, reviewUrl: url, optOutToken: token });
  const row = await insertRow({
    source_type: source, source_id: sourceId, kind: "review_request",
    due_at: reviewDueAt(createdAt).toISOString(), recipient_email: email, payload, opt_out_token: token,
  });
  return { state: "queued", rowId: row.id };
}

/** Feedback-Einwilligung: Buchungs-Einwilligung ODER dokumentierte Telefon-Einwilligung (Betreiber). */
export async function hasFeedbackConsent(source: OutboxSource, sourceId: string, email: string): Promise<boolean> {
  if (await hasReviewConsent(source, sourceId)) return true;
  const db = await admin();
  const { data, error } = await db.from("marketing_consent_attestations").select("id")
    .eq("email_lower", email.trim().toLowerCase()).eq("scope", "feedback").maybeSingle();
  if (error) throw new Error(`Einwilligung nicht prüfbar: ${error.message}`);
  return !!data;
}

/** Bereits angeschriebene Adressen (Bewertungs-/Feedbackmail versendet oder unterwegs). */
async function contactedEmails(): Promise<Set<string>> {
  const db = await admin();
  const { data, error } = await db.from("customer_mail_outbox").select("recipient_email, kind, status")
    .in("kind", ["review_request", "feedback_request"]).in("status", ["sent", "scheduled", "processing", "failed", "needs_review"]);
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((r) => (r.recipient_email ?? "").trim().toLowerCase()).filter(Boolean));
}

/** Persönlicher 10-%-Dankeschön-Gutschein, einmal pro Kunde (DB-Unique email+kind). */
async function ensureThanksCoupon(emailLower: string, userId: string | null, source: OutboxSource, sourceId: string) {
  const { generateThanksCode, thanksValidUntil, THANKS_DISCOUNT_PERCENT } = await import("@/lib/coupons");
  const { berlinDateParts } = await import("@/lib/birthday");
  const db = await admin();
  const { data: existing, error } = await db.from("customer_coupons").select("code, discount_percent, valid_until, redeemed_at, created_at")
    .eq("email_lower", emailLower).eq("kind", "thanks").maybeSingle();
  if (error) throw new Error(error.message);
  if (existing) return null; // nur einmal pro Kunde – keine zweite Ausgabe
  const today = berlinDateParts().iso;
  const row = { code: generateThanksCode(), kind: "thanks", email_lower: emailLower, user_id: userId, discount_percent: THANKS_DISCOUNT_PERCENT,
    valid_from: today, valid_until: thanksValidUntil(today), source_type: source, source_id: sourceId };
  const { error: insErr } = await db.from("customer_coupons").insert(row as never);
  if (insErr) {
    if (insErr.code === "23505") return null;
    throw new Error(insErr.message);
  }
  return { code: row.code, percent: row.discount_percent, validUntil: row.valid_until };
}

/**
 * Feedback-Mail 24 h nach tatsächlichem Mietende (Rückgabe, sonst geplantes Ende).
 * Nur nicht stornierte, beendete Mieten; nie für laufende/zukünftige Mieten.
 * Pro Buchung genau eine Zeile (Unique source+kind); pro Adresse höchstens eine offene/versendete
 * Bewertungs-/Feedbackmail im Nachholzeitraum.
 */
export async function enqueueFeedbackRequest(source: OutboxSource, sourceId: string, contacted?: Set<string>): Promise<EnqueueResult> {
  const existing = await getRow(source, sourceId, "feedback_request");
  if (existing) return { state: "queued", rowId: existing.id };
  const s = await loadMailSettings();
  const from = (s as unknown as { feedback_requests_from?: string | null }).feedback_requests_from;
  if (!from) return { state: "disabled" };
  const db = await admin();
  const { feedbackDueAt } = await import("@/lib/coupons");
  const { MARKETING_EXCLUDED_EMAILS } = await import("@/lib/birthday.server");
  let endDue: number, email: string, firstName: string | null, userId: string | null = null;
  if (source === "booking") {
    const { data: b, error } = await db.from("bookings").select("id, user_id, status, start_date, start_hour, plan_id, vehicle_name, return_reported_at").eq("id", sourceId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!b) return { state: "not_found" };
    if (!BOOKED.includes(b.status)) return { state: "cancelled" };
    if (!(await isActive(b.user_id))) return { state: "cancelled" };
    const { resolveTripWindow } = await import("@/lib/trip-time");
    const { endMs } = resolveTripWindow(b as never);
    if (!Number.isFinite(endMs)) return { state: "blocked" };
    endDue = feedbackDueAt(endMs, b.return_reported_at);
    const { data: p, error: pErr } = await db.from("profiles").select("email, first_name").eq("id", b.user_id).maybeSingle();
    if (pErr) throw new Error(pErr.message);
    email = p?.email?.trim() ?? ""; firstName = p?.first_name ?? null; userId = b.user_id;
  } else {
    const { data: r, error } = await db.from("manual_reservations").select("id, end_at, customer_email, customer_name").eq("id", sourceId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!r) return { state: "not_found" };
    endDue = new Date(r.end_at).getTime() + 24 * 3600_000;
    email = (r.customer_email ?? "").trim(); firstName = (r.customer_name ?? "").trim().split(/\s+/)[0] || null;
  }
  // Mietende muss im Aktivierungszeitraum liegen und 24 h vorbei sein – sonst nichts anlegen.
  if (endDue - 24 * 3600_000 < new Date(from).getTime()) return { state: "before_activation" };
  if (endDue > Date.now()) return { state: "blocked" };
  const lower = email.toLowerCase();
  if (!email.includes("@") || MARKETING_EXCLUDED_EMAILS.includes(lower) || (await isOptedOut(email))) return { state: "cancelled" };
  if ((contacted ?? (await contactedEmails())).has(lower)) return { state: "legacy_sent" };
  if (!(await hasFeedbackConsent(source, sourceId, email))) return { state: "no_consent" };
  const token = crypto.randomUUID();
  const coupon = await ensureThanksCoupon(lower, userId, source, sourceId);
  const payload = buildFeedbackMail({ firstName, to: email, reviewUrl: effectiveReviewUrl(s.google_review_url), optOutToken: token, coupon });
  const row = await insertRow({
    source_type: source, source_id: sourceId, kind: "feedback_request",
    due_at: new Date().toISOString(), recipient_email: email, payload, opt_out_token: token,
  });
  contacted?.add(lower);
  return { state: "queued", rowId: row.id };
}

/** Kandidaten: beendete Mieten ab Aktivierung, ohne Feedback-Zeile. */
export async function runFeedbackEnqueue(): Promise<number> {
  const s = await loadMailSettings();
  const from = (s as unknown as { feedback_requests_from?: string | null }).feedback_requests_from;
  if (!from) return 0;
  const db = await admin();
  const sinceDate = new Date(new Date(from).getTime() - 35 * 86400_000).toISOString().slice(0, 10);
  const { data: bs, error } = await db.from("bookings").select("id").gte("start_date", sinceDate)
    .lte("start_date", new Date().toISOString().slice(0, 10)).in("status", BOOKED).order("start_date");
  if (error) throw new Error(error.message);
  const { data: ms, error: mErr } = await db.from("manual_reservations").select("id").gte("end_at", from).lte("end_at", new Date().toISOString());
  if (mErr) throw new Error(mErr.message);
  const { data: done, error: dErr } = await db.from("customer_mail_outbox").select("source_type, source_id").eq("kind", "feedback_request");
  if (dErr) throw new Error(dErr.message);
  const have = new Set((done ?? []).map((d) => `${d.source_type}:${d.source_id}`));
  const contacted = await contactedEmails();
  let n = 0;
  const list: [OutboxSource, string][] = [
    ...(bs ?? []).map((b) => ["booking", b.id] as [OutboxSource, string]),
    ...(ms ?? []).map((m) => ["manual", m.id] as [OutboxSource, string]),
  ];
  for (const [src, id] of list) {
    if (have.has(`${src}:${id}`)) continue;
    try { if ((await enqueueFeedbackRequest(src, id, contacted)).state === "queued") n++; }
    catch (e) { console.warn("[outbox] Feedback", String((e as Error)?.message ?? e).slice(0, 200)); }
  }
  return n;
}

export async function createOutboxDeps(): Promise<OutboxDeps> {
  const db = await admin();
  const { sendEmailDetailed } = await import("@/lib/booking-emails.server");
  const { ISSUED_DOCUMENTS_BUCKET } = await import("@/lib/document-archive.server");
  return {
    precheck: async (row) => {
      if (row.kind === "invoice") return null;
      if (row.kind === "deposit_review_admin" || row.kind === "deposit_digest" || row.kind === "deposit_closing") {
        const { depositMailPrecheck } = await import("@/lib/deposit-review.server");
        return depositMailPrecheck(row);
      }
      if (row.source_type === "booking") {
        const { data: b, error } = await db.from("bookings").select("status, user_id, start_date, start_hour, plan_id, vehicle_name").eq("id", row.source_id).maybeSingle();
        if (error) throw new Error(error.message);
        if (!b) return "Buchung nicht gefunden";
        if (!BOOKED.includes(b.status)) return "Buchung storniert";
        if (row.kind !== "admin_booking" && !(await isActive(b.user_id))) return "Konto gelöscht/inaktiv";
        if (row.kind === "return_reminder") {
          const { resolveTripWindow } = await import("@/lib/trip-time");
          const { endMs } = resolveTripWindow(b);
          if (!Number.isFinite(endMs) || Date.now() >= endMs) return "Rückgabe-Erinnerung abgelaufen";
          if (["returning", "completed", "return_pending"].includes(b.status)) return "Rückgabe bereits gemeldet";
        }
        if (row.kind === "return_overdue_1" || row.kind === "return_overdue_2") {
          if (["returning", "completed", "return_pending", "returned"].includes(b.status)) return "Rückgabe bereits gemeldet";
          const { isLegacyOpenTrip } = await import("@/lib/active-trip");
          if (isLegacyOpenTrip(b)) return "Altbuchung";
        }
      } else {
        const { data: r, error } = await db.from("manual_reservations").select("id, confirmation_requested, end_at").eq("id", row.source_id).maybeSingle();
        if (error) throw new Error(error.message);
        if (!r) return "Termin gelöscht";
        if (row.kind === "return_reminder" && (!r.confirmation_requested || Date.now() >= new Date(r.end_at).getTime())) return "Rückgabe-Erinnerung abgelaufen/zurückgezogen";
      }
      if (row.kind === "feedback_request") {
        if (!row.recipient_email || !(await hasFeedbackConsent(row.source_type, row.source_id, row.recipient_email))) return "Keine Einwilligung für Feedbackmail";
        if (await isOptedOut(row.recipient_email)) return "Empfänger hat widersprochen";
        return null;
      }
      if (row.kind !== "review_request") return null;
      if (!(await hasReviewConsent(row.source_type, row.source_id))) return "Keine Einwilligung für Bewertungsmail";
      if (row.recipient_email && (await isOptedOut(row.recipient_email))) return "Empfänger hat widersprochen";
      return null;
    },
    cancel: async (id, reason) => {
      const { error } = await db.from("customer_mail_outbox").update({ status: "cancelled", blocked_reason: reason } as never)
        .eq("id", id).in("status", ["scheduled", "failed"]);
      if (error) throw new Error("Mailabbruch nicht gespeichert");
    },
    claim: async (id) => {
      const { data, error } = await db.rpc("claim_customer_mail", { _id: id, _lease_seconds: OUTBOX_LEASE_SECONDS, _safe_seconds: OUTBOX_SAFE_SECONDS });
      if (error) throw new Error(error.message);
      return data as never;
    },
    loadAttachment: async (archiveId) => {
      const { data: doc, error } = await db.from("issued_documents").select("pdf_path").eq("id", archiveId).maybeSingle();
      if (error || !doc?.pdf_path) throw new Error("Archivbeleg fehlt");
      const { data: file, error: dErr } = await db.storage.from(ISSUED_DOCUMENTS_BUCKET).download(doc.pdf_path);
      if (dErr || !file) throw new Error(dErr?.message ?? "Download fehlgeschlagen");
      const bytes = new Uint8Array(await file.arrayBuffer());
      let bin = "";
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(bin);
    },
    send: (mail, att, key, provider) =>
      sendEmailDetailed({
        from: mail.from, to: mail.to, replyTo: mail.reply_to, subject: mail.subject, html: mail.html, text: mail.text,
        attachments: att && mail.attachment ? [{ filename: mail.attachment.filename, content: att }] : undefined,
        provider, headers: mail.headers, idempotencyKey: key, timeoutMs: 20_000,
      }),
    complete: async (id, tok, pid) => {
      const { data, error } = await db.rpc("complete_customer_mail", { _id: id, _lease_token: tok, _provider_id: pid });
      if (error) throw new Error(error.message);
      return data === true;
    },
    fail: async (id, tok, kind, err, amb, retry) => {
      const { data, error } = await db.rpc("fail_customer_mail", { _id: id, _lease_token: tok, _kind: kind, _error: err, _ambiguous: amb, _retry_seconds: retry });
      if (error) throw new Error(error.message);
      return data === true;
    },
  };
}

export async function processOutboxRowById(rowId: string): Promise<OutboxOutcome> {
  const db = await admin();
  const { data, error } = await db.from("customer_mail_outbox").select(ROW_COLS).eq("id", rowId).maybeSingle();
  if (error || !data) throw new Error("Outbox-Eintrag nicht gefunden");
  return processOutboxRow(await createOutboxDeps(), data as unknown as OutboxRow);
}

/** Stündlicher Nachholer: fehlende Einträge per Anti-Join anlegen, bearbeitbare fällige Zeilen verarbeiten. */
export async function runCustomerMailSweep(): Promise<Record<string, number>> {
  const db = await admin();
  const settings = await loadMailSettings();
  const stats: Record<string, number> = { invoices_enqueued: 0, reviews_enqueued: 0, manual_enqueued: 0, processed: 0, sent: 0, failed: 0 };
  const note = (what: string, e: unknown) => console.warn(`[outbox] ${what}`, String((e as Error)?.message ?? e).slice(0, 200));

  const missing = async (kind: OutboxKind, from: string) => {
    const { data, error } = await db.rpc("customer_mail_missing_bookings", { _kind: kind, _from: from, _limit: 50 });
    if (error) throw new Error(error.message);
    return (data ?? []) as { id: string }[];
  };
  for (const b of await missing("invoice", settings.invoice_outbox_from)) {
    try { if ((await enqueueBookingInvoice(b.id)).state === "queued") stats.invoices_enqueued++; } catch (e) { note("Rechnung", e); }
  }
  if (settings.review_requests_from) {
    for (const b of await missing("review_request", settings.review_requests_from)) {
      try { if ((await enqueueReviewRequest("booking", b.id, settings)).state === "queued") stats.reviews_enqueued++; } catch (e) { note("Bewertung", e); }
    }
  }
  const { data: mi, error: miErr } = await db.rpc("customer_mail_missing_manual", { _kind: "invoice", _from: settings.invoice_outbox_from, _limit: 50 });
  if (miErr) throw new Error(miErr.message);
  for (const m of (mi ?? []) as { id: string }[]) {
    try { if ((await enqueueManualInvoice(m.id)).state === "queued") stats.manual_enqueued++; } catch (e) { note("manuelle Rechnung", e); }
  }
  if (settings.review_requests_from) {
    const { data: mr, error: mrErr } = await db.rpc("customer_mail_missing_manual", { _kind: "review_request", _from: settings.review_requests_from, _limit: 50 });
    if (mrErr) throw new Error(mrErr.message);
    for (const m of (mr ?? []) as { id: string }[]) {
      try { if ((await enqueueReviewRequest("manual", m.id, settings)).state === "queued") stats.manual_enqueued++; } catch (e) { note("manuelle Bewertung", e); }
    }
  }

  try { stats.feedback_enqueued = await runFeedbackEnqueue(); } catch (e) { note("Feedback", e); }

  try {
    const { runDepositSweep } = await import("@/lib/deposit-review.server");
    Object.assign(stats, await runDepositSweep());
  } catch (e) { note("Kaution", e); }

  const { data: ids, error: dErr } = await db.rpc("customer_mail_due_ids", { _limit: 25 });
  if (dErr) throw new Error(dErr.message);
  const list = ((ids ?? []) as unknown as string[]).map((x) => (typeof x === "string" ? x : (x as { id: string }).id));
  if (list.length) {
    const { data: rows, error } = await db.from("customer_mail_outbox").select(ROW_COLS).in("id", list);
    if (error) throw new Error(error.message);
    const deps = await createOutboxDeps();
    for (const row of (rows ?? []) as unknown as OutboxRow[]) {
      const out = await processOutboxRow(deps, row);
      stats.processed++;
      if (out.status === "sent" || out.status === "accepted_unrecorded") stats.sent++;
      if (out.status === "failed") stats.failed++;
    }
  }
  return stats;
}

/**
 * Erinnerung über die Outbox: eingefrorener Inhalt, Lease + Token, 23-h-Grenze,
 * Ablauf zum Abholbeginn. true = abgeschlossen (angenommen oder endgültig beendet).
 */
export async function sendReminderViaOutbox(args: {
  source: OutboxSource;
  sourceId: string;
  kind: "reminder_24h" | "reminder_30min" | "return_reminder" | "return_overdue_1" | "return_overdue_2";
  to: string;
  subject: string;
  html: string;
  text?: string;
  dueAt?: string;
  expiresAt: string;
}): Promise<{ done: boolean; sent: boolean }> {
  const row = await insertRow({
    source_type: args.source, source_id: args.sourceId, kind: args.kind, due_at: args.dueAt ?? new Date().toISOString(),
    recipient_email: args.to,
    payload: { from: "Christian Krüger – MyTransporter <info@mytransporter.org>", to: args.to, reply_to: "info@mytransporter.org", subject: args.subject, html: args.html, text: args.text ?? "", attachment: null },
    expires_at: args.expiresAt,
  });
  const out = await processOutboxRow(await createOutboxDeps(), row);
  const sent = out.status === "sent" || out.status === "accepted_unrecorded" || (out.status === "skipped" && out.reason === "sent");
  const final = sent || out.status === "cancelled" || (out.status === "skipped" && ["needs_review", "expired", "cancelled", "blocked"].includes(out.reason));
  return { done: final, sent };
}
