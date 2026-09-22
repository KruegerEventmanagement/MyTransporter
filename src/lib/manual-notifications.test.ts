import { describe, expect, it, vi } from "vitest";
import {
  ALLOWED_PAYLOAD_KEYS,
  buildManualNotificationEmail,
  formatBerlin,
  LABEL_RESERVATION_ID,
  LABEL_REVISION,
  LABEL_SOURCE_TYPE,
  manualNotificationIdempotencyKey,
  manualNotificationSubject,
  OWNER_CALENDAR_EMAIL,
  sanitizeManualPayload,
} from "@/lib/manual-notifications";
import { runManualNotificationOutbox, type OutboxDeps, type OutboxRow } from "@/lib/manual-notifications.server";

const RAW = {
  reservation_id: "11111111-1111-4111-8111-111111111111",
  source_type: "manual_reservation",
  revision: 2,
  event_kind: "updated",
  vehicle_id: "22222222-2222-4222-8222-222222222222",
  vehicle_plate: "BB-MT 123",
  vehicle_name: "Citroën Jumper L1H1",
  start_at: "2026-07-01T12:00:00Z",
  end_at: "2026-07-02T12:00:00Z",
  customer_name: "Anna Muster",
  customer_phone: "0152 3623 0118",
  customer_email: "anna@example.org",
  note: "Abholung an der Werkstatt",
  created_at: "2026-06-01T08:00:00Z",
  updated_at: "2026-06-02T09:30:00Z",
  // Diese Felder dürfen NIE nach außen:
  customer_birth_date: "1990-05-04",
  customer_id_number: "L01X00T47",
  customer_license_number: "B072RRE2I55",
  customer_street: "Römerstraße 36",
  customer_city: "71229 Leonberg",
  pickup_code: "4711",
  documents: ["id_front.jpg"],
};

const SENSITIVE = [
  "Abholung an der Werkstatt",
  "1990-05-04",
  "L01X00T47",
  "B072RRE2I55",
  "Römerstraße 36",
  "71229 Leonberg",
  "4711",
  "id_front.jpg",
];

describe("sanitizeManualPayload", () => {
  it("behält nur freigegebene Felder", () => {
    const p = sanitizeManualPayload(RAW) as Record<string, unknown>;
    for (const key of Object.keys(p)) {
      expect(ALLOWED_PAYLOAD_KEYS as readonly string[]).toContain(key);
    }
    expect(p.customer_birth_date).toBeUndefined();
    expect(p.customer_id_number).toBeUndefined();
    expect(p.customer_license_number).toBeUndefined();
    expect(p.pickup_code).toBeUndefined();
  });

  it("verlangt Kennung und Zeitraum", () => {
    expect(() => sanitizeManualPayload({ start_at: "x", end_at: "y" })).toThrow();
    expect(() => sanitizeManualPayload({ reservation_id: "abc" })).toThrow();
  });
});

describe("Berliner Zeit inkl. Sommer-/Winterzeit", () => {
  it("rechnet Sommerzeit (+2h) korrekt", () => {
    expect(formatBerlin("2026-07-01T12:00:00Z")).toBe("01.07.2026, 14:00");
  });
  it("rechnet Winterzeit (+1h) korrekt", () => {
    expect(formatBerlin("2026-01-15T12:00:00Z")).toBe("15.01.2026, 13:00");
  });
});

describe("Owner-Mail", () => {
  const payload = sanitizeManualPayload(RAW);

  it("nutzt die vorgegebenen Betreffzeilen", () => {
    expect(manualNotificationSubject("created", payload)).toBe(
      "🚐 Neue Buchung · Anna Muster · 01.07.2026 14:00",
    );
    expect(manualNotificationSubject("updated", payload)).toContain("🚐 Buchung geändert · Anna Muster");
    expect(manualNotificationSubject("deleted", payload)).toContain("🚐 Buchung storniert · Anna Muster");
  });

  it("enthält Berliner Zeit, ISO-Zeitstempel und stabile Kennungen", () => {
    const { html } = buildManualNotificationEmail({ eventKind: "updated", payload });
    expect(html).toContain("01.07.2026, 14:00");
    expect(html).toContain("02.07.2026, 14:00");
    expect(html).toContain("2026-07-01T12:00:00Z");
    expect(html).toContain("2026-07-02T12:00:00Z");
    expect(html).toContain(LABEL_RESERVATION_ID);
    expect(html).toContain(LABEL_SOURCE_TYPE);
    expect(html).toContain(LABEL_REVISION);
    expect(html).toContain(RAW.reservation_id);
  });

  it("enthält keine sensiblen Daten", () => {
    const { subject, html } = buildManualNotificationEmail({ eventKind: "created", payload });
    for (const needle of SENSITIVE) {
      expect(html).not.toContain(needle);
      expect(subject).not.toContain(needle);
    }
  });
});

function makeRow(over: Partial<OutboxRow> = {}): OutboxRow {
  return {
    id: "row-1",
    reservation_id: RAW.reservation_id,
    event_kind: "created",
    revision: 1,
    payload: RAW,
    attempts: 1,
    push_sent_at: null,
    mail_sent_at: null,
    lease_token: "lease-a",
    ...over,
  };
}

