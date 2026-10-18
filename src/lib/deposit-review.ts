/**
 * Kautionsprüfung (rein, ohne I/O): Abzugspositionen, serverseitige Summen,
 * Pflichtfoto-Checkliste und eingefrorene Mailinhalte (Admin + Kunde).
 * Regelquellen: /agb §5 (Rauchen 100 €, Verspätung 25 €/angefangene Stunde,
 * Kraftstoff = tatsächliche Tankkosten + 20 € Servicegebühr), /agb §3/§9
 * (Reinigung, Ausstattung, Schäden nach tatsächlichem Aufwand) und
 * documentation-fee.ts (30 € nur nach manueller Prüfung, nie bei Technikproblemen).
 */
import { renderEmail, esc, APP_ORIGIN, rawListBlock, noteBlock } from "@/lib/email-template";
import { DOCUMENTATION_FEE_EUR, classifyDocumentationGaps } from "@/lib/documentation-fee";
import { OUTBOX_FROM, OUTBOX_REPLY_TO, OUTBOX_SIGNATURE, type FrozenOutboxMail } from "@/lib/customer-mail-outbox";

export const MAX_ITEM_CENTS = 5_000_00;
export const MAX_QUANTITY = 48;
export const MAX_REASON = 500;
export const MAX_MESSAGE = 1500;
export const ADMIN_RECIPIENT = "info@mytransporter.org";

export type DeductionType =
  | "smoking"
  | "late_return"
  | "fuel"
  | "cleaning"
  | "damage"
  | "missing_accessory"
  | "documentation_fee"
  | "extra_km"
  | "other";

type Def = {
  label: string;
  /** Interne Quelle für den Admin (nie in der Kundenmail). */
  source: string;
  /** Erklärung für den Kunden. */
  customerText: string;
  mode: "fixed" | "per_unit" | "amount_plus_fee" | "free" | "snapshot";
  unitCents?: number;
  feeCents?: number;
  unitLabel?: string;
  reasonRequired: boolean;
};

export const DEDUCTION_DEFS: Record<DeductionType, Def> = {
  smoking: {
    label: "Rauchen im Fahrzeug",
    source: "AGB §5: Reinigungsgebühr 100 € bei Rauchen",
    customerText: "Reinigungsgebühr wegen Rauchen im Fahrzeug laut Mietbedingungen",
    mode: "fixed",
    unitCents: 100_00,
    reasonRequired: false,
  },
  late_return: {
    label: "Verspätete Rückgabe",
    source: "AGB §5: 25 € je angefangene Stunde",
    customerText: "Verspätete Rückgabe, 25 € je angefangene Stunde laut Mietbedingungen",
    mode: "per_unit",
    unitCents: 25_00,
    unitLabel: "angefangene Stunden",
    reasonRequired: false,
  },
  fuel: {
    label: "Fehlender Kraftstoff",
    source: "AGB §5: tatsächliche Tankkosten + 20 € Servicegebühr",
    customerText: "Nachtanken: tatsächliche Tankkosten zuzüglich 20 € Servicegebühr laut Mietbedingungen",
    mode: "amount_plus_fee",
    feeCents: 20_00,
    reasonRequired: false,
  },
  cleaning: {
    label: "Reinigung",
    source: "AGB §3/§9: nach tatsächlichem Aufwand, Betrag manuell",
    customerText: "Reinigung des Fahrzeugs nach tatsächlichem Aufwand",
    mode: "free",
    reasonRequired: true,
  },
  damage: {
    label: "Beschädigung",
    source: "AGB §9: nach tatsächlichem Schaden, Betrag manuell",
    customerText: "Beschädigung am Fahrzeug",
    mode: "free",
    reasonRequired: true,
  },
  missing_accessory: {
    label: "Fehlendes Zubehör",
    source: "AGB §3: Ausstattung nach tatsächlichem Wert, Betrag manuell",
    customerText: "Fehlendes oder beschädigtes Zubehör",
    mode: "free",
    reasonRequired: true,
  },
  documentation_fee: {
    label: "Bearbeitungspauschale fehlende Nachweise",
    source: "Rückgabehinweis / Bearbeitungspauschale: 30 € nur nach manueller Prüfung, nie bei technischen Problemen",
    customerText: "Bearbeitungspauschale für fehlende Fahrzeugdokumentation bei der Rückgabe",
    mode: "fixed",
    unitCents: DOCUMENTATION_FEE_EUR * 100,
    reasonRequired: true,
  },
  extra_km: {
    label: "Mehrkilometer",
    source: "Bei Buchung vereinbarter Kilometerpreis",
    customerText: "Mehrkilometer zum bei der Buchung vereinbarten Kilometerpreis",
    mode: "snapshot",
    reasonRequired: false,
  },
  other: {
    label: "Sonstiges",
    source: "Freie Position, Begründung Pflicht",
    customerText: "Sonstige Position",
    mode: "free",
    reasonRequired: true,
  },
};

