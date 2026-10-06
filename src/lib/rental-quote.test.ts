import { describe, expect, it } from "vitest";
import { checkoutKmCatalogError, KM_CATALOG_OUTDATED_MESSAGE } from "./booking-rules";
import { quoteRental } from "@/lib/rental-quote";
import { EXTRA_KM_CENTS_BY_CLASS, getPlanById, planCatalog, VEHICLE_CLASSES, KM_CATALOG_VERSION, legacyFreeKmFor, resolveCheckoutKmSnapshot, bookingFreeKm, KM_TARIFF_CENTS_PER_KM } from "@/lib/booking-rules";
import { longTermFreeKm } from "@/lib/long-term";
import { extraKmCostEur, LONG_TERM_KM_CONFIG, LONG_TERM_MAX_KM, rentalDaysFromDateTimes } from "@/lib/long-term";
import { buildRequestMail, returnLabel } from "@/components/LongTermPlanner";

const t3 = { startDate: "2026-10-05", startTime: "09:00", endDate: "2026-10-08", endTime: "09:00" };
const t30 = { startDate: "2026-10-05", startTime: "09:00", endDate: "2026-11-04", endTime: "09:00" };
const ok = (q: ReturnType<typeof quoteRental>) => {
  if (!q.ok) throw new Error("not ok");
  return q;
};

describe("Katalog unverändert", () => {
  it("3 Tage multi_3d je Klasse", () => {
    expect(getPlanById("multi_3d", "l1h1")!.price).toBe(269);
    expect(getPlanById("multi_3d", "l4h2")!.price).toBe(299);
    expect(getPlanById("multi_3d", "l5h2")!.price).toBe(315);
  });
  it("Mehrkilometer 0,45/0,35/0,29 für alle Klassen, gleich wie vorher", () => {
    for (const c of VEHICLE_CLASSES) {
      expect(EXTRA_KM_CENTS_BY_CLASS[c]).toEqual({ day: 45, multi: 45, week: 45 });
      const cat = planCatalog(c);
      expect(cat.find((p) => p.id === "3h")!.extraKmCents).toBe(45);
      expect(cat.find((p) => p.id === "24h_800")!.extraKmCents).toBe(45);
      expect(cat.find((p) => p.id === "multi_6d")!.extraKmCents).toBe(45);
      expect(cat.find((p) => p.id === "multi_7d")!.extraKmCents).toBe(45);
      expect(getPlanById("week_x3", c)!.extraKmCents).toBe(45);
      expect(LONG_TERM_KM_CONFIG[c].returnExtraKmEur).toBe(0.45);
    }
  });
});

