import { describe, expect, it, vi } from "vitest";
import { writeFileSync } from "node:fs";
import { quoteCustomKm, customKmLabel } from "./custom-km";

// Fiktive Testdaten, kein DB-Zugriff, kein Versand.
const q = quoteCustomKm("24h_300", "l1h1", 503)!;
const booking = {
  id: "00000000-0000-4000-8000-000000000001", user_id: "u1", created_at: "2026-09-30T10:00:00Z",
  vehicle_name: "Citroen Jumper L1H1", vehicle_plate: "TEST 1", plan_id: "24h_300", plan_label: "24 h · 200 km · L1H1",
  plan_price: 99, deposit: 200, free_km: q.contractKm, km_price_cents: q.rateCents, start_date: "2026-10-05", start_hour: 9,
  pickup_code: "ABC123",
  addons: [{ id: "umzugspaket", label: "Umzugspaket", price_cents: 2900 }, { id: "km_paket", label: customKmLabel(q), price_cents: q.surchargeCents }],
  addons_total_cents: 2900 + q.surchargeCents,
};
vi.mock("@/integrations/supabase/client.server", () => {
  const rows: Record<string, unknown> = {
    bookings: booking,
    profiles: { email: "max@example.test", first_name: "Max", last_name: "Muster", account_type: "private" },
    vehicles: { vin: null },
  };
  const q2 = (t: string) => { const c: Record<string, unknown> = {}; c.select = () => c; c.eq = () => c; c.maybeSingle = async () => ({ data: rows[t], error: null }); return c; };
  return { supabaseAdmin: { from: q2 } };
});
vi.mock("@/lib/brand-logo.server", () => ({ embedBrandLogo: async () => null }));

describe("Rechnung mit Kilometerpaket (gemockt)", () => {
  it("erzeugt PDF", async () => {
    const { generateBookingInvoicePdf } = await import("./invoice-pdf.server");
    const r = await generateBookingInvoicePdf(booking.id);
    expect(r.pdfBase64.length).toBeGreaterThan(1000);
    if (process.env["INVOICE_OUT"]) writeFileSync(process.env["INVOICE_OUT"], Buffer.from(r.pdfBase64, "base64"));
  });
});
