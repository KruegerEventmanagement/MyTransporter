import { describe, expect, it } from "vitest";
import { createFakeSupabase } from "@/test/fake-supabase";
import { evaluateReturnKm, missingReturnEvidence, REQUIRED_RETURN_TAGS, generateReturnCode } from "./trip-return";
import { parseReportInput, performReturnReport } from "./trip-return.server";

const ID = "11111111-2222-3333-4444-555555555555";
const allPhotos = REQUIRED_RETURN_TAGS.map((t) => ({ photo_type: t }));
const booking = (o: Record<string, unknown> = {}) => ({
  id: ID,
  user_id: "u1",
  status: "active",
  plan_id: "km",
  start_km: 100,
  free_km: 0,
  km_price_cents: 90,
  return_code: null,
  return_review_reason: null,
  ...o,
});
const input = (o: Record<string, unknown> = {}) =>
  parseReportInput({ bookingId: ID, endKm: 150, endFuelPercent: 80, endKmManual: true, exceptions: {}, ...o });

describe("Rückgabe-Nachweise und Kilometer", () => {
  it("fehlende Kategorien; begründete Ausnahme deckt nur ihre Kategorien", () => {
    expect(missingReturnEvidence([], {})).toEqual([...REQUIRED_RETURN_TAGS]);
    const rest = missingReturnEvidence(
      allPhotos.map((p) => p.photo_type).filter((t) => t !== "tank_receipt" && t !== "post_fuel"),
      { receipt: "Tankstelle hatte keinen Drucker" },
    );
    expect(rest).toEqual(["post_fuel"]);
    expect(missingReturnEvidence([], { photos: "kurz" })).toContain("post_front");
  });
  it("Endstand 0 zulässig; kleinerer Endstand → manuelle Prüfung statt 0 berechnen", () => {
    expect(evaluateReturnKm({ planId: "km", startKm: 0, endKm: 0, freeKm: 0, kmPriceCents: 90 })).toMatchObject({ driven: 0, chargeCents: 0, reviewReason: null });
    const odd = evaluateReturnKm({ planId: "24h", startKm: 399999, endKm: 120, freeKm: 200, kmPriceCents: 45 });
    expect(odd.chargeCents).toBeNull();
    expect(odd.extra).toBeNull();
    expect(odd.reviewReason).toMatch(/manuelle Prüfung/);
  });
  it("Code ohne verwechselbare Zeichen", () => {
    expect(generateReturnCode()).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  });
  it("Eingabe wird validiert", () => {
    expect(() => parseReportInput({ bookingId: "x", endKm: 1 })).toThrow();
    expect(() => parseReportInput({ bookingId: ID, endKm: -1 })).toThrow();
    expect(() => parseReportInput({ bookingId: ID, endKm: 1, endFuelPercent: 101 })).toThrow();
    expect(parseReportInput({ bookingId: ID, endKm: 0 }).endKm).toBe(0);
  });
});

