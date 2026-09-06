import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ChevronLeft, Calendar, Car, Hash, Key, Wallet, Route as RouteIcon, Image as ImageIcon, X } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { resolveTripPhotoUrls } from "@/lib/trip-photos";

export const Route = createFileRoute("/buchung/$bookingId")({
  head: () => ({ meta: [{ title: "MyTransporter · Buchungsdetails" }] }),
  component: BookingDetailPage,
});

interface Booking {
  id: string;
  vehicle_name: string;
  vehicle_plate: string;
  plan_id: string;
  plan_label: string;
  plan_price: number;
  deposit: number;
  deposit_status: string;
  deposit_deducted_cents: number | null;
  deposit_refund_id: string | null;
  deposit_released_at: string | null;
  start_date: string;
  start_hour: number;
  start_km: number | null;
  end_km: number | null;
  pickup_code: string;
  return_code: string | null;
  status: string;
  created_at: string;
  remarks: string | null;
  extra_km: number | null;
  extra_km_charge_cents: number | null;
  km_price_cents: number | null;
  free_km: number | null;
  addons: Array<{ id: string; label: string; price_cents: number }> | null;
  addons_total_cents: number | null;
}

interface TripPhoto {
  id: string;
  photo_type: string;
  photo_url: string;
  created_at: string;
}

interface UserDoc {
  id: string;
  doc_type: string;
  photo_url: string;
  created_at: string;
  resolvedUrl: string;
}

const DOC_LABELS: Record<string, string> = {
  id_front: "Personalausweis · Vorderseite",
  id_back: "Personalausweis · Rückseite",
  license_front: "Führerschein · Vorderseite",
  license_back: "Führerschein · Rückseite",
};

const PHOTO_TYPE_LABEL: Record<string, string> = {
  exterior_front: "Außen vorne",
  exterior_back: "Außen hinten",
  exterior_left: "Außen links",
  exterior_right: "Außen rechts",
  interior: "Innenraum",
  dashboard: "Tacho / Cockpit",
  fuel_gauge: "Tankanzeige",
  damage: "Schaden",
  pre_drive: "Vor der Fahrt",
  return: "Bei Rückgabe",
};