export type DraftItem = {
  type: DeductionType;
  quantity?: number;
  /** Bei fuel: Tankkosten; bei free: Betrag. Immer Cent. */
  amount_cents?: number;
  reason?: string;
};

export type PricedItem = DraftItem & { line_cents: number; label: string; customer_text: string };

/** Fakten, die der Server (nie der Client) für Regelprüfungen liefert. */
export type ReviewFacts = {
  extraKmChargeCents: number | null;
  extraKmAlreadyPaid: boolean;
  extraKm: number | null;
  /** Fehlende Pflichtnachweise (Tags). */
  missingTags: string[];
  /** Kunden-Ausnahmen aus der Rückgabe (return_exceptions). */
  exceptions: Record<string, string | undefined>;
};

const isCents = (v: unknown, max = MAX_ITEM_CENTS): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= max;

/** Dokumentationspauschale nur bei bewusst nicht bereitgestellten Nachweisen ohne Technikproblem. */
export function documentationFeeAllowed(f: ReviewFacts): { allowed: boolean; why: string } {
  const g = classifyDocumentationGaps(f.exceptions);
  if (g.technical.length > 0) return { allowed: false, why: "Kunde meldete technische Probleme: keine Pauschale" };
  if (g.notProvided.length > 0) return { allowed: true, why: "Nachweis laut Kunde bewusst nicht bereitgestellt" };
  if (f.missingTags.length > 0 && g.unclassified.length === 0)
    return { allowed: true, why: "Pflichtnachweise fehlen ohne gemeldetes Technikproblem (manuell prüfen)" };
  if (f.missingTags.length === 0) return { allowed: false, why: "Alle Pflichtnachweise vorhanden" };
  return { allowed: false, why: "Ursache unklar: manuell klären, keine Pauschale" };
}

/** Validiert und bepreist alle Positionen serverseitig. Wirft bei jedem Fehler. */
export function priceItems(raw: unknown, facts: ReviewFacts, opts: { frozen?: boolean } = {}): PricedItem[] {
  if (!Array.isArray(raw)) throw new Error("Positionen ungültig");
  if (raw.length > 20) throw new Error("Zu viele Positionen");
  const seen = new Set<DeductionType>();
  return raw.map((r): PricedItem => {
    const it = r as DraftItem;
    const def = DEDUCTION_DEFS[it?.type as DeductionType];
    if (!def) throw new Error("Unbekannte Position");
    if (it.type !== "other" && it.type !== "damage" && seen.has(it.type)) throw new Error(`${def.label} doppelt`);
    seen.add(it.type);
    const reason = typeof it.reason === "string" ? it.reason.trim() : "";
    if (reason.length > MAX_REASON) throw new Error("Begründung zu lang");
    if (def.reasonRequired && reason.length < 3) throw new Error(`${def.label}: Begründung fehlt`);
    let line: number;
    let quantity: number | undefined;
    let amount: number | undefined;
    switch (def.mode) {
      case "fixed":
        line = def.unitCents!;
        break;
      case "per_unit":
        if (!Number.isSafeInteger(it.quantity) || (it.quantity as number) < 1 || (it.quantity as number) > MAX_QUANTITY)
          throw new Error(`${def.label}: Menge ungültig`);
        quantity = it.quantity as number;
        line = def.unitCents! * quantity;
        break;
      case "amount_plus_fee":
        if (!isCents(it.amount_cents) || it.amount_cents === 0) throw new Error(`${def.label}: Betrag ungültig`);
        amount = it.amount_cents;
        line = amount + def.feeCents!;
        break;
      case "free":
        if (!isCents(it.amount_cents) || it.amount_cents === 0) throw new Error(`${def.label}: Betrag ungültig`);
        amount = it.amount_cents;
        line = amount;
        break;
      case "snapshot":
        if (opts.frozen) {
          if (!isCents(it.amount_cents) || !it.amount_cents) throw new Error("Mehrkilometer-Betrag fehlt");
          amount = it.amount_cents;
          line = amount;
          break;
        }
        if (facts.extraKmAlreadyPaid) throw new Error("Mehrkilometer wurden bereits separat eingezogen oder der Einzug läuft");
        if (!isCents(facts.extraKmChargeCents) || !facts.extraKmChargeCents) throw new Error("Keine Mehrkilometer-Forderung gespeichert");
        line = facts.extraKmChargeCents;
        amount = line;
        break;
    }
    if (!opts.frozen && it.type === "documentation_fee" && !documentationFeeAllowed(facts).allowed)
      throw new Error("Bearbeitungspauschale hier nicht zulässig (technisches Problem oder Nachweise vollständig)");
    if (!isCents(line)) throw new Error(`${def.label}: Betrag zu hoch`);
    return {
      type: it.type,
      ...(quantity != null && { quantity }),
      ...(amount != null && { amount_cents: amount }),
      ...(reason && { reason }),
      line_cents: line,
      label: def.label,
      customer_text: def.customerText,
    };
  });
}