describe("performReturnReport", () => {
  it("meldet einmal, filtert auf Nutzer, setzt returning und benachrichtigt Admin", async () => {
    const f = createFakeSupabase();
    f.on("bookings", "select", { data: booking(), error: null });
    f.on("trip_photos", "select", { data: allPhotos, error: null });
    f.on("bookings", "update", { data: [{ id: ID }], error: null });
    const r = await performReturnReport(f.client, "u1", input(), { code: () => "ABC234" });
    expect(r).toMatchObject({ ok: true, returnCode: "ABC234", alreadyReported: false });
    const sel = f.calls.find((c) => c.table === "bookings" && c.op === "select")!;
    expect(sel.filters).toEqual(expect.arrayContaining([["id", ID], ["user_id", "u1"]]));
    const upd = f.calls.find((c) => c.op === "update")!;
    expect(upd.values).toMatchObject({ status: "returning", return_code: "ABC234", end_km: 150, extra_km: 50, extra_km_charge_cents: 4500, end_km_manual: true });
    expect(f.calls.filter((c) => c.table === "admin_notifications")).toHaveLength(1);
  });
  it("verlorene Antwort / Reload: vorhandener Code, kein Update, keine zweite Benachrichtigung", async () => {
    const f = createFakeSupabase();
    f.on("bookings", "select", { data: booking({ status: "returning", return_code: "OLD777" }), error: null });
    const r = await performReturnReport(f.client, "u1", input());
    expect(r).toMatchObject({ ok: true, returnCode: "OLD777", alreadyReported: true });
    expect(f.calls.some((c) => c.op === "update")).toBe(false);
    expect(f.calls.some((c) => c.table === "admin_notifications")).toBe(false);
  });
  it("Doppelklick parallel: Verlierer übernimmt Gewinner-Code ohne Nebenaktion", async () => {
    const f = createFakeSupabase();
    f.on("bookings", "select", { data: booking(), error: null }, { data: booking({ status: "returning", return_code: "WIN222" }), error: null });
    f.on("trip_photos", "select", { data: allPhotos, error: null });
    f.on("bookings", "update", { data: [], error: null });
    const r = await performReturnReport(f.client, "u1", input(), { code: () => "LOS333" });
    expect(r).toMatchObject({ ok: true, returnCode: "WIN222", alreadyReported: true });
    expect(f.calls.some((c) => c.table === "admin_notifications")).toBe(false);
  });
  it("fremde, beendete oder stornierte Buchung: keine Rückgabe", async () => {
    const f = createFakeSupabase();
    f.on("bookings", "select", { data: null, error: null });
    expect(await performReturnReport(f.client, "fremd", input())).toMatchObject({ ok: false });
    f.on("bookings", "select", { data: booking({ status: "cancelled" }), error: null });
    expect(await performReturnReport(f.client, "u1", input())).toMatchObject({ ok: false });
    expect(f.calls.some((c) => c.op === "update")).toBe(false);
  });
  it("fehlende Fotos blockieren; begründete Ausnahme + Tacho-Problem 399999 → Prüfung", async () => {
    const f = createFakeSupabase();
    f.on("bookings", "select", { data: booking({ plan_id: "24h", start_km: 399999 }), error: null });
    f.on("trip_photos", "select", { data: [], error: null });
    const blocked = await performReturnReport(f.client, "u1", input());
    expect(blocked).toMatchObject({ ok: false });
    expect((blocked as { missing: string[] }).missing).toContain("post_fuel");

    f.on("trip_photos", "select", { data: allPhotos.filter((p) => p.photo_type !== "tank_receipt"), error: null });
    f.on("bookings", "update", { data: [{ id: ID }], error: null });
    const ok = await performReturnReport(f.client, "u1", input({ endKm: 120, exceptions: { receipt: "Beleg verloren an der Kasse" } }), { code: () => "REV444" });
    expect(ok).toMatchObject({ ok: true });
    const upd = f.calls.find((c) => c.op === "update")!.values as Record<string, unknown>;
    expect(upd.extra_km_charge_cents).toBeNull();
    expect(String(upd.return_review_reason)).toMatch(/kleiner als Start.*Tankbeleg fehlt/);
    expect(upd.return_exceptions).toEqual({ receipt: "Beleg verloren an der Kasse" });
  });
});

describe("v2 Pflichtnachweise", async () => {
  const { missingReturnEvidence, requiredReturnTagsV2, RETURN_V2_CORE_TAGS } = await import("./trip-return");
  it("genau 6 Kernfotos, Tankbeleg nur bei Tanken", () => {
    expect(RETURN_V2_CORE_TAGS).toEqual(["post_front", "post_back", "post_left", "post_right", "post_interior", "post_dashboard"]);
    expect(requiredReturnTagsV2(false)).toHaveLength(6);
    expect(requiredReturnTagsV2(true)).toEqual([...RETURN_V2_CORE_TAGS, "tank_receipt"]);
  });
  it("Altfotos Tacho+Tank decken Instrumentenfoto; Ausnahme photos deckt nur Fahrzeugfotos", () => {
    const mode = { flow: "v2" as const, refueled: false };
    expect(missingReturnEvidence(["post_front", "post_back", "post_left", "post_right", "post_interior", "post_odometer", "post_fuel"], {}, mode)).toEqual([]);
    expect(missingReturnEvidence([], { photos: "[Technisches Problem] Kamera kaputt" }, mode)).toEqual(["post_dashboard"]);
    expect(missingReturnEvidence(["post_front"], {}, null)).toContain("post_front_right");
  });
});
