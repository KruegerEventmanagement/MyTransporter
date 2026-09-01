import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
  note: string | null;
  reminder_enabled: boolean;
  notify_customer: boolean;
  created_at: string;
};

const SELECT_COLUMNS =
  "id, vehicle_id, vehicle_plate, vehicle_name, start_at, end_at, customer_name, customer_phone, customer_email, note, reminder_enabled, notify_customer, created_at";

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  vehicleId: z.string().uuid().nullable().optional(),
  vehiclePlate: z.string().trim().min(1, "Kennzeichen fehlt").max(20),
  vehicleName: z.string().trim().max(120).nullable().optional(),
  startAt: z.string().min(1),
  endAt: z.string().min(1),
  customerName: z.string().trim().min(1, "Name fehlt").max(120),
  customerPhone: z.string().trim().max(40).nullable().optional(),
  customerEmail: z.string().trim().email("Ungültige E-Mail").max(255).nullable().optional(),
  note: z.string().trim().max(1000).nullable().optional(),
  reminderEnabled: z.boolean().default(true),
  notifyCustomer: z.boolean().default(false),
});

const listSchema = z.object({
  fromIso: z.string().min(1),
  toIso: z.string().min(1),
});

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
    const { error } = await context.supabase
      .from("manual_reservations")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
