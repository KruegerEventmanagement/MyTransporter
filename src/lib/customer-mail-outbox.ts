/**
 * Kunden-Mail-Outbox (Rechnung als PDF, Bewertungsanfrage 24 h nach Buchung).
 *
 * Reine, testbare Kernlogik ohne DB-/Netz-Zugriff:
 * - Vorlagen (HTML + Plaintext) mit offiziellem Logo über renderEmail
 * - stabile Idempotenz-Schlüssel und Fälligkeit
 * - Versandablauf je Zeile mit Fencing: Erfolg NUR mit Provider-ID,
 *   unklare Versuche nach dem sicheren Fenster ⇒ needs_review (kein Blindversand)
 */
import { renderEmail, noteBlock, esc, APP_ORIGIN } from "@/lib/email-template";
import type { DetailedSendResult } from "@/lib/booking-emails.server";

export const OUTBOX_FROM = "Christian Krüger – MyTransporter <info@mytransporter.org>";
export const OUTBOX_REPLY_TO = "info@mytransporter.org";
export const OUTBOX_SIGNATURE = "Christian Krüger\nMyTransporter";
export const OUTBOX_LEASE_SECONDS = 90;
/** Resend hält Idempotenz-Schlüssel 24 h – wir bleiben sicher darunter. */
export const OUTBOX_SAFE_SECONDS = 23 * 3600;
/** Vom Inhaber verifiziertes öffentliches Google-Profil (CID aus Google-Business-Profile-Mails, 09.10.2026). */
export const GOOGLE_REVIEW_URL = "https://www.google.com/maps?cid=9407266905378611223";
export const REVIEW_BUTTON_LABEL = "Bei Google bewerten";
export const REVIEW_LINK_TEXT = "Google-Profil öffnen";

/** Hinterlegter Link aus den Einstellungen, sonst der zentrale verifizierte Profil-Link. */
export function effectiveReviewUrl(stored: string | null | undefined): string {
  return validateGoogleReviewUrl(stored) ?? GOOGLE_REVIEW_URL;
}
export const REVIEW_CONSENT_VERSION = "review-mail-v1-2026-10-15";
export const REVIEW_CONSENT_TEXT =
  "Ja, MyTransporter darf mir 24 Stunden nach dieser Buchung einmalig eine E-Mail mit der Bitte um eine freiwillige Google-Bewertung senden. Ich kann jederzeit widersprechen (Abmeldelink in der E-Mail oder an info@mytransporter.org).";
export const REVIEW_DELAY_MS = 24 * 3600_000;

export type OutboxKind = "invoice" | "review_request" | "reminder_24h" | "reminder_30min" | "return_reminder" | "booking_confirmation" | "admin_booking" | "deposit_review_admin" | "deposit_digest" | "deposit_closing";
export type OutboxSource = "booking" | "manual" | "digest";

export type FrozenOutboxMail = {
  from: string;
  to: string;
  reply_to: string;
  subject: string;
  html: string;
  text: string;
  attachment?: { archive_id: string; filename: string } | null;
  /** Zusätzliche Kopfzeilen, z. B. List-Unsubscribe (One-Click). */
  headers?: Record<string, string>;
};

export function outboxIdempotencyKey(source: OutboxSource, sourceId: string, kind: OutboxKind): string {
  return `mt-${kind}-${source}-${sourceId}`;
}

/** Bewertungsanfrage frühestens 24 h nach Buchungsabschluss – nie davor. */
export function reviewDueAt(bookingCreatedAt: string | Date): Date {
  const t = new Date(bookingCreatedAt).getTime();
  if (!Number.isFinite(t)) throw new Error("Ungültiger Buchungszeitpunkt");
  return new Date(t + REVIEW_DELAY_MS);
}

/**
 * Nur echte, direkte Google-Bewertungs-/Profil-Links. Keine generische Suche,
 * keine erfundene Place-ID – der Link muss vom Inhaber hinterlegt werden.
 */
