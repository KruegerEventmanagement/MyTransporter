import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { embedBrandLogo } from "@/lib/brand-logo.server";
import { computeDocTotals, type DocItemInput } from "@/lib/doc-totals";

export type { DocItemInput };

export type DocKind = "invoice" | "offer";

export interface DocInput {
  kind: DocKind;
  number: string;
  date: string; // YYYY-MM-DD
  recipient: {
    company?: string;
    attention?: string;
    street?: string;
    city?: string;
    email?: string;
    vatId?: string;
  };
  service: {
    vehicle?: string;
    vin?: string;
    pickup?: string;
    ret?: string;
    freeKm?: number | null;
    kmPrice?: number | null;
  };
  items: DocItemInput[];
  note?: string;
}

function fmtEur(n: number): string {
  return n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

function fmtDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

async function loadLogo(pdf: PDFDocument) {
  return await embedBrandLogo(pdf);
}

export async function generateCustomDocumentPdf(
  input: DocInput,
): Promise<{ pdfBase64: string; filename: string }> {
  const isOffer = input.kind === "offer";
  const totals = computeDocTotals(input.items);

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const black = rgb(0, 0, 0);
  const grey = rgb(0.4, 0.4, 0.4);
  const line = rgb(0.85, 0.85, 0.85);

  const left = 50;
  const right = 545;
  let y = 800;

  const logo = await loadLogo(pdf);
  let logoBottomY = y;
  if (logo) {
    const logoH = 48;
    const logoW = (logo.width / logo.height) * logoH;
    const logoY = y - logoH + 16;
    page.drawImage(logo, { x: left, y: logoY, width: logoW, height: logoH });
    logoBottomY = logoY;
  } else {
    page.drawText("MyTransporter", { x: left, y, font: bold, size: 20, color: black });
    logoBottomY = y - 4;
  }

  const title = isOffer ? "ANGEBOT" : "RECHNUNG";
  page.drawText(title, { x: right - bold.widthOfTextAtSize(title, 16), y, font: bold, size: 16, color: black });

  y = logoBottomY - 14;
  page.drawText("Transporter-Vermietung", { x: left, y, font, size: 10, color: grey });
  y -= 12;
  page.drawText("Römerstraße 36, 71229 Leonberg", { x: left, y, font, size: 10, color: grey });

  y -= 20;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, color: line, thickness: 1 });

  // Meta rechts
  y -= 24;
  const metaLabel = (label: string, value: string, yy: number) => {
    page.drawText(label, { x: right - 220, y: yy, font, size: 10, color: grey });
    page.drawText(value, { x: right - font.widthOfTextAtSize(value, 10), y: yy, font: bold, size: 10, color: black });
  };
  metaLabel(isOffer ? "Angebotsnummer" : "Rechnungsnummer", input.number, y);
  y -= 14;
  metaLabel(isOffer ? "Angebotsdatum" : "Rechnungsdatum", fmtDate(input.date), y);

  // Empfänger links
  let cy = y + 28;
  page.drawText(isOffer ? "Angebot für" : "Rechnung an", { x: left, y: cy, font: bold, size: 10, color: grey });
  cy -= 14;
  const r = input.recipient;
  const recipientLines: { text: string; strong?: boolean }[] = [];
  if (r.company) recipientLines.push({ text: r.company, strong: true });
  if (r.attention) recipientLines.push({ text: r.attention });
  if (r.street) recipientLines.push({ text: r.street });
  if (r.city) recipientLines.push({ text: r.city });
  if (r.vatId) recipientLines.push({ text: `USt-IdNr.: ${r.vatId}` });
  if (r.email) recipientLines.push({ text: r.email });
  for (const l of recipientLines) {
    page.drawText(l.text, { x: left, y: cy, font: l.strong ? bold : font, size: l.strong ? 11 : 10, color: black });
    cy -= 13;
  }

  y = Math.min(y - 24, cy - 10);
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, color: line, thickness: 1 });

  // Leistung
  const s = input.service;
  if (s.vehicle || s.vin || s.pickup || s.ret || s.freeKm != null) {
    y -= 22;
    page.drawText("Leistung", { x: left, y, font: bold, size: 11, color: black });
    const row = (t: string) => {
      y -= 13;
      page.drawText(t, { x: left, y, font, size: 10, color: black });
    };
    if (s.vehicle) row(`Fahrzeug: ${s.vehicle}`);
    if (s.vin) row(`Fahrgestellnummer (FIN): ${s.vin}`);
    if (s.pickup) row(`Abholung: ${s.pickup}`);
    if (s.ret) row(`Rückgabe: ${s.ret}`);
    if (s.freeKm != null)
      row(
        `Inklusive ${s.freeKm.toLocaleString("de-DE")} Freikilometer${
          s.kmPrice != null ? ` · darüber ${s.kmPrice.toFixed(2)} € / km` : ""
        }`,
      );
  }

  // Positionen
  const colNetX = 330;
  const colVatX = 410;
  const colGrossX = right;
  const drawRight = (text: string, x: number, yy: number, f = font, size = 10, color = grey) => {
    page.drawText(text, { x: x - f.widthOfTextAtSize(text, size), y: yy, font: f, size, color });
  };

  y -= 28;
  page.drawText("Position", { x: left, y, font: bold, size: 10, color: grey });
  drawRight("Netto", colNetX, y, bold);
  drawRight("MwSt 19%", colVatX, y, bold);
  drawRight("Brutto", colGrossX, y, bold);
  y -= 6;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, color: line, thickness: 1 });

  for (const row of totals.rows) {
    y -= 18;
    page.drawText(row.label, { x: left, y, font, size: 11, color: black });
    drawRight(row.netC == null ? "—" : fmtEur(row.netC / 100), colNetX, y, font, 11, black);
    drawRight(row.vatC == null ? "—" : fmtEur(row.vatC / 100), colVatX, y, font, 11, black);
    drawRight(fmtEur(row.grossC / 100), colGrossX, y, font, 11, black);
  }

  y -= 14;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, color: line, thickness: 1 });

  const sumRow = (label: string, amountC: number, opts?: { bold?: boolean }) => {
    y -= opts?.bold ? 22 : 16;
    const f = opts?.bold ? bold : font;
    const size = opts?.bold ? 13 : 11;
    page.drawText(label, { x: left, y, font: f, size, color: black });
    const a = fmtEur(amountC / 100);
    page.drawText(a, { x: right - f.widthOfTextAtSize(a, size), y, font: f, size, color: black });
  };
  sumRow("Zwischensumme netto", totals.vatNetC);
  sumRow("zzgl. 19% USt.", totals.vatVatC);
  sumRow("Bruttobetrag Leistung", totals.vatGrossC);
  if (totals.plainC !== 0) sumRow("Ohne USt. (z.B. Kaution)", totals.plainC);
  sumRow("Gesamtbetrag", totals.totalC, { bold: true });

  if (input.note) {
    y -= 26;
    const words = input.note.split(/\s+/);
    let currentLine = "";
    const maxW = right - left;
    for (const w of words) {
      const test = currentLine ? `${currentLine} ${w}` : w;
      if (font.widthOfTextAtSize(test, 9) > maxW) {
        page.drawText(currentLine, { x: left, y, font, size: 9, color: grey });
        y -= 11;
        currentLine = w;
      } else {
        currentLine = test;
      }
    }
    if (currentLine) page.drawText(currentLine, { x: left, y, font, size: 9, color: grey });
  }

  // Fußzeile
  const footerTop = 140;
  page.drawLine({ start: { x: left, y: footerTop }, end: { x: right, y: footerTop }, color: line, thickness: 1 });
  const colW = (right - left) / 3;
  const c1 = left;
  const c2 = left + colW;
  const c3 = left + colW * 2;
  let fy = footerTop - 14;
  page.drawText("Kontakt", { x: c1, y: fy, font: bold, size: 9, color: black });
  page.drawText("Unternehmen", { x: c2, y: fy, font: bold, size: 9, color: black });
  page.drawText("Bankverbindung", { x: c3, y: fy, font: bold, size: 9, color: black });
  fy -= 12;
  page.drawText("MyTransporter", { x: c1, y: fy, font, size: 9, color: black });
  page.drawText("Christian Krüger", { x: c2, y: fy, font, size: 9, color: black });
  page.drawText("Christian Krüger", { x: c3, y: fy, font, size: 9, color: black });
  fy -= 11;
  page.drawText("Römerstraße 36", { x: c1, y: fy, font, size: 9, color: grey });
  page.drawText("USt-IdNr.: DE328715703", { x: c2, y: fy, font, size: 9, color: grey });
  page.drawText("Finom Payments", { x: c3, y: fy, font, size: 9, color: grey });
  fy -= 11;
  page.drawText("71229 Leonberg", { x: c1, y: fy, font, size: 9, color: grey });
  page.drawText("mytransporter.org", { x: c2, y: fy, font, size: 9, color: grey });
  page.drawText("IBAN: DE44 1001 8000 0164 8885 87", { x: c3, y: fy, font, size: 9, color: grey });
  fy -= 11;
  page.drawText("info@mytransporter.org", { x: c1, y: fy, font, size: 9, color: grey });
  page.drawText("BIC: FNOMDEB2", { x: c3, y: fy, font, size: 9, color: grey });

  page.drawText(
    isOffer
      ? "Wir freuen uns auf Ihre Rückmeldung."
      : "Vielen Dank für Ihre Buchung bei MyTransporter.",
    { x: left, y: 40, font, size: 10, color: black },
  );

  const bytes = await pdf.save();
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as number[]);
  }
  const pdfBase64 = btoa(binary);
  const filename = `MyTransporter-${isOffer ? "Angebot" : "Rechnung"}-${input.number}.pdf`;
  return { pdfBase64, filename };
}
