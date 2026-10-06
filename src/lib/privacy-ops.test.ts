import { describe, it, expect, vi } from "vitest";
import {
  removeDocumentsFromAccount,
  runAccountDeletion,
  findBlockingRental,
  purgeExpiredArchive,
  type PrivacyStore,
  type DocRow,
} from "./privacy-ops.server";
import { computeRetention } from "./document-retention";
import { isRecentAuth } from "./account.functions";

const UID = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const NOW = Date.parse("2026-10-06T12:00:00Z");

type Bk = { id: string; status: string; start_date: string; start_hour: number; plan_id: string };

function makeStore(opts: { docs?: DocRow[]; bookings?: Bk[]; files?: Record<string, boolean>; failAt?: string } = {}) {
  const docs = [...(opts.docs ?? [])];
  const removed = new Set<string>();
  const archive = new Map<string, unknown>();
  const archiveFiles = new Set<string>();
  const userFiles = new Map(Object.entries(opts.files ?? {}));
  let deletion: { status: string; requested_at: string; completed_at: string | null } | null = null;
  let authExists = true;
  let failAt = opts.failAt;
  const log: string[] = [];
  const maybeFail = (step: string) => {
    if (failAt === step) {
      failAt = undefined; // nur einmal, dann Wiederaufnahme möglich
      throw new Error(`simuliert: ${step}`);
    }
  };
  const store: PrivacyStore = {
    listDocs: async (uid, types) => docs.filter((d) => d.user_id === uid && types.includes(d.doc_type) && !removed.has(d.id)),
    listBookings: async () => (opts.bookings ?? []) as never,
    archiveExists: async (id) => archive.has(id),
    download: async (p) => {
      maybeFail("download");
      return userFiles.has(p) ? { bytes: new Uint8Array([1, 2]), contentType: "image/jpeg" } : null;
    },
    uploadArchive: async (p) => {
      archiveFiles.add(p);
    },
    insertArchive: async (row) => {
      if (!archive.has(row.source_document_id)) archive.set(row.source_document_id, row);
    },
    removeUserFiles: async (paths) => {
      maybeFail("storage");
      paths.forEach((p) => userFiles.delete(p));
    },
    markRemoved: async (id) => {
      removed.add(id);
    },
    claimDeletion: async () => {
      if (!deletion) deletion = { status: "requested", requested_at: "2026-10-06T10:00:00Z", completed_at: null };
      if (deletion.status === "completed") return "completed";
      if (deletion.status === "processing") return "processing";
      deletion.status = "processing";
      return "claimed";
    },
    requestDeletion: async () => {
      if (!deletion) deletion = { status: "requested", requested_at: "2026-10-06T10:00:00Z", completed_at: null };
      return deletion.requested_at;
    },
    completeDeletion: async () => {
      deletion!.status = "completed";
      deletion!.completed_at = "2026-10-06T12:00:01Z";
      return deletion!.completed_at;
    },
    failDeletion: async () => {
      deletion!.status = "failed";
    },
    deletionStatus: async () => deletion,
    listUserFiles: async (uid) => [...userFiles.keys()].filter((k) => k.startsWith(`${uid}/`)),
    deleteUserDocumentRows: async () => {
      log.push("docrows");
    },
    deleteDevicesAndMarketing: async () => {
      log.push("devices");
    },
    countBookings: async () => (opts.bookings ?? []).length,
    deleteAuthUser: async () => {
      maybeFail("auth");
      if (!authExists) return "missing";
      authExists = false;
      log.push("auth");
      return "deleted";
    },
    deleteProfile: async () => {
      log.push("profile");
    },
    listDueArchive: async () => [],
    removeArchiveFile: async () => {},
    markPurged: async () => {},
  };
  return { store, archive, archiveFiles, userFiles, removed, log, get deletion() { return deletion; }, get authExists() { return authExists; } };
}

const doc = (id: string, type: string, created = "2026-09-01T10:00:00Z", user = UID): DocRow => ({
  id,
  user_id: user,
  doc_type: type,
  photo_url: `${user}/${type}-${id}.jpg`,
  created_at: created,
});

