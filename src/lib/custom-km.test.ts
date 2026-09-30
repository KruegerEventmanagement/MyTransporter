import { describe, expect, it } from "vitest";
import {
  customKmLabel, customKmMetadata, paidCustomKmCents, parseCustomKmInput, quoteCustomKm,
  readCustomKmSnapshot, CUSTOM_KM_ADDON_ID, isPhysicalAddon,
} from "./custom-km";
import { bookingFreeKm, getPlanById, planCatalog, resolveCheckoutKmSnapshot, VEHICLE_CLASSES, KM_CATALOG_VERSION } from "./booking-rules";
import { quoteRental } from "./rental-quote";
import { resolveAddonSelection } from "./addons";

const eur = (planId: string, km: number, c: "l1h1" | "l4h2" | "l5h2" = "l1h1") => quoteCustomKm(planId, c, km)!.totalRentCents / 100;

describe("Beispiele L1H1", () => {
  it("24 h", () => {
    expect([200, 300, 400, 500, 503, 700, 800, 803].map((k) => eur("24h_300", k))).toEqual([99, 144, 189, 189, 190.35, 279, 299, 300.35]);
    const q = quoteCustomKm("24h_300", "l1h1", 503)!;
    expect([q.consideredPlanId, q.contractKm, q.surchargeCents, q.rateCents]).toEqual(["24h_500", 503, 9135, 45]);
    expect(customKmLabel(q)).toContain("berechnet über");
    expect(quoteCustomKm("24h_300", "l1h1", 400)!.contractKm).toBe(500);
  });
  it("Mehrtage/Woche", () => {
    expect([600, 900, 1200].map((k) => eur("multi_3d", k))).toEqual([269, 374, 479]);
    expect(eur("multi_3d", 900, "l4h2")).toBe(404);
    expect(eur("multi_3d", 900, "l5h2")).toBe(420);
    expect(eur("multi_7d", 1400)).toBe(499);
    expect(eur("multi_7d", 2000)).toBe(673);
    expect(quoteCustomKm("multi_7d", "l1h1", 2000)!.rateCents).toBe(29);
  });
  it("500/800-Grenzen ±1 km", () => {
    expect(eur("24h_300", 499)).toBe(189);
    expect(eur("24h_300", 501)).toBe(189.45);
    expect(eur("24h_300", 799)).toBe(298.55);
    expect(eur("24h_300", 801)).toBe(299.45);
  });
});

describe("Regeln", () => {
  it("≤ enthalten → 0 € Aufschlag, volles Kontingent, keine Gutschrift", () => {
    for (const k of [0, 100, 200]) {
      const q = quoteCustomKm("24h_300", "l1h1", k)!;
      expect([q.surchargeCents, q.contractKm]).toEqual([0, 200]);
    }
    expect(quoteCustomKm("multi_3d", "l1h1", 0)!.totalRentCents).toBe(26900);
  });
  it("bewusst gewählter 500/800-Tarif wird nicht herabgestuft", () => {
    const q = quoteCustomKm("24h_800", "l1h1", 100)!;
    expect([q.surchargeCents, q.contractKm, q.consideredPlanId]).toEqual([0, 800, "24h_800"]);
    expect(quoteCustomKm("24h_500", "l1h1", 700)!.surchargeCents).toBe(9000); // 800er statt 500+200×0,45
  });
  it("kein Dauerwechsel: 3h/6h bleiben bei eigenem Satz", () => {
    const q = quoteCustomKm("3h", "l1h1", 167)!;
    expect([q.consideredPlanId, q.surchargeCents]).toEqual(["3h", 4500]);
  });
  it("jede Klasse × Tarif: nie negativ, Kontingent ≥ Original, monoton", () => {
    for (const c of VEHICLE_CLASSES) for (const p of planCatalog(c)) {
      let prev = -1;
      for (let k = 0; k <= 3000; k += 37) {
        const q = quoteCustomKm(p.id, c, k)!;
        expect(q.surchargeCents).toBeGreaterThanOrEqual(0);
        expect(q.contractKm).toBeGreaterThanOrEqual(p.freeKm);
        expect(q.contractKm).toBeGreaterThanOrEqual(k);
        expect(q.totalRentCents).toBeGreaterThanOrEqual(prev);
        prev = q.totalRentCents;
      }
    }
  });
  it("km-Tarif/ungültig → null", () => {
    expect(quoteCustomKm("km", "l1h1", 100)).toBeNull();
    for (const v of [-1, 1.5, Number.NaN, 30001]) expect(quoteCustomKm("24h_300", "l1h1", v)).toBeNull();
  });
});

describe("Eingabe", () => {
  it("streng", () => {
    expect(parseCustomKmInput("503")).toEqual({ ok: true, value: 503 });
    expect(parseCustomKmInput("30000")).toEqual({ ok: true, value: 30000 });
    expect(parseCustomKmInput("0")).toEqual({ ok: true, value: 0 });
    for (const bad of ["", " ", "-5", "12,5", "12.5", "1e3", "abc", "30001", "NaN"]) expect(parseCustomKmInput(bad).ok).toBe(false);
  });
});

describe("Anfragerechner unverändert", () => {
  it("gleiche Beträge wie vorher", () => {
    const t3 = { startDate: "2026-10-05", startTime: "09:00", endDate: "2026-10-08", endTime: "09:00" };
    const q = quoteRental({ ...t3, desiredKm: 900 }, "l1h1");
    expect(q.ok && q.totalEur).toBe(374);
    const t30 = { ...t3, endDate: "2026-11-04" };
    const l = quoteRental({ ...t30, desiredKm: 2667 }, "l1h1");
    expect(l.ok && l.totalEur).toBe(999);
  });
});

