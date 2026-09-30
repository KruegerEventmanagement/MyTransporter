/**
 * Echter Checkout-Handler (runBookingCheckout) + echte Webhook-Persistenzauflösung
 * (resolveBookingPricing) mit gemocktem Stripe/Backend. Keine echten Writes.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  vehicles: [] as Array<{ name: string; model: string | null; plate: string; is_active: boolean }>,
  sessions: [] as any[],
  priceBumpEur: 0,
  coupon: { ok: true, discountCents: 0 } as any,
}));

vi.mock("@/lib/booking-rules", async (orig) => {
  const a = await orig<typeof import("@/lib/booking-rules")>();
  // Simulierte spätere Katalogänderung (Test "Katalog nach Checkout").
  const bump = (p: any): any => (p && state.priceBumpEur ? { ...p, price: p.price + state.priceBumpEur } : p);
  return {
    ...a,
    getPlanById: (id: string, c?: any) => bump(a.getPlanById(id, c)),
    planCatalog: (c: any) => a.planCatalog(c).map((p) => bump(p)!),
  };
});

function query(rows: any[]) {
  let r = rows;
  const b: any = {
    select: () => b,
    eq: (k: string, v: unknown) => ((r = r.filter((x) => x[k] === undefined || x[k] === v)), b),
    gt: () => b,
    limit: (n: number) => ((r = r.slice(0, n)), b),
    maybeSingle: async () => ({ data: r[0] ?? null, error: null }),
    then: (res: any) => res({ data: r, error: null }),
  };
  return b;
}
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (t: string) => query(t === "vehicles" ? state.vehicles : t === "booking_holds" ? [{ id: "h1" }] : []),
  },
}));
vi.mock("@/lib/stripe.server", () => ({
  createStripeClient: () => ({
    checkout: { sessions: { create: async (p: any) => (state.sessions.push(p), { client_secret: "cs_test_secret" }) } },
  }),
  getStripeErrorMessage: (e: any) => String(e?.message ?? e),
}));
vi.mock("@/lib/availability.server", () => ({ findVehicleConflicts: async () => [], conflictMessage: () => "Konflikt" }));
vi.mock("@/lib/birthday.server", () => ({ resolveCouponForRent: async () => state.coupon }));

import { runBookingCheckout, CUSTOM_KM_VEHICLE_ERROR } from "./booking-checkout.server";
import { resolveBookingPricing } from "./booking-persist";
import { KM_CATALOG_VERSION, bookingFreeKm } from "./booking-rules";
import { CUSTOM_KM_ADDON_ID, paidCustomKmCents } from "./custom-km";

const ctx = {
  userId: "user-1",
  supabase: { from: () => query(["id_front", "id_back", "license_front", "license_back"].map((doc_type) => ({ doc_type }))) },
};
const L1 = { name: "Citroen Jumper L1H1", model: "Jumper", plate: "TEST L1", is_active: true };

async function checkout(over: Record<string, unknown> = {}) {
  const res = await runBookingCheckout(
    {
      plan: "24h_300", returnUrl: "https://x.test/r", environment: "sandbox", vehiclePlate: "TEST L1",
      vehicleName: "Citroen Jumper L1H1", startDate: "2026-10-05", startHour: 9, kmCatalog: KM_CATALOG_VERSION, ...over,
    } as any,
    ctx,
  );
  const s = state.sessions.at(-1);
  const total = s ? s.line_items.reduce((t: number, l: any) => t + l.price_data.unit_amount * l.quantity, 0) : 0;
  return { res, s, total, md: s?.metadata as Record<string, string> };
}
const persist = (md: Record<string, string>, total: number, planId = md.planId!) =>
  resolveBookingPricing({
    md, planId, vehicleClass: "l1h1", addonIds: md.addonIds?.split(",") ?? [],
    couponDiscountCents: Number(md.discountCents ?? 0), paid: { amountTotal: total, currency: "eur" },
  });

beforeEach(() => {
  state.vehicles = [L1];
  state.sessions = [];
  state.priceBumpEur = 0;
  state.coupon = { ok: true, discountCents: 0 };
});

describe("echter Checkout-Handler + Webhook-Persistenz", () => {
  it("24 h + 503 km + Umzugspaket + 10 % Gutschein: Stripe-Summe = gespeicherte Summe", async () => {
    state.coupon = { ok: true, discountCents: 990, discountPercent: 10, code: "BDAY" };
    const { res, s, total, md } = await checkout({ customKm: 503, addonIds: ["umzugspaket"], couponCode: "BDAY" });
    expect("clientSecret" in res).toBe(true);
    const amounts = s.line_items.map((l: any) => l.price_data.unit_amount);
    expect(amounts).toContain(9135); // Paket, nicht rabattiert
    expect(amounts).toContain(8910); // 99 € − 10 %
    const b = persist(md, total);
    if (b.kind !== "ok") throw new Error(b.reason);
    expect(Math.round(b.planPrice * 100) + b.addonsTotalCents + 20000).toBe(total);
    expect([b.freeKm, b.kmPriceCents]).toEqual([503, 45]);
    expect(b.addons.map((a) => a.id)).toEqual(["umzugspaket", CUSTOM_KM_ADDON_ID]);
    expect(Object.keys(md).length).toBeLessThanOrEqual(50);
    expect(Object.values(md).every((v) => v.length <= 500)).toBe(true);
  });

  it("Katalogänderung nach Checkout ändert gespeicherten Snapshot nicht", async () => {
    const { total, md } = await checkout({ customKm: 503 });
    state.priceBumpEur = 50;
    const b = persist(md, total);
    if (b.kind !== "ok") throw new Error(b.reason);
    expect(b.planPrice).toBe(99);
    expect(b.addonsTotalCents).toBe(9135);
    expect(Math.round(b.planPrice * 100) + b.addonsTotalCents + 20000).toBe(total);
  });

  it("3 d mit 900 km vorab: 404 € + 200 € Kaution, Rückgabe ohne Doppelberechnung", async () => {
    const { total, md } = await checkout({ plan: "multi_3d", customKm: 900 });
    expect(total).toBe(40400 + 20000);
    const b = persist(md, total);
    if (b.kind !== "ok") throw new Error(b.reason);
    const extra = (driven: number) => Math.max(0, driven - bookingFreeKm("multi_3d", b.freeKm)) * b.kmPriceCents;
    expect([extra(900), extra(901)]).toEqual([0, 45]);
    expect(paidCustomKmCents(b.addons)).toBe(13500);
  });

  it("falsches/inaktives/mehrdeutiges DB-Fahrzeug → klarer Fehler, keine Session", async () => {
    state.vehicles = [];
    expect((await checkout({ customKm: 503, vehicleClass: "l1h1" })).res).toEqual({ error: CUSTOM_KM_VEHICLE_ERROR });
    state.vehicles = [{ ...L1, is_active: false }];
    expect((await checkout({ customKm: 503 })).res).toEqual({ error: CUSTOM_KM_VEHICLE_ERROR });
    state.vehicles = [L1, L1];
    expect((await checkout({ customKm: 503 })).res).toEqual({ error: CUSTOM_KM_VEHICLE_ERROR });
    expect(state.sessions).toHaveLength(0);
  });

  it("Klasse kommt aus DB, nicht aus Browserangabe", async () => {
    state.vehicles = [{ name: "Citroen Jumper L4H2", model: "Jumper", plate: "TEST L1", is_active: true }];
    const { md } = await checkout({ plan: "multi_3d", customKm: 900, vehicleClass: "l1h1", vehicleName: "L1H1" });
    expect(md.ckCls).toBe("l4h2");
    expect(md.ckSurcharge).toBe("13500");
    expect(md.ckRentFull).toBe("29900");
  });

  it("defekte / fehlende / alte ckV und falscher Stripe-Betrag → invalid, nie Grundtarif", async () => {
    const { total, md } = await checkout({ customKm: 503 });
    const { ckV: _v, ...noV } = md;
    expect(persist(noV, total).kind).toBe("invalid");
    expect(persist({ ...md, ckV: "ckm-1" }, total).kind).toBe("invalid");
    expect(persist({ ...md, ckSurcharge: "abc" }, total).kind).toBe("invalid");
    expect(persist({ ...md, ckSurcharge: "9999" }, total).kind).toBe("invalid"); // Summe passt nicht
    expect(persist(md, total - 1).kind).toBe("invalid");
    expect(persist(md, total, "multi_2d").kind).toBe("invalid");
    expect(resolveBookingPricing({ md, planId: md.planId!, vehicleClass: "l1h1", addonIds: [], couponDiscountCents: 0, paid: { amountTotal: total, currency: "usd" } }).kind).toBe("invalid");
  });

  it("Kaution aus vollständigem Snapshot wird durchgereicht; ohne Paket 200 €", async () => {
    const { total, md } = await checkout({ customKm: 503 });
    const alt = { ...md, ckDep: "15000", ckTot: String(Number(md.ckTot) - 5000) };
    const b = persist(alt, total - 5000);
    expect(b.kind === "ok" && b.deposit).toBe(150);
    expect((persist(md, total) as any).deposit).toBe(200);
    const legacy = persist({ planId: "24h_300" }, 29900);
    expect(legacy.kind === "ok" && legacy.deposit).toBe(200);
  });

  it("ohne Paket (leer/aus) keine ck-Felder; alte Session 35 ct bleibt 35 ct", async () => {
    const { md, total } = await checkout({ customKm: null });
    expect(Object.keys(md).some((k) => k.startsWith("ck"))).toBe(false);
    expect(total).toBe(9900 + 20000);
    const b = persist(md, total);
    expect(b.kind === "ok" && [b.freeKm, b.kmPriceCents]).toEqual([200, 45]);
    const old = resolveBookingPricing({ md: { planId: "multi_3d" }, planId: "multi_3d", vehicleClass: "l1h1", addonIds: [], couponDiscountCents: 0, paid: { amountTotal: 46900, currency: "eur" } });
    expect(old.kind === "ok" && [old.freeKm, old.kmPriceCents]).toEqual([900, 35]);
    // gespeicherte Altbuchung: Kontingent strikt aus DB
    expect(bookingFreeKm("24h_300", 300)).toBe(300);
  });
});
