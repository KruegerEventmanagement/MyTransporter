/**
 * Gezielte Tests für den Google-gtag-Wrapper und die Purchase-Deduplizierung.
 * Keine echten Netzwerkaufrufe, keine echten Conversions.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

type FakeScript = { src: string; async: boolean; addEventListener: () => void };

function installDom(): void {
  const store = new Map<string, string>();
  const scripts: FakeScript[] = [];
  const g = globalThis as unknown as Record<string, unknown>;
  g.document = {
    head: { appendChild: (el: FakeScript) => scripts.push(el) },
    querySelector: () => null,
    createElement: (): FakeScript => ({ src: "", async: false, addEventListener: () => {} }),
  };
  g.window = globalThis;
  g.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
    clear: () => store.clear(),
  };
  delete (globalThis as unknown as { dataLayer?: unknown }).dataLayer;
  delete (globalThis as unknown as { gtag?: unknown }).gtag;
  delete (globalThis as unknown as { uetq?: unknown }).uetq;
  delete (globalThis as unknown as { fbq?: unknown }).fbq;
}

function dataLayer(): unknown[] {
  return ((globalThis as unknown as { dataLayer?: unknown[] }).dataLayer ?? []) as unknown[];
}

async function loadAnalytics(label: string | undefined) {
  vi.resetModules();
  if (label === undefined) vi.stubEnv("VITE_GOOGLE_ADS_PURCHASE_LABEL", "");
  else vi.stubEnv("VITE_GOOGLE_ADS_PURCHASE_LABEL", label);
  return await import("./analytics");
}

beforeEach(() => {
  installDom();
  vi.unstubAllEnvs();
});

describe("Google gtag Wrapper", () => {
  it("pusht ein echtes arguments-Objekt (kein Array) in den dataLayer", async () => {
    const a = await loadAnalytics(undefined);
    (globalThis as unknown as { localStorage: Storage }).localStorage.setItem(
      a.CONSENT_STORAGE_KEY,
      "marketing",
    );
    a.ensureGoogleTag();

    const entries = dataLayer();
    expect(entries.length).toBeGreaterThan(0);
    for (const e of entries) {
      // Google erwartet arguments-artige Objekte, keine Arrays.
      expect(Array.isArray(e)).toBe(false);
      expect(Object.prototype.toString.call(e)).toBe("[object Arguments]");
    }
    // Inhalt bleibt in der richtigen Reihenfolge lesbar.
    const first = Array.from(entries[0] as ArrayLike<unknown>);
    expect(first[0]).toBe("consent");
    expect(first[1]).toBe("default");
  });
});

describe("Purchase-Deduplizierung", () => {
  const purchase = {
    paid: true,
    conversionValueEur: 120,
    currency: "eur",
    transactionId: "pi_test_1",
  };

  it("markiert Google bei fehlendem Label NICHT dauerhaft als gesendet", async () => {
    const noLabel = await loadAnalytics(undefined);
    (globalThis as unknown as { localStorage: Storage }).localStorage.setItem(
      noLabel.CONSENT_STORAGE_KEY,
      "marketing",
    );
    noLabel.trackPurchase(purchase);
    expect(
      (globalThis as unknown as { localStorage: Storage }).localStorage.getItem(
        "mt_google_conversions_sent",
      ),
    ).toBeNull();

    // Gleiche Session-Storage, aber Label jetzt konfiguriert → Google feuert.
    const withLabel = await loadAnalytics("AbC-123");
    const calls: unknown[][] = [];
    (globalThis as unknown as { gtag?: (...a: unknown[]) => void }).gtag = (...a) => calls.push(a);
    withLabel.trackPurchase(purchase);
    const conv = calls.find((c) => c[0] === "event" && c[1] === "conversion");
    expect(conv).toBeTruthy();
    expect(conv?.[2]).toMatchObject({
      send_to: `${withLabel.GOOGLE_ADS_ID}/AbC-123`,
      value: 120,
      currency: "EUR",
      transaction_id: "pi_test_1",
    });
    expect(
      (globalThis as unknown as { localStorage: Storage }).localStorage.getItem(
        "mt_google_conversions_sent",
      ),
    ).toContain("pi_test_1");
  });

  it("sendet die Google-Conversion nicht zweimal", async () => {
    const a = await loadAnalytics("AbC-123");
    (globalThis as unknown as { localStorage: Storage }).localStorage.setItem(
      a.CONSENT_STORAGE_KEY,
      "marketing",
    );
    const calls: unknown[][] = [];
    (globalThis as unknown as { gtag?: (...a: unknown[]) => void }).gtag = (...x) => calls.push(x);
    a.trackPurchase(purchase);
    a.trackPurchase(purchase);
    expect(calls.filter((c) => c[1] === "conversion").length).toBe(1);
  });

  it("UET-Conversion enthält default+grant und die verifizierte Währung", async () => {
    const a = await loadAnalytics(undefined);
    (globalThis as unknown as { localStorage: Storage }).localStorage.setItem(
      a.CONSENT_STORAGE_KEY,
      "marketing",
    );
    a.trackPurchase({ ...purchase, currency: "chf", transactionId: "pi_chf" });

    const q = ((globalThis as unknown as { uetq?: unknown[] }).uetq ?? []) as unknown[];
    expect(q.slice(0, 3)).toEqual(["consent", "default", { ad_storage: "denied" }]);
    expect(q).toContain("granted" === "" ? "" : "consent");
    const gi = q.indexOf("update");
    expect(q[gi + 1]).toEqual({ ad_storage: "granted" });
    const ei = q.indexOf("mytransporter_booking");
    expect(q[ei + 1]).toMatchObject({ currency: "CHF", revenue_value: 120 });
  });
});