describe("Aufbewahrung (simuliert)", () => {
  it("ohne Mietvertrag: sofort löschen", () => {
    expect(computeRetention(NOW - 1000, [], NOW).action).toBe("delete");
  });
  it("Vertrag vor 30 Tagen beendet: Archiv bis 90 Tage nach Ende", () => {
    const r = computeRetention(Date.parse("2026-08-01T00:00:00Z"), [
      { id: "b1aaaaaa", status: "completed", start_date: "2026-09-05", start_hour: 10, plan_id: "24h" },
    ], NOW);
    expect(r.action).toBe("archive");
    if (r.action === "archive") expect(r.untilMs).toBeGreaterThan(NOW);
  });
  it("Frist bereits abgelaufen: nicht verlängern, sofort löschen", () => {
    const r = computeRetention(Date.parse("2026-01-01T00:00:00Z"), [
      { id: "b1", status: "completed", start_date: "2026-02-01", start_hour: 10, plan_id: "24h" },
    ], NOW);
    expect(r.action).toBe("delete");
  });
  it("stornierte Buchung begründet keine Aufbewahrung", () => {
    const r = computeRetention(NOW - 1000, [
      { id: "b1", status: "cancelled", start_date: "2026-10-10", start_hour: 10, plan_id: "24h" },
    ], NOW);
    expect(r.action).toBe("delete");
  });
});

describe("Dokument aus Konto entfernen (simuliert)", () => {
  const bookings: Bk[] = [{ id: "b1aaaaaa-x", status: "completed", start_date: "2026-09-20", start_hour: 10, plan_id: "24h" }];

  it("archiviert benötigte Kopie privat, entfernt Kundenpfad, kein Doppel-Archiv bei Wiederholung", async () => {
    const d = doc("d1", "id_front");
    const s = makeStore({ docs: [d], bookings, files: { [d.photo_url]: true } });
    const r1 = await removeDocumentsFromAccount(s.store, UID, ["id_front", "id_back"], NOW);
    expect(r1).toEqual({ processed: 1, archived: 1, deleted: 0 });
    expect(s.userFiles.has(d.photo_url)).toBe(false);
    expect([...s.archiveFiles][0]).toBe(`${UID}/d1.jpg`);
    const r2 = await removeDocumentsFromAccount(s.store, UID, ["id_front", "id_back"], NOW);
    expect(r2.processed).toBe(0);
    expect(s.archive.size).toBe(1);
  });

  it("Speicherfehler: nichts als entfernt markiert, Wiederholung klappt ohne Doppel-Archiv", async () => {
    const d = doc("d1", "license_front");
    const s = makeStore({ docs: [d], bookings, files: { [d.photo_url]: true }, failAt: "storage" });
    await expect(removeDocumentsFromAccount(s.store, UID, ["license_front"], NOW)).rejects.toThrow();
    expect(s.removed.size).toBe(0);
    await removeDocumentsFromAccount(s.store, UID, ["license_front"], NOW);
    expect(s.removed.has("d1")).toBe(true);
    expect(s.archive.size).toBe(1);
  });

  it("fremde Dokumente und manipulierte Pfade werden nie angefasst", async () => {
    const foreign = doc("d2", "id_front", undefined, OTHER);
    const tampered = { ...doc("d3", "id_front"), photo_url: `${OTHER}/id.jpg` };
    const s = makeStore({ docs: [foreign, tampered], bookings, files: { [foreign.photo_url]: true, [`${OTHER}/id.jpg`]: true } });
    await removeDocumentsFromAccount(s.store, UID, ["id_front"], NOW);
    expect(s.userFiles.has(foreign.photo_url)).toBe(true);
    expect(s.userFiles.has(`${OTHER}/id.jpg`)).toBe(true);
    expect(s.archive.size).toBe(0);
  });

  it("Reupload nach Entfernen: altes Archiv bleibt unverändert, neues Dokument separat", async () => {
    const d = doc("d1", "id_front");
    const s = makeStore({ docs: [d], bookings, files: { [d.photo_url]: true } });
    await removeDocumentsFromAccount(s.store, UID, ["id_front"], NOW);
    const before = s.archive.get("d1");
    // neuer Upload, nie entfernt -> listDocs liefert nur das neue
    expect((await s.store.listDocs(UID, ["id_front"])).length).toBe(0);
    expect(s.archive.get("d1")).toBe(before);
  });
});

