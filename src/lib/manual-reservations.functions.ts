import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isValidIsoDate, todayIsoBerlin } from "@/lib/age";

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
  "id, vehicle_id, vehicle_plate, vehicle_name, start_at, end_at, customer_name, customer_phone, customer_email, customer_birth_date, customer_street, customer_city, customer_id_number, customer_license_number, note, reminder_enabled, notify_customer, created_at";

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
});

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

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error || !data) throw new Error("Forbidden");
}

export const listManualReservations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
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

export const upsertManualReservation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => upsertSchema.parse(input))
  .handler(async ({ data, context }): Promise<ManualReservation> => {
    await assertAdmin(context);

    const start = new Date(data.startAt);
    const end = new Date(data.endAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new Error("Ungültiger Zeitraum");
    }
    if (end.getTime() <= start.getTime()) {
      throw new Error("Das Ende muss nach dem Start liegen");
    }

    const payload = {
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
      created_by: context.userId,
    };

    if (data.id) {
      const { data: row, error } = await context.supabase
        .from("manual_reservations")
        .update(payload)
        .eq("id", data.id)
        .select(SELECT_COLUMNS)
        .single();
      if (error) throw new Error(error.message);
      return row as ManualReservation;
    }

    const { data: row, error } = await context.supabase
      .from("manual_reservations")
      .insert(payload)
      .select(SELECT_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return row as ManualReservation;
  });

export const deleteManualReservation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
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
    return { ok: true as const };
  });

/** Dokumente eines manuellen Termins inkl. zeitlich begrenzter Ansichts-Links. */
export const listManualReservationDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
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
  .middleware([requireSupabaseAuth])
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
  .middleware([requireSupabaseAuth])
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
