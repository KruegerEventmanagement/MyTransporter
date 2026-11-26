// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from "vitest";
import {
  buildPartnerRedirect, capturePartnerRef, computePartnerCommission, getPartnerRef, isWithinAttributionWindow,
  partnerTrackingUrl, safeTargetPath, PARTNER_REF_STORAGE_KEY,
} from "@/lib/partner-tracking";
import { handlePartnerScan } from "@/lib/partner-scan";
import { attachPartnerAttribution, validatePartnerVisit } from "@/lib/partner-attribution.server";
import { assertPartnerAdmin, partnerStats, savePartner, validatePartnerInput } from "@/lib/partners-admin";

const VISIT = "11111111-2222-4333-8444-555555555555";
const NOW = new Date("2026-11-26T12:00:00Z");

describe("QR-Ziel und Weiterleitung", () => {
  it("OBI-Link ist der dauerhafte Link unter eigener Domain", () => {
    expect(partnerTrackingUrl("obi-leonberg")).toBe("https://mytransporter.org/q/obi-leonberg");
  });
  it("leitet nur auf interne Pfade (kein offener Redirect)", () => {
    expect(safeTargetPath("//evil.com")).toBe("/");
    expect(safeTargetPath("https://evil.com")).toBe("/");
    expect(safeTargetPath("/\\evil.com")).toBe("/");
    expect(safeTargetPath("/preise")).toBe("/preise");
    expect(buildPartnerRedirect("/", VISIT)).toBe(`/?mt_ref=${VISIT}`);
    expect(buildPartnerRedirect("/", "nicht-uuid")).toBe("/");
  });
  it("Scan zählt Aufruf und leitet auf die Website", async () => {
    const res = await handlePartnerScan("obi-leonberg", { lookup: async () => ({ id: "p1", target_path: "/" }), recordVisit: async () => VISIT });
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe(`/?mt_ref=${VISIT}`);
  });
  it("öffnet die Website auch bei Trackingfehler oder unbekanntem Partner", async () => {
    const broken = await handlePartnerScan("obi-leonberg", { lookup: async () => ({ id: "p1", target_path: "/" }), recordVisit: async () => { throw new Error("db down"); } });
    expect(broken.headers.get("Location")).toBe("/");
    const down = await handlePartnerScan("obi-leonberg", { lookup: async () => { throw new Error("x"); }, recordVisit: async () => VISIT });
    expect(down.headers.get("Location")).toBe("/");
    const unknown = await handlePartnerScan("../../etc", { lookup: async () => ({ id: "p1", target_path: "/" }), recordVisit: async () => VISIT });
    expect(unknown.headers.get("Location")).toBe("/");
  });
});

describe("Attribution über Registrierung/Login hinweg", () => {
  beforeEach(() => localStorage.clear());
  it("merkt die Aufruf-ID, entfernt sie aus der Adresse und behält sie nach Seitenwechsel/Login", () => {
    history.replaceState(null, "", `/?mt_ref=${VISIT}&x=1`);
    expect(capturePartnerRef()).toBe(VISIT);
    expect(location.search).toBe("?x=1");
    history.replaceState(null, "", "/auth");
    expect(capturePartnerRef()).toBe(VISIT);
    expect(getPartnerRef()).toBe(VISIT);
  });
  it("letzter Partnerkontakt gewinnt", () => {
    const other = "99999999-2222-4333-8444-555555555555";
    history.replaceState(null, "", `/?mt_ref=${VISIT}`); capturePartnerRef();
    history.replaceState(null, "", `/?mt_ref=${other}`); capturePartnerRef();
    expect(getPartnerRef()).toBe(other);
  });
  it("ignoriert lokal abgelaufene Kontakte", () => {
    localStorage.setItem(PARTNER_REF_STORAGE_KEY, JSON.stringify({ ref: VISIT, seenAt: "2020-01-01T00:00:00Z" }));
    expect(getPartnerRef()).toBeNull();
  });
  it("Fenster: 30 Tage", () => {
    expect(isWithinAttributionWindow("2026-10-28T12:00:00Z", NOW)).toBe(true);
    expect(isWithinAttributionWindow("2026-10-26T11:59:00Z", NOW)).toBe(false);
  });
});