export type Totals = { depositCents: number; totalCents: number; appliedCents: number; outstandingCents: number; refundCents: number };

/** Abzug > Kaution wird nicht still abgeschnitten: Rest bleibt als offene Forderung sichtbar. */
export function computeTotals(depositCents: number, items: PricedItem[]): Totals {
  if (!isCents(depositCents)) throw new Error("Kaution ungültig");
  const total = items.reduce((s, i) => s + i.line_cents, 0);
  if (!Number.isSafeInteger(total)) throw new Error("Summe ungültig");
  const applied = Math.min(total, depositCents);
  return { depositCents, totalCents: total, appliedCents: applied, outstandingCents: total - applied, refundCents: depositCents - applied };
}

export const eur = (c: number) => `${(c / 100).toFixed(2).replace(".", ",")} €`;

export function berlinStamp(ms: number): string {
  return new Date(ms).toLocaleString("de-DE", {
    timeZone: "Europe/Berlin", weekday: "short", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  }) + " Uhr";
}

export const PHOTO_CHECKLIST: { tag: string; label: string }[] = [
  { tag: "post_front", label: "Außen vorn" },
  { tag: "post_back", label: "Außen hinten" },
  { tag: "post_left", label: "Außen links" },
  { tag: "post_right", label: "Außen rechts" },
  { tag: "post_interior", label: "Innenraum" },
  { tag: "post_dashboard", label: "Tacho mit km und Tank" },
  { tag: "tank_receipt", label: "Tankbeleg" },
];

/** Altbuchungen mit getrennten Tacho-/Tankfotos gelten für „Tacho“ als vorhanden. */
export function photoChecklist(present: string[]) {
  const has = new Set(present);
  return PHOTO_CHECKLIST.map((p) => ({
    ...p,
    present: has.has(p.tag) || (p.tag === "post_dashboard" && has.has("post_odometer")),
  }));
}

export type AdminMailInput = {
  sourceType: "booking" | "manual";
  sourceId: string;
  customerName: string;
  bookingRef: string;
  vehicle: string;
  startMs: number;
  endMs: number;
  returnReportedMs: number | null;
  priceLine: string;
  depositLine: string;
  checklist: { label: string; present: boolean }[] | null;
  issues: string[];
};

export function adminDeepLink(sourceType: string, sourceId: string) {
  return `${APP_ORIGIN}/admin?kaution=${encodeURIComponent(`${sourceType}:${sourceId}`)}`;
}

