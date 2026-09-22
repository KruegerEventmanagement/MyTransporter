/**
 * Mock-Tests für Microsoft UET – ohne echte Netzwerkaufrufe und ohne
 * echte Test-Conversion. Minimale DOM-Stubs (kein jsdom nötig).
 *
 * Offizieller UET-Vertrag (Microsoft Advertising UI):
 *   window.uetq = window.uetq || [];
 *   window.uetq.push('consent', 'default', { ad_storage: 'denied' });
 *   window.uetq.push('event', 'mytransporter_booking', {});
 * Die Roh-Queue ist FLACH (Argumente einzeln), NICHT wie gtag-arguments
 * verschachtelt. Nach dem Laden von bat.js ersetzt `new UET({...})` die Queue
 * durch die Instanz, die dieselben Argumente über push(...) erhält.
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
  UET_TAG_ID,
} from "./microsoft-uet";

type Listener = (type: string, fn: () => void) => void;
type FakeScript = { src: string; async: boolean; addEventListener: Listener };
let scripts: FakeScript[] = [];
let loadHandlers: Array<() => void> = [];

function installDom(): void {
  const store = new Map<string, string>();
  const g = globalThis as unknown as Record<string, unknown>;
  g.document = {
    head: { appendChild: (el: FakeScript) => scripts.push(el) },
    querySelector: (sel: string) =>
      scripts.find((s) => s.src && sel.includes(s.src)) ?? null,
    createElement: (): FakeScript => ({
      src: "",
      async: false,
      addEventListener: (type, fn) => {
        if (type === "load") loadHandlers.push(fn);
      },
    }),
  };
  g.window = globalThis;
  g.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
    clear: () => store.clear(),
  };
}

/** Flache Roh-Queue vor dem Tag-Init. */
function rawQueue(): unknown[] {
  return ((globalThis as unknown as { uetq?: unknown[] }).uetq ?? []) as unknown[];
}

/** Argumente eines Kommandos aus der flachen Queue lesen. */
function commandAt(name: string): unknown[] | null {
  const q = rawQueue();
  const i = q.indexOf(name);
  if (i < 0) return null;
  return q.slice(i, i + 3);
}

beforeEach(() => {
  __resetUetForTests();
  scripts = [];
  loadHandlers = [];
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
    expect(scripts[0]?.src).toContain(`ti=${UET_TAG_ID}`);
  });

  it("schreibt Consent-Kommandos FLACH in die Roh-Queue (offizieller Vertrag)", () => {
    setMicrosoftUetDefaultDenied();
    expect(rawQueue()).toEqual(["consent", "default", { ad_storage: "denied" }]);
    ensureMicrosoftUet();
    grantMicrosoftUetConsent();
    expect(rawQueue()).toEqual([
      "consent",
      "default",
      { ad_storage: "denied" },
      "consent",
      "update",
      { ad_storage: "granted" },
    ]);
  });

  it("Widerruf sendet denied-Update", () => {
    setMicrosoftUetDefaultDenied();
    grantMicrosoftUetConsent();
    resetMicrosoftUetForWithdrawal();
    expect(rawQueue().slice(-3)).toEqual(["consent", "update", { ad_storage: "denied" }]);
  });

  it("initialisiert nach dem Script mit der Roh-Queue und schickt pageLoad an die Instanz", () => {
    const instancePushes: unknown[][] = [];
    let ctorOpts: Record<string, unknown> | null = null;
    class FakeUET {
      constructor(opts: Record<string, unknown>) {
        ctorOpts = opts;
      }
      push(...args: unknown[]) {
        instancePushes.push(args);
      }
    }
    setMicrosoftUetDefaultDenied();
    ensureMicrosoftUet();
    (globalThis as unknown as { UET?: unknown }).UET = FakeUET;
    loadHandlers.forEach((fn) => fn());

    expect(ctorOpts).toMatchObject({ ti: UET_TAG_ID, enableAutoSpaTracking: true });
    expect((ctorOpts as unknown as { q: unknown[] }).q).toEqual([
      "consent",
      "default",
      { ad_storage: "denied" },
    ]);
    expect(instancePushes).toEqual([["pageLoad"]]);

    // Nach Init gehen weitere Kommandos an die Instanz – gleiche flache Form.
    grantMicrosoftUetConsent();
    expect(instancePushes.at(-1)).toEqual(["consent", "update", { ad_storage: "granted" }]);
  });

  it("initialisiert bei bereits vorhandenem window.UET nicht vor default/grant", async () => {
    const seen: unknown[][] = [];
    let ctorOpts: Record<string, unknown> | null = null;
    class FakeUET {
      constructor(opts: Record<string, unknown>) {
        ctorOpts = opts;
      }
      push(...args: unknown[]) {
        seen.push(args);
      }
    }
    (globalThis as unknown as { UET?: unknown }).UET = FakeUET;

    setMicrosoftUetDefaultDenied();
    ensureMicrosoftUet();
    grantMicrosoftUetConsent();
    // Noch nicht initialisiert: alles steckt in der flachen Roh-Queue.
    expect(ctorOpts).toBeNull();
    expect(rawQueue()).toContain("consent");

    await Promise.resolve();
    expect((ctorOpts as unknown as { q: unknown[] }).q).toEqual([
      "consent",
      "default",
      { ad_storage: "denied" },
      "consent",
      "update",
      { ad_storage: "granted" },
    ]);
    expect(seen).toEqual([["pageLoad"]]);
  });
});