function fakeDb(visit: any, store: any[] = []) {
  return {
    from(t: string) {
      if (t === "partner_visits") {
        const q: any = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: visit, error: null }) };
        return q;
      }
      return {
        upsert: async (row: any, opt: any) => {
          if (!store.some((r) => r.booking_id === row.booking_id)) store.push(row);
          expect(opt.ignoreDuplicates).toBe(true);
          return { error: null };
        },
      };
    },
  };
}
const visit = (o: any = {}) => ({ id: VISIT, visited_at: "2026-11-20T10:00:00Z", partners: { id: "p1", slug: "obi-leonberg", active: true, commission_rate_bp: 1000, ...o } });

describe("Serverseitige Zuordnung", () => {
  it("friert Satz ein und ist bei doppelten Webhooks idempotent", async () => {
    const store: any[] = [];
    const db = fakeDb(visit(), store);
    expect(await attachPartnerAttribution(db, "b1", VISIT, NOW)).toBe("attached");
    await attachPartnerAttribution(db, "b1", VISIT, NOW);
    expect(store).toHaveLength(1);
    expect(store[0].commission_rate_bp).toBe(1000);
    expect(store[0].partner_slug).toBe("obi-leonberg");
  });
  it("lehnt deaktivierte Partner, alte Scans und ungültige IDs ab", async () => {
    expect(await validatePartnerVisit(fakeDb(visit({ active: false })), VISIT, NOW)).toBeNull();
    expect(await validatePartnerVisit(fakeDb({ ...visit(), visited_at: "2026-09-01T00:00:00Z" }), VISIT, NOW)).toBeNull();
    expect(await attachPartnerAttribution(fakeDb(visit()), "b1", "x' or 1=1", NOW)).toBe("skipped");
  });
});

describe("Adminzugriff", () => {
  const ctx = (isAdmin: boolean) => ({ userId: "u", supabase: { rpc: async () => ({ data: isAdmin, error: null }), from: () => { throw new Error("darf nicht lesen"); } } });
  it("Nicht-Admins bekommen weder Statistik noch Verwaltung", async () => {
    await expect(assertPartnerAdmin(ctx(false))).rejects.toThrow("Nicht autorisiert");
    await expect(partnerStats(ctx(false), { from: null, to: null })).rejects.toThrow("Nicht autorisiert");
    await expect(savePartner(ctx(false), validatePartnerInput({ slug: "x", name: "X", commissionPercent: 10, targetPath: "/" }))).rejects.toThrow("Nicht autorisiert");
  });
  it("Zielseite muss intern sein", () => {
    expect(() => validatePartnerInput({ slug: "a", name: "A", commissionPercent: 10, targetPath: "https://evil.com" })).toThrow();
  });
});

describe("Provision", () => {
  const b = (o: any = {}) => ({ status: "paid", plan_price: 89.1, addons_total_cents: 1500, ...o });
  it("10 % der bezahlten Miete ohne Kaution, centgenau", () => {
    const c = computePartnerCommission(b(), [], 1000);
    expect(c.baseCents).toBe(10410);
    expect(c.commissionCents).toBe(1041);
  });
  it("Kautionserstattungen mindern nichts, Teilerstattung der Miete schon, doppelte Events zählen einmal", () => {
    const refunds = [
      { refund_id: "re_dep", amount_cents: 20000, status: "succeeded", allocation: "deposit" },
      { refund_id: "re_1", amount_cents: 2005, status: "succeeded", allocation: "cancellation" },
      { refund_id: "re_1", amount_cents: 2005, status: "succeeded", allocation: "cancellation" },
      { refund_id: "re_f", amount_cents: 5000, status: "failed", allocation: "cancellation" },
    ];
    const c = computePartnerCommission(b(), refunds, 1000);
    expect(c.baseCents).toBe(8405);
    expect(c.commissionCents).toBe(841);
  });
  it("keine Provision bei Storno oder Volländerstattung", () => {
    expect(computePartnerCommission(b({ status: "cancelled" }), [], 1000).commissionCents).toBe(0);
    expect(computePartnerCommission(b({ status: "pending" }), [], 1000).commissionCents).toBe(0);
    expect(computePartnerCommission(b(), [{ refund_id: "r", amount_cents: 99999, status: "succeeded", allocation: "cancellation" }], 1000).commissionCents).toBe(0);
  });
  it("nutzt den an der Buchung gesicherten Satz", () => {
    expect(computePartnerCommission(b(), [], 500).commissionCents).toBe(521);
  });
});
