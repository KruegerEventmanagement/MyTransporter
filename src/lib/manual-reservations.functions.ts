import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveAccount } from "@/lib/active-account";
import { isValidIsoDate, todayIsoBerlin } from "@/lib/age";
import { MAX_PRICE_CENTS } from "@/lib/money-input";
import { PICKUP_ADDRESS } from "@/lib/seo";
import { isValidCustomerEmail } from "@/lib/manual-confirmation";

export type ManualReservation = {
  id: string;
  vehicle_id: string | null;
  vehicle_plate: string;
  vehicle_name: string | null;
  start_at: string;
  end_at: string;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  customer_birth_date: string | null;
  customer_street: string | null;
  customer_city: string | null;
  customer_id_number: string | null;
  customer_license_number: string | null;
  note: string | null;
  reminder_enabled: boolean;
  notify_customer: boolean;
  total_price_cents: number | null;
  pickup_address: string | null;
  revision: number;
  confirmation_requested: boolean;
  created_at: string;
};

export type ManualReservationDocument = {
  id: string;
  reservation_id: string;
  doc_type: string;
  file_path: string;
  original_name: string | null;
  created_at: string;
};

const SELECT_COLUMNS =
  "id, vehicle_id, vehicle_plate, vehicle_name, start_at, end_at, customer_name, customer_phone, customer_email, customer_birth_date, customer_street, customer_city, customer_id_number, customer_license_number, note, reminder_enabled, notify_customer, total_price_cents, pickup_address, revision, confirmation_requested, created_at";

const DOC_SELECT_COLUMNS = "id, reservation_id, doc_type, file_path, original_name, created_at";

const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Ungültiges Geburtsdatum")
  .refine((v) => isValidIsoDate(v), "Ungültiges Geburtsdatum")
  .refine((v) => v <= todayIsoBerlin(), "Das Geburtsdatum darf nicht in der Zukunft liegen");

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  vehicleId: z.string().uuid().nullable().optional(),
  vehiclePlate: z.string().trim().min(1, "Kennzeichen fehlt").max(20),
  vehicleName: z.string().trim().max(120).nullable().optional(),
  startAt: z.string().min(1),
  endAt: z.string().min(1),
  customerName: z.string().trim().min(1, "Name fehlt").max(120),
  customerPhone: optionalText(40),
  customerEmail: z.string().trim().email("Ungültige E-Mail").max(255).nullable().optional(),
  customerBirthDate: isoDate.nullable().optional(),
  customerStreet: optionalText(160),
  customerCity: optionalText(160),
  customerIdNumber: optionalText(60),
  customerLicenseNumber: optionalText(60),
  note: optionalText(1000),
  reminderEnabled: z.boolean().default(true),
  notifyCustomer: z.boolean().default(false),
  /** Gesamtmietpreis in ganzen Cent. Pflicht für neue Termine. */
  totalPriceCents: z.number().int().min(0).max(MAX_PRICE_CENTS).nullable().optional(),
  /** Kunden-Buchungsbestätigung für die gespeicherte Fassung senden. */
  sendConfirmation: z.boolean().default(false),
  /** Stabile Kennung je Anlage-Vorgang – schützt vor Doppelanlage bei Retry. */
  createRequestId: z.string().uuid().optional(),
});

export type UpsertInput = z.infer<typeof upsertSchema>;

/** Fachliche Pflichtprüfungen (serverseitig, unabhängig vom Browser). */
export function validateManualUpsert(data: UpsertInput): string | null {
  const start = Date.parse(data.startAt);
  const end = Date.parse(data.endAt);
  if (Number.isNaN(start) || Number.isNaN(end)) return "Ungültiger Zeitraum";
  if (end <= start) return "Das Ende muss nach dem Start liegen";
  if (!data.id && data.totalPriceCents == null) return "Bitte den Gesamtmietpreis eintragen";
  if ((data.sendConfirmation || data.notifyCustomer) && !isValidCustomerEmail(data.customerEmail)) {
    return "Für Bestätigung/Erinnerung an den Kunden ist eine gültige E-Mail-Adresse Pflicht";
  }
  if (data.sendConfirmation && data.id && data.totalPriceCents == null) {
    return "Für die Bestätigung bitte den Gesamtmietpreis eintragen";
  }
  return null;
}