describe("Buchungs-Conversion", () => {
  it("sendet nichts ohne Einwilligung", () => {
    const sent = uetTrackBooking({ paid: true, transactionId: "pi_1", revenueEur: 100 }, false);
    expect(sent).toBe(false);
    expect(scripts.length).toBe(0);
  });

  it("sendet nichts ohne serverseitig bestätigte Zahlung", () => {
    expect(uetTrackBooking({ paid: false, transactionId: "pi_1" }, true)).toBe(false);
    expect(uetTrackBooking({ paid: true, transactionId: "" }, true)).toBe(false);
  });

  it("sendet genau ein flaches Event mit Action, Kategorie und Betrag", () => {
    expect(uetTrackBooking({ paid: true, transactionId: "pi_9", revenueEur: 249.5 }, true)).toBe(
      true,
    );
    expect(commandAt("event")).toEqual([
      "event",
      UET_BOOKING_ACTION,
      {
        event_category: "mytransporter",
        event_label: "pi_9",
        revenue_value: 249.5,
        currency: "EUR",
      },
    ]);
  });

  it("dedupliziert stabil pro Buchung – auch über Reload/neue Session", () => {
    expect(uetTrackBooking({ paid: true, transactionId: "pi_dup", revenueEur: 10 }, true)).toBe(
      true,
    );
    expect(uetTrackBooking({ paid: true, transactionId: "pi_dup", revenueEur: 10 }, true)).toBe(
      false,
    );
    __resetUetForTests();
    delete (globalThis as unknown as { uetq?: unknown }).uetq;
    expect(uetTrackBooking({ paid: true, transactionId: "pi_dup", revenueEur: 10 }, true)).toBe(
      false,
    );
  });

  it("markiert erst NACH erfolgreicher Übergabe als gesendet (Retry bleibt möglich)", () => {
    // Queue, deren push beim ersten Event wirft.
    let fail = true;
    (globalThis as unknown as { uetq?: unknown }).uetq = {
      push: (...args: unknown[]) => {
        if (fail && args[0] === "event") throw new Error("boom");
      },
    };
    expect(uetTrackBooking({ paid: true, transactionId: "pi_retry", revenueEur: 20 }, true)).toBe(
      false,
    );
    fail = false;
    expect(uetTrackBooking({ paid: true, transactionId: "pi_retry", revenueEur: 20 }, true)).toBe(
      true,
    );
  });

  it("lässt Betrag weg, wenn kein verifizierter Umsatz vorliegt", () => {
    uetTrackBooking({ paid: true, transactionId: "pi_norev" }, true);
    expect(commandAt("event")?.[2]).toEqual({
      event_category: "mytransporter",
      event_label: "pi_norev",
    });
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