/** Mock-Pipeline: Checkout-Positionen → Metadata → Webhook-Snapshot → Buchung → Rückgabe/Storno. */
describe("Checkout → Webhook → Buchung (gemockt, ohne Stripe)", () => {
  function checkout(planId: string, cls: "l1h1" | "l4h2" | "l5h2", customKm: number | null, addonIds: string[], discountCents: number) {
    const plan = getPlanById(planId, cls)!;
    const rent = plan.price * 100;
    const q = customKm != null ? quoteCustomKm(planId, cls, customKm) : null;
    const pkg = q && q.surchargeCents > 0 ? q : null;
    const lines = [rent - discountCents, ...(pkg ? [pkg.surchargeCents] : []), ...addonIds.map((a) => resolveAddonSelection(a)!.priceCents), 20000];
    const md: Record<string, string> = {
      planId, kmCatalog: KM_CATALOG_VERSION,
      freeKm: String(pkg ? pkg.contractKm : plan.freeKm), kmPriceCents: String(pkg ? pkg.rateCents : plan.extraKmCents),
      ...(pkg ? customKmMetadata(pkg) : {}),
    };
    return { lines, md };
  }
  function webhook(md: Record<string, string>, planId: string, cls: "l1h1" | "l4h2" | "l5h2", addonIds: string[], discountCents: number) {
    const s = readCustomKmSnapshot(md, planId);
    if (s.kind === "invalid") return { error: s.reason };
    const base = resolveCheckoutKmSnapshot(md, planId, cls);
    const addons = [...addonIds.map((a) => ({ id: a, label: "x", price_cents: resolveAddonSelection(a)!.priceCents })), ...(s.kind === "ok" ? [s.addon] : [])];
    return {
      plan_price: (getPlanById(planId, cls)!.price * 100 - discountCents) / 100,
      free_km: s.kind === "ok" ? s.contractKm : base.freeKm,
      km_price_cents: s.kind === "ok" ? s.rateCents : base.kmPriceCents,
      addons, addons_total_cents: addons.reduce((x, a) => x + a.price_cents, 0), deposit: 200,
    };
  }
  it("3 d + 900 km + Umzugspaket + 10 % Gutschein: Summen stimmen, Rückgabe korrekt", () => {
    const { lines, md } = checkout("multi_3d", "l1h1", 900, ["umzugspaket"], 2690);
    const b = webhook(md, "multi_3d", "l1h1", ["umzugspaket"], 2690) as Exclude<ReturnType<typeof webhook>, { error: string }>;
    const stripeTotal = lines.reduce((a, c) => a + c, 0);
    expect(Math.round(b.plan_price * 100) + b.addons_total_cents + b.deposit * 100).toBe(stripeTotal);
    expect(lines).toContain(10500); // Paket nicht rabattiert
    expect([b.free_km, b.km_price_cents]).toEqual([900, 35]);
    const extra = (driven: number) => Math.max(0, driven - bookingFreeKm("multi_3d", b.free_km)) * b.km_price_cents;
    expect(extra(900)).toBe(0);
    expect(extra(901)).toBe(35);
    expect(paidCustomKmCents(b.addons)).toBe(10500);
    expect(b.addons.filter(isPhysicalAddon).map((a) => a.id)).toEqual(["umzugspaket"]);
  });
  it("24 h + 503 km: bis 503 frei, 504 → 0,45 €", () => {
    const { md } = checkout("24h_300", "l1h1", 503, [], 0);
    const b = webhook(md, "24h_300", "l1h1", [], 0) as { free_km: number; km_price_cents: number; addons: Array<{ id: string; price_cents: number }> };
    expect([b.free_km, b.km_price_cents]).toEqual([503, 45]);
    expect(b.addons[0]).toMatchObject({ id: CUSTOM_KM_ADDON_ID, price_cents: 9135 });
  });
  it("ohne Paket: alte und neue Sessions unverändert", () => {
    expect(readCustomKmSnapshot({}, "multi_3d")).toEqual({ kind: "none" });
    expect(webhook({ planId: "multi_3d" }, "multi_3d", "l1h1", [], 0)).toMatchObject({ free_km: 900, km_price_cents: 35, addons_total_cents: 0 });
    const { md } = checkout("multi_3d", "l1h1", null, [], 0);
    expect(webhook(md, "multi_3d", "l1h1", [], 0)).toMatchObject({ free_km: 600, km_price_cents: 35 });
  });
  it("defekter Snapshot → Fehler, nie stiller Grundtarif", () => {
    const { md } = checkout("multi_3d", "l1h1", 900, [], 0);
    expect("error" in webhook({ ...md, ckSurcharge: "abc" }, "multi_3d", "l1h1", [], 0)).toBe(true);
    expect("error" in webhook({ ...md, ckContract: "100" }, "multi_3d", "l1h1", [], 0)).toBe(true);
    expect("error" in webhook({ ...md, ckV: "ckm-9" }, "multi_3d", "l1h1", [], 0)).toBe(true);
    expect("error" in webhook(md, "multi_2d", "l1h1", [], 0)).toBe(true);
  });
  it("Snapshot wird nicht aus aktuellem Katalog neu berechnet", () => {
    const { md } = checkout("multi_3d", "l1h1", 900, [], 0);
    const s = readCustomKmSnapshot({ ...md, ckSurcharge: "9999" }, "multi_3d");
    expect(s.kind === "ok" && s.surchargeCents).toBe(9999);
  });
  it("Storno-Erstattung enthält Kilometerpaket", () => {
    expect(paidCustomKmCents([{ id: "umzugspaket", price_cents: 2900 }, { id: CUSTOM_KM_ADDON_ID, price_cents: 10500 }])).toBe(10500);
    expect(paidCustomKmCents(null)).toBe(0);
  });
});