const RULES_SUMMARY = [
  "Rauchen: 100 € Reinigungsgebühr (AGB §5)",
  "Verspätete Rückgabe: 25 € je angefangene Stunde (AGB §5)",
  "Fehlender Kraftstoff: tatsächliche Tankkosten + 20 € Servicegebühr (AGB §5)",
  "Reinigung, Zubehör, Schäden: nach tatsächlichem Aufwand mit Begründung (AGB §3/§9)",
  "Fehlende Nachweise: 30 € nur nach manueller Prüfung, nie bei technischen Problemen",
  "Mehrkilometer: nur zum bei Buchung vereinbarten Kilometerpreis, nicht wenn bereits separat bezahlt",
];

export function buildAdminReviewMail(i: AdminMailInput): FrozenOutboxMail {
  const returned = i.returnReportedMs != null;
  const subject = `Wie ist die Fahrt von ${i.customerName} verlaufen? Kaution prüfen`;
  const rows = [
    { label: "Kunde", value: i.customerName },
    { label: "Buchung", value: i.bookingRef },
    { label: "Fahrzeug", value: i.vehicle },
    { label: "Beginn", value: berlinStamp(i.startMs) },
    { label: "Geplantes Ende", value: berlinStamp(i.endMs) },
    { label: "Rückgabe", value: returned ? `gemeldet am ${berlinStamp(i.returnReportedMs!)}` : "noch nicht bestätigt (geplantes Mietende erreicht)" },
    { label: "Miete", value: i.priceLine },
    { label: "Kaution", value: i.depositLine },
  ];
  const checklistHtml = i.checklist
    ? rawListBlock("Pflichtfotos", i.checklist.map((c) => `${c.present ? "✓" : "✗"} ${esc(c.label)}${c.present ? "" : " (fehlt)"}`))
    : noteBlock("Manueller Termin: keine Rückgabefotos im System. Zustand bitte vor Ort prüfen.");
  const issuesHtml = i.issues.length ? rawListBlock("Hinweise", i.issues.map(esc)) : "";
  const rulesHtml = rawListBlock("Regelübersicht zur manuellen Prüfung", RULES_SUMMARY.map(esc));
  const link = adminDeepLink(i.sourceType, i.sourceId);
  const intro = [
    returned ? "Die Rückgabe wurde gemeldet. Bitte Zustand und Nachweise prüfen und die Kaution abschließen." : "Das geplante Mietende ist erreicht, eine Rückgabe ist noch nicht bestätigt. Bitte prüfen.",
    "Diese Mail enthält nur bekannte Fakten. Ob Abzüge berechtigt sind, entscheidest du bei der manuellen Prüfung. Es wurde nichts automatisch abgezogen.",
  ];
  const html = renderEmail({
    heading: "Kaution prüfen",
    intro,
    rows,
    rowsTitle: "Buchung",
    button: { label: "Buchung im Admin öffnen", url: link },
    extraHtml: checklistHtml + issuesHtml + rulesHtml,
    omitSignature: true,
  });
  const text = [
    subject, "", ...intro, "",
    ...rows.map((r) => `${r.label}: ${r.value}`), "",
    ...(i.checklist ? ["Pflichtfotos:", ...i.checklist.map((c) => `${c.present ? "[x]" : "[ ]"} ${c.label}`)] : ["Manueller Termin: keine Rückgabefotos im System."]),
    ...(i.issues.length ? ["", "Hinweise:", ...i.issues.map((x) => `- ${x}`)] : []),
    "", "Regelübersicht:", ...RULES_SUMMARY.map((x) => `- ${x}`), "",
    `Admin öffnen: ${link}`,
  ].join("\n");
  return { from: OUTBOX_FROM, to: ADMIN_RECIPIENT, reply_to: OUTBOX_REPLY_TO, subject, html, text, attachment: null };
}

export type DigestEntry = { name: string; vehicle: string; endMs: number; state: string; sourceType: string; sourceId: string };