describe("Kontolöschung (simuliert)", () => {
  it("offene/bevorstehende Miete: nur Löschantrag mit Zeitpunkt, nichts gelöscht", async () => {
    const s = makeStore({ bookings: [{ id: "b", status: "confirmed", start_date: "2026-10-10", start_hour: 9, plan_id: "24h" }] });
    const r = await runAccountDeletion(s.store, { uid: UID, accountCreatedAt: null, bookings: s.store ? ((await s.store.listBookings(UID)) as never) : [], nowMs: NOW });
    expect(r).toEqual({ ok: false, kind: "requested", requestedAt: "2026-10-06T10:00:00Z" });
    expect(s.authExists).toBe(true);
  });

  it("bestätigte Löschung: Auth, Profil, Geräte; Buchungen bleiben; doppelter Request idempotent", async () => {
    const d = doc("d1", "id_front");
    const bookings: Bk[] = [{ id: "b", status: "completed", start_date: "2026-09-20", start_hour: 9, plan_id: "24h" }];
    const s = makeStore({ docs: [d], bookings, files: { [d.photo_url]: true, [`${UID}/orphan.jpg`]: true } });
    const r = await runAccountDeletion(s.store, { uid: UID, accountCreatedAt: "2026-01-01T00:00:00Z", bookings, nowMs: NOW });
    expect(r).toEqual({ ok: true, completedAt: "2026-10-06T12:00:01Z", already: false });
    expect(s.authExists).toBe(false);
    expect(s.log).toEqual(["docrows", "devices", "auth", "profile"]);
    expect(s.userFiles.size).toBe(0);
    expect(s.archive.size).toBe(1);
    const again = await runAccountDeletion(s.store, { uid: UID, accountCreatedAt: null, bookings, nowMs: NOW });
    expect(again).toEqual({ ok: true, completedAt: "2026-10-06T12:00:01Z", already: true });
    expect(s.archive.size).toBe(1);
  });

  it("Auth-Teilfehler: Status failed, Wiederaufnahme schließt ab ohne Doppel-Archiv", async () => {
    const d = doc("d1", "id_front");
    const bookings: Bk[] = [{ id: "b", status: "completed", start_date: "2026-09-20", start_hour: 9, plan_id: "24h" }];
    const s = makeStore({ docs: [d], bookings, files: { [d.photo_url]: true }, failAt: "auth" });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const r1 = await runAccountDeletion(s.store, { uid: UID, accountCreatedAt: null, bookings, nowMs: NOW });
    expect(r1).toEqual({ ok: false, kind: "failed" });
    expect(s.deletion?.status).toBe("failed");
    expect(s.authExists).toBe(true);
    const r2 = await runAccountDeletion(s.store, { uid: UID, accountCreatedAt: null, bookings, nowMs: NOW });
    expect(r2.ok).toBe(true);
    expect(s.archive.size).toBe(1);
  });

  it("parallel laufende Löschung wird nicht doppelt gestartet", async () => {
    const s = makeStore();
    await s.store.claimDeletion(UID, null); // anderer Lauf hält die Sperre
    const r = await runAccountDeletion(s.store, { uid: UID, accountCreatedAt: null, bookings: [], nowMs: NOW });
    expect(r).toEqual({ ok: false, kind: "busy" });
  });
});

describe("Blockierende Miete", () => {
  it("vergangene bezahlte Buchung blockiert nicht", () => {
    expect(findBlockingRental([{ id: "a", status: "paid", start_date: "2026-09-01", start_hour: 9, plan_id: "24h" }], NOW)).toBeNull();
  });
  it("aktive Fahrt ab Stichtag blockiert auch nach Ende", () => {
    expect(findBlockingRental([{ id: "a", status: "active", start_date: "2026-10-06", start_hour: 0, plan_id: "3h" }], NOW)).not.toBeNull();
  });
  it("offene Altbuchung vor Stichtag blockiert nicht", () => {
    expect(findBlockingRental([{ id: "a", status: "active", start_date: "2026-09-01", start_hour: 9, plan_id: "24h" }], NOW)).toBeNull();
  });
});

describe("Besitzbestätigung", () => {
  it("frische Anmeldung zählt, alte nicht", () => {
    const now = 1_000_000;
    expect(isRecentAuth({ amr: [{ method: "password", timestamp: now - 60 }] }, now)).toBe(true);
    expect(isRecentAuth({ amr: [{ method: "password", timestamp: now - 3600 }] }, now)).toBe(false);
    expect(isRecentAuth({}, now)).toBe(false);
  });
});

describe("Archivbereinigung", () => {
  it("löscht nur fällige Einträge, Fehler einzelner Dateien stoppen nicht den Rest", async () => {
    const s = makeStore();
    const purged: string[] = [];
    s.store.listDueArchive = async () => [{ id: "a", storage_path: "x/a.jpg" }, { id: "b", storage_path: "x/b.jpg" }];
    s.store.removeArchiveFile = async (p) => {
      if (p === "x/a.jpg") throw new Error("simuliert");
    };
    s.store.markPurged = async (id) => {
      purged.push(id);
    };
    expect(await purgeExpiredArchive(s.store, NOW)).toEqual({ due: 2, purged: 1, failed: 1 });
    expect(purged).toEqual(["b"]);
  });
});
