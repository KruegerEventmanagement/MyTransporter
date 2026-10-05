// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { clearReturnDraft, loadReturnDraft, loadTripNav, saveReturnDraft, saveTripNav } from "./return-draft";

beforeEach(() => localStorage.clear());

describe("Rückgabeentwurf", () => {
  it("speichert Schritt, Zähler, Tank, Ausnahmen, Code – pro Nutzer und Buchung", () => {
    saveReturnDraft("u1", "b1", { started: true, step: "km", endKm: "0", endFuelPercent: "60", exceptions: { fuel: "Anzeige defekt seit Abholung" }, returnCode: "ABC234" }, 10);
    const d = loadReturnDraft("u1", "b1")!;
    expect(d).toMatchObject({ step: "km", endKm: "0", endFuelPercent: "60", returnCode: "ABC234", started: true });
    expect(loadReturnDraft("u2", "b1")).toBeNull();
    expect(loadReturnDraft("u1", "b2")).toBeNull();
  });
  it("älterer Stand überschreibt keinen neueren", () => {
    saveReturnDraft("u1", "b1", { step: "receipt" }, 200);
    saveReturnDraft("u1", "b1", { step: "photos" }, 100);
    expect(loadReturnDraft("u1", "b1")!.step).toBe("receipt");
  });
  it("keine Fotodaten im localStorage", () => {
    saveReturnDraft("u1", "b1", { step: "photos" });
    expect(localStorage.getItem("mt_return_draft_v1:u1:b1")).not.toMatch(/data:image|base64/);
    clearReturnDraft("u1", "b1");
    expect(loadReturnDraft("u1", "b1")).toBeNull();
  });
  it("Navigation: Ziel/Route/Nav-Modus/GPS-Ablehnung bleiben, ungültige Daten verworfen", () => {
    saveTripNav("u1", "b1", { destination: { lat: 48.8, lng: 9, label: "Stuttgart" }, routeIndex: 2, navMode: true, gpsChoice: "declined" });
    expect(loadTripNav("u1", "b1")).toMatchObject({ routeIndex: 2, navMode: true, gpsChoice: "declined" });
    expect(loadTripNav("u2", "b1").destination).toBeNull();
    localStorage.setItem("mt_trip_nav_v1:u1:b1", JSON.stringify({ destination: { lat: "x" }, navMode: true }));
    expect(loadTripNav("u1", "b1")).toMatchObject({ destination: null, navMode: false });
  });
});

describe("Service-Worker-Ziel", () => {
  const { mtResolveTarget } = createRequire(import.meta.url)("../../public/sw-target.js") as {
    mtResolveTarget: (u: unknown, o: string) => string;
  };
  const O = "https://www.mytransporter.org";
  const T = "/trip/11111111-2222-3333-4444-555555555555";
  it("öffnet exakt /trip/ID same-origin, nie fremde Hosts", () => {
    expect(mtResolveTarget(T, O)).toBe(T);
    expect(mtResolveTarget(`${O}${T}`, O)).toBe(T);
    expect(mtResolveTarget(`https://evil.example${T}`, O)).toBe("/");
    expect(mtResolveTarget("//evil.example/trip/x", O)).toBe("/");
    expect(mtResolveTarget("/trip/../admin", O)).toBe("/admin");
    expect(mtResolveTarget("/trip/abc", O)).toBe("/");
    expect(mtResolveTarget("/admin", O)).toBe("/admin");
    expect(mtResolveTarget(undefined, O)).toBe("/");
  });
});
