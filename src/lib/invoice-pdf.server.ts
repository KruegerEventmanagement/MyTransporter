import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { computePlanReturn } from "@/lib/booking-rules";
import logoAsset from "@/assets/invoice-logo.png.asset.json";
import { getRequest } from "@tanstack/react-start/server";

type Addon = { id: string; label: string; price_cents: number };

function fmtEur(n: number): string {
  return n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function fmtDateTime(date: string, hour: number): string {
  const d = new Date(`${date}T${String(hour).padStart(2, "0")}:00:00`);
  return d.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) + " Uhr";
}

function invoiceNumber(bookingId: string, createdAt: string): string {
  const d = new Date(createdAt);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const short = bookingId.replace(/-/g, "").slice(0, 6).toUpperCase();
  return `MT-${yyyy}${mm}-${short}`;
}

export async function generateBookingInvoicePdf(bookingId: string): Promise<{ pdfBase64: string; invoiceNo: string; filename: string }> {
  const { data: booking, error } = await supabaseAdmin
    .from("bookings")
    .select("id, user_id, created_at, vehicle_name, vehicle_plate, plan_id, plan_label, plan_price, deposit, free_km, km_price_cents, start_date, start_hour, pickup_code, addons, addons_total_cents")
    .eq("id", bookingId)
    .maybeSingle();
  if (error || !booking) throw new Error("Buchung nicht gefunden");

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("email, first_name, last_name, account_type, company_name, vat_id")
    .eq("id", booking.user_id)
    .maybeSingle();

  // Fahrgestellnummer (VIN) aus vehicles per Kennzeichen holen
  let vin: string | null = null;
  if (booking.vehicle_plate) {
    const { data: veh } = await supabaseAdmin
      .from("vehicles")
      .select("vin")
      .eq("plate", booking.vehicle_plate)
      .maybeSingle();
    vin = (veh?.vin ?? null) as string | null;
  }

  const customerName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "Kunde";
  const customerEmail = profile?.email ?? "";
  const isBusiness = profile?.account_type === "business";
  const companyName = (profile?.company_name ?? "").trim();
  const vatId = (profile?.vat_id ?? "").trim();
  const addons: Addon[] = Array.isArray(booking.addons) ? (booking.addons as Addon[]) : [];

  // Beträge in Cent, brutto (so wurden sie kassiert). MwSt. 19% wird herausgerechnet.
  const VAT_RATE = 0.19;
  const rentGrossC = Math.round(Number(booking.plan_price ?? 0) * 100);
  const depositGrossC = Math.round(Number(booking.deposit ?? 0) * 100);
  const addonItems = addons.map((a) => ({ label: a.label, grossC: a.price_cents }));

  const splitVat = (grossC: number) => {
    const netC = Math.round(grossC / (1 + VAT_RATE));
    const vatC = grossC - netC;
    return { netC, vatC, grossC };
  };
  const rentSplit = splitVat(rentGrossC);
  const addonSplits = addonItems.map((a) => ({ label: a.label, ...splitVat(a.grossC) }));
  const serviceNetC = rentSplit.netC + addonSplits.reduce((s, a) => s + a.netC, 0);
  const serviceVatC = rentSplit.vatC + addonSplits.reduce((s, a) => s + a.vatC, 0);
  const serviceGrossC = rentSplit.grossC + addonSplits.reduce((s, a) => s + a.grossC, 0);
  const totalC = serviceGrossC + depositGrossC;
  const toEur = (c: number) => c / 100;

  const startStr = fmtDateTime(booking.start_date, booking.start_hour);
  const ret = computePlanReturn(booking.plan_id, new Date(`${booking.start_date}T00:00:00`), booking.start_hour);
  const returnStr = ret.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) + " Uhr";

  const invoiceNo = invoiceNumber(booking.id, booking.created_at);
  const today = fmtDate(new Date());

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]); // A4
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const black = rgb(0, 0, 0);
  const grey = rgb(0.4, 0.4, 0.4);
  const line = rgb(0.85, 0.85, 0.85);

  let y = 800;
  const left = 50;
  const right = 545;

  // Header — Logo statt Text
  let logoDrawn = false;
  try {
    let origin = "https://mytransporter.org";
    try {
      const req = getRequest();
      const proto = req.headers.get("x-forwarded-proto") ?? "https";
      const host = req.headers.get("host");
      if (host) origin = `${proto}://${host}`;
    } catch {
      // kein Request-Kontext (z.B. Hintergrund-Job) — Fallback nutzen
    }
    const logoRes = await fetch(`${origin}${logoAsset.url}`);
    if (logoRes.ok) {
      const logoBytes = new Uint8Array(await logoRes.arrayBuffer());
      const logoImg = await pdf.embedPng(logoBytes);
      const logoH = 42;
      const logoW = (logoImg.width / logoImg.height) * logoH;
      page.drawImage(logoImg, { x: left, y: y - logoH + 16, width: logoW, height: logoH });
      logoDrawn = true;
    }
  } catch {
    // Fallback unten
  }
  if (!logoDrawn) {
    page.drawText("MyTransporter", { x: left, y, font: bold, size: 20, color: black });
  }
  page.drawText("RECHNUNG", { x: right - bold.widthOfTextAtSize("RECHNUNG", 16), y, font: bold, size: 16, color: black });
  y -= 18;
  page.drawText("Transporter-Vermietung", { x: left, y, font, size: 10, color: grey });
  y -= 12;
  page.drawText("info@mytransporter.org", { x: left, y, font, size: 10, color: grey });
  y -= 12;
  page.drawText("mytransporter.org", { x: left, y, font, size: 10, color: grey });
  y -= 12;
  page.drawText("USt-IdNr.: DE328715703", { x: left, y, font, size: 10, color: grey });

  y -= 30;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, color: line, thickness: 1 });

  // Meta
  y -= 24;
  const metaLabel = (label: string, value: string, yy: number) => {
    page.drawText(label, { x: right - 220, y: yy, font, size: 10, color: grey });
    page.drawText(value, { x: right - font.widthOfTextAtSize(value, 10), y: yy, font: bold, size: 10, color: black });
  };
  metaLabel("Rechnungsnummer", invoiceNo, y);
  y -= 14;
  metaLabel("Rechnungsdatum", today, y);
  y -= 14;
  metaLabel("Buchungs-Code", booking.pickup_code, y);

  // Customer block (left)
  let cy = y + 28;
  page.drawText("Rechnung an", { x: left, y: cy, font: bold, size: 10, color: grey });
  cy -= 14;
  if (isBusiness && companyName) {
    page.drawText(companyName, { x: left, y: cy, font: bold, size: 11, color: black });
    cy -= 13;
    if (customerName && customerName !== "Kunde") {
      page.drawText(`z.Hd. ${customerName}`, { x: left, y: cy, font, size: 10, color: black });
      cy -= 13;
    }
    if (vatId) {
      page.drawText(`USt-IdNr.: ${vatId}`, { x: left, y: cy, font, size: 10, color: black });
      cy -= 13;
    }
  } else {
    page.drawText(customerName, { x: left, y: cy, font: bold, size: 11, color: black });
    cy -= 13;
  }
  if (customerEmail) {
    page.drawText(customerEmail, { x: left, y: cy, font, size: 10, color: black });
  }

  y -= 60;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, color: line, thickness: 1 });

  // Leistungszeitraum
  y -= 22;
  page.drawText("Leistungszeitraum", { x: left, y, font: bold, size: 11, color: black });
  y -= 16;
  page.drawText(`Fahrzeug: ${booking.vehicle_name} · ${booking.vehicle_plate}`, { x: left, y, font, size: 10, color: black });
  if (vin) {
    y -= 13;
    page.drawText(`Fahrgestellnummer (FIN): ${vin}`, { x: left, y, font, size: 10, color: black });
  }
  y -= 13;
  page.drawText(`Abholung: ${startStr}`, { x: left, y, font, size: 10, color: black });
  y -= 13;
  page.drawText(`Rückgabe spätestens: ${returnStr}`, { x: left, y, font, size: 10, color: black });

  // Items table mit Spalten: Position · Netto · MwSt 19% · Brutto
  const colNetX = 330;
  const colVatX = 410;
  const colGrossX = right; // rechtsbündig

  y -= 28;
  page.drawText("Position", { x: left, y, font: bold, size: 10, color: grey });
  const drawRight = (text: string, x: number, yy: number, f = font, size = 10, color = grey) => {
    page.drawText(text, { x: x - f.widthOfTextAtSize(text, size), y: yy, font: f, size, color });
  };
  drawRight("Netto", colNetX, y, bold);
  drawRight("MwSt 19%", colVatX, y, bold);
  drawRight("Brutto", colGrossX, y, bold);
  y -= 6;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, color: line, thickness: 1 });

  const itemRow = (label: string, netC: number | null, vatC: number | null, grossC: number, opts?: { sub?: string }) => {
    y -= 18;
    page.drawText(label, { x: left, y, font, size: 11, color: black });
    drawRight(netC == null ? "—" : fmtEur(toEur(netC)), colNetX, y, font, 11, black);
    drawRight(vatC == null ? "—" : fmtEur(toEur(vatC)), colVatX, y, font, 11, black);
    drawRight(fmtEur(toEur(grossC)), colGrossX, y, font, 11, black);
    if (opts?.sub) {
      y -= 12;
      page.drawText(opts.sub, { x: left, y, font, size: 9, color: grey });
    }
  };

  itemRow(`Miete · ${booking.plan_label}`, rentSplit.netC, rentSplit.vatC, rentSplit.grossC);
  for (const a of addonSplits) {
    itemRow(`Zubehör · ${a.label}`, a.netC, a.vatC, a.grossC);
  }
  itemRow("Kaution", null, null, depositGrossC);
  if (booking.free_km != null) {
    y -= 14;
    page.drawText(`Inklusive ${booking.free_km} Freikilometer · darüber ${((booking.km_price_cents ?? 0) / 100).toFixed(2)} € / km`, { x: left, y, font, size: 9, color: grey });
  }

  y -= 14;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, color: line, thickness: 1 });

  // Summenblock
  const sumRow = (label: string, amountC: number, opts?: { bold?: boolean; size?: number }) => {
    y -= opts?.bold ? 22 : 16;
    const f = opts?.bold ? bold : font;
    const s = opts?.size ?? (opts?.bold ? 13 : 11);
    page.drawText(label, { x: left, y, font: f, size: s, color: black });
    const a = fmtEur(toEur(amountC));
    page.drawText(a, { x: right - f.widthOfTextAtSize(a, s), y, font: f, size: s, color: black });
  };
  sumRow("Zwischensumme netto (Miete + Zubehör)", serviceNetC);
  sumRow("zzgl. 19% USt.", serviceVatC);
  sumRow("Bruttobetrag Leistung", serviceGrossC);
  sumRow("Kaution", depositGrossC);
  sumRow("Gesamtbetrag", totalC, { bold: true });

  y -= 16;
  page.drawText("Bereits bezahlt per Kreditkarte / Stripe", { x: left, y, font, size: 10, color: grey });

  // VAT note
  y -= 28;
  page.drawText("Hinweis zur Umsatzsteuer", { x: left, y, font: bold, size: 10, color: black });
  y -= 13;
  page.drawText("Im ausgewiesenen Brutto der Leistung sind 19% Umsatzsteuer enthalten.", { x: left, y, font, size: 9, color: grey });

  // Hinweis zur Kaution
  y -= 22;
  page.drawText("Hinweis zur Kaution", { x: left, y, font: bold, size: 10, color: black });
  y -= 13;
  page.drawText("Bei beanstandungsfreier Rückgabe wird die Kaution vollständig erstattet.", { x: left, y, font, size: 9, color: grey });
  y -= 12;
  page.drawText("Bei Schäden, Verschmutzung, fehlendem Tankbeleg oder sonstigen Vertragsverstößen wird ein", { x: left, y, font, size: 9, color: grey });
  y -= 11;
  page.drawText("angemessener Betrag einbehalten und der verbleibende Rest anteilig zurückerstattet.", { x: left, y, font, size: 9, color: grey });
  y -= 12;
  page.drawText("Die Auszahlung der Kaution kann bis zu einer Woche dauern.", { x: left, y, font, size: 9, color: grey });

  // Footer
  page.drawText("Vielen Dank für deine Buchung bei MyTransporter.", { x: left, y: 60, font, size: 10, color: black });
  page.drawText("MyTransporter · info@mytransporter.org · mytransporter.org", { x: left, y: 44, font, size: 9, color: grey });

  const bytes = await pdf.save();
  // base64 encode
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as number[]);
  }
  const pdfBase64 = btoa(binary);

  return { pdfBase64, invoiceNo, filename: `MyTransporter-Rechnung-${invoiceNo}.pdf` };
}