export type UpsertResult = {
  reservation: ManualReservation;
  /** true = Anlage war bereits gespeichert (wiederholte Anfrage), nichts geändert. */
  deduplicated: boolean;
  confirmation: import("@/lib/manual-confirmation.server").ConfirmationOutcome | null;
};

async function confirmSaved(id: string, revision: number) {
  try {
    const { runCustomerConfirmation, createConfirmationDeps } = await import(
      "@/lib/manual-confirmation.server"
    );
    return await runCustomerConfirmation(await createConfirmationDeps(), { reservationId: id, revision });
  } catch (e) {
    // Speichern ist bereits erfolgreich – Versandfehler nie als Speicherfehler melden.
    return {
      status: "failed" as const,
      kind: "internal",
      error: String((e as Error)?.message ?? e).slice(0, 300),
      ambiguous: true,
      revision,
    };
  }
}

const listSchema = z.object({
  fromIso: z.string().min(1),
  toIso: z.string().min(1),
});

const DOC_TYPES = [
  "id_front",
  "id_back",
  "license_front",
  "license_back",
  "other",
] as const;

/**
 * Stößt den Versand der Owner-Benachrichtigung sofort an. Die Einreihung selbst
 * passiert atomar per Datenbank-Trigger, daher darf ein Fehler hier die
 * gespeicherte Reservierung nie zurückrollen – es wird planmäßig wiederholt.
 */
async function kickOutbox(reservationId: string): Promise<void> {
  try {
    const { kickManualNotificationOutbox } = await import("@/lib/manual-notifications.server");
    await kickManualNotificationOutbox();
  } catch (e) {
    console.warn("Benachrichtigungslauf nicht gestartet:", e);
  }
  // Kalenderübertragung ist unabhängig: ein Fehler hier darf die Mail-/Push-
  // Benachrichtigung und die gespeicherte Reservierung nie beeinflussen.
  try {
    const { kickCalendarSync } = await import("@/lib/calendar-sync.server");
    await kickCalendarSync("manual_reservation", reservationId);
  } catch (e) {
    console.warn("Kalenderübertragung nicht gestartet:", e);
  }
}

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error || !data) throw new Error("Forbidden");
}

