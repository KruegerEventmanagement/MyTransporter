import { describe, it, expect, beforeEach } from "vitest";
import {
  ensureMicrosoftUet,
  uetTrackBooking,
  setMicrosoftUetDefaultDenied,
  grantMicrosoftUetConsent,
  resetMicrosoftUetForWithdrawal,
  __resetUetForTests,
  UET_SCRIPT_SRC,
  UET_BOOKING_ACTION,
} from "./microsoft-uet";

function pushes(): unknown[][] {
  return (window.uetq as unknown[][]) ?? [];
}

beforeEach(() => {
  __resetUetForTests();
  document.head.innerHTML = "";
  window.localStorage.clear();
  delete window.uetq;
  delete window.UET;
});

describe("Microsoft UET Loader", () => {
  it("lädt bat.js genau einmal (kein Doppel-Loader)", () => {
    ensureMicrosoftUet();
    ensureMicrosoftUet();
    ensureMicrosoftUet();
    const scripts = document.head.querySelectorAll(`script[src="${UET_SCRIPT_SRC}"]`);
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
