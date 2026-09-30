import { describe, expect, it } from "vitest";
import { quoteRental } from "@/lib/rental-quote";
import { EXTRA_KM_CENTS_BY_CLASS, getPlanById, planCatalog, VEHICLE_CLASSES } from "@/lib/booking-rules";
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
      expect(EXTRA_KM_CENTS_BY_CLASS[c]).toEqual({ day: 45, multi: 35, week: 29 });
      const cat = planCatalog(c);
      expect(cat.find((p) => p.id === "3h")!.extraKmCents).toBe(45);
      expect(cat.find((p) => p.id === "24h_800")!.extraKmCents).toBe(45);
      expect(cat.find((p) => p.id === "multi_6d")!.extraKmCents).toBe(35);
      expect(cat.find((p) => p.id === "multi_7d")!.extraKmCents).toBe(29);
      expect(getPlanById("week_x3", c)!.extraKmCents).toBe(29);
      expect(LONG_TERM_KM_CONFIG[c].returnExtraKmEur).toBe(0.29);
    }
  });
});

describe("quoteRental", () => {
  it("3 Tage / 900 km: Standardtarif, keine Gutschrift", () => {
    const exp = { l1h1: 269, l4h2: 299, l5h2: 315 } as const;
    for (const c of VEHICLE_CLASSES) {
      const q = ok(quoteRental({ ...t3, desiredKm: 900 }, c));
      expect(q.kind).toBe("standard");
      expect(q.planId).toBe("multi_3d");
      expect(q.totalEur).toBe(exp[c]);
      expect(q.includedKm).toBe(900);
      expect(q.creditEur).toBe(0);
      expect(q.depositEur).toBe(200);
      expect(q.returnExtraKmEur).toBe(0.35);
    }
  });
  it("3 Tage / 1.200 km: 300 Mehr-km × 0,35", () => {
    expect(ok(quoteRental({ ...t3, desiredKm: 1200 }, "l1h1")).totalEur).toBe(374);
    expect(ok(quoteRental({ ...t3, desiredKm: 1200 }, "l4h2")).totalEur).toBe(404);
    expect(ok(quoteRental({ ...t3, desiredKm: 1200 }, "l5h2")).totalEur).toBe(420);
  });
  it("3 Tage / 0 km: keine Gutschrift auf Standardpaket", () => {
    expect(ok(quoteRental({ ...t3, desiredKm: 0 }, "l1h1")).totalEur).toBe(269);
  });
  it("30 Tage / 4.000 km: Monatsanker je Klasse", () => {
    const exp = { l1h1: 999, l4h2: 1399, l5h2: 1699 } as const;
    for (const c of VEHICLE_CLASSES) {
      const q = ok(quoteRental({ ...t30, desiredKm: 4000 }, c));
      expect(q.kind).toBe("long_term");
      expect(q.totalEur).toBe(exp[c]);
      expect(q.extraKm).toBe(0);
      expect(q.contractKm).toBe(4000);
    }
  });
  it("Staffelgrenzen", () => {
    expect(extraKmCostEur(1000, "l4h2")).toBe(290);
    expect(extraKmCostEur(5000, "l5h2")).toBe(290 + 880);
    expect(extraKmCostEur(5001, "l1h1")).toBe(1170.18);
    const q = ok(quoteRental({ ...t30, desiredKm: 5000 }, "l1h1"));
    expect(q.totalEur).toBe(1289);
    expect(q.contractKm).toBe(5000);
  });
  it("1 Tag: günstigster 24h-Tarif je km", () => {
    const d = { startDate: "2026-10-05", startTime: "09:00", endDate: "2026-10-06", endTime: "09:00" };
    expect(ok(quoteRental({ ...d, desiredKm: 300 }, "l1h1")).planId).toBe("24h_300");
    expect(ok(quoteRental({ ...d, desiredKm: 800 }, "l1h1")).planId).toBe("24h_800");
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
    for (const s of ["LEO MY 102", "269,00 €", "300 km × 0,35 €", "374,00 €", "Kaution", "200,00 €", "unverbindliche", "maximal 100 km/h"]) {
      expect(m).toContain(s);
    }
  });
});

describe("Langzeit: angefragtes Kontingent = Wunschkilometer", () => {
  const cases: Array<[number, number, number, number]> = [
    // km, total, credit, contractKm
    [2500, 924, 75, 2500],
    [4000, 999, 0, 4000],
    [5000, 1289, 0, 5000],
    [0, 899.1, 99.9, 0],
  ];
  for (const [kmv, total, credit, contract] of cases) {
    it(`30 Tage / ${kmv} km`, () => {
      const q = ok(quoteRental({ ...t30, desiredKm: kmv }, "l1h1"));
      expect(q.totalEur).toBe(total);
      expect(q.creditEur).toBe(credit);
      expect(q.includedKm).toBe(4000);
      expect(q.contractKm).toBe(contract);
      const label = returnLabel(q);
      expect(label).toContain(`über ${contract.toLocaleString("de-DE")} km`);
      const mail = buildRequestMail({ name: "Van", plate: "PF MY 1003" }, "l1h1", q, t30);
      expect(mail).toContain("Grundtarifbasis: 4.000 km");
      expect(mail).toContain(`Angefragtes Kontingent: ${contract.toLocaleString("de-DE")} km`);
      expect(mail).toContain(label);
    });
  }
  it("Standard 3 Tage unverändert", () => {
    const q = ok(quoteRental({ ...t3, desiredKm: 1200 }, "l1h1"));
    expect([q.includedKm, q.contractKm, q.extraKmCostEur, q.creditEur]).toEqual([900, 900, 105, 0]);
    expect(returnLabel(q)).toBe("Mehrkilometer bei Rückgabe über 900 km");
  });
});