export const listManualReservations = createServerFn({ method: "POST" })
  .middleware([requireActiveAccount])
  .inputValidator((input: unknown) => listSchema.parse(input))
  .handler(async ({ data, context }): Promise<ManualReservation[]> => {
    await assertAdmin(context);
    const { data: rows, error } = await context.supabase
      .from("manual_reservations")
      .select(SELECT_COLUMNS)
      .lt("start_at", data.toIso)
      .gt("end_at", data.fromIso)
      .order("start_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (rows ?? []) as ManualReservation[];
  });

/** Kern des Speicherns (exportiert für Tests; nur serverseitig aufrufen). */
export async function performManualUpsert(
  data: UpsertInput,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: { supabase: any; userId: string },
): Promise<UpsertResult> {
    await assertAdmin(context);
    const invalid = validateManualUpsert(data);
    if (invalid) throw new Error(invalid);
    const start = new Date(data.startAt);
    const end = new Date(data.endAt);

    const payload: {
      [k: string]: string | number | boolean | null;
      vehicle_plate: string;
      start_at: string;
      end_at: string;
      customer_name: string;
    } = {
      vehicle_id: data.vehicleId ?? null,
      vehicle_plate: data.vehiclePlate,
      vehicle_name: data.vehicleName ?? null,
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      customer_name: data.customerName,
      customer_phone: data.customerPhone || null,
      customer_email: data.customerEmail || null,
      customer_birth_date: data.customerBirthDate || null,
      customer_street: data.customerStreet || null,
      customer_city: data.customerCity || null,
      customer_id_number: data.customerIdNumber || null,
      customer_license_number: data.customerLicenseNumber || null,
      note: data.note || null,
      reminder_enabled: data.reminderEnabled,
      notify_customer: data.notifyCustomer,
      confirmation_requested: data.sendConfirmation,
      created_by: context.userId,
    };

    // Preis nur setzen, wenn angegeben – ein bestehender Preis wird nie still entfernt.
    if (data.totalPriceCents != null) payload.total_price_cents = data.totalPriceCents;

    if (data.id) {
      // Abholort-Snapshot nur ergänzen, nie bestehende Snapshots umschreiben.
      const { data: cur } = await context.supabase
        .from("manual_reservations")
        .select("pickup_address")
        .eq("id", data.id)
        .maybeSingle();
      if (!cur?.pickup_address) payload.pickup_address = PICKUP_ADDRESS;
      const { data: row, error } = await context.supabase
        .from("manual_reservations")
        .update(payload as never)
        .eq("id", data.id)
        .select(SELECT_COLUMNS)
        .single();
      if (error) throw new Error(error.message);
      await kickOutbox(data.id);
      const saved = row as ManualReservation;
      return {
        reservation: saved,
        deduplicated: false,
        confirmation: data.sendConfirmation ? await confirmSaved(saved.id, saved.revision) : null,
      };
    }

    payload.pickup_address = PICKUP_ADDRESS;
    if (data.createRequestId) payload.create_request_id = data.createRequestId;
    const { data: row, error } = await context.supabase
      .from("manual_reservations")
      .insert(payload as never)
      .select(SELECT_COLUMNS)
      .single();
    if (error) {
      // Wiederholte Anlage (verlorene Antwort): bestehende Zeile zurückgeben, nichts ändern.
      if (error.code === "23505" && data.createRequestId) {
        const { data: existing } = await context.supabase
          .from("manual_reservations")
          .select(SELECT_COLUMNS)
          .eq("create_request_id", data.createRequestId)
          .maybeSingle();
        if (existing) {
          const ex = existing as ManualReservation & { confirmation_requested?: boolean };
          return {
            reservation: ex,
            deduplicated: true,
            confirmation: ex.confirmation_requested ? await confirmSaved(ex.id, ex.revision) : null,
          };
        }
      }
      throw new Error(error.message);
    }
    const saved = row as ManualReservation;
    await kickOutbox(saved.id);
    return {
      reservation: saved,
      deduplicated: false,
      confirmation: data.sendConfirmation ? await confirmSaved(saved.id, saved.revision) : null,
    };
}

export const upsertManualReservation = createServerFn({ method: "POST" })
  .middleware([requireActiveAccount])
  .inputValidator((input: unknown) => upsertSchema.parse(input))
  .handler(({ data, context }) => performManualUpsert(data, context));

export const deleteManualReservation = createServerFn({ method: "POST" })
  .middleware([requireActiveAccount])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);

    // Dateien im geschützten Speicher mit aufräumen (Zeilen entfernt die Kaskade)
    const { data: docs } = await context.supabase
      .from("manual_reservation_documents")
      .select("file_path")
      .eq("reservation_id", data.id);
    const paths = (docs ?? []).map((d: { file_path: string }) => d.file_path).filter(Boolean);
    if (paths.length > 0) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.storage.from("user-documents").remove(paths);
    }

    const { error } = await context.supabase
      .from("manual_reservations")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await kickOutbox(data.id);
    return { ok: true as const };
  });

/** Dokumente eines manuellen Termins inkl. zeitlich begrenzter Ansichts-Links. */
export const listManualReservationDocuments = createServerFn({ method: "POST" })
  .middleware([requireActiveAccount])
  .inputValidator((input: unknown) =>
    z.object({ reservationId: z.string().uuid() }).parse(input),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<Array<ManualReservationDocument & { signedUrl: string | null }>> => {
      await assertAdmin(context);
      const { data: rows, error } = await context.supabase
        .from("manual_reservation_documents")
        .select(DOC_SELECT_COLUMNS)
        .eq("reservation_id", data.reservationId)
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);

      const docs = (rows ?? []) as ManualReservationDocument[];
      return await Promise.all(
        docs.map(async (doc) => {
          const { data: signed } = await context.supabase.storage
            .from("user-documents")
            .createSignedUrl(doc.file_path, 3600);
          return { ...doc, signedUrl: signed?.signedUrl ?? null };
        }),
      );
    },
  );

