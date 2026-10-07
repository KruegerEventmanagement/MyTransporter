import { BUSINESS_OFFICE, BUSINESS_OFFICE_ADDRESS } from "@/lib/seo";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { computePlanReturn } from "@/lib/booking-rules";
import { embedBrandLogo } from "@/lib/brand-logo.server";

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

export async function generateBookingInvoicePdf(
  bookingId: string,
  opts: { archive?: boolean } = {},
): Promise<{ pdfBase64: string; invoiceNo: string; filename: string; archiveId?: string | null }> {
  const { data: booking, error } = await supabaseAdmin
    .from("bookings")
    .select("id, user_id, created_at, vehicle_name, vehicle_plate, plan_id, plan_label, plan_price, deposit, free_km, km_price_cents, start_date, start_hour, pickup_code, addons, addons_total_cents, status, deposit_status, coupon_code, discount_cents")
    .eq("id", bookingId)
    .maybeSingle();
  if (error || !booking) throw new Error("Buchung nicht gefunden");

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("email, first_name, last_name, account_type, company_name, vat_id, address_street, address_postal_code, address_city, address_country")
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
  let logoBottomY = y; // untere Kante des Logos, damit Text nicht überlappt
  try {
    const logoImg = await embedBrandLogo(pdf);
    if (logoImg) {
      const logoH = 48;
      const logoW = (logoImg.width / logoImg.height) * logoH;
      const logoY = y - logoH + 16;
      page.drawImage(logoImg, { x: left, y: logoY, width: logoW, height: logoH });
      logoBottomY = logoY;
      logoDrawn = true;
    }
  } catch {
    // Fallback unten
  }
  if (!logoDrawn) {
    page.drawText("MyTransporter", { x: left, y, font: bold, size: 20, color: black });
    logoBottomY = y - 4;
  }
  page.drawText("RECHNUNG", { x: right - bold.widthOfTextAtSize("RECHNUNG", 16), y, font: bold, size: 16, color: black });
  // Absenderblock beginnt unterhalb des Logos, damit nichts überlappt
  y = logoBottomY - 14;
  page.drawText("Transporter-Vermietung", { x: left, y, font, size: 10, color: grey });
  y -= 12;
  page.drawText(BUSINESS_OFFICE_ADDRESS, { x: left, y, font, size: 10, color: grey });

  y -= 20;
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

  // Leistung
  y -= 22;
  page.drawText("Leistung", { x: left, y, font: bold, size: 11, color: black });
  y -= 16;
  page.drawText(`Fahrzeug: ${booking.vehicle_name} · ${booking.vehicle_plate}`, { x: left, y, font, size: 10, color: black });
  if (vin) {
    y -= 13;
    page.drawText(`Fahrgestellnummer (FIN): ${vin}`, { x: left, y, font, size: 10, color: black });
  }
  y -= 13;
  page.drawText(`Abholung: ${startStr}`, { x: left, y, font, size: 10, color: black });
  y -= 13;
  page.drawText(`Rückgabe: ${returnStr}`, { x: left, y, font, size: 10, color: black });

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
    if (a.label.startsWith("Kilometerpaket")) {
      // Kurz in der Zeile, Details (berücksichtigter Tarif) in zweiter Zeile – kein Überlappen der Beträge.
      const m = /^Kilometerpaket:\s*(.+?)(?:\s*\((.+)\))?$/.exec(a.label);
      itemRow(`Kilometerpaket · ${m?.[1] ?? ""}`.trim(), a.netC, a.vatC, a.grossC, m?.[2] ? { sub: m[2] } : undefined);
    } else {
      itemRow(`Zubehör · ${a.label}`, a.netC, a.vatC, a.grossC);
    }
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

  // Footer mit vollständigen Kontakt- und Bankdaten
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
  page.drawText(BUSINESS_OFFICE.street, { x: c1, y: fy, font, size: 9, color: grey });
  page.drawText("USt-IdNr.: DE328715703", { x: c2, y: fy, font, size: 9, color: grey });
  page.drawText("Finom Payments", { x: c3, y: fy, font, size: 9, color: grey });
  fy -= 11;
  page.drawText(`${BUSINESS_OFFICE.postalCode} ${BUSINESS_OFFICE.locality}`, { x: c1, y: fy, font, size: 9, color: grey });
  page.drawText("mytransporter.org", { x: c2, y: fy, font, size: 9, color: grey });
  page.drawText("IBAN: DE44 1001 8000 0164 8885 87", { x: c3, y: fy, font, size: 9, color: grey });
  fy -= 11;
  page.drawText("info@mytransporter.org", { x: c1, y: fy, font, size: 9, color: grey });
  page.drawText("", { x: c2, y: fy, font, size: 9, color: grey });
  page.drawText("BIC: FNOMDEB2", { x: c3, y: fy, font, size: 9, color: grey });

  page.drawText("Vielen Dank für deine Buchung bei MyTransporter.", { x: left, y: 40, font, size: 10, color: black });

  const bytes = await pdf.save();
  // base64 encode
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as number[]);
  }
  const pdfBase64 = btoa(binary);

  const filename = `MyTransporter-Rechnung-${invoiceNo}.pdf`;
  let archiveId: string | null = null;
  if (opts.archive !== false) {
    // Belegarchiv: Fehler hier dürfen Bestätigung/Rechnungsversand nie blockieren,
    // werden aber für den Admin protokolliert.
    try {
      const { archiveIssuedDocument } = await import("@/lib/document-archive.server");
      const now = new Date();
      const docDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const billingAddress = {
        street: profile?.address_street ?? null,
        postal_code: profile?.address_postal_code ?? null,
        city: profile?.address_city ?? null,
        country: profile?.address_country ?? null,
        vat_id: vatId || null,
        account_type: profile?.account_type ?? null,
      };
      const items = [
        { label: `Miete · ${booking.plan_label}`, net_cents: rentSplit.netC, vat_cents: rentSplit.vatC, gross_cents: rentSplit.grossC, vat_rate: VAT_RATE },
        ...addonSplits.map((a) => ({ label: a.label, net_cents: a.netC, vat_cents: a.vatC, gross_cents: a.grossC, vat_rate: VAT_RATE })),
        { label: "Kaution", net_cents: null, vat_cents: null, gross_cents: depositGrossC, vat_rate: null },
      ];
      const res = await archiveIssuedDocument({
        kind: "invoice",
        source: "booking",
        documentNumber: invoiceNo,
        documentDate: docDate,
        bookingId: booking.id,
        userId: booking.user_id,
        customerName: customerName === "Kunde" ? null : customerName,
        customerCompany: isBusiness && companyName ? companyName : null,
        customerEmail: customerEmail || null,
        billingAddress,
        items,
        netCents: serviceNetC,
        vatRate: VAT_RATE,
        vatCents: serviceVatC,
        grossCents: serviceGrossC,
        nonTaxableCents: depositGrossC,
        totalCents: totalC,
        paymentStatus: "paid",
        snapshot: {
          invoice_no: invoiceNo,
          invoice_date: docDate,
          booking: {
            id: booking.id, pickup_code: booking.pickup_code, status: booking.status,
            deposit_status: booking.deposit_status, vehicle_name: booking.vehicle_name,
            vehicle_plate: booking.vehicle_plate, vin, plan_id: booking.plan_id,
            plan_label: booking.plan_label, start: startStr, return: returnStr,
            free_km: booking.free_km, km_price_cents: booking.km_price_cents,
            coupon_code: booking.coupon_code, discount_cents: booking.discount_cents,
          },
          customer: { name: customerName, email: customerEmail, company: companyName || null, ...billingAddress },
          items,
          totals: { net_cents: serviceNetC, vat_rate: VAT_RATE, vat_cents: serviceVatC, gross_cents: serviceGrossC, deposit_cents: depositGrossC, total_cents: totalC },
          payment_note: "Bereits bezahlt per Kreditkarte / Stripe",
        },
        pdfBase64,
        filename,
      });
      archiveId = res.id;
    } catch (e) {
      const msg = String((e as Error)?.message ?? e).slice(0, 300);
      console.warn("Belegarchiv fehlgeschlagen:", msg);
      try {
        await supabaseAdmin.from("admin_notifications").insert({
          type: "document_archive_failed",
          title: "Rechnung nicht archiviert",
          body: `Rechnung ${invoiceNo} (Buchung ${booking.id}): ${msg}`,
          booking_id: booking.id,
        });
      } catch {
        /* optional */
      }
    }
  }

  return { pdfBase64, invoiceNo, filename, archiveId };
}