export function buildDigestMail(dateLabel: string, open: DigestEntry[], pending: DigestEntry[]): FrozenOutboxMail {
  const subject = `Offene Kautionen: ${open.length} ungeprüft${pending.length ? `, ${pending.length} bei Stripe ausstehend` : ""} (${dateLabel})`;
  const line = (e: DigestEntry) => `${e.name} · ${e.vehicle} · Ende ${berlinStamp(e.endMs)} · ${e.state}`;
  const html = renderEmail({
    heading: "Offene Kautionen",
    intro: ["Täglicher Sammelhinweis. Es wurde nichts automatisch erstattet oder abgezogen."],
    extraHtml:
      (open.length ? rawListBlock("Noch ungeprüft", open.map((e) => `<a href="${esc(adminDeepLink(e.sourceType, e.sourceId))}" style="color:#000;">${esc(line(e))}</a>`)) : "") +
      (pending.length ? rawListBlock("Rückzahlung bei Stripe ausstehend (nur Statusabgleich, keine neue Zahlung)", pending.map((e) => esc(line(e)))) : ""),
    button: { label: "Offene Kautionen öffnen", url: `${APP_ORIGIN}/admin?kaution=list` },
    omitSignature: true,
  });
  const text = [subject, "", ...(open.length ? ["Noch ungeprüft:", ...open.map((e) => `- ${line(e)}`), ""] : []), ...(pending.length ? ["Stripe ausstehend:", ...pending.map((e) => `- ${line(e)}`), ""] : []), `${APP_ORIGIN}/admin?kaution=list`].join("\n");
  return { from: OUTBOX_FROM, to: ADMIN_RECIPIENT, reply_to: OUTBOX_REPLY_TO, subject, html, text, attachment: null };
}

/** Tatsächlicher Zahlungsstand zum Zeitpunkt des Einfrierens. */
export type PayoutState =
  | { kind: "stripe_succeeded" }
  | { kind: "stripe_pending" }
  | { kind: "manual_confirmed"; method: "cash" | "transfer" | "sumup" | "other" }
  | { kind: "none_due" }
  | { kind: "preview" };

export type CustomerMailInput = {
  to: string;
  firstName: string | null;
  vehicle: string;
  startMs: number;
  endMs: number;
  totals: Totals;
  items: PricedItem[];
  message: string | null;
  payout: PayoutState;
  /** Karte/Original-Zahlung (Stripe) vs. manuell. */
  channel: "stripe" | "manual";
};

const METHOD_LABEL = { cash: "in bar", transfer: "per Überweisung", sumup: "über SumUp", other: "auf dem vereinbarten Weg" } as const;

export function payoutSentence(p: PayoutState, refund: number, channel: "stripe" | "manual"): string {
  if (refund === 0 || p.kind === "none_due") return "Es verbleibt kein Betrag zur Rückzahlung.";
  switch (p.kind) {
    case "stripe_succeeded":
      return `Die Rückzahlung von ${eur(refund)} auf deine ursprüngliche Zahlungsart wurde von unserem Zahlungsanbieter bestätigt. Je nach Bank kann die Gutschrift 1 bis 10 Werktage dauern.`;
    case "stripe_pending":
      return `Die Rückzahlung von ${eur(refund)} auf deine ursprüngliche Zahlungsart ist beauftragt und wird noch bearbeitet. Je nach Bank kann die Gutschrift 1 bis 10 Werktage dauern.`;
    case "manual_confirmed":
      return `Die Rückzahlung von ${eur(refund)} ist ${METHOD_LABEL[p.method]} erfolgt.`;
    case "preview":
      return channel === "stripe"
        ? `Die Rückzahlung von ${eur(refund)} wird nach Abschluss auf deine ursprüngliche Zahlungsart beauftragt. (Vorschau: endgültiger Status folgt.)`
        : `Die Rückzahlung von ${eur(refund)} erfolgt manuell. (Vorschau: endgültiger Status folgt.)`;
  }
}

