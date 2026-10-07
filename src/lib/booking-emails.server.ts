import { isPhysicalAddon } from "@/lib/custom-km";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { computePlanReturn } from "@/lib/booking-rules";
import { pushToAdmins } from "@/lib/push.functions";
import { renderEmail, noteBlock, listBlock, rawListBlock, esc } from "@/lib/email-template";
import { bookingWindowMs } from "@/lib/booking-window";
import {
  formatBerlin,
  LABEL_BOOKING_ID,
  LABEL_EVENT,
  LABEL_SOURCE_TYPE,
  ONLINE_SOURCE_TYPE,
} from "@/lib/manual-notifications";

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

export type ResendErrorKind =
  | "invalid_key"
  | "restricted_key"
  | "sender_domain"
  | "transient"
  | "other";

/** Ordnet einen Resend-Fehler anhand von name/message ein – nicht pauschal nach Status. */
export function classifyResendError(
  status: number,
  bodyText: string,
): { kind: ResendErrorKind; hint: string | null } {
  let name = "";
  let message = "";
  try {
    const j = JSON.parse(bodyText) as { name?: unknown; message?: unknown };
    name = typeof j.name === "string" ? j.name.toLowerCase() : "";
    message = typeof j.message === "string" ? j.message.toLowerCase() : "";
  } catch {
    message = bodyText.toLowerCase();
  }
  if (name === "invalid_api_key" || /api key is invalid/.test(message)) {
    return { kind: "invalid_key", hint: "Mail-Zugang abgelehnt (Schlüssel ungültig) – RESEND_API_KEY prüfen/ersetzen" };
  }
  if (name === "restricted_api_key" || /restricted to only send|restricted api key/.test(message)) {
    return { kind: "restricted_key", hint: "Mail-Schlüssel ohne nötige Berechtigung – Schlüsselrechte in Resend prüfen" };
  }
  if (
    /domain is not verified|not verified|verify a domain|testing emails|own email address|invalid_from_address/.test(
      `${name} ${message}`,
    )
  ) {
    return { kind: "sender_domain", hint: "Absender/Domain in Resend nicht freigegeben – Domain-Verifizierung prüfen (kein Schlüsselproblem)" };
  }
  if (status === 429 || status >= 500) {
    return { kind: "transient", hint: "Vorübergehende Störung beim Mailanbieter; Versand nicht erfolgt." };
  }
  return { kind: "other", hint: null };
}

/** Entfernt mögliche Schlüssel (re_…/Bearer …) aus Fehlertexten. */
export function redactSecrets(s: string): string {
  return s.replace(/re_[A-Za-z0-9_]{8,}/g, "re_***").replace(/Bearer\s+\S+/gi, "Bearer ***");
}

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  attachments?: Attachment[],
  /** Stabiler Schlüssel pro Buchung/Aktion – verhindert Doppelversand bei Netzwerk-Ambiguität. */
  idempotencyKey?: string,
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("RESEND_API_KEY missing, Buchungsbestätigung wird nicht versendet");
    return false;
  }
  const from = getFrom();
  const safeTo = isValidEmailish(to, 320) ? to : DEFAULT_ADMIN_EMAIL;
  const body: Record<string, unknown> = { from, to: safeTo, subject, html };
  if (attachments && attachments.length > 0) body.attachments = attachments;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey.slice(0, 256);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers,

    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    console.error("Resend send failed", res.status, redactSecrets(errText).slice(0, 400));
    const cls = classifyResendError(res.status, errText);
    try {
      await supabaseAdmin.from("admin_notifications").insert({
        type: "email_failed",
        title: "E-Mail-Versand fehlgeschlagen",
        body: `${cls.hint ? `${cls.hint} · ` : ""}${subject} → ${safeTo} · ${res.status} · ${redactSecrets(errText).slice(0, 400)}`,
      });
    } catch {
      /* Protokollierung ist optional */
    }
    return false;
  }
  return true;
}

export type DetailedSendResult =
  | { ok: true; providerId: string }
  | {
      ok: false;
      kind: ResendErrorKind | "missing_key" | "timeout" | "network" | "no_provider_id";
      /** true = unklar, ob der Anbieter die Mail angenommen hat. */
      ambiguous: boolean;
      status: number | null;
      error: string;
    };

/**
 * Versand mit belastbarer Rückmeldung: Erfolg NUR bei 2xx UND Provider-ID.
 * Keine Admin-Protokollierung hier – der Aufrufer verfolgt den Status selbst.
 */