/** Legt einen Dokumenteintrag zu einem manuellen Termin an (Datei liegt bereits im Speicher). */
export const addManualReservationDocument = createServerFn({ method: "POST" })
  .middleware([requireActiveAccount])
  .inputValidator((input: unknown) =>
    z
      .object({
        reservationId: z.string().uuid(),
        docType: z.enum(DOC_TYPES).default("other"),
        filePath: z.string().trim().min(1).max(400),
        originalName: z.string().trim().max(200).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<ManualReservationDocument> => {
    await assertAdmin(context);
    const { data: row, error } = await context.supabase
      .from("manual_reservation_documents")
      .insert({
        reservation_id: data.reservationId,
        doc_type: data.docType,
        file_path: data.filePath,
        original_name: data.originalName || null,
        created_by: context.userId,
      })
      .select(DOC_SELECT_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return row as ManualReservationDocument;
  });

/** Entfernt ein Dokument samt Datei aus dem geschützten Speicher. */
export const deleteManualReservationDocument = createServerFn({ method: "POST" })
  .middleware([requireActiveAccount])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: row } = await context.supabase
      .from("manual_reservation_documents")
      .select("file_path")
      .eq("id", data.id)
      .maybeSingle();

    const { error } = await context.supabase
      .from("manual_reservation_documents")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    if (row?.file_path) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.storage.from("user-documents").remove([row.file_path]);
    }
    return { ok: true as const };
  });

export type ManualNotificationState = {
  reservation_id: string;
  event_kind: string;
  status: string;
  attempts: number;
  last_error: string | null;
  created_at: string;
};

/** Zustand der Owner-Benachrichtigungen (ausstehend / gesendet / Fehler). */
export const listManualNotificationStates = createServerFn({ method: "POST" })
  .middleware([requireActiveAccount])
  .inputValidator((input: unknown) =>
    z.object({ reservationIds: z.array(z.string().uuid()).max(300) }).parse(input),
  )
  .handler(async ({ data, context }): Promise<ManualNotificationState[]> => {
    await assertAdmin(context);
    if (data.reservationIds.length === 0) return [];
    const { data: rows, error } = await context.supabase
      .from("manual_reservation_notifications")
      .select("reservation_id, event_kind, status, attempts, last_error, created_at")
      .in("reservation_id", data.reservationIds)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as ManualNotificationState[];
  });

export type CustomerMailState = {
  reservation_id: string;
  revision: number;
  status: "pending" | "processing" | "sent" | "failed";
  attempts: number;
  ambiguous: boolean;
  error_kind: string | null;
  last_error: string | null;
  sent_at: string | null;
  lease_until: string | null;
  first_attempt_at: string | null;
};

/** Kunden-Bestätigung senden (nur nach gespeicherter Reservierung, idempotent je Revision). */
export const sendManualReservationConfirmation = createServerFn({ method: "POST" })
  .middleware([requireActiveAccount])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), revision: z.number().int().min(1) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    return confirmSaved(data.id, data.revision);
  });

/** Status der Kunden-Bestätigungen (neueste Revision zuerst). */
export const listCustomerMailStates = createServerFn({ method: "POST" })
  .middleware([requireActiveAccount])
  .inputValidator((input: unknown) =>
    z.object({ reservationIds: z.array(z.string().uuid()).max(300) }).parse(input),
  )
  .handler(async ({ data, context }): Promise<CustomerMailState[]> => {
    await assertAdmin(context);
    if (data.reservationIds.length === 0) return [];
    const { data: rows, error } = await context.supabase
      .from("manual_reservation_customer_mails")
      .select("reservation_id, revision, status, attempts, ambiguous, error_kind, last_error, sent_at, lease_until, first_attempt_at")
      .in("reservation_id", data.reservationIds)
      .order("revision", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as CustomerMailState[];
  });