/** Kundenmail ohne interne Technik, ohne Gedankenstriche im Fließtext. */
export function buildCustomerClosingMail(i: CustomerMailInput): FrozenOutboxMail {
  const t = i.totals;
  const subject = "Deine Kaution bei MyTransporter";
  const intro = [
    "vielen Dank für deine Buchung bei MyTransporter.",
    t.totalCents === 0
      ? "Wir haben die Rückgabe geprüft. Es gibt keine Abzüge von deiner Kaution."
      : "Wir haben die Rückgabe geprüft. Hier siehst du transparent, welche Positionen wir mit deiner Kaution verrechnen.",
  ];
  const rows = [
    { label: "Fahrzeug", value: i.vehicle },
    { label: "Mietbeginn", value: berlinStamp(i.startMs) },
    { label: "Mietende", value: berlinStamp(i.endMs) },
    { label: "Kaution", value: eur(t.depositCents) },
    ...i.items.map((it) => ({
      label: it.label + (it.quantity ? ` (${it.quantity})` : ""),
      value: `${eur(it.line_cents)}: ${it.customer_text}${it.reason ? `. ${it.reason}` : ""}`,
    })),
    { label: "Abzug gesamt", value: eur(t.totalCents) },
    { label: "Verrechnet mit Kaution", value: eur(t.appliedCents) },
    { label: "Rückzahlung", value: eur(t.refundCents) },
    ...(t.outstandingCents > 0 ? [{ label: "Offener Restbetrag", value: eur(t.outstandingCents) }] : []),
  ];
  const payout = payoutSentence(i.payout, t.refundCents, i.channel);
  const outro = [
    payout,
    ...(t.outstandingCents > 0 ? [`Der Restbetrag von ${eur(t.outstandingCents)} übersteigt die Kaution. Wir melden uns dazu separat bei dir; es erfolgt keine automatische Abbuchung.`] : []),
    ...(i.message?.trim() ? [i.message.trim()] : []),
    "Bei Fragen antworte einfach auf diese E-Mail. Wir freuen uns, wenn du wieder bei uns mietest.",
  ];
  const html = renderEmail({ firstName: i.firstName, heading: "Abschluss deiner Kaution", intro, rows, rowsTitle: "Kautionsabrechnung", outro, signature: OUTBOX_SIGNATURE });
  const text = [
    i.firstName ? `Hallo ${i.firstName},` : "Hallo,", "", ...intro, "",
    ...rows.map((r) => `${r.label}: ${r.value}`), "", ...outro, "", "Herzliche Grüße", OUTBOX_SIGNATURE,
  ].join("\n");
  return { from: OUTBOX_FROM, to: i.to, reply_to: OUTBOX_REPLY_TO, subject, html, text, attachment: null };
}

/** Deterministische Quelle je Berliner Kalendertag für den Sammelhinweis. */
export function digestSourceId(berlinDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(berlinDate)) throw new Error("Datum ungültig");
  return `00000000-0000-4000-8000-0000${berlinDate.replace(/-/g, "")}`;
}

export function berlinDateAndHour(ms: number): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ms));
  const g = (t: string) => parts.find((p) => p.type === t)!.value;
  return { date: `${g("year")}-${g("month")}-${g("day")}`, hour: Number(g("hour")) };
}

export const DIGEST_HOUR_BERLIN = 10;

export const SETTLEMENT_STATE_DE: Record<string, string> = {
  processing: "Ergebnis unklar, gleicher Auftrag wird abgeglichen",
  pending: "Stripe ausstehend",
  requires_action: "Stripe benötigt eine Aktion",
  needs_review: "Manuell prüfen",
  failed: "Rückzahlung fehlgeschlagen",
  canceled: "Rückzahlung abgebrochen",
  succeeded: "Von Stripe bestätigt",
  no_refund: "Vollständig einbehalten",
};

export const MAIL_STATE_DE: Record<string, string> = {
  scheduled: "geplant", processing: "wird versendet", sent: "von Gmail angenommen", failed: "fehlgeschlagen, wird erneut versucht",
  needs_review: "unklar, manuell prüfen", blocked: "gesperrt", cancelled: "abgebrochen",
};

type SettlementLite = { id: string; status: string };

/**
 * Offener Status einer Online-Kaution; null nur bei bestätigtem Erfolg/no_refund
 * bzw. Altabschluss ohne Auftrag. Fehlerstatus bleiben offen (kein automatischer Neuversuch).
 */
