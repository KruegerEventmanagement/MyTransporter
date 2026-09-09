import { describe, it, expect } from "vitest";
import {
  BOOKING_ACTION_KEYS,
  runBookingActions,
  type BookingActionKey,
  type BookingActionStore,
} from "@/lib/booking-actions.server";
import { CONFIRM_LOG_TITLE, ADMIN_LOG_TITLE } from "@/lib/booking-emails.server";

/**
 * In-Memory-Store mit denselben Regeln wie claim/complete/fail_booking_action:
 * - genau ein Claim gewinnt pro Aktion
 * - succeeded wird nie erneut geclaimt
 * - failed ist nach Retry-Fenster wieder claimbar
 */
function createStore(seed: Partial<Record<BookingActionKey, "succeeded" | "failed">> = {}) {
  const rows = new Map<string, { status: string; attempts: number; lastError?: string }>();
  for (const [k, v] of Object.entries(seed)) rows.set(k, { status: v, attempts: 1 });

  const store: BookingActionStore = {
    async claim(_bookingId, key) {
      const row = rows.get(key) ?? { status: "pending", attempts: 0 };
      rows.set(key, row);
      if (row.status === "succeeded" || row.status === "processing") return false;
      row.status = "processing";
      row.attempts += 1;
      return true;
    },
    async complete(_bookingId, key) {
      const row = rows.get(key);
      if (row) {
        row.status = "succeeded";
        delete row.lastError;
      }
    },
    async fail(_bookingId, key, message) {
      const row = rows.get(key);
      if (row && row.status !== "succeeded") {
        row.status = "failed";
        row.lastError = message;
      }
    },
  };
  return { store, rows };
}

function handlers(calls: string[], failing: Partial<Record<BookingActionKey, () => void>> = {}) {
  const make = (key: BookingActionKey) => async () => {
    calls.push(key);
    failing[key]?.();
  };
  return {
    new_booking_notification: make("new_booking_notification"),
    customer_confirmation_invoice: make("customer_confirmation_invoice"),
    admin_booking_email: make("admin_booking_email"),
  };
}

const BOOKING = "11111111-1111-1111-1111-111111111111";

describe("Folgeaktionen nach bezahlter Buchung", () => {
  it("fehlende Admin-Mail: Retry holt NUR die Admin-Mail nach", async () => {
    const { store, rows } = createStore({
      new_booking_notification: "succeeded",
      customer_confirmation_invoice: "succeeded",
    });
    const calls: string[] = [];
    const res = await runBookingActions(BOOKING, store, handlers(calls));
    expect(calls).toEqual(["admin_booking_email"]);
    expect(res.results.admin_booking_email).toBe("succeeded");
    expect(res.results.customer_confirmation_invoice).toBe("skipped");
    expect(res.hasFailures).toBe(false);
    expect(rows.get("admin_booking_email")?.status).toBe("succeeded");
  });

  it("fehlende Kundenbestätigung: Retry holt NUR Bestätigung inkl. Rechnung nach", async () => {
    const { store } = createStore({
      new_booking_notification: "succeeded",
      admin_booking_email: "succeeded",
    });
    const calls: string[] = [];
    const res = await runBookingActions(BOOKING, store, handlers(calls));
    expect(calls).toEqual(["customer_confirmation_invoice"]);
    expect(res.results.admin_booking_email).toBe("skipped");
  });

  it("Mailprovider-Fehler bleibt retrybar und gelingt im zweiten Lauf", async () => {
    const { store, rows } = createStore();
    const calls: string[] = [];
    const first = await runBookingActions(
      BOOKING,
      store,
      handlers(calls, {
        customer_confirmation_invoice: () => {
          throw new Error("Resend 500");
        },
      }),
    );
    expect(first.results.customer_confirmation_invoice).toBe("failed");
    expect(first.hasFailures).toBe(true);
    expect(rows.get("customer_confirmation_invoice")?.status).toBe("failed");
    expect(rows.get("customer_confirmation_invoice")?.lastError).toContain("Resend 500");

    const second = await runBookingActions(BOOKING, store, handlers(calls));
    expect(second.results.customer_confirmation_invoice).toBe("succeeded");
    expect(second.results.admin_booking_email).toBe("skipped");
    expect(second.hasFailures).toBe(false);
  });

  it("wiederholter Webhook nach vollem Erfolg sendet nichts erneut", async () => {
    const { store } = createStore();
    const calls: string[] = [];
    await runBookingActions(BOOKING, store, handlers(calls));
    expect(calls).toHaveLength(3);
    const again = await runBookingActions(BOOKING, store, handlers(calls));
    expect(calls).toHaveLength(3);
    expect(Object.values(again.results).every((r) => r === "skipped")).toBe(true);
  });

  it("zwei parallele Reconcile-Läufe führen jede Aktion genau einmal aus", async () => {
    const { store } = createStore();
    const calls: string[] = [];
    const slow = () => {
      /* Handler ohne Fehler */
    };
    const h = handlers(calls, {
      new_booking_notification: slow,
      customer_confirmation_invoice: slow,
      admin_booking_email: slow,
    });
    await Promise.all([runBookingActions(BOOKING, store, h), runBookingActions(BOOKING, store, h)]);
    for (const key of BOOKING_ACTION_KEYS) {
      expect(calls.filter((c) => c === key)).toHaveLength(1);
    }
  });

  it("gezielter Reconcile führt nur die angeforderte Aktion aus", async () => {
    const { store } = createStore();
    const calls: string[] = [];
    await runBookingActions(BOOKING, store, handlers(calls), ["admin_booking_email"]);
    expect(calls).toEqual(["admin_booking_email"]);
  });

  it("Protokolltitel verwenden die korrekte Umlaut-Schreibweise", () => {
    expect(CONFIRM_LOG_TITLE).toBe("Buchungsbestätigung versendet");
    expect(ADMIN_LOG_TITLE).toBe("Admin-Buchungsmail versendet");
    expect(CONFIRM_LOG_TITLE).not.toContain("staetigung");
  });
});
