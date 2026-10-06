import { describe, expect, it, vi } from "vitest";
import { processWebAdInquiry, type WebAdInquiryDeps } from "./web-ad-inquiry.server";

const NOW = new Date("2026-10-06T12:00:00Z");
const valid = {
  company: "Muster GmbH", contactName: "Max Muster", email: "max@example.com",
  website: "https://example.com", slot: "left", startDate: "2026-10-20",
  message: "Test", consent: true, hp: "",
};
function deps(over: Partial<WebAdInquiryDeps> = {}): WebAdInquiryDeps {
  return {
    now: () => NOW,
    countRecent: vi.fn(async () => 0),
    store: vi.fn(async () => true),
    mail: vi.fn(async () => true),
    ...over,
  };
}

describe("Website-Werbeplatz-Anfrage (simuliert, kein Versand)", () => {
  it("nimmt gültige Anfrage an und enthält Preis/Laufzeit", async () => {
    const d = deps();
    const r = await processWebAdInquiry(valid, d);
    expect(r).toEqual({ ok: true, stored: true, mailed: true });
    const body = (d.store as ReturnType<typeof vi.fn>).mock.calls[0][1] as string;
    expect(body).toContain("29 € netto / 30 Tage zzgl. USt.");
    expect(body).toContain("Desktop-Seitenplatz links");
  });

  it.each([
    [{ email: "x" }],
    [{ company: "" }],
    [{ slot: "top" }],
    [{ website: "javascript:alert(1)" }],
    [{ consent: false }],
    [{ startDate: "2020-01-01" }],
    [{ startDate: "2026-02-31" }],
    [{ startDate: "2026-13-01" }],
    [{ startDate: "2026-10-05" }],
  ])("lehnt ungültige Eingaben serverseitig ab %#", async (patch) => {
    const d = deps();
    const r = await processWebAdInquiry({ ...valid, ...patch }, d);
    expect(r.ok).toBe(false);
    expect(d.store).not.toHaveBeenCalled();
    expect(d.mail).not.toHaveBeenCalled();
  });

  it("Vergangenheit nach Berliner Kalenderdatum", async () => {
    // 05.10. 23:30 UTC = 06.10. 01:30 Berlin → 06.10. zulässig, 05.10. nicht
    const late = deps({ now: () => new Date("2026-10-05T23:30:00Z") });
    expect((await processWebAdInquiry({ ...valid, startDate: "2026-10-06" }, late)).ok).toBe(true);
    const late2 = deps({ now: () => new Date("2026-10-05T23:30:00Z") });
    expect((await processWebAdInquiry({ ...valid, startDate: "2026-10-05" }, late2)).ok).toBe(false);
  });

  it("Honeypot ausgefüllt: keine Annahme, kein Erfolg", async () => {
    const d = deps();
    expect((await processWebAdInquiry({ ...valid, hp: "bot" }, d)).ok).toBe(false);
    expect(d.store).not.toHaveBeenCalled();
  });

  it("Rate-Limit pro E-Mail und Fail-closed bei DB-Fehler", async () => {
    expect((await processWebAdInquiry(valid, deps({ countRecent: async () => 5 }))).ok).toBe(false);
    const d = deps({ countRecent: async () => { throw new Error("db"); } });
    expect((await processWebAdInquiry(valid, d)).ok).toBe(false);
    expect(d.mail).not.toHaveBeenCalled();
  });

  it("kein stiller Erfolg wenn Speichern und Mail scheitern", async () => {
    const r = await processWebAdInquiry(valid, deps({ store: async () => false, mail: async () => { throw new Error("x"); } }));
    expect(r.ok).toBe(false);
  });

  it("Erfolg wenn nur eines bestätigt ist, ehrlich ausgewiesen", async () => {
    expect(await processWebAdInquiry(valid, deps({ mail: async () => false }))).toEqual({ ok: true, stored: true, mailed: false });
    expect(await processWebAdInquiry(valid, deps({ store: async () => false }))).toEqual({ ok: true, stored: false, mailed: true });
  });
});
