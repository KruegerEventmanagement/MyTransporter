import { describe, expect, it } from "vitest";
import { bounceReason, bounceTitle, parseGmailBounce, shouldAlert } from "./mail-bounce";

const enc = (s: string) => btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const status = [
  "Final-Recipient: rfc822; kunde@outlook.de",
  "Action: failed",
  "Status: 5.7.1",
  "Diagnostic-Code: smtp; 550 5.7.1 Message rejected: Message lacks SPF/DKIM/DMARC Auth Records",
  " (AS9031519) [CPH1 2026-11-07T07:45:04Z]",
].join("\r\n");
const dsn = (internalDate: string) => ({
  id: "dsn1", threadId: "orig1", internalDate,
  payload: { mimeType: "multipart/report", parts: [
    { mimeType: "text/plain", body: { data: enc("Die Nachricht wurde blockiert") } },
    { mimeType: "message/delivery-status", parts: [{ mimeType: "text/plain", body: { data: enc(status) } }] },
  ] },
});

describe("Gmail-Bounce-Auswertung", () => {
  it("liest Empfänger, Status und Original-Thread aus der Outlook-Ablehnung", () => {
    const b = parseGmailBounce(dsn(String(Date.UTC(2026, 10, 7, 7, 45))))!;
    expect(b.recipient).toBe("kunde@outlook.de");
    expect(b.status).toBe("5.7.1");
    expect(b.threadId).toBe("orig1");
    expect(b.permanent).toBe(true);
    expect(b.diagnostic).toContain("AS9031519");
    expect(b.diagnostic).not.toMatch(/2026/); // Ziffernfolgen maskiert
  });
  it("erkennt fehlende Domain-Authentifizierung als Grund", () => {
    expect(bounceReason(parseGmailBounce(dsn("1"))!)).toMatch(/Absender-Authentifizierung nicht akzeptiert/);
  });
  it("ignoriert normale Mails ohne Zustellstatus", () => {
    expect(parseGmailBounce({ id: "x", payload: { mimeType: "text/plain", body: { data: enc("Hallo") } } })).toBeNull();
  });
  it("alarmiert nur bei Meldungen der letzten 6 Stunden", () => {
    const now = Date.UTC(2026, 10, 7, 12);
    expect(shouldAlert({ bouncedAt: new Date(now - 5 * 3600_000).toISOString() }, now)).toBe(true);
    expect(shouldAlert({ bouncedAt: new Date(now - 7 * 3600_000).toISOString() }, now)).toBe(false);
  });
  it("benennt Schlüsselcode-Bounces eindeutig", () => {
    expect(bounceTitle("reminder_30min")).toContain("Schlüsselcode");
  });
});
