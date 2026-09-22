/**
 * Mock-Tests für Microsoft UET – ohne echte Netzwerkaufrufe und ohne
 * echte Test-Conversion. Minimale DOM-Stubs (kein jsdom nötig).
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  ensureMicrosoftUet,
  uetTrackBooking,
  setMicrosoftUetDefaultDenied,
  grantMicrosoftUetConsent,
  resetMicrosoftUetForWithdrawal,
  __resetUetForTests,
  UET_BOOKING_ACTION,
} from "./microsoft-uet";

type FakeScript = { src: string; async: boolean; addEventListener: () => void };
let scripts: FakeScript[] = [];

function installDom(): void {
  const store = new Map<string, string>();
  const g = globalThis as unknown as Record<string, unknown>;
  g.document = {
    head: { appendChild: (el: FakeScript) => scripts.push(el) },
    querySelector: (sel: string) => scripts.find((s) => s.src && sel.includes(s.src)) ?? null,
    createElement: (): FakeScript => ({ src: "", async: false, addEventListener: () => {} }),
  };
  g.window = globalThis;
  g.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
    clear: () => store.clear(),
  };
}

function pushes(): unknown[][] {
  return ((globalThis as unknown as { uetq?: unknown[][] }).uetq ?? []) as unknown[][];
}

beforeEach(() => {
  __resetUetForTests();
  scripts = [];
  installDom();
  delete (globalThis as unknown as { uetq?: unknown }).uetq;
  delete (globalThis as unknown as { UET?: unknown }).UET;
});

describe("Microsoft UET Loader", () => {
  it("lädt bat.js genau einmal (kein Doppel-Loader)", () => {
    ensureMicrosoftUet();
    ensureMicrosoftUet();
    ensureMicrosoftUet();
    expect(scripts.length).toBe(1);
  });

  it("setzt Default denied vor dem Laden und granted nach Einwilligung", () => {
    setMicrosoftUetDefaultDenied();
    expect(pushes()[0]).toEqual(["consent", "default", { ad_storage: "denied" }]);
    ensureMicrosoftUet();
    grantMicrosoftUetConsent();
    expect(pushes()).toContainEqual(["consent", "update", { ad_storage: "granted" }]);
  });

  it("Widerruf sendet denied-Update", () => {
    setMicrosoftUetDefaultDenied();
    grantMicrosoftUetConsent();
    resetMicrosoftUetForWithdrawal();
    expect(pushes().at(-1)).toEqual(["consent", "update", { ad_storage: "denied" }]);
  });
});

describe("Buchungs-Conversion", () => {
  it("sendet nichts ohne Einwilligung", () => {
    const sent = uetTrackBooking({ paid: true, transactionId: "pi_1", revenueEur: 100 }, false);
    expect(sent).toBe(false);
    expect(document.head.innerHTML).toBe("");
  });

  it("sendet nichts ohne serverseitig bestätigte Zahlung", () => {
    expect(uetTrackBooking({ paid: false, transactionId: "pi_1" }, true)).toBe(false);
    expect(uetTrackBooking({ paid: true, transactionId: "" }, true)).toBe(false);
  });

  it("sendet genau ein Event mit korrekter Action, Kategorie und Betrag", () => {
    expect(uetTrackBooking({ paid: true, transactionId: "pi_9", revenueEur: 249.5 }, true)).toBe(
      true,
    );
    const ev = pushes().find((p) => p[0] === "event");
    expect(ev?.[1]).toBe(UET_BOOKING_ACTION);
    expect(ev?.[2]).toEqual({
      event_category: "mytransporter",
      event_label: "pi_9",
      revenue_value: 249.5,
      currency: "EUR",
    });
  });

  it("dedupliziert stabil pro Buchung – auch über Reload/neue Session", () => {
    expect(uetTrackBooking({ paid: true, transactionId: "pi_dup", revenueEur: 10 }, true)).toBe(
      true,
    );
    expect(uetTrackBooking({ paid: true, transactionId: "pi_dup", revenueEur: 10 }, true)).toBe(
      false,
    );
    __resetUetForTests();
    delete window.uetq;
    expect(uetTrackBooking({ paid: true, transactionId: "pi_dup", revenueEur: 10 }, true)).toBe(
      false,
    );
  });

  it("lässt Betrag weg, wenn kein verifizierter Umsatz vorliegt", () => {
    uetTrackBooking({ paid: true, transactionId: "pi_norev" }, true);
    const ev = pushes().find((p) => p[0] === "event");
    expect(ev?.[2]).toEqual({ event_category: "mytransporter", event_label: "pi_norev" });
  });

  it("holt nach erneuter Einwilligung eine noch nicht gesendete Buchung nach", () => {
    expect(uetTrackBooking({ paid: true, transactionId: "pi_late", revenueEur: 50 }, false)).toBe(
      false,
    );
    expect(uetTrackBooking({ paid: true, transactionId: "pi_late", revenueEur: 50 }, true)).toBe(
      true,
    );
  });
});
