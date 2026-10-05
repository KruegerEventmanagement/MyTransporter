import { describe, expect, it } from "vitest";
import {
  birthAndAge,
  fmtBerlinDateTime,
  joinAddress,
  overlapsBerlinDay,
  pickDocuments,
  isSafeOwnedPath,
} from "@/lib/calendar-details";
import { loadCalendarEntryDetails } from "@/lib/calendar-details.server";
import { bookingWindowMs } from "@/lib/booking-window";

type Rows = Record<string, any[]>;

/** Synthetischer DB-Mock: filtert eq/in, zählt Signier-Aufrufe. */
function fakeDb(rows: Rows, opts: { admin?: boolean; failTable?: string } = {}) {
  const signed: string[] = [];
  const db = {
    rpc: async () => ({ data: opts.admin ?? true, error: null }),
    from(table: string) {
      const filters: Array<[string, unknown]> = [];
      const run = () => {
        if (opts.failTable === table) return { data: null, error: { message: "x" } };
        return {
          data: (rows[table] ?? []).filter((r) => filters.every(([k, v]) => r[k] === v)),
          error: null,
        };
      };
      const q: any = {
        select: () => q,
        eq: (k: string, v: unknown) => (filters.push([k, v]), q),
        in: () => q,
        maybeSingle: async () => {
          const r = run();
          return { data: r.data?.[0] ?? null, error: r.error };
        },
        then: (res: any, rej: any) => Promise.resolve(run()).then(res, rej),
      };
      return q;
    },
    storage: {
      from: () => ({
        createSignedUrl: async (path: string) => {
          signed.push(path);
          return path.includes("missing")
            ? { data: null, error: { message: "not found" } }
            : { data: { signedUrl: `https://signed.test/${path}` }, error: null };
        },
      }),
    },
  };
  return { db, signed };
}

const B1 = "11111111-1111-4111-8111-111111111111";
const U1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const U2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const M1 = "22222222-2222-4222-8222-222222222222";

const baseRows = (): Rows => ({
  bookings: [
    {
      id: B1, user_id: U1, vehicle_name: "Citroën Jumper L4H2", vehicle_plate: "TEST 1",
      plan_id: "multi_2d", plan_label: "2 Tage", plan_price: 189, deposit: 200,
      start_date: "2026-10-09", start_hour: 16, status: "paid", remarks: null,
      addons: [{ id: "x", label: "Sackkarre" }], addons_total_cents: 900, free_km: 400, km_price_cents: 45,
    },
  ],
  profiles: [
    { id: U1, first_name: "Erika", last_name: "Muster", email: "e@test.invalid", phone: "+49 1",
      birth_date: "1990-10-06", address_street: "Teststr. 1", address_postal_code: "12345", address_city: "Teststadt" },
    { id: U2, first_name: "Fremd", last_name: "Person" },
  ],
  user_documents: [
    { id: "d1", user_id: U1, doc_type: "license_front", photo_url: `${U1}/lf-old.jpg`, created_at: "2026-01-01" },
    { id: "d2", user_id: U1, doc_type: "license_front", photo_url: `${U1}/lf-new.jpg`, created_at: "2026-02-01" },
    { id: "d3", user_id: U1, doc_type: "id_back", photo_url: `${U1}/missing.jpg`, created_at: "2026-02-01" },
    { id: "d9", user_id: U2, doc_type: "id_front", photo_url: `${U2}/foreign.jpg`, created_at: "2026-03-01" },
  ],
  manual_reservations: [
    { id: M1, vehicle_plate: "TEST 2", vehicle_name: "Jumper", start_at: "2026-10-09T14:00:00Z",
      end_at: "2026-10-11T08:00:00Z", customer_name: "Max Test", customer_street: "Weg 2",
      customer_city: "99999 Ort", note: "Bitte Gurte", customer_birth_date: "2030-01-01" },
  ],
  manual_reservation_documents: [
    { id: "m1", reservation_id: M1, doc_type: "id_front", file_path: "admin/manual/x/id.pdf", created_at: "2026-01-01" },
  ],
});