describe("quoteRental", () => {
  it("3 Tage / 600 km: Standardtarif, keine Gutschrift", () => {
    const exp = { l1h1: 269, l4h2: 299, l5h2: 315 } as const;
    for (const c of VEHICLE_CLASSES) {
      const q = ok(quoteRental({ ...t3, desiredKm: 600 }, c));
      expect(q.kind).toBe("standard");
      expect(q.planId).toBe("multi_3d");
      expect(q.totalEur).toBe(exp[c]);
      expect(q.includedKm).toBe(600);
      expect(q.creditEur).toBe(0);
      expect(q.depositEur).toBe(200);
      expect(q.returnExtraKmEur).toBe(0.45);
    }
  });
  it("3 Tage / 900 km: 300 Mehr-km × 0,45 = 135 €", () => {
    expect(ok(quoteRental({ ...t3, desiredKm: 900 }, "l1h1")).totalEur).toBe(404);
    expect(ok(quoteRental({ ...t3, desiredKm: 900 }, "l4h2")).totalEur).toBe(434);
    expect(ok(quoteRental({ ...t3, desiredKm: 900 }, "l5h2")).totalEur).toBe(450);
    expect(ok(quoteRental({ ...t3, desiredKm: 900 }, "l1h1")).extraKmCostEur).toBe(135);
    expect(ok(quoteRental({ ...t3, desiredKm: 1200 }, "l1h1")).totalEur).toBe(539);
  });
  it("3 Tage / 0 km: keine Gutschrift auf Standardpaket", () => {
    expect(ok(quoteRental({ ...t3, desiredKm: 0 }, "l1h1")).totalEur).toBe(269);
  });
  it("30 Tage / 2.667 km: Monatsanker je Klasse", () => {
    const exp = { l1h1: 999, l4h2: 1399, l5h2: 1699 } as const;
    for (const c of VEHICLE_CLASSES) {
      const q = ok(quoteRental({ ...t30, desiredKm: 2667 }, c));
      expect(q.kind).toBe("long_term");
      expect(q.totalEur).toBe(exp[c]);
      expect(q.extraKm).toBe(0);
      expect(q.includedKm).toBe(2667);
      expect(q.contractKm).toBe(2667);
    }
  });
  it("Staffelgrenzen", () => {
    expect(extraKmCostEur(1000, "l4h2")).toBe(290);
    expect(extraKmCostEur(5000, "l5h2")).toBe(290 + 880);
    expect(extraKmCostEur(5001, "l1h1")).toBe(1170.18);
    const q = ok(quoteRental({ ...t30, desiredKm: 5000 }, "l1h1"));
    expect(q.totalEur).toBe(1582.26);
    expect(q.contractKm).toBe(5000);
  });
  it("1 Tag: günstigster 24h-Tarif je km", () => {
    const d = { startDate: "2026-10-05", startTime: "09:00", endDate: "2026-10-06", endTime: "09:00" };
    expect(ok(quoteRental({ ...d, desiredKm: 300 }, "l1h1")).planId).toBe("24h_300");
    expect(ok(quoteRental({ ...d, desiredKm: 800 }, "l1h1")).planId).toBe("24h_300");
    const h3 = { ...d, endDate: "2026-10-05", endTime: "12:00" };
    expect(ok(quoteRental({ ...h3, desiredKm: 50 }, "l1h1")).planId).toBe("3h");
  });
  it("ungültige Eingaben", () => {
    expect(quoteRental({ ...t3, endDate: "2026-10-04", desiredKm: 100 }, "l1h1").ok).toBe(false);
    expect(quoteRental({ ...t3, endDate: "2026-02-31", desiredKm: 100 }, "l1h1").ok).toBe(false);
    expect(quoteRental({ ...t3, startTime: "", desiredKm: 100 }, "l1h1").ok).toBe(false);
    expect(quoteRental({ ...t3, desiredKm: Number.NaN }, "l1h1").ok).toBe(false);
    expect(quoteRental({ ...t3, desiredKm: -1 }, "l1h1").ok).toBe(false);
    expect(quoteRental({ ...t3, desiredKm: LONG_TERM_MAX_KM + 1 }, "l1h1").ok).toBe(false);
    expect(quoteRental({ ...t30, desiredKm: LONG_TERM_MAX_KM }, "l1h1").ok).toBe(true);
  });
  it("Uhrzeitwechsel über Tagesgrenze ändert Tage", () => {
    expect(rentalDaysFromDateTimes("2026-10-05", "09:00", "2026-10-08", "10:00")).toBe(3);
    expect(rentalDaysFromDateTimes("2026-10-05", "09:00", "2026-10-08", "10:01")).toBe(4);
    expect(ok(quoteRental({ ...t3, endTime: "10:30", desiredKm: 900 }, "l1h1")).planId).toBe("multi_4d");
  });
  it("Anfragemail enthält alle Posten", () => {
    const q = ok(quoteRental({ ...t3, desiredKm: 1200 }, "l1h1"));
    const m = buildRequestMail({ name: "Citroen Jumper L1H1", plate: "LEO MY 102" }, "l1h1", q, t3, true);
    for (const s of ["LEO MY 102", "269,00 €", "600 km × 0,45 €", "539,00 €", "Kaution", "200,00 €", "unverbindliche", "maximal 100 km/h"]) {
      expect(m).toContain(s);
    }
  });
});

describe("Langzeit: angefragtes Kontingent = Wunschkilometer", () => {
  const cases: Array<[number, number, number, number]> = [
    // km, total, credit, contractKm
    [2500, 990.65, 8.35, 2500],
    [4000, 1362.26, 0, 4000],
    [5000, 1582.26, 0, 5000],
    [0, 899.1, 99.9, 0],
  ];
  for (const [kmv, total, credit, contract] of cases) {
    it(`30 Tage / ${kmv} km`, () => {
      const q = ok(quoteRental({ ...t30, desiredKm: kmv }, "l1h1"));
      expect(q.totalEur).toBe(total);
      expect(q.creditEur).toBe(credit);
      expect(q.includedKm).toBe(2667);
      expect(q.contractKm).toBe(contract);
      const label = returnLabel(q);
      expect(label).toContain(`über ${contract.toLocaleString("de-DE")} km`);
      const mail = buildRequestMail({ name: "Van", plate: "PF MY 1003" }, "l1h1", q, t30);
      expect(mail).toContain("Grundtarifbasis: 2.667 km");
      expect(mail).toContain(`Angefragtes Kontingent: ${contract.toLocaleString("de-DE")} km`);
      expect(mail).toContain(label);
    });
  }
  it("Standard 3 Tage unverändert", () => {
    const q = ok(quoteRental({ ...t3, desiredKm: 900 }, "l1h1"));
    expect([q.includedKm, q.contractKm, q.extraKmCostEur, q.creditEur]).toEqual([600, 600, 135, 0]);
    expect(returnLabel(q)).toBe("Mehrkilometer bei Rückgabe über 600 km");
  });
});