export function bookingDepositState(
  review: { status: string; settlement_id: string | null } | null,
  settlements: SettlementLite[],
  depositStatus: string | null,
): string | null {
  if (review?.status === "finalized") {
    if (!review.settlement_id) return "Abschluss: Rückzahlung fortsetzen";
    const s = settlements.find((x) => x.id === review.settlement_id);
    if (!s) return "Verknüpfung ungültig: manuell prüfen";
    if (s.status === "succeeded" || s.status === "no_refund") return null;
    return SETTLEMENT_STATE_DE[s.status] ?? "Manuell prüfen";
  }
  const active = settlements.find((x) => !["failed", "canceled"].includes(x.status));
  if (active) return active.status === "succeeded" || active.status === "no_refund" ? null : SETTLEMENT_STATE_DE[active.status] ?? "Manuell prüfen";
  const bad = settlements.find((x) => x.status === "failed" || x.status === "canceled");
  if (bad) return SETTLEMENT_STATE_DE[bad.status];
  if (depositStatus === "released") return null;
  return review ? "Entwurf" : "Ungeprüft";
}

/** Vor (erneutem) Versand der Kundenmail: aktuelle Fakten müssen den eingefrorenen Inhalt noch tragen. */
export function closingMailStillValid(i: { reviewFinalized: boolean; payout: PayoutState | null; refundCents: number | null; frozenText: string }): string | null {
  if (!i.reviewFinalized) return "Kaution nicht abgeschlossen";
  if (!i.payout) return "Zahlungsstand geändert oder fehlgeschlagen: Mail nicht gesendet";
  if (i.refundCents == null || !i.frozenText.includes(`Rückzahlung: ${eur(i.refundCents)}`)) return "Betrag passt nicht zum Abschluss: Mail nicht gesendet";
  if (i.frozenText.includes("bestätigt") && i.payout.kind === "stripe_pending") return "Zahlungsstand passt nicht: Mail nicht gesendet";
  return null;
}

/** Vor (erneutem) Versand des Adminhinweises: Quelle noch fällig, offen und unverändert. */
export function adminMailStillValid(i: {
  bookingStatus: string; depositStatus: string | null; reviewFinalized: boolean; endMs: number; returnReportedMs: number | null; nowMs: number; frozenText: string;
}): string | null {
  if (i.bookingStatus === "cancelled") return "Buchung storniert";
  if (i.depositStatus === "released") return "Kaution bereits abgerechnet";
  if (i.reviewFinalized) return "Kaution bereits abgeschlossen";
  if (i.returnReportedMs == null && i.endMs > i.nowMs) return "Mietende verschoben, noch nicht fällig";
  if (!i.frozenText.includes(berlinStamp(i.endMs))) return "Mietzeitraum geändert: veraltete Nachricht";
  return null;
}

/** Nur Fotos dieser Buchung mit bestätigtem Storage-Objekt (Typ), keine fremden/ungültigen Pfade, keine öffentlichen URLs. */
export function safePhotoRows<T extends { photo_type: string; photo_url: string }>(bookingId: string, rows: T[], confirmedTypes: string[]): T[] {
  const ok = new Set(confirmedTypes);
  return rows.filter(
    (r) =>
      typeof r.photo_url === "string" &&
      r.photo_url.startsWith(`${bookingId}/`) &&
      !r.photo_url.includes("..") &&
      !/^https?:/i.test(r.photo_url) &&
      ok.has(r.photo_type),
  );
}

/** Stabiler Inhaltsschlüssel eines Entwurfs: Abschluss nur, wenn sichtbarer Inhalt == gespeicherter Inhalt. */
export function draftKey(items: DraftItem[], message: string | null | undefined): string {
  const norm = items
    .map((i) => ({ t: i.type, q: i.type === "late_return" ? i.quantity ?? null : null, a: i.type === "extra_km" ? null : i.amount_cents ?? null, r: (i.reason ?? "").trim() }))
    .sort((a, b) => (a.t + a.r).localeCompare(b.t + b.r));
  return JSON.stringify({ i: norm, m: (message ?? "").trim() });
}

/** Ordnet den mit der Kaution verrechneten Betrag den Positionen in Reihenfolge zu (nur tatsächlich Zugeordnetes gilt als verrechnet). */
export function allocateApplied(items: PricedItem[], appliedCents: number): Partial<Record<DeductionType, number>> {
  let left = appliedCents;
  const out: Partial<Record<DeductionType, number>> = {};
  for (const it of items) {
    const part = Math.min(it.line_cents, Math.max(0, left));
    out[it.type] = (out[it.type] ?? 0) + part;
    left -= part;
  }
  return out;
}