export function validateGoogleReviewUrl(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim();
  if (!v || v.length > 500) return null;
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  const host = u.hostname.toLowerCase();
  if (host === "g.page" && /^\/r\/[A-Za-z0-9_-]{6,}/.test(u.pathname)) return u.toString();
  if (host === "search.google.com" && u.pathname === "/local/writereview" && /^[A-Za-z0-9_-]{10,}$/.test(u.searchParams.get("placeid") ?? ""))
    return u.toString();
  if (host === "maps.app.goo.gl" && /^\/[A-Za-z0-9]{6,}$/.test(u.pathname)) return u.toString();
  // Maps-Unternehmensprofil per numerischer CID – ausschließlich ?cid=…, keine Query/Redirect-Parameter.
  if ((host === "www.google.com" || host === "google.com") && (u.pathname === "/maps" || u.pathname === "/maps/")) {
    const keys = [...u.searchParams.keys()];
    const cid = u.searchParams.get("cid") ?? "";
    if (keys.length === 1 && keys[0] === "cid" && /^[0-9]{5,20}$/.test(cid) && !u.username && !u.password && !u.hash) {
      return `https://www.google.com/maps?cid=${cid}`;
    }
  }
  return null;
}

export function berlinDateTime(iso: string | Date): string {
  return new Date(iso).toLocaleString("de-DE", {
    timeZone: "Europe/Berlin",
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function eur(cents: number): string {
  return `${(cents / 100).toFixed(2).replace(".", ",")} €`;
}

export type InvoiceMailInput = {
  firstName: string | null;
  to: string;
  invoiceNo: string;
  vehicle: string;
  start: string; // bereits Berlin-formatiert
  totalCents: number | null;
  paid: boolean;
  bookingUrl: string | null;
  archiveId: string;
  filename: string;
  preview?: boolean;
};

export function buildInvoiceMail(i: InvoiceMailInput): FrozenOutboxMail {
  const prefix = i.preview ? "[TEST – Vorschau] " : "";
  const subject = `${prefix}Deine Rechnung ${i.invoiceNo} – MyTransporter`;
  const payNote = i.paid
    ? "Der Betrag wurde bereits bei der Buchung bezahlt."
    : "Die Zahlung erfolgt wie mit uns vereinbart.";
  const rows = [
    { label: "Rechnungsnummer", value: i.invoiceNo },
    { label: "Fahrzeug", value: i.vehicle },
    { label: "Abholung", value: `${i.start} Uhr` },
    ...(i.totalCents != null ? [{ label: "Rechnungsbetrag", value: eur(i.totalCents) }] : []),
  ];
  const html = renderEmail({
    firstName: i.firstName,
    heading: i.preview ? "TEST – Vorschau deiner Rechnung" : "Deine Rechnung",
    intro: [
      ...(i.preview ? ["Dies ist eine Test-Vorschau mit fiktiven Daten. Keine echte Rechnung."] : []),
      "vielen Dank für deine Buchung. Im Anhang findest du deine Rechnung als PDF.",
      payNote,
    ],
    rowsTitle: "Deine Rechnung",
    rows,
    button: i.bookingUrl ? { label: "Zur Buchung", url: i.bookingUrl } : undefined,
    extraHtml: noteBlock("Bitte bewahre die Rechnung für deine Unterlagen auf. Bei Fragen antworte einfach auf diese E-Mail."),
    signature: OUTBOX_SIGNATURE,
  });
  const text = [
    i.firstName ? `Hallo ${i.firstName},` : "Hallo,",
    "",
    ...(i.preview ? ["Dies ist eine Test-Vorschau mit fiktiven Daten. Keine echte Rechnung.", ""] : []),
    "vielen Dank für deine Buchung. Im Anhang findest du deine Rechnung als PDF.",
    payNote,
    "",
    ...rows.map((r) => `${r.label}: ${r.value}`),
    ...(i.bookingUrl ? ["", `Zur Buchung: ${i.bookingUrl}`] : []),
    "",
    "Bei Fragen antworte einfach auf diese E-Mail.",
    "",
    "Herzliche Grüße",
    OUTBOX_SIGNATURE,
  ].join("\n");
  return {
    from: OUTBOX_FROM,
    to: i.to,
    reply_to: OUTBOX_REPLY_TO,
    subject,
    html,
    text,
    attachment: { archive_id: i.archiveId, filename: i.filename },
  };
}

export type ReviewMailInput = {
  firstName: string | null;
  to: string;
  reviewUrl: string;
  optOutToken: string;
  preview?: boolean;
};

export function reviewOptOutUrl(token: string): string {
  return `${APP_ORIGIN}/api/public/review-opt-out?t=${encodeURIComponent(token)}`;
}

export function buildReviewMail(i: ReviewMailInput): FrozenOutboxMail {
  const valid = validateGoogleReviewUrl(i.reviewUrl);
  // Nur die Test-Vorschau darf ohne echten Link gerendert werden (Platzhalter, klar markiert).
  if (!valid && !i.preview) throw new Error("Kein gültiger Google-Bewertungslink hinterlegt");
  const url = valid ?? GOOGLE_REVIEW_URL;
  const optOut = reviewOptOutUrl(i.optOutToken);
  const prefix = i.preview ? "[TEST – Vorschau] " : "";
  const intro = [
    ...(i.preview
      ? [`Dies ist eine Test-Vorschau. Keine echte Kundenmail.`]
      : []),
    "vielen Dank für deine Buchung bei MyTransporter.",
    "Wir sind ein kleines Unternehmen aus Leonberg und lernen aus jeder Rückmeldung. Wenn du magst, teile deine bisherige Erfahrung mit uns in einer ehrlichen Bewertung auf Google – ganz gleich, wie sie ausgefallen ist.",
    "Die Bewertung ist freiwillig und dauert nur eine Minute.",
  ];
  const html = renderEmail({
    firstName: i.firstName,
    heading: i.preview ? "TEST – Deine Erfahrung mit MyTransporter" : "Deine Erfahrung mit MyTransporter",
    intro,
    button: { label: REVIEW_BUTTON_LABEL, url },
    extraHtml: noteBlock(
      `Du möchtest keine Bewertungsanfragen mehr erhalten? <a href="${esc(optOut)}" style="color:#000;">Hier abmelden</a>.`,
    ),
    outro: ["Wenn etwas nicht gepasst hat, antworte gern direkt auf diese E-Mail – wir kümmern uns."],
    signature: OUTBOX_SIGNATURE,
  });
  const text = [
    i.firstName ? `Hallo ${i.firstName},` : "Hallo,",
    "",
    ...intro,
    "",
    `${REVIEW_LINK_TEXT}: ${url}`,
    "",
    "Wenn etwas nicht gepasst hat, antworte gern direkt auf diese E-Mail – wir kümmern uns.",
    "",
    `Keine Bewertungsanfragen mehr: ${optOut}`,
    "",
    "Herzliche Grüße",
    OUTBOX_SIGNATURE,
  ].join("\n");
  return {
    from: OUTBOX_FROM,
    to: i.to,
    reply_to: OUTBOX_REPLY_TO,
    subject: `${prefix}Deine Erfahrung mit MyTransporter`,
    headers: { "List-Unsubscribe": `<${optOut}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    html,
    text,
    attachment: null,
  };
}

// ---------------------------------------------------------------------------
// Versandablauf je Zeile
// ---------------------------------------------------------------------------

export type OutboxRow = {
  id: string;
  source_type: OutboxSource;
  source_id: string;
  kind: OutboxKind;
  status: string;
  idempotency_key: string;
  mail_provider?: "gmail" | "resend";
  recipient_email: string | null;
  payload: FrozenOutboxMail | null;
};

export type OutboxClaim =
  | { result: "claimed"; lease_token: string; prior_ambiguous: boolean }
  | { result: "sent" | "cancelled" | "blocked" | "needs_review" | "no_payload" | "not_due" | "in_progress" | "backoff" | "expired" | "not_found" };

export type OutboxDeps = {
  /** null = darf gesendet werden, sonst Grund für Abbruch (Storno, Abmeldung, gelöschtes Konto). */
  precheck: (row: OutboxRow) => Promise<string | null>;
  cancel: (rowId: string, reason: string) => Promise<void>;
  claim: (rowId: string) => Promise<OutboxClaim>;
  loadAttachment: (archiveId: string) => Promise<string>;
  send: (mail: FrozenOutboxMail, attachmentBase64: string | null, idempotencyKey: string, provider?: "gmail" | "resend") => Promise<DetailedSendResult>;
  complete: (rowId: string, leaseToken: string, providerId: string) => Promise<boolean>;
  fail: (rowId: string, leaseToken: string, kind: string, error: string, ambiguous: boolean, retrySeconds: number) => Promise<boolean>;
};

export type OutboxOutcome =
  | { status: "sent"; providerId: string }
  | { status: "accepted_unrecorded"; providerId: string }
  | { status: "skipped"; reason: string }
  | { status: "cancelled"; reason: string }
  | { status: "failed"; kind: string; error: string; ambiguous: boolean };

export function retrySecondsFor(kind: string): number {
  if (kind === "invalid_key" || kind === "restricted_key" || kind === "sender_domain" || kind === "missing_key") return 3600;
  if (kind === "transient" || kind === "idempotency_in_progress") return 600;
  return 900;
}

export async function processOutboxRow(deps: OutboxDeps, row: OutboxRow): Promise<OutboxOutcome> {
  if (row.status === "sent") return { status: "skipped", reason: "sent" };
  let stop: string | null;
  try {
    stop = await deps.precheck(row);
  } catch (e) {
    // Nicht prüfbar (z. B. DB-Fehler bei Abmeldung/Storno) ⇒ NICHT senden, nichts verändern, später erneut.
    return { status: "failed", kind: "precheck", error: String((e as Error)?.message ?? e).slice(0, 200), ambiguous: false };
  }
  if (stop) {
    if (row.status !== "processing") {
      await deps.cancel(row.id, stop);
      return { status: "cancelled", reason: stop };
    }
    return { status: "skipped", reason: "in_progress" };
  }
  const claim = await deps.claim(row.id);
  if (claim.result !== "claimed") return { status: "skipped", reason: claim.result };
  const token = claim.lease_token;
  const mail = row.payload;
  if (!mail) {
    await deps.fail(row.id, token, "no_payload", "Kein eingefrorener Inhalt", claim.prior_ambiguous, 3600);
    return { status: "failed", kind: "no_payload", error: "Kein eingefrorener Inhalt", ambiguous: claim.prior_ambiguous };
  }

  let attachment: string | null = null;
  if (mail.attachment) {
    try {
      attachment = await deps.loadAttachment(mail.attachment.archive_id);
      if (!attachment) throw new Error("leer");
    } catch (e) {
      // Pflichtanhang fehlt ⇒ NICHT ohne PDF senden. Noch nichts an den Anbieter übergeben.
      const err = `Rechnungs-PDF nicht ladbar: ${String((e as Error)?.message ?? e).slice(0, 200)}`;
      await deps.fail(row.id, token, "attachment", err, claim.prior_ambiguous, 900);
      return { status: "failed", kind: "attachment", error: err, ambiguous: claim.prior_ambiguous };
    }
  }

  let result: DetailedSendResult;
  try {
    result = await deps.send(mail, attachment, row.idempotency_key, row.mail_provider ?? "resend");
  } catch (e) {
    result = { ok: false, kind: "network", ambiguous: true, status: null, error: String((e as Error)?.message ?? e).slice(0, 300) };
  }

  if (result.ok && typeof result.providerId === "string" && result.providerId.trim() !== "") {
    let recorded = false;
    try {
      recorded = await deps.complete(row.id, token, result.providerId);
    } catch {
      recorded = false;
    }
    return recorded
      ? { status: "sent", providerId: result.providerId }
      : { status: "accepted_unrecorded", providerId: result.providerId };
  }

  const f = result.ok
    ? { kind: "no_provider_id", error: "Antwort ohne Versand-ID", ambiguous: true }
    : { kind: result.kind, error: result.error, ambiguous: result.ambiguous };
  const ambiguous = f.ambiguous || claim.prior_ambiguous;
  try {
    await deps.fail(row.id, token, f.kind, f.error, ambiguous, retrySecondsFor(f.kind));
  } catch {
    /* bleibt processing ⇒ nach Lease-Ablauf kontrolliert (innerhalb Fenster gleicher Schlüssel, danach needs_review) */
  }
  return { status: "failed", kind: f.kind, error: f.error, ambiguous };
}

/** Admin-Anzeige: ehrliche Statusbezeichnung (angenommen ≠ zugestellt). */
export function outboxStatusLabel(status: string, ambiguous: boolean): string {
  switch (status) {
    case "scheduled":
      return "Geplant";
    case "processing":
      return "Wird gesendet / Ergebnis offen";
    case "sent":
      return "Vom Mailanbieter angenommen";
    case "failed":
      return ambiguous ? "Ergebnis unklar – wird nur mit gleichem Schlüssel wiederholt" : "Fehlgeschlagen – wird wiederholt";
    case "needs_review":
      return "Prüfung nötig";
    case "blocked":
      return "Gesperrt";
    case "cancelled":
      return "Abgebrochen";
    default:
      return status;
  }
}
