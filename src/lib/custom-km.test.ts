import { describe, expect, it } from "vitest";
import {
  customKmLabel, paidCustomKmCents, parseCustomKmInput, quoteCustomKm,
  CUSTOM_KM_ADDON_ID, isPhysicalAddon,
} from "./custom-km";
import { planCatalog, VEHICLE_CLASSES } from "./booking-rules";
import { quoteRental } from "./rental-quote";

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
    expect([600, 900, 1200].map((k) => eur("multi_3d", k))).toEqual([269, 404, 539]);
    expect(eur("multi_3d", 900, "l4h2")).toBe(434);
    expect(eur("multi_3d", 900, "l5h2")).toBe(450);
    expect(eur("multi_7d", 1400)).toBe(499);
    expect(eur("multi_7d", 2000)).toBe(769);
    expect(quoteCustomKm("multi_7d", "l1h1", 2000)!.rateCents).toBe(45);
  });
  it("500/800-Grenzen ±1 km", () => {
    expect(eur("24h_300", 499)).toBe(189);
    expect(eur("24h_300", 501)).toBe(189.45);
    expect(eur("24h_300", 799)).toBe(299); // 800er-Paket günstiger als 500 + 299 × 0,45
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

describe("Anfragerechner (Katalog 0,45 €)", () => {
  it("gleiche Beträge wie vorher", () => {
    const t3 = { startDate: "2026-10-05", startTime: "09:00", endDate: "2026-10-08", endTime: "09:00" };
    const q = quoteRental({ ...t3, desiredKm: 900 }, "l1h1");
    expect(q.ok && q.totalEur).toBe(404);
    const t30 = { ...t3, endDate: "2026-11-04" };
    const l = quoteRental({ ...t30, desiredKm: 2667 }, "l1h1");
    expect(l.ok && l.totalEur).toBe(999);
  });
});

describe("Storno", () => {
  it("Erstattung enthält Kilometerpaket", () => {
    expect(paidCustomKmCents([{ id: "umzugspaket", price_cents: 2900 }, { id: CUSTOM_KM_ADDON_ID, price_cents: 13500 }])).toBe(13500);
    expect(paidCustomKmCents(null)).toBe(0);
    expect(isPhysicalAddon({ id: CUSTOM_KM_ADDON_ID })).toBe(false);
  });
});
