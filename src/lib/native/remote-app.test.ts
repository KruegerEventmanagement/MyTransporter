import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import config, { LIVE_URL } from "../../../capacitor.config";
import { detectNative, isLocalShellOrigin } from "./platform";
import { renderErrorPage } from "../error-page";

describe("App lädt Live-Website", () => {
  it("server.url ist die HTTPS-Produktions-URL mit Offline-Seite", () => {
    expect(LIVE_URL).toBe("https://mytransporter.org");
    expect(config.server?.url).toBe("https://mytransporter.org");
    expect(config.server?.cleartext).toBe(false);
    expect(config.server?.errorPath).toBe("offline.html");
  });
  it("Offline-Seite existiert und bietet Erneut versuchen", () => {
    const html = readFileSync("public/offline.html", "utf8");
    expect(html).toContain("Erneut versuchen");
    expect(html).toContain("https://mytransporter.org/");
  });
});

describe("Laufzeit-Erkennung", () => {
  it("erkennt Capacitor ohne Build-Flag", () => {
    expect(detectNative({ Capacitor: { isNativePlatform: () => true } })).toBe(true);
    expect(detectNative({ Capacitor: { isNativePlatform: () => false } })).toBe(false);
    expect(detectNative({})).toBe(false);
    expect(detectNative(undefined)).toBe(false);
  });
  it("lokale WebView-Origins nie für Stripe/Mail", () => {
    expect(isLocalShellOrigin("capacitor://localhost")).toBe(true);
    expect(isLocalShellOrigin("https://localhost")).toBe(true);
    expect(isLocalShellOrigin("https://mytransporter.org")).toBe(false);
  });
});

describe("Fehlerseite", () => {
  it("ist deutsch mit Erneut versuchen", () => {
    const html = renderErrorPage();
    expect(html).toContain('lang="de"');
    expect(html).toContain("Erneut versuchen");
    expect(html).not.toContain("Something went wrong");
  });
});