function makeDeps(rows: OutboxRow[], over: Partial<OutboxDeps> = {}) {
  const claim = vi.fn(async () => rows.splice(0, rows.length));
  return {
    claim,
    complete: vi.fn(async () => true),
    markMailed: vi.fn(async () => true),
    markPushed: vi.fn(async () => true),
    fail: vi.fn(async () => true),
    sendMail: vi.fn(async () => true),
    push: vi.fn(async () => ({ sent: 1, skipped: false })),
    ...over,
  } satisfies OutboxDeps;
}

describe("Benachrichtigungslauf", () => {
  it("sendet neu/geändert/storniert an den Owner-Posteingang", async () => {
    for (const kind of ["created", "updated", "deleted"] as const) {
      const deps = makeDeps([makeRow({ event_kind: kind, revision: 3 })]);
      const res = await runManualNotificationOutbox(deps);
      expect(res.sent).toBe(1);
      expect(deps.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: OWNER_CALENDAR_EMAIL,
          idempotencyKey: manualNotificationIdempotencyKey(RAW.reservation_id, kind, 3),
        }),
      );
      expect(deps.markMailed).toHaveBeenCalledWith("row-1", "lease-a");
      expect(deps.complete).toHaveBeenCalledWith("row-1", true, "lease-a");
      expect(deps.fail).not.toHaveBeenCalled();
    }
  });

  it("markiert Mailfehler als retrybar und schließt nicht ab", async () => {
    const deps = makeDeps([makeRow({ attempts: 2 })], { sendMail: vi.fn(async () => false) });
    const res = await runManualNotificationOutbox(deps);
    expect(res.failed).toBe(1);
    expect(deps.complete).not.toHaveBeenCalled();
    expect(deps.fail).toHaveBeenCalledWith("row-1", expect.any(String), 600, "lease-a");
    expect(deps.push).not.toHaveBeenCalled();
  });

  it("wertet einen Push ohne Empfänger (sent: 0) als Fehler", async () => {
    const deps = makeDeps([makeRow()], {
      push: vi.fn(async () => ({ sent: 0, skipped: true })),
    });
    const res = await runManualNotificationOutbox(deps);
    expect(res.pushed).toBe(0);
    expect(res.failed).toBe(1);
    expect(deps.markPushed).not.toHaveBeenCalled();
    expect(deps.complete).not.toHaveBeenCalled();
    expect(deps.fail).toHaveBeenCalledWith("row-1", expect.any(String), 300, "lease-a");
  });

  it("wiederholt nach Push-Fehler nur den Push, nicht die Mail", async () => {
    const deps = makeDeps([makeRow({ mail_sent_at: "2026-06-02T10:00:00Z", attempts: 2 })]);
    const res = await runManualNotificationOutbox(deps);
    expect(deps.sendMail).not.toHaveBeenCalled();
    expect(res.sent).toBe(0);
    expect(res.pushed).toBe(1);
    expect(deps.complete).toHaveBeenCalledWith("row-1", true, "lease-a");
  });

  it("pusht nur einmal pro Ereignis, auch bei Mail-Wiederholung", async () => {
    const deps = makeDeps([makeRow({ push_sent_at: "2026-06-02T10:00:00Z", attempts: 2 })]);
    await runManualNotificationOutbox(deps);
    expect(deps.push).not.toHaveBeenCalled();
    expect(deps.complete).toHaveBeenCalledWith("row-1", true, "lease-a");
  });

  it("hält einen Push-Fehler retrybar, ohne die Mail zu entwerten", async () => {
    const deps = makeDeps([makeRow()], {
      push: vi.fn(async () => {
        throw new Error("no subscription");
      }),
    });
    const res = await runManualNotificationOutbox(deps);
    expect(res.sent).toBe(1);
    expect(res.failed).toBe(1);
    expect(deps.markMailed).toHaveBeenCalled();
    expect(deps.complete).not.toHaveBeenCalled();
    expect(deps.fail).toHaveBeenCalledWith(
      "row-1",
      expect.stringContaining("Push"),
      300,
      "lease-a",
    );
  });

  it("erkennt eine verlorene Lease und finalisiert nicht mehr", async () => {
    const deps = makeDeps([makeRow()], { markMailed: vi.fn(async () => false) });
    const res = await runManualNotificationOutbox(deps);
    expect(res.lost_lease).toBe(1);
    expect(deps.complete).not.toHaveBeenCalled();
    expect(deps.push).not.toHaveBeenCalled();
  });

  it("verarbeitet jedes Ereignis nur einmal (paralleler zweiter Lauf leer)", async () => {
    const rows = [makeRow()];
    const deps = makeDeps(rows);
    const [a, b] = await Promise.all([
      runManualNotificationOutbox(deps),
      runManualNotificationOutbox(deps),
    ]);
    expect(a.claimed + b.claimed).toBe(1);
    expect(deps.sendMail).toHaveBeenCalledTimes(1);
  });

  it("meldet kaputte Datenauszüge als Fehler statt zu senden", async () => {
    const deps = makeDeps([makeRow({ payload: { nope: true } })]);
    const res = await runManualNotificationOutbox(deps);
    expect(res.failed).toBe(1);
    expect(deps.sendMail).not.toHaveBeenCalled();
    expect(deps.fail).toHaveBeenCalled();
  });

  it("propagiert Datenbankfehler aus fail() nicht als stiller Erfolg", async () => {
    const deps = makeDeps([makeRow()], {
      sendMail: vi.fn(async () => false),
      fail: vi.fn(async () => {
        throw new Error("rpc down");
      }),
    });
    await expect(runManualNotificationOutbox(deps)).rejects.toThrow("rpc down");
  });
});