function BookingDetailPage() {
  const { bookingId } = Route.useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [photos, setPhotos] = useState<Array<TripPhoto & { resolvedUrl: string }>>([]);
  const [documents, setDocuments] = useState<UserDoc[]>([]);
  const [lightbox, setLightbox] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) {
        navigate({ to: "/" });
        return;
      }
      const { data: b } = await supabase
        .from("bookings")
        .select("*")
        .eq("id", bookingId)
        .maybeSingle();
      if (!mounted) return;
      if (!b) {
        setLoading(false);
        return;
      }
      setBooking(b as Booking);

      const { data: ph } = await supabase
        .from("trip_photos")
        .select("*")
        .eq("booking_id", bookingId)
        .order("created_at", { ascending: true });
      if (ph && ph.length) {
        const urls = await resolveTripPhotoUrls(ph.map((p) => p.photo_url));
        if (!mounted) return;
        setPhotos(ph.map((p, i) => ({ ...(p as TripPhoto), resolvedUrl: urls[i] })));
      }

      const { data: docs } = await supabase
        .from("user_documents")
        .select("id, doc_type, photo_url, created_at")
        .eq("user_id", user.id)
        .is("deleted_by_user_at", null)
        .order("created_at", { ascending: true });
      if (docs && docs.length) {
        const signed = await Promise.all(
          docs.map(async (d) => {
            const { data } = await supabase.storage
              .from("user-documents")
              .createSignedUrl(d.photo_url, 3600);
            return data?.signedUrl ?? "";
          })
        );
        if (!mounted) return;
        setDocuments(docs.map((d, i) => ({ ...(d as Omit<UserDoc, "resolvedUrl">), resolvedUrl: signed[i] })));
      }
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [bookingId, navigate]);

  if (loading) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground text-sm">Laden…</p>
      </main>
    );
  }

  if (!booking) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center px-4 text-center">
        <div>
          <h1 className="text-2xl font-bold mb-2">Buchung nicht gefunden</h1>
          <Link to="/profil" className="underline">Zurück zu meinen Buchungen</Link>
        </div>
      </main>
    );
  }

  const startsAt = new Date(`${booking.start_date}T${String(booking.start_hour).padStart(2, "0")}:00:00`);
  const km = booking.start_km !== null && booking.end_km !== null
    ? Math.max(0, booking.end_km - booking.start_km)
    : null;

  // Storno-/Erstattungs-Auswertung
  const feeEuro = booking.deposit_deducted_cents != null ? booking.deposit_deducted_cents / 100 : null;
  const isCancelled = booking.status === "cancelled";
  const refundEuro =
    isCancelled && feeEuro !== null
      ? Math.max(0, Number(booking.plan_price) - feeEuro) + Number(booking.deposit)
      : null;

  return (
    <main className="min-h-screen bg-background pb-12">
      <header className="sticky top-0 z-10 bg-background/90 backdrop-blur border-b border-border">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link
            to="/profil"
            className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center hover:bg-secondary/80"
            aria-label="Zurück"
          >
            <ChevronLeft className="w-4 h-4" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-base font-bold truncate">Buchungsdetails</h1>
            <p className="text-xs text-muted-foreground truncate font-mono">
              {booking.id.slice(0, 8).toUpperCase()}
            </p>
          </div>
          <span className="ml-auto px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-secondary text-foreground">
            {STATUS_LABEL[booking.status] ?? booking.status}
          </span>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 mt-6 space-y-6">
        {/* Fahrzeug + Zeitpunkt */}
        <section className="rounded-2xl bg-card border border-border p-4 space-y-3">
          <div className="flex items-center gap-3">
            <Car className="w-5 h-5" />
            <div>
              <p className="font-bold">{booking.vehicle_name}</p>
              <p className="text-xs text-muted-foreground">{booking.vehicle_plate}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs pt-2 border-t border-border">
            <InfoLine icon={<Calendar className="w-3 h-3" />} label="Abfahrt">
              {format(startsAt, "dd.MM.yyyy HH:mm", { locale: de })}
            </InfoLine>
            <InfoLine icon={<Key className="w-3 h-3" />} label="Tarif">
              {booking.plan_label}
            </InfoLine>
            <InfoLine icon={<RouteIcon className="w-3 h-3" />} label="Gefahrene km">
              {km !== null ? `${km} km` : "-"}
            </InfoLine>
            <InfoLine icon={<Hash className="w-3 h-3" />} label="Abhol-Code">
              <span className="font-mono">{booking.pickup_code}</span>
            </InfoLine>
          </div>
        </section>

        {/* Zahlungsübersicht */}
        <section className="rounded-2xl bg-card border border-border p-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">Zahlung</h2>
          <div className="space-y-2 text-sm">
            <PaymentLine label="Miete" value={`${Number(booking.plan_price).toFixed(2)} €`} />
            {Array.isArray(booking.addons) && booking.addons.map((a) => (
              <PaymentLine
                key={a.id}
                label={a.label}
                value={`${(a.price_cents / 100).toFixed(2)} €`}
              />
            ))}
            <PaymentLine label="Kaution" value={`${Number(booking.deposit).toFixed(2)} €`} />
            {booking.extra_km_charge_cents != null && booking.extra_km_charge_cents > 0 && (
              <PaymentLine
                label={`Mehrkilometer${booking.extra_km ? ` (${booking.extra_km} km)` : ""}`}
                value={`+ ${(booking.extra_km_charge_cents / 100).toFixed(2)} €`}
              />
            )}
            <div className="border-t border-border pt-2 mt-2" />
            {isCancelled ? (
              <>
                <PaymentLine
                  label="Stornogebühr einbehalten"
                  value={`− ${(feeEuro ?? 0).toFixed(2)} €`}
                  emphasize
                />
                <PaymentLine
                  label="Zurückerstattet"
                  value={`${(refundEuro ?? 0).toFixed(2)} €`}
                  positive
                />
                {booking.deposit_refund_id && (
                  <p className="text-[11px] text-muted-foreground mt-2">
                    Erstattung auf die ursprüngliche Zahlungsmethode (Stripe-Vorgang{" "}
                    <span className="font-mono">{booking.deposit_refund_id}</span>)
                    {booking.deposit_released_at && (
                      <>, ausgelöst am {format(new Date(booking.deposit_released_at), "dd.MM.yyyy HH:mm", { locale: de })} Uhr</>
                    )}
                    . Gutschrift erfolgt je nach Bank innerhalb von 3-10 Werktagen.
                  </p>
                )}
              </>
            ) : booking.deposit_status === "released" ? (
              <>
                {feeEuro !== null && feeEuro > 0 && (
                  <PaymentLine label="Von Kaution einbehalten" value={`− ${feeEuro.toFixed(2)} €`} emphasize />
                )}
                <PaymentLine
                  label="Kaution erstattet"
                  value={`${(Number(booking.deposit) - (feeEuro ?? 0)).toFixed(2)} €`}
                  positive
                />
              </>
            ) : (
              <PaymentLine label="Kaution-Status" value="Einbehalten, Erstattung nach Rückgabe" />
            )}
          </div>
        </section>

        {/* Zusatzpakete – Inhalt */}
        {Array.isArray(booking.addons) && booking.addons.length > 0 && (
          <section className="rounded-2xl bg-card border border-border p-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">Gebuchtes Zubehör</h2>
            <ul className="space-y-2 text-sm">
              {booking.addons.map((a) => (
                <li key={a.id} className="flex items-center justify-between">
                  <span className="text-foreground">{a.label}</span>
                  <span className="text-muted-foreground">{(a.price_cents / 100).toFixed(2)} €</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] text-muted-foreground">
              Bitte das Zubehör vollständig und unbeschädigt zurückgeben. Bei Verlust oder Beschädigung können Ersatzkosten entstehen.
            </p>
          </section>
        )}

        {/* Notizen / Vermerke */}
        {booking.remarks && (
          <section className="rounded-2xl bg-card border border-border p-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">Verlauf</h2>
            <pre className="text-xs text-foreground whitespace-pre-wrap font-sans leading-relaxed">{booking.remarks}</pre>
          </section>
        )}

        {/* Fotos */}
        <section className="rounded-2xl bg-card border border-border p-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
            <ImageIcon className="w-3.5 h-3.5" /> Fotos ({photos.length})
          </h2>
          {photos.length === 0 ? (
            <p className="text-xs text-muted-foreground">Für diese Buchung wurden noch keine Fotos hochgeladen.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {photos.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setLightbox(p.resolvedUrl)}
                  className="group relative aspect-square overflow-hidden rounded-xl bg-secondary"
                >
                  {p.resolvedUrl ? (
                    <img
                      src={p.resolvedUrl}
                      alt={PHOTO_TYPE_LABEL[p.photo_type] ?? p.photo_type}
                      loading="lazy"
                      className="w-full h-full object-cover transition-transform group-hover:scale-105"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
                      Bild nicht verfügbar
                    </div>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 bg-foreground/70 text-background text-[10px] px-2 py-1 truncate">
                    {PHOTO_TYPE_LABEL[p.photo_type] ?? p.photo_type}
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Ausweis- und Führerscheindokumente (nur Ansicht) */}
        {documents.length > 0 && (
          <section className="rounded-2xl bg-card border border-border p-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
              <ImageIcon className="w-3.5 h-3.5" /> Meine Ausweisdokumente ({documents.length})
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {documents.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setLightbox(d.resolvedUrl)}
                  className="group relative aspect-[1.586/1] overflow-hidden rounded-xl bg-secondary"
                >
                  {d.resolvedUrl ? (
                    <img
                      src={d.resolvedUrl}
                      alt={DOC_LABELS[d.doc_type] ?? d.doc_type}
                      loading="lazy"
                      className="w-full h-full object-cover transition-transform group-hover:scale-105"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
                      Bild nicht verfügbar
                    </div>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 bg-foreground/70 text-background text-[10px] px-2 py-1 truncate">
                    {DOC_LABELS[d.doc_type] ?? d.doc_type}
                  </div>
                </button>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground">
              Dokumente können nur im Profil bearbeitet werden.
            </p>
          </section>
        )}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-foreground/90 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-background flex items-center justify-center"
            aria-label="Schließen"
            onClick={() => setLightbox(null)}
          >
            <X className="w-5 h-5 text-foreground" />
          </button>
          <img src={lightbox} alt="" className="max-h-full max-w-full rounded-2xl object-contain" />
        </div>
      )}
    </main>
  );
}

const STATUS_LABEL: Record<string, string> = {
  paid: "Bezahlt",
  active: "Unterwegs",
  returning: "Rückgabe",
  completed: "Abgeschlossen",
  cancelled: "Storniert",
};

function InfoLine({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1 text-muted-foreground">
        {icon}
        <span className="text-[10px] uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-foreground truncate">{children}</div>
    </div>
  );
}

function PaymentLine({
  label,
  value,
  emphasize,
  positive,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
  positive?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-bold ${positive ? "text-foreground" : emphasize ? "text-foreground" : "text-foreground"}`}>
        {value}
      </span>
    </div>
  );
}