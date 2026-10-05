import { describe, expect, it } from "vitest";
import { rewriteToRemote } from "./remote-fetch";
import { deepLinkToPath } from "./deep-links";
import { nativeCorsHeaders, withCors } from "./cors";
import { resolvePushTarget } from "./push-target";
import { mapsDirectionsUrl } from "./external";

const L = "capacitor://localhost";
const R = "https://mytransporter.org";

describe("rewriteToRemote", () => {
  it("leitet Server-Funktionen und API an den Worker", () => {
    expect(rewriteToRemote("/_serverFn/abc?x=1", L, R)).toBe(`${R}/_serverFn/abc?x=1`);
    expect(rewriteToRemote(`${L}/_serverFn/abc`, L, R)).toBe(`${R}/_serverFn/abc`);
    expect(rewriteToRemote("/api/public/x", L, R)).toBe(`${R}/api/public/x`);
  });
  it("lässt lokale Assets und fremde Hosts unverändert", () => {
    expect(rewriteToRemote("/assets/app.js", L, R)).toBe("/assets/app.js");
    expect(rewriteToRemote("/apiary", L, R)).toBe("/apiary");
    expect(rewriteToRemote("https://x.supabase.co/rest/v1/b", L, R)).toBe("https://x.supabase.co/rest/v1/b");
  });
});

describe("deepLinkToPath", () => {
  it("Universal Links für Fahrt, Zahlung und Auth", () => {
    expect(deepLinkToPath("https://www.mytransporter.org/trip/abc-123")).toBe("/trip/abc-123");
    expect(deepLinkToPath("https://mytransporter.org/checkout/return?session_id=cs_1")).toBe(
      "/checkout/return?session_id=cs_1",
    );
    expect(deepLinkToPath("https://www.mytransporter.org/auth/confirm#access_token=t")).toBe(
      "/auth/confirm#access_token=t",
    );
  });
  it("eigenes Schema", () => {
    expect(deepLinkToPath("mytransporter://trip/abc")).toBe("/trip/abc");
  });
  it("verwirft fremde Hosts, Schemata und unbekannte Pfade", () => {
    expect(deepLinkToPath("https://evil.example/trip/abc")).toBeNull();
    expect(deepLinkToPath("javascript:alert(1)")).toBeNull();
    expect(deepLinkToPath("https://www.mytransporter.org/admin")).toBeNull();
    expect(deepLinkToPath("https://www.mytransporter.org/trip/../admin")).toBeNull();
    expect(deepLinkToPath("kein link")).toBeNull();
  });
});

describe("nativeCorsHeaders", () => {
  const req = (origin: string | null, path: string) =>
    new Request(`https://www.mytransporter.org${path}`, { headers: origin ? { origin } : {} });
  it("nur App-Origins auf Server-Funktionen", () => {
    expect(nativeCorsHeaders(req("capacitor://localhost", "/_serverFn/x"))?.["access-control-allow-origin"]).toBe(
      "capacitor://localhost",
    );
    expect(nativeCorsHeaders(req("https://localhost", "/api/public/x"))).not.toBeNull();
    expect(nativeCorsHeaders(req("https://evil.example", "/_serverFn/x"))).toBeNull();
    expect(nativeCorsHeaders(req("capacitor://localhost", "/profil"))).toBeNull();
    expect(nativeCorsHeaders(req(null, "/_serverFn/x"))).toBeNull();
  });
  it("setzt keine Credentials-Freigabe", () => {
    const h = nativeCorsHeaders(req("capacitor://localhost", "/_serverFn/x"))!;
    expect(h["access-control-allow-credentials"]).toBeUndefined();
    const r = withCors(new Response("ok"), h);
    expect(r.headers.get("access-control-allow-origin")).toBe("capacitor://localhost");
  });
});

describe("resolvePushTarget / Maps", () => {
  it("öffnet exakt die Fahrt", () => {
    expect(resolvePushTarget("/trip/abc")).toBe("/trip/abc");
    expect(resolvePushTarget("//evil.example")).toBe("/");
    expect(resolvePushTarget("https://evil.example")).toBe("/");
    expect(resolvePushTarget(undefined)).toBe("/");
  });
  it("Maps-Link ist https und kodiert", () => {
    expect(mapsDirectionsUrl("Poststraße 60, 71229 Leonberg")).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=Poststra%C3%9Fe%2060%2C%2071229%20Leonberg",
    );
  });
});
