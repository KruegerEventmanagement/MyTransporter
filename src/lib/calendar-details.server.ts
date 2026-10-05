/**
 * Serverseitige Auflösung der Kalender-Details (nur Admin).
 * Verknüpfung ausschließlich über IDs: Buchung → user_id → Profil/Dokumente,
 * manueller Termin → reservation_id → eigene Dokumente. Kein Namensabgleich.
 * Dokument-Links werden kurzfristig signiert und nie protokolliert.
 */
import { clean, joinAddress, pickDocuments, isPdfPath, DOC_TYPE_MAP, type RawDoc } from "@/lib/calendar-details";

export const SIGNED_URL_SECONDS = 600;

export type DetailDoc = {
  id: string;
  docType: string;
  label: string;
  signedUrl: string | null;
  isPdf: boolean;
  removedByUser: boolean;
  originalName: string | null;
};

export type CalendarEntryDetails = {
  kind: "booking" | "manual";
  id: string;
  startAt: string;
  endAt: string;
  vehicleName: string | null;
  vehiclePlate: string | null;
  booking: null | {
    planLabel: string | null;
    status: string | null;
    planPrice: number | null;
    deposit: number | null;
    discountCents: number | null;
    addonsTotalCents: number | null;
    addons: string[];
    freeKm: number | null;
    kmPriceCents: number | null;
    couponCode: string | null;
    createdAt: string | null;
  };
  customer: {
    name: string | null;
    phone: string | null;
    email: string | null;
    birthDate: string | null;
    address: string | null;
    companyName: string | null;
    idNumber: string | null;
    licenseNumber: string | null;
    profileLinked: boolean;
  };
  notes: string | null;
  documents: {
    license: { front: DetailDoc | null; back: DetailDoc | null };
    id: { front: DetailDoc | null; back: DetailDoc | null };
    others: DetailDoc[];
  };
};

const LABELS: Record<string, string> = {
  id_front: "Ausweis · Vorderseite",
  id_back: "Ausweis · Rückseite",
  license_front: "Führerschein · Vorderseite",
  license_back: "Führerschein · Rückseite",
};

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = any;

async function sign(db: Db, path: string): Promise<string | null> {
  try {
    const { data, error } = await db.storage.from("user-documents").createSignedUrl(path, SIGNED_URL_SECONDS);
    if (error) return null;
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}

async function toDetailDocs(db: Db, rows: RawDoc[]): Promise<CalendarEntryDetails["documents"]> {
  const { slots, others } = pickDocuments(rows);
  const conv = async (r: RawDoc | undefined): Promise<DetailDoc | null> =>
    r
      ? {
          id: r.id,
          docType: r.doc_type,
          label: LABELS[r.doc_type] ?? "Weiteres Dokument",
          signedUrl: await sign(db, r.path),
          isPdf: isPdfPath(r.path) || isPdfPath(r.original_name),
          removedByUser: !!r.deleted,
          originalName: r.original_name ?? null,
        }
      : null;
  const [lf, lb, idf, idb, ...rest] = await Promise.all([
    conv(slots.license_front),
    conv(slots.license_back),
    conv(slots.id_front),
    conv(slots.id_back),
    ...others.map(conv),
  ]);
  return {
    license: { front: lf, back: lb },
    id: { front: idf, back: idb },
    others: rest.filter((d): d is DetailDoc => !!d),
  };
}

function addonLabels(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((a) => {
      if (!a || typeof a !== "object") return null;
      const o = a as Record<string, unknown>;
      const label = clean((o.label ?? o.name ?? o.title ?? o.id) as string | null);
      const qty = typeof o.quantity === "number" && o.quantity > 1 ? ` × ${o.quantity}` : "";
      return label ? `${label}${qty}` : null;
    })
    .filter((x): x is string => !!x);
}

export async function assertAdminRole(db: Db, userId: string): Promise<void> {
  const { data, error } = await db.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error || !data) throw new Error("Forbidden");
}