describe("Km-Reduktion um ein Drittel (2/3)", () => {
  const NEW: Record<string, number> = { "3h": 60, "6h": 120, "24h_300": 480, "24h_500": 500, "24h_800": 800, multi_2d: 400, multi_3d: 600, multi_4d: 800, multi_5d: 1000, multi_6d: 1200, multi_7d: 1400 };
  const PRICES: Record<string, [number, number]> = { "3h": [49, 59], "6h": [69, 79], "24h_300": [99, 109], "24h_500": [189, 199], "24h_800": [299, 309], multi_2d: [189, 209], multi_3d: [269, 299], multi_4d: [339, 379], multi_5d: [399, 449], multi_6d: [449, 509], multi_7d: [499, 569] };
  it("jede Klasse × jeder Tarif: neue km, unveränderte Preise", () => {
    for (const c of VEHICLE_CLASSES) for (const [id, km] of Object.entries(NEW)) {
      const p = getPlanById(id, c)!;
      expect(p.freeKm).toBe(km);
      expect(p.basePrice).toBe(PRICES[id][0]);
      expect(p.priceL4h2).toBe(PRICES[id][1]);
    }
    expect(getPlanById("multi_3d", "l5h2")!.price).toBe(315);
    expect(getPlanById("week_x3", "l1h1")!.freeKm).toBe(4200);
    expect(getPlanById("week_x3", "l1h1")!.price).toBe(1497);
    expect(getPlanById("24h_300", "l1h1")!.shortLabel).toBe("24 h · 480 km");
    expect(getPlanById("24h", "l1h1")!.freeKm).toBe(480);
  });
  it("24h: 480 km ohne Extras, 580 km = 100 × 0,45 = 45 €", () => {
    const d = { startDate: "2026-10-05", startTime: "09:00", endDate: "2026-10-06", endTime: "09:00" };
    const a = ok(quoteRental({ ...d, desiredKm: 480 }, "l1h1"));
    expect([a.planId, a.totalEur, a.extraKmCostEur]).toEqual(["24h_300", 99, 0]);
    const b = ok(quoteRental({ ...d, desiredKm: 580 }, "l1h1"));
    expect([b.planId, b.totalEur, b.extraKmCostEur]).toEqual(["24h_300", 144, 45]);
    
  });
  it("Langzeitbasis erst am Ende gerundet", () => {
    expect([7, 14, 30, 45, 60].map(longTermFreeKm)).toEqual([622, 1244, 2667, 4000, 5333]);
    expect(longTermFreeKm(7)).not.toBe(getPlanById("multi_7d")!.freeKm);
    const t45 = { ...t30, endDate: "2026-11-19" };
    const q = ok(quoteRental({ ...t45, desiredKm: 4000 }, "l1h1"));
    expect([q.includedKm, q.contractKm, q.extraKm]).toEqual([4000, 4000, 0]);
    const t60 = { ...t30, endDate: "2026-12-04" };
    expect(ok(quoteRental({ ...t60, desiredKm: 0 }, "l1h1")).includedKm).toBe(5333);
  });
  it("Legacy-Kontingente für Altbuchungen/Altsessions", () => {
    expect(legacyFreeKmFor("multi_3d")).toBe(900);
    expect(legacyFreeKmFor("24h_300")).toBe(300);
    expect(legacyFreeKmFor("24h")).toBe(300);
    expect(legacyFreeKmFor("week_x2")).toBe(4200);
    expect(legacyFreeKmFor("km")).toBeNull();
  });
  it("Webhook: alte Session ohne Version → Legacy, neue Session → Snapshot", () => {
    expect(resolveCheckoutKmSnapshot({}, "multi_3d", "l1h1")).toEqual({ freeKm: 900, kmPriceCents: 35 });
    expect(resolveCheckoutKmSnapshot({ kmCatalog: "alt" }, "24h_300", "l4h2")).toEqual({ freeKm: 300, kmPriceCents: 45 });
    expect(resolveCheckoutKmSnapshot({ kmCatalog: KM_CATALOG_VERSION, freeKm: "600", kmPriceCents: "35" }, "multi_3d", "l1h1")).toEqual({ freeKm: 600, kmPriceCents: 35 });
    // manipulierte/defekte Snapshot-Werte → nie gekürzt ohne gültigen Snapshot
    expect(resolveCheckoutKmSnapshot({ kmCatalog: KM_CATALOG_VERSION, freeKm: "abc" }, "multi_3d", "l1h1")).toEqual({ freeKm: 600, kmPriceCents: 45 });
    expect(resolveCheckoutKmSnapshot({ kmCatalog: KM_CATALOG_VERSION, freeKm: "0" }, "multi_3d", "l1h1").freeKm).toBe(0);
    expect(resolveCheckoutKmSnapshot({}, "km", "l1h1")).toEqual({ freeKm: 0, kmPriceCents: KM_TARIFF_CENTS_PER_KM });
    expect(resolveCheckoutKmSnapshot({}, "24h_800", "l1h1").freeKm).toBe(800);
  });
});