export async function sendEmailDetailed(args: {
  from: string;
  to: string;
  replyTo?: string;
  subject: string;
  html: string;
  text?: string;
  idempotencyKey: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}): Promise<DetailedSendResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, kind: "missing_key", ambiguous: false, status: null, error: "RESEND_API_KEY fehlt" };
  }
  const f = args.fetchImpl ?? fetch;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), args.timeoutMs ?? 15_000);
  try {
    const body: Record<string, unknown> = {
      from: args.from,
      to: args.to,
      subject: args.subject,
      html: args.html,
    };
    if (args.text) body.text = args.text;
    if (args.replyTo) body.reply_to = args.replyTo;
    const res = await f("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": args.idempotencyKey.slice(0, 256),
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const raw = await res.text();
    if (!res.ok) {
      const cls = classifyResendError(res.status, raw);
      return {
        ok: false,
        kind: cls.kind,
        ambiguous: false,
        status: res.status,
        error: `${cls.hint ?? "Versand abgelehnt"} · ${res.status} · ${redactSecrets(raw).slice(0, 300)}`,
      };
    }
    let id = "";
    try {
      id = String((JSON.parse(raw) as { id?: unknown }).id ?? "");
    } catch {
      /* leer */
    }
    if (!id) {
      return { ok: false, kind: "no_provider_id", ambiguous: true, status: res.status, error: "Antwort ohne Versand-ID" };
    }
    return { ok: true, providerId: id };
  } catch (e) {
    const aborted = (e as Error)?.name === "AbortError";
    return {
      ok: false,
      kind: aborted ? "timeout" : "network",
      ambiguous: true,
      status: null,
      error: aborted ? "Zeitüberschreitung beim Mailanbieter" : redactSecrets(String((e as Error)?.message ?? e)).slice(0, 300),
    };
  } finally {
    clearTimeout(timer);
  }
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isDuplicateLog(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === "23505" || (err.message ?? "").includes("duplicate key");
}

/**
 * Protokolliert eine ERFOLGREICH abgeschlossene Aktion. Bewusst NACH dem
 * Versand: ein Eintrag bedeutet immer „wirklich erledigt“. Die Exactly-once-
 * Garantie liefert die Action-State-Machine (public.booking_actions).
 */
async function logActionSuccess(params: {
  bookingId: string;
  userId: string | null;
  title: string;
  type: string;
  body: string;
}): Promise<void> {
  const { error } = await supabaseAdmin.from("admin_notifications").insert({
    type: params.type,
    title: params.title,
    body: params.body,
    booking_id: params.bookingId,
    user_id: params.userId,
  });
  if (error && !isDuplicateLog(error)) {
    console.warn("[emails] Protokolleintrag fehlgeschlagen:", error.message);
  }
}

export const CONFIRM_LOG_TITLE = "Buchungsbestätigung versendet";
export const ADMIN_LOG_TITLE = "Admin-Buchungsmail versendet";
export const INVOICE_LOG_TITLE = "Rechnung versendet";

/**
 * Server-only Implementierung. MUSS aus Server-Routen (Webhook) direkt
 * aufgerufen werden – nie über den createServerFn-Wrapper, da dessen
 * Aufruf auf dem Server ein RPC-Stub ist und fehlschlägt.
 *
 * Exactly-once wird NICHT hier entschieden, sondern von der Action-State-
 * Machine (public.booking_actions). Diese Funktion meldet ehrlich zurück,
 * ob wirklich versendet wurde, und wirft bei harten Fehlern.
 */
export async function sendBookingConfirmationImpl(data: {
  bookingId: string;
  force?: boolean;
}): Promise<{ sent: boolean; invoiceAttached?: boolean; reason?: string }> {
  const { data: booking, error } = await supabaseAdmin
    .from("bookings")
    .select(
      "id, user_id, vehicle_name, vehicle_plate, plan_id, plan_label, start_date, start_hour, pickup_code, addons, addons_total_cents",
    )
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
  const kmPackages = addons.filter((a) => !isPhysicalAddon(a));
  const physical = addons.filter(isPhysicalAddon);
  const kmPackageHtmlBlock =
    kmPackages.length === 0
      ? ""
      : rawListBlock(
          "Vorab gebuchtes Kilometerpaket",
          kmPackages.map((a) => `${esc(a.label)} · <strong>${(a.price_cents / 100).toFixed(2)} €</strong>`),
        );
  const addonsHtmlBlock =
    kmPackageHtmlBlock +
    (physical.length === 0
      ? ""
      : rawListBlock(
          "Gebuchtes Zubehör",
          physical.map(
            (a) => `${esc(a.label)} · <strong>${(a.price_cents / 100).toFixed(2)} €</strong>`,
          ),
        ) +
        noteBlock(
          `Summe Zubehör: <strong>${(physical.reduce((s, a) => s + a.price_cents, 0) / 100).toFixed(2)} €</strong>. Bitte vollständig &amp; unbeschädigt zurückgeben.`,
        ));

  const html = renderEmail({
    firstName: profile?.first_name,
    heading: "Deine Buchung ist bestätigt",
    intro: [
      "vielen Dank für deine Buchung bei MyTransporter. Hier findest du alle Mietdaten auf einen Blick.",
    ],
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

  // Die Rechnung liegt der Bestätigung bei. Scheitert das PDF, geht die
  // Bestätigung trotzdem raus (der Kunde braucht Code + Abholdetails) und der
  // Rechnungsfehler wird für den Admin protokolliert.
  let invoiceAttachment: Attachment | null = null;
  try {
    const { generateBookingInvoicePdf } = await import("@/lib/invoice-pdf.server");
    const inv = await generateBookingInvoicePdf(booking.id);
    invoiceAttachment = { filename: inv.filename, content: inv.pdfBase64 };
  } catch (e) {
    const msg = String((e as Error)?.message ?? e).slice(0, 300);
    console.warn("Rechnungs-PDF konnte nicht erzeugt werden:", msg);
    try {
      await supabaseAdmin.from("admin_notifications").insert({
        type: "invoice_failed",
        title: "Rechnungs-PDF fehlgeschlagen",
        body: `Buchung ${booking.id}: ${msg}`,
        booking_id: booking.id,
      });
    } catch {
      /* Protokollierung ist optional */
    }
  }

  const sent = await sendEmail(
    email,
    `MyTransporter · Buchungsbestätigung für ${startStr} Uhr`,
    html,
    invoiceAttachment ? [invoiceAttachment] : undefined,
    `booking-confirmation-${booking.id}`,
  );

  if (sent) {
    await logActionSuccess({
      bookingId: booking.id,
      userId: booking.user_id,
      title: CONFIRM_LOG_TITLE,
      type: "booking_created",
      body: `${booking.vehicle_name} · Start ${booking.start_date} ${booking.start_hour}:00 (E-Mail ${invoiceAttachment ? "inkl. Rechnung" : "ohne Rechnungs-PDF"} gesendet)`,
    });
    if (invoiceAttachment) {
      // Rechnung lag der Bestätigung bei ⇒ der separate Rechnungs-Schritt
      // ist damit erledigt und darf nichts mehr nachsenden.
      await logActionSuccess({
        bookingId: booking.id,
        userId: booking.user_id,
        title: INVOICE_LOG_TITLE,
        type: "booking_created",
        body: `${invoiceAttachment.filename} (mit Buchungsbestätigung gesendet)`,
      });
    }
  }

  return {
    sent,
    invoiceAttached: invoiceAttachment != null,
    ...(sent ? {} : { reason: "send_failed" }),
  };
}

/**
 * Stellt sicher, dass der Kunde die Rechnung erhält – auch wenn sie der
 * Buchungsbestätigung wegen eines temporären PDF-Fehlers nicht beilag.
 * Wirft bei Fehlern, damit die Aktion retrybar bleibt.
 */
export async function ensureInvoiceDeliveredImpl(data: {
  bookingId: string;
}): Promise<{ sent: boolean; reason?: string }> {
  const { data: booking, error } = await supabaseAdmin
    .from("bookings")
    .select("id, user_id, vehicle_name, vehicle_plate, plan_label, start_date, start_hour")
    .eq("id", data.bookingId)
    .maybeSingle();
  if (error || !booking) throw new Error("Buchung nicht gefunden");

  // Bereits zugestellt (z. B. als Anhang der Bestätigung)? Dann nichts tun.
  const { data: existing } = await supabaseAdmin
    .from("admin_notifications")
    .select("id")
    .eq("booking_id", booking.id)
    .eq("title", INVOICE_LOG_TITLE)
    .limit(1)
    .maybeSingle();
  if (existing) return { sent: true, reason: "already_delivered" };

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("email, first_name")
    .eq("id", booking.user_id)
    .maybeSingle();
  const email = profile?.email;
  if (!email) return { sent: false, reason: "no_email" };

  const { generateBookingInvoicePdf } = await import("@/lib/invoice-pdf.server");
  const inv = await generateBookingInvoicePdf(booking.id);

  const startStr = fmtDate(booking.start_date, booking.start_hour);
  const html = renderEmail({
    firstName: profile?.first_name,
    heading: "Deine Rechnung",
    intro: ["im Anhang findest du die Rechnung zu deiner Buchung bei MyTransporter."],
    rowsTitle: "Deine Buchung",
    rows: [
      { label: "Fahrzeug", value: `${booking.vehicle_name} · ${booking.vehicle_plate}` },
      { label: "Tarif", value: booking.plan_label },
      { label: "Abholung", value: `${startStr} Uhr` },
      { label: "Rechnungsnummer", value: inv.invoiceNo },
    ],
    button: { label: "Zur Buchung", url: `https://www.mytransporter.org/trip/${booking.id}` },
    extraHtml: noteBlock(
      "Die Buchungsbestätigung hast du bereits erhalten. Diese E-Mail enthält ausschließlich die Rechnung.",
    ),
  });

  const sent = await sendEmail(
    email,
    `MyTransporter · Rechnung ${inv.invoiceNo}`,
    html,
    [{ filename: inv.filename, content: inv.pdfBase64 }],
    `booking-invoice-${booking.id}`,
  );

  if (sent) {
    await logActionSuccess({
      bookingId: booking.id,
      userId: booking.user_id,
      title: INVOICE_LOG_TITLE,
      type: "booking_created",
      body: `${inv.filename} (separat nachgesendet)`,
    });
  }

  return { sent, ...(sent ? {} : { reason: "send_failed" }) };
}

export async function sendAdminBookingNotificationImpl(data: {
  bookingId: string;
  force?: boolean;
}): Promise<{ sent: boolean; reason?: string }> {
  const { data: booking } = await supabaseAdmin
    .from("bookings")
    .select(
      "id, user_id, vehicle_name, vehicle_plate, plan_id, plan_label, plan_price, start_date, start_hour, pickup_code, addons, addons_total_cents",
    )
    .eq("id", data.bookingId)
    .maybeSingle();
  if (!booking) return { sent: false, reason: "booking_not_found" };

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("email, first_name, last_name, phone")
    .eq("id", booking.user_id)
    .maybeSingle();

  const startStr = fmtDate(booking.start_date, booking.start_hour);
  // Explizite Start-/Endzeit aus der gemeinsamen Buchungsfenster-Logik (DST-sicher)
  const windowMs = bookingWindowMs(booking.plan_id, booking.start_date, booking.start_hour);
  const startIso = new Date(windowMs.start).toISOString();
  const endIso = new Date(windowMs.end).toISOString();
  const customerName =
    [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "Unbekannt";
  const addons = Array.isArray(booking.addons)
    ? (booking.addons as Array<{ id: string; label: string; price_cents: number }>)
    : [];
  const addonsHtml =
    addons.length === 0
      ? "<em>keins</em>"
      : addons
          .map((a) => `${escapeHtml(a.label)} (${(a.price_cents / 100).toFixed(2)} €)`)
          .join(", ");

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
          <tr><td style="padding:6px 0;color:#666;">Beginn (Europe/Berlin)</td><td><strong>${escapeHtml(formatBerlin(startIso))} Uhr</strong></td></tr>
          <tr><td style="padding:6px 0;color:#666;">Ende (Europe/Berlin)</td><td><strong>${escapeHtml(formatBerlin(endIso))} Uhr</strong></td></tr>
          <tr><td style="padding:6px 0;color:#666;">Beginn (ISO)</td><td><code>${escapeHtml(startIso)}</code></td></tr>
          <tr><td style="padding:6px 0;color:#666;">Ende (ISO)</td><td><code>${escapeHtml(endIso)}</code></td></tr>
        </table>
        <table style="width:100%;border-collapse:collapse;font-size:12px;color:#666;margin-top:16px;">
          <tr><td style="padding:4px 0;width:210px;">${escapeHtml(LABEL_SOURCE_TYPE)}</td><td>${escapeHtml(ONLINE_SOURCE_TYPE)}</td></tr>
          <tr><td style="padding:4px 0;">${escapeHtml(LABEL_BOOKING_ID)}</td><td><code>${escapeHtml(booking.id)}</code></td></tr>
          <tr><td style="padding:4px 0;">${escapeHtml(LABEL_EVENT)}</td><td>created</td></tr>
        </table>
        <p style="margin:24px 0;">
          <a href="https://www.mytransporter.org/admin" style="background:#000;color:#fff;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:600;display:inline-block;">Im Admin öffnen</a>
        </p>
      </div>`;

  const sent = await sendEmail(
    getAdminEmail(),
    `🚐 Neue Buchung · ${customerName} · ${startStr}`,
    html,
    undefined,
    `admin-booking-${booking.id}`,
  );

  // Push an alle Admin-Geräte. Ein Push-Fehler darf die erfolgreich
  // versendete Admin-E-Mail NICHT in einen Fehlzustand versetzen.
  await pushToAdmins({
    title: "Neue Buchung",
    body: `${customerName} · ${booking.plan_label} · ${startStr}`,
    url: "/admin",
    tag: `booking-${booking.id}`,
  }).catch((e) => console.warn("Admin-Push (Buchung) fehlgeschlagen:", e));

  if (sent) {
    await logActionSuccess({
      bookingId: booking.id,
      userId: booking.user_id,
      title: ADMIN_LOG_TITLE,
      type: "booking_created",
      body: `${customerName} · ${booking.plan_label} · ${startStr} (E-Mail gesendet)`,
    });
  }

  return { sent, ...(sent ? {} : { reason: "send_failed" }) };
}