export async function loadCalendarEntryDetails(
  db: Db,
  userId: string,
  kind: "booking" | "manual",
  id: string,
): Promise<CalendarEntryDetails> {
  await assertAdminRole(db, userId);

  if (kind === "manual") {
    const { data: m, error } = await db
      .from("manual_reservations")
      .select(
        "id, vehicle_plate, vehicle_name, start_at, end_at, customer_name, customer_phone, customer_email, customer_birth_date, customer_street, customer_city, customer_id_number, customer_license_number, note",
      )
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error("Termin konnte nicht geladen werden");
    if (!m) throw new Error("Termin nicht gefunden");
    const { data: docs, error: docErr } = await db
      .from("manual_reservation_documents")
      .select("id, doc_type, file_path, original_name, created_at")
      .eq("reservation_id", m.id);
    if (docErr) throw new Error("Dokumente konnten nicht geladen werden");
    const raw: RawDoc[] = (docs ?? []).map((d: any) => ({
      id: d.id,
      doc_type: d.doc_type,
      path: d.file_path,
      created_at: d.created_at,
      original_name: d.original_name,
    }));
    return {
      kind,
      id: m.id,
      startAt: m.start_at,
      endAt: m.end_at,
      vehicleName: m.vehicle_name,
      vehiclePlate: m.vehicle_plate,
      booking: null,
      customer: {
        name: clean(m.customer_name),
        phone: clean(m.customer_phone),
        email: clean(m.customer_email),
        birthDate: clean(m.customer_birth_date),
        address: joinAddress({ street: m.customer_street, city: m.customer_city }),
        companyName: null,
        idNumber: clean(m.customer_id_number),
        licenseNumber: clean(m.customer_license_number),
        profileLinked: false,
      },
      notes: clean(m.note),
      documents: await toDetailDocs(db, raw),
    };
  }

  const { data: b, error } = await db
    .from("bookings")
    .select(
      "id, user_id, vehicle_name, vehicle_plate, plan_id, plan_label, plan_price, deposit, start_date, start_hour, status, remarks, created_at, discount_cents, addons, addons_total_cents, free_km, km_price_cents, coupon_code",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("Buchung konnte nicht geladen werden");
  if (!b) throw new Error("Buchung nicht gefunden");

  const { bookingWindowMs } = await import("@/lib/booking-window");
  const w = bookingWindowMs(b.plan_id, b.start_date, b.start_hour);

  // Profil und Dokumente nur über die in der Buchung gespeicherte user_id.
  const [{ data: p }, { data: docs, error: docErr }] = await Promise.all([
    db
      .from("profiles")
      .select(
        "id, first_name, last_name, email, phone, birth_date, company_name, address_street, address_postal_code, address_city, address_country",
      )
      .eq("id", b.user_id)
      .maybeSingle(),
    db
      .from("user_documents")
      .select("id, doc_type, photo_url, created_at, deleted_by_user_at")
      .eq("user_id", b.user_id),
  ]);
  if (docErr) throw new Error("Dokumente konnten nicht geladen werden");
  const raw: RawDoc[] = (docs ?? [])
    .filter((d: any) => DOC_TYPE_MAP[d.doc_type] || d.doc_type)
    .map((d: any) => ({
      id: d.id,
      doc_type: d.doc_type,
      path: d.photo_url,
      created_at: d.created_at,
      deleted: !!d.deleted_by_user_at,
    }));
  const name = p ? [clean(p.first_name), clean(p.last_name)].filter(Boolean).join(" ") || null : null;

  return {
    kind,
    id: b.id,
    startAt: new Date(w.start).toISOString(),
    endAt: new Date(w.end).toISOString(),
    vehicleName: b.vehicle_name,
    vehiclePlate: b.vehicle_plate,
    booking: {
      planLabel: clean(b.plan_label),
      status: clean(b.status),
      planPrice: b.plan_price === null || b.plan_price === undefined ? null : Number(b.plan_price),
      deposit: b.deposit === null || b.deposit === undefined ? null : Number(b.deposit),
      discountCents: b.discount_cents ?? null,
      addonsTotalCents: b.addons_total_cents ?? null,
      addons: addonLabels(b.addons),
      freeKm: b.free_km ?? null,
      kmPriceCents: b.km_price_cents ?? null,
      couponCode: clean(b.coupon_code),
      createdAt: b.created_at ?? null,
    },
    customer: {
      name,
      phone: p ? clean(p.phone) : null,
      email: p ? clean(p.email) : null,
      birthDate: p ? clean(p.birth_date) : null,
      address: p
        ? joinAddress({
            street: p.address_street,
            postalCode: p.address_postal_code,
            city: p.address_city,
            country: p.address_country,
          })
        : null,
      companyName: p ? clean(p.company_name) : null,
      idNumber: null,
      licenseNumber: null,
      profileLinked: !!p,
    },
    notes: clean(b.remarks),
    documents: await toDetailDocs(db, raw),
  };
}
