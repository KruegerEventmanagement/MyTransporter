// Admin-Deep-Link-Parser: kaution=list, kaution=<src>:<id>, kunde=<uuid>, Browser-Zurück.
import { describe, expect, it } from "vitest";
import { parseAdminDeepLink } from "@/lib/admin-deeplink";
import { resolvePushTarget } from "@/lib/native/push-target";

const ID = "11111111-2222-3333-4444-555555555555";

describe("parseAdminDeepLink", () => {
  it("kaution=list öffnet die Übersicht", () => {
    expect(parseAdminDeepLink("?kaution=list")).toEqual({ kind: "deposit-list" });
  });
  it("kaution=<src>:<id> öffnet die Kautionsansicht", () => {
    expect(parseAdminDeepLink(`?kaution=booking:${ID}`)).toEqual({ kind: "deposit", source: "booking", id: ID });
    expect(parseAdminDeepLink(`?kaution=manual:${ID}`)).toEqual({ kind: "deposit", source: "manual", id: ID });
  });
  it("kunde=<uuid> öffnet das Profil", () => {
    expect(parseAdminDeepLink(`?kunde=${ID}`)).toEqual({ kind: "customer", id: ID });
  });
  it("ungültige oder fehlende Werte fallen auf null (Zurücksetzen)", () => {
    expect(parseAdminDeepLink("")).toBeNull();
    expect(parseAdminDeepLink("?kaution=booking:keine-uuid")).toBeNull();
    expect(parseAdminDeepLink("?kaution=sonstiges")).toBeNull();
    expect(parseAdminDeepLink("?kunde=nope")).toBeNull();
  });
});

describe("resolvePushTarget mit Liste", () => {
  it("kaution=list ist ein sicheres Push-Ziel", () => {
    expect(resolvePushTarget("/admin?kaution=list")).toBe("/admin?kaution=list");
  });
});

describe("Service-Worker-Zielparser", () => {
  it("kaution=list und Kautionslinks bleiben erhalten", async () => {
    // @ts-expect-error CJS-Hilfsdatei ohne Typen
    const { mtResolveTarget } = await import("../../public/sw-target.js");
    expect(mtResolveTarget("https://mytransporter.org/admin?kaution=list", "https://mytransporter.org")).toBe("/admin?kaution=list");
    expect(mtResolveTarget(`https://mytransporter.org/admin?kaution=booking:${ID}`, "https://mytransporter.org")).toBe(`/admin?kaution=booking%3A${ID}`);
    expect(mtResolveTarget("https://evil.example/admin?kaution=list", "https://mytransporter.org")).toBe("/");
  });
});