describe("Altbuchungen behalten ihre Kilometer", () => {
  const extra = (driven: number, planId: string, stored: number | null, cents: number) => Math.max(0, driven - bookingFreeKm(planId, stored)) * cents;
  it("Alt 3 Tage / 900 km gespeichert, 900 gefahren → 0 €", () => {
    expect(extra(900, "multi_3d", 900, 35)).toBe(0);
  });
  it("Alt 24h_300 / 300 km gespeichert, 300 gefahren → 0 €", () => {
    expect(extra(300, "24h_300", 300, 45)).toBe(0);
  });
  it("gespeicherte 0 km bleiben 0 (nullish statt ||)", () => {
    expect(bookingFreeKm("24h", 0)).toBe(0);
  });
  it("fehlender Snapshot → Legacy, nicht neuer Katalog", () => {
    expect(bookingFreeKm("multi_3d", null)).toBe(900);
    expect(bookingFreeKm("km", null)).toBe(0);
  });
});

describe("Alter Browser-Tab fordert neuen Checkout an", () => {
  it("fehlende oder veraltete Version → verständlicher Fehler, kein Checkout", () => {
    expect(checkoutKmCatalogError(undefined)).toBe(KM_CATALOG_OUTDATED_MESSAGE);
    expect(checkoutKmCatalogError("km-2026-01-01")).toBe(KM_CATALOG_OUTDATED_MESSAGE);
    expect(checkoutKmCatalogError(123)).toBe(KM_CATALOG_OUTDATED_MESSAGE);
    expect(KM_CATALOG_OUTDATED_MESSAGE).toBe("Tarife wurden aktualisiert. Bitte Seite neu laden und die aktuellen Konditionen prüfen.");
  });
  it("aktuelle Version → erlaubt; Kilometer bleiben Serverwerte", () => {
    expect(checkoutKmCatalogError(KM_CATALOG_VERSION)).toBeNull();
    expect(getPlanById("multi_3d", "l1h1")!.freeKm).toBe(600);
  });
  it("bereits existierende Session ohne Version behält Legacy-Werte", () => {
    expect(resolveCheckoutKmSnapshot({ planId: "multi_3d" }, "multi_3d", "l1h1").freeKm).toBe(900);
  });
});

describe("Mehrkilometer einheitlich 0,45 €", () => {
  it("neue Sessions 0,45, alte Sessions behalten ihren Satz", () => {
    expect(resolveCheckoutKmSnapshot({ kmCatalog: KM_CATALOG_VERSION, freeKm: "600", kmPriceCents: "45" }, "multi_3d", "l1h1")).toEqual({ freeKm: 600, kmPriceCents: 45 });
    // Session aus vorheriger Version (600 km, 0,35 €) bleibt exakt so
    expect(resolveCheckoutKmSnapshot({ kmCatalog: "km-2026-09-30", freeKm: "600", kmPriceCents: "35" }, "multi_3d", "l1h1")).toEqual({ freeKm: 600, kmPriceCents: 35 });
    // Session ohne Version: Legacy 900 km und Legacy-Satz, nie 0,45
    expect(resolveCheckoutKmSnapshot({}, "multi_7d", "l1h1")).toEqual({ freeKm: 2100, kmPriceCents: 29 });
    expect(checkoutKmCatalogError("km-2026-09-30")).toBe(KM_CATALOG_OUTDATED_MESSAGE);
  });
});