describe("Berliner Zeit", () => {
  it("formatiert unabhängig von der Browser-Zeitzone", () => {
    expect(fmtBerlinDateTime(new Date("2026-10-09T14:00:00Z"))).toBe("09.10.2026, 16:00 Uhr");
    expect(fmtBerlinDateTime(new Date("2026-12-09T15:00:00Z"))).toBe("09.12.2026, 16:00 Uhr");
  });
  it("ordnet mehrtägige Buchung den Berliner Tagen zu (Ende exklusiv)", () => {
    const w = bookingWindowMs("24h_300", "2026-10-09", 16);
    expect(overlapsBerlinDay(w.start, w.end, 2026, 10, 9)).toBe(true);
    expect(overlapsBerlinDay(w.start, w.end, 2026, 10, 10)).toBe(true);
    expect(overlapsBerlinDay(w.start, w.end, 2026, 10, 11)).toBe(false);
    // 23:30 UTC = 01:30 Berlin am Folgetag
    const s = Date.parse("2026-10-09T23:30:00Z");
    expect(overlapsBerlinDay(s, s + 3600_000, 2026, 10, 9)).toBe(false);
    expect(overlapsBerlinDay(s, s + 3600_000, 2026, 10, 10)).toBe(true);
  });
});

describe("Geburtstag/Alter/Adresse/Dokumente", () => {
  it("Alter kalendergenau, Zukunft/ungültig ohne Alter", () => {
    expect(birthAndAge("1990-10-06", "2026-10-05")).toEqual({ birth: "06.10.1990", age: "35 Jahre" });
    expect(birthAndAge("1990-10-06", "2026-10-06").age).toBe("36 Jahre");
    expect(birthAndAge("2030-01-01", "2026-10-05").age).toBe("Nicht hinterlegt");
    expect(birthAndAge("1990-02-31").age).toBe("Nicht hinterlegt");
    expect(birthAndAge(null)).toEqual({ birth: "Nicht hinterlegt", age: "Nicht hinterlegt" });
  });
  it("Adresse nur aus vorhandenen Teilen", () => {
    expect(joinAddress({ street: " ", city: null })).toBeNull();
    expect(joinAddress({ street: "A 1", postalCode: "1", city: "B" })).toBe("A 1, 1 B");
  });
  it("neuestes nicht entferntes Dokument je Seite", () => {
    const r = pickDocuments([
      { id: "a", doc_type: "id_front", path: "a", created_at: "2026-03-01", deleted: true },
      { id: "b", doc_type: "id_front", path: "b", created_at: "2026-01-01" },
      { id: "c", doc_type: "legacy", path: "c", created_at: "2026-01-01" },
    ]);
    expect(r.slots.id_front?.id).toBe("b");
    expect(r.others.map((o) => o.id)).toEqual(["c"]);
  });
});

