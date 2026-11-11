import { describe, it, expect } from "vitest";
import { buildKeySms, smsSegments } from "./key-sms";
import { buildCustomerConfirmation } from "./manual-confirmation";
import { KEY_VIDEO_LINKS, KEY_VIDEOS_SHORT_LINK, keyVideosHtml } from "./key-videos";
import { bounceReason } from "./mail-bounce";

describe("Schlüssel-Videos", () => {
  it("SMS behält alle Hinweise und bekommt genau einen Videolink, 5 Teile", () => {
    const t = buildKeySms("PF-MY 1003", "123456")!;
    for (const s of ["Box ", "OBI Leonberg", "Code: 123456", "Poststraße 63", "30 €", "Gute Fahrt!"]) expect(t).toContain(s);
    expect(t.split(KEY_VIDEOS_SHORT_LINK).length - 1).toBe(1);
    expect(KEY_VIDEOS_SHORT_LINK).toBe("mytransporter.org/so-funktionierts#schluessel-videos");
    expect(smsSegments(t)).toBe(5);
  });
  it("Mailblock: verlinkte Vorschaubilder, absolute URLs, kein Videoplayer", () => {
    const h = keyVideosHtml();
    expect(h).not.toMatch(/<video|<iframe|<div/);
    expect(h.startsWith("<table role=\"presentation\"")).toBe(true);
    expect(h).toContain("Arial,Helvetica,sans-serif");
    expect(h).toMatch(/<img [^>]*width="160"[^>]*alt="Video 1/);
    expect(KEY_VIDEO_LINKS.map((v) => v.key)).toEqual(["obi", "open"]);
    for (const v of KEY_VIDEO_LINKS) {
      expect(v.posterUrl.startsWith("https://mytransporter.org/")).toBe(true);
      expect(h).toContain(`href="${v.pageUrl}"`);
    }
    expect(KEY_VIDEO_LINKS[0].pageUrl).toMatch(/#schluessel-standort$/);
    expect(KEY_VIDEO_LINKS[1].pageUrl).toMatch(/#schluessel-bedienung$/);
  });
  it("manuelle Bestätigung enthält Videos in HTML und Text", () => {
    const m = buildCustomerConfirmation({ reservationId: "abcdef12-0000-0000-0000-000000000000", revision: 1, customerName: "Test", customerEmail: "t@example.com", vehicleName: "L1H1", vehiclePlate: "PF-MY 1003", startAt: "2026-12-01T09:00:00Z", endAt: "2026-12-02T09:00:00Z", totalPriceCents: 9900, pickupAddress: "Poststraße 60, Leonberg" });
    for (const v of KEY_VIDEO_LINKS) { expect(m.html).toContain(v.pageUrl); expect(m.text).toContain(v.pageUrl); }
  });
  it("Bounce-Grund behauptet keine fehlenden DNS-Einträge", () => {
    const r = bounceReason({ status: "5.7.1", diagnostic: "550 5.7.1 Message lacks SPF/DKIM/DMARC Auth Records" } as never);
    expect(r).not.toMatch(/fehlen/);
  });
});