describe("loadCalendarEntryDetails", () => {
  it("weist Nicht-Admins ab, ohne Daten zu lesen", async () => {
    const { db, signed } = fakeDb(baseRows(), { admin: false });
    await expect(loadCalendarEntryDetails(db, U2, "booking", B1)).rejects.toThrow("Forbidden");
    expect(signed).toEqual([]);
  });

  it("Online-Buchung: Profil/Dokumente nur über user_id, keine fremden Dateien", async () => {
    const { db, signed } = fakeDb(baseRows());
    const d = await loadCalendarEntryDetails(db, "admin", "booking", B1);
    expect(d.customer.name).toBe("Erika Muster");
    expect(d.customer.address).toBe("Teststr. 1, 12345 Teststadt");
    expect(d.notes).toBeNull();
    expect(d.documents.license.front?.signedUrl).toContain("lf-new.jpg");
    expect(d.documents.license.back).toBeNull();
    expect(d.documents.id.back?.signedUrl).toBeNull(); // Datei fehlt
    expect(signed.some((p) => p.includes(U2))).toBe(false);
    expect(fmtBerlinDateTime(new Date(d.startAt))).toBe("09.10.2026, 16:00 Uhr");
    expect(fmtBerlinDateTime(new Date(d.endAt))).toBe("11.10.2026, 16:00 Uhr");
    expect(d.booking?.addons).toEqual(["Sackkarre"]);
  });

  it("fehlendes Profil verhindert Details nicht", async () => {
    const rows = baseRows();
    rows.profiles = [];
    const { db } = fakeDb(rows);
    const d = await loadCalendarEntryDetails(db, "admin", "booking", B1);
    expect(d.customer.profileLinked).toBe(false);
    expect(d.customer.name).toBeNull();
  });

  it("manueller Termin: eigene Daten + PDF, kein Profil", async () => {
    const { db, signed } = fakeDb(baseRows());
    const d = await loadCalendarEntryDetails(db, "admin", "manual", M1);
    expect(d.customer.address).toBe("Weg 2, 99999 Ort");
    expect(d.notes).toBe("Bitte Gurte");
    expect(d.documents.id.front?.isPdf).toBe(true);
    expect(signed).toEqual(["admin/manual/x/id.pdf"]);
  });

  it("Ladefehler wird gemeldet statt leer angezeigt", async () => {
    const { db } = fakeDb(baseRows(), { failTable: "user_documents" });
    await expect(loadCalendarEntryDetails(db, "admin", "booking", B1)).rejects.toThrow(
      "Dokumente konnten nicht geladen werden",
    );
  });

  it("Kundeneigene Zeile mit fremdem Pfad wird nie signiert", async () => {
    const rows = baseRows();
    rows.user_documents.push({
      id: "evil", user_id: U1, doc_type: "id_front", photo_url: `${U2}/foreign.jpg`, created_at: "2026-09-01",
    });
    const { db, signed } = fakeDb(rows);
    const d = await loadCalendarEntryDetails(db, "admin", "booking", B1);
    expect(d.documents.id.front?.id).toBe("evil");
    expect(d.documents.id.front?.fileState).toBe("path_rejected");
    expect(d.documents.id.front?.signedUrl).toBeNull();
    expect(signed.some((p) => p.includes(U2))).toBe(false);
  });

  it("Profil-Abfragefehler ist ein Ladefehler, kein fehlendes Profil", async () => {
    const { db } = fakeDb(baseRows(), { failTable: "profiles" });
    await expect(loadCalendarEntryDetails(db, "admin", "booking", B1)).rejects.toThrow(
      "Kundendaten konnten nicht geladen werden",
    );
  });

  it("manuelle Datei außerhalb des eigenen Termin-Ordners wird nicht signiert", async () => {
    const rows = baseRows();
    rows.manual_reservation_documents = [
      { id: "m2", reservation_id: M1, doc_type: "id_back", file_path: "admin/manual/other-id/x.jpg", created_at: "2026-01-02" },
    ];
    const { db, signed } = fakeDb(rows);
    const d = await loadCalendarEntryDetails(db, "admin", "manual", M1);
    expect(d.documents.id.back?.fileState).toBe("path_rejected");
    expect(signed).toEqual([]);
  });

  it("Signierfehler → neutraler Zustand unavailable", async () => {
    const { db } = fakeDb(baseRows());
    const d = await loadCalendarEntryDetails(db, "admin", "booking", B1);
    expect(d.documents.id.back?.fileState).toBe("unavailable");
  });
});

describe("isSafeOwnedPath", () => {
  it("akzeptiert nur relative Pfade unter dem Eigentümer", () => {
    expect(isSafeOwnedPath(`${U1}/a.jpg`, `${U1}/`)).toBe(true);
    expect(isSafeOwnedPath(`${U2}/a.jpg`, `${U1}/`)).toBe(false);
    expect(isSafeOwnedPath(`${U1}/../${U2}/a.jpg`, `${U1}/`)).toBe(false);
    expect(isSafeOwnedPath(`/${U1}/a.jpg`, `${U1}/`)).toBe(false);
    expect(isSafeOwnedPath(`https://x.test/${U1}/a.jpg`, `${U1}/`)).toBe(false);
    expect(isSafeOwnedPath(`${U1}/%2e%2e/a.jpg`, `${U1}/`)).toBe(false);
    expect(isSafeOwnedPath(null, `${U1}/`)).toBe(false);
  });
});
