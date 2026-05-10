import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Bell,
  Car,
  Check,
  ChevronLeft,
  Image as ImageIcon,
  LogOut,
  MapPin,
  Mail,
  Phone,
  IdCard,
  Search,
  User,
  Users,
  Wallet,
} from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { AdminLogin } from "@/components/admin/AdminLogin";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [{ title: "MyTransporter · Admin" }],
  }),
  component: AdminDashboard,
});

interface Booking {
  id: string;
  user_id: string;
  vehicle_name: string;
  vehicle_plate: string;
  plan_label: string;
  plan_price: number;
  deposit: number;
  deposit_status: string;
  deposit_released_at: string | null;
  start_date: string;
  start_hour: number;
  start_km: number | null;
  end_km: number | null;
  pickup_code: string;
  return_code: string | null;
  status: string;
  remarks: string | null;
  created_at: string;
}
interface Profile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
}
interface TripPhoto {
  id: string;
  photo_url: string;
  photo_type: string;
  booking_id: string;
  created_at: string;
}
interface UserDocument {
  id: string;
  doc_type: string;
  photo_url: string;
  created_at: string;
}
interface GpsPoint {
  latitude: number;
  longitude: number;
  recorded_at: string;
  booking_id: string;
}
interface AdminNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  booking_id: string | null;
  user_id: string | null;
  read: boolean;
  created_at: string;
}

type Tab = "customers" | "bookings" | "notifications";

function AdminDashboard() {
  const [authReady, setAuthReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [tab, setTab] = useState<Tab>("customers");
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [search, setSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);
  const lastNotificationId = useRef<string | null>(null);

  const checkAdmin = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setIsAdmin(false);
      setAuthReady(true);
      return;
    }
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin");
    setIsAdmin(!!roles && roles.length > 0);
    setAuthReady(true);
  };

  useEffect(() => {
    checkAdmin();
  }, []);

  const loadAll = async () => {
    const [b, p, n] = await Promise.all([
      supabase.from("bookings").select("*").order("created_at", { ascending: false }),
      supabase.from("profiles").select("*"),
      supabase
        .from("admin_notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    if (b.data) setBookings(b.data as Booking[]);
    if (p.data) setProfiles(p.data as Profile[]);
    if (n.data) setNotifications(n.data as AdminNotification[]);
  };

  useEffect(() => {
    if (!isAdmin) return;
    loadAll();

    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }

    const channel = supabase
      .channel("admin-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings" },
        () => loadAll()
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "trip_photos" },
        () => loadAll()
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "admin_notifications" },
        (payload) => {
          const n = payload.new as AdminNotification;
          setNotifications((prev) => [n, ...prev]);
          if (lastNotificationId.current !== n.id) {
            lastNotificationId.current = n.id;
            if (typeof Notification !== "undefined" && Notification.permission === "granted") {
              try {
                new Notification("MyTransporter · " + n.title, {
                  body: n.body ?? undefined,
                  tag: n.id,
                });
              } catch {
                // ignore
              }
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAdmin]);

  const profilesById = useMemo(() => {
    const m: Record<string, Profile> = {};
    profiles.forEach((p) => (m[p.id] = p));
    return m;
  }, [profiles]);

  const customers = useMemo(() => {
    const map = new Map<string, { profile: Profile | undefined; bookings: Booking[] }>();
    bookings.forEach((b) => {
      const cur = map.get(b.user_id) ?? { profile: profilesById[b.user_id], bookings: [] };
      cur.bookings.push(b);
      map.set(b.user_id, cur);
    });
    const arr = Array.from(map.entries()).map(([id, v]) => ({
      id,
      profile: v.profile,
      bookings: v.bookings,
    }));
    arr.sort((a, b) => {
      const ln = (a.profile?.last_name || a.profile?.email || "ZZZ").toLowerCase();
      const lo = (b.profile?.last_name || b.profile?.email || "ZZZ").toLowerCase();
      return ln.localeCompare(lo);
    });
    return arr;
  }, [bookings, profilesById]);

  const filteredCustomers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) => {
      const txt = `${c.profile?.first_name ?? ""} ${c.profile?.last_name ?? ""} ${c.profile?.email ?? ""}`.toLowerCase();
      return txt.includes(q);
    });
  }, [customers, search]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAllRead = async () => {
    const unread = notifications.filter((n) => !n.read).map((n) => n.id);
    if (unread.length === 0) return;
    await supabase.from("admin_notifications").update({ read: true }).in("id", unread);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const releaseDeposit = async (bookingId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase
      .from("bookings")
      .update({
        deposit_status: "released",
        deposit_released_at: new Date().toISOString(),
        deposit_released_by: user?.id ?? null,
      })
      .eq("id", bookingId);
    await loadAll();
  };

  const confirmReturn = async (bookingId: string) => {
    await supabase.from("bookings").update({ status: "completed" }).eq("id", bookingId);
    await loadAll();
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setIsAdmin(false);
  };

  if (!authReady) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Laden…</p>
      </main>
    );
  }

  if (!isAdmin) {
    return <AdminLogin onSuccess={checkAdmin} />;
  }

  if (selectedCustomer) {
    const customer = customers.find((c) => c.id === selectedCustomer);
    if (!customer) {
      setSelectedCustomer(null);
      return null;
    }
    return (
      <CustomerDetail
        customer={customer}
        onBack={() => setSelectedCustomer(null)}
        onReleaseDeposit={releaseDeposit}
        onConfirmReturn={confirmReturn}
      />
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 bg-background border-b border-border">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">MyTransporter · Admin</h1>
            <p className="text-xs text-muted-foreground">
              {profiles.length} Registrierungen · {customers.length} Kunden · {bookings.length} Buchungen
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="rounded-full bg-secondary px-3 py-2 text-xs font-medium flex items-center gap-1.5"
          >
            <LogOut className="w-3.5 h-3.5" /> Abmelden
          </button>
        </div>
        <nav className="max-w-5xl mx-auto px-4 flex gap-1">
          <TabButton active={tab === "customers"} onClick={() => setTab("customers")}>
            <Users className="w-4 h-4" /> Kunden
          </TabButton>
          <TabButton active={tab === "bookings"} onClick={() => setTab("bookings")}>
            <Car className="w-4 h-4" /> Buchungen
          </TabButton>
          <TabButton active={tab === "notifications"} onClick={() => setTab("notifications")}>
            <Bell className="w-4 h-4" /> Push
            {unreadCount > 0 && (
              <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-foreground text-background text-[10px] font-bold">
                {unreadCount}
              </span>
            )}
          </TabButton>
        </nav>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6">
        {tab === "customers" && (
          <>
            <div className="relative mb-4">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Suche nach Name oder E-Mail…"
                className="w-full rounded-full bg-secondary pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-foreground"
              />
            </div>

            {filteredCustomers.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-12">
                Keine Kunden gefunden.
              </p>
            )}

            <ul className="space-y-2">
              {filteredCustomers.map((c) => {
                const name =
                  [c.profile?.first_name, c.profile?.last_name].filter(Boolean).join(" ") ||
                  c.profile?.email ||
                  "Unbekannter Kunde";
                const active = c.bookings.find((b) => b.status === "active" || b.status === "returning");
                return (
                  <li key={c.id}>
                    <button
                      onClick={() => setSelectedCustomer(c.id)}
                      className="w-full text-left p-4 rounded-2xl bg-card border border-border hover:bg-secondary/40 transition-all flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center shrink-0">
                          <User className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold truncate">{name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {c.profile?.email} · {c.bookings.length} Buchung{c.bookings.length === 1 ? "" : "en"}
                          </p>
                        </div>
                      </div>
                      {active && (
                        <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-full bg-foreground text-background shrink-0">
                          Aktiv
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {tab === "bookings" && (
          <ul className="space-y-2">
            {bookings.map((b) => {
              const p = profilesById[b.user_id];
              const name = [p?.first_name, p?.last_name].filter(Boolean).join(" ") || p?.email || "—";
              return (
                <li
                  key={b.id}
                  className="p-4 rounded-2xl bg-card border border-border flex items-center justify-between"
                >
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {b.vehicle_plate} · {b.plan_label} · {b.start_date} {b.start_hour}:00
                    </p>
                  </div>
                  <StatusBadge status={b.status} />
                </li>
              );
            })}
          </ul>
        )}

        {tab === "notifications" && (
          <>
            {unreadCount > 0 && (
              <div className="flex justify-end mb-3">
                <button
                  onClick={markAllRead}
                  className="text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  Alle als gelesen markieren
                </button>
              </div>
            )}
            {notifications.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-12">
                Keine Benachrichtigungen.
              </p>
            ) : (
              <ul className="space-y-2">
                {notifications.map((n) => (
                  <li
                    key={n.id}
                    className={`p-4 rounded-2xl border ${
                      n.read ? "bg-card border-border" : "bg-secondary border-foreground"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-foreground text-background flex items-center justify-center shrink-0">
                        <Bell className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-sm">{n.title}</p>
                        {n.body && <p className="text-xs text-muted-foreground mt-0.5">{n.body}</p>}
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {format(new Date(n.created_at), "dd.MM.yyyy HH:mm", { locale: de })}
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
        active
          ? "text-foreground border-foreground"
          : "text-muted-foreground border-transparent hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    paid: { label: "Bezahlt", cls: "bg-secondary text-foreground" },
    active: { label: "Unterwegs", cls: "bg-foreground text-background" },
    returning: { label: "Rückgabe", cls: "bg-secondary text-foreground border border-foreground" },
    completed: { label: "Abgeschlossen", cls: "bg-secondary text-muted-foreground" },
  };
  const m = map[status] ?? { label: status, cls: "bg-muted text-muted-foreground" };
  return <span className={`px-3 py-1 rounded-full text-xs font-medium ${m.cls}`}>{m.label}</span>;
}

function CustomerDetail({
  customer,
  onBack,
  onReleaseDeposit,
  onConfirmReturn,
}: {
  customer: { id: string; profile: Profile | undefined; bookings: Booking[] };
  onBack: () => void;
  onReleaseDeposit: (id: string) => Promise<void>;
  onConfirmReturn: (id: string) => Promise<void>;
}) {
  const [photos, setPhotos] = useState<TripPhoto[]>([]);
  const [gps, setGps] = useState<GpsPoint[]>([]);
  const [openBooking, setOpenBooking] = useState<string | null>(null);
  const [documents, setDocuments] = useState<UserDocument[]>([]);
  const [docUrls, setDocUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    const ids = customer.bookings.map((b) => b.id);
    Promise.all([
      ids.length
        ? supabase.from("trip_photos").select("*").in("booking_id", ids).order("created_at")
        : Promise.resolve({ data: [] as TripPhoto[] }),
      ids.length
        ? supabase
            .from("gps_tracks")
            .select("latitude, longitude, recorded_at, booking_id")
            .in("booking_id", ids)
            .order("recorded_at")
        : Promise.resolve({ data: [] as GpsPoint[] }),
      supabase
        .from("user_documents")
        .select("*")
        .eq("user_id", customer.id)
        .order("created_at"),
    ]).then(async ([p, g, d]) => {
      if (p.data) setPhotos(p.data as TripPhoto[]);
      if (g.data) setGps(g.data as GpsPoint[]);
      if (d.data) {
        const docs = d.data as UserDocument[];
        setDocuments(docs);
        // Sign URLs for private bucket
        const entries = await Promise.all(
          docs.map(async (doc) => {
            const { data: signed } = await supabase.storage
              .from("user-documents")
              .createSignedUrl(doc.photo_url, 3600);
            return [doc.id, signed?.signedUrl ?? ""] as const;
          })
        );
        setDocUrls(Object.fromEntries(entries));
      }
    });
  }, [customer.id]);

  const name =
    [customer.profile?.first_name, customer.profile?.last_name].filter(Boolean).join(" ") ||
    customer.profile?.email ||
    "Unbekannter Kunde";

  const totalRentals = customer.bookings.length;
  const totalSpent = customer.bookings.reduce((s, b) => s + Number(b.plan_price || 0), 0);

  const docLabels: Record<string, string> = {
    id_front: "Personalausweis · Vorderseite",
    id_back: "Personalausweis · Rückseite",
    license_front: "Führerschein · Vorderseite",
    license_back: "Führerschein · Rückseite",
  };

  return (
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 bg-background border-b border-border">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <button
            onClick={onBack}
            className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center"
            aria-label="Zurück"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-lg font-bold truncate">{name}</h1>
            <p className="text-xs text-muted-foreground truncate">
              Kunden-ID {customer.id.slice(0, 8)}
            </p>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <section className="rounded-2xl bg-card border border-border p-4 space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-1">
            Kontakt
          </h2>
          <a
            href={`mailto:${customer.profile?.email ?? ""}`}
            className="flex items-center gap-2 text-sm hover:underline"
          >
            <Mail className="w-4 h-4 text-muted-foreground" />
            {customer.profile?.email || "—"}
          </a>
          <a
            href={`tel:${customer.profile?.phone ?? ""}`}
            className="flex items-center gap-2 text-sm hover:underline"
          >
            <Phone className="w-4 h-4 text-muted-foreground" />
            {customer.profile?.phone || "Keine Telefonnummer"}
          </a>
        </section>

        <section>
          <h2 className="text-sm font-semibold mb-2 uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
            <IdCard className="w-4 h-4" /> Ausweis & Führerschein
          </h2>
          {documents.length === 0 ? (
            <p className="text-xs text-muted-foreground p-4 rounded-2xl bg-secondary">
              Keine Dokumente hochgeladen.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {documents.map((doc) => (
                <a
                  key={doc.id}
                  href={docUrls[doc.id] || "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="relative block rounded-xl overflow-hidden border border-border bg-secondary"
                >
                  {docUrls[doc.id] ? (
                    <img
                      src={docUrls[doc.id]}
                      alt={doc.doc_type}
                      className="w-full aspect-[1.586/1] object-cover"
                    />
                  ) : (
                    <div className="w-full aspect-[1.586/1] flex items-center justify-center text-xs text-muted-foreground">
                      Lädt…
                    </div>
                  )}
                  <span className="absolute bottom-1 left-1 right-1 text-[10px] bg-black/70 text-white px-1.5 py-0.5 rounded truncate">
                    {docLabels[doc.doc_type] ?? doc.doc_type}
                  </span>
                </a>
              ))}
            </div>
          )}
        </section>

        <div className="grid grid-cols-2 gap-3">
          <div className="p-4 rounded-2xl bg-secondary">
            <p className="text-xs text-muted-foreground">Buchungen gesamt</p>
            <p className="text-2xl font-bold">{totalRentals}</p>
          </div>
          <div className="p-4 rounded-2xl bg-foreground text-background">
            <p className="text-xs opacity-70">Umsatz</p>
            <p className="text-2xl font-bold">{totalSpent.toFixed(2)} €</p>
          </div>
        </div>

        <section>
          <h2 className="text-sm font-semibold mb-2 uppercase tracking-wide text-muted-foreground">
            Mietverlauf
          </h2>
          <ul className="space-y-2">
            {customer.bookings.map((b) => {
              const isOpen = openBooking === b.id;
              const bphotos = photos.filter((p) => p.booking_id === b.id);
              const bgps = gps.filter((g) => g.booking_id === b.id);
              return (
                <li key={b.id} className="rounded-2xl bg-card border border-border overflow-hidden">
                  <button
                    onClick={() => setOpenBooking(isOpen ? null : b.id)}
                    className="w-full text-left p-4 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold truncate">
                        {b.vehicle_plate} · {b.plan_label}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(b.start_date), "dd.MM.yyyy", { locale: de })} · {b.start_hour}:00 ·{" "}
                        Code {b.pickup_code}
                      </p>
                    </div>
                    <StatusBadge status={b.status} />
                  </button>

                  {isOpen && (
                    <div className="px-4 pb-4 border-t border-border pt-4 space-y-4">
                      <div className="grid grid-cols-4 gap-2 text-sm">
                        <Stat label="Preis" value={`${b.plan_price} €`} />
                        <Stat label="Kaution" value={`${b.deposit} €`} />
                        <Stat label="Start-KM" value={b.start_km ?? "–"} />
                        <Stat label="End-KM" value={b.end_km ?? "–"} />
                      </div>

                      <div className="p-4 rounded-2xl bg-secondary flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold flex items-center gap-1.5">
                            <Wallet className="w-4 h-4" /> Kaution {b.deposit} €
                          </p>
                          {b.deposit_status === "released" ? (
                            <p className="text-xs text-muted-foreground">
                              Ausgezahlt am{" "}
                              {b.deposit_released_at
                                ? format(new Date(b.deposit_released_at), "dd.MM.yyyy HH:mm", { locale: de })
                                : "–"}
                            </p>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              Einbehalten · Auszahlung 3–7 Werktage nach Freigabe
                            </p>
                          )}
                        </div>
                        {b.deposit_status !== "released" && b.status === "completed" && (
                          <button
                            onClick={() => onReleaseDeposit(b.id)}
                            className="rounded-full bg-foreground text-background px-3 py-2 text-xs font-semibold whitespace-nowrap"
                          >
                            Auszahlen
                          </button>
                        )}
                      </div>

                      {b.status === "returning" && (
                        <button
                          onClick={() => onConfirmReturn(b.id)}
                          className="w-full rounded-full bg-foreground text-background py-3 font-semibold flex items-center justify-center gap-2"
                        >
                          <Check className="w-4 h-4" /> Rückgabe bestätigen
                        </button>
                      )}

                      {b.remarks && (
                        <div className="p-3 rounded-xl bg-secondary">
                          <p className="text-xs text-muted-foreground mb-1">Anmerkungen</p>
                          <p className="text-sm">{b.remarks}</p>
                        </div>
                      )}

                      {bphotos.length > 0 && (
                        <div>
                          <p className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                            <ImageIcon className="w-4 h-4" /> Fotos ({bphotos.length})
                          </p>
                          <div className="grid grid-cols-3 gap-2">
                            {bphotos.map((ph) => (
                              <a
                                key={ph.id}
                                href={ph.photo_url}
                                target="_blank"
                                rel="noreferrer"
                                className="relative block"
                              >
                                <img
                                  src={ph.photo_url}
                                  alt={ph.photo_type}
                                  className="w-full aspect-square object-cover rounded-lg border border-border"
                                />
                                <span className="absolute bottom-1 left-1 right-1 text-[10px] bg-black/70 text-white px-1.5 py-0.5 rounded truncate">
                                  {ph.photo_type}
                                </span>
                              </a>
                            ))}
                          </div>
                        </div>
                      )}

                      {bgps.length > 0 && (
                        <div className="p-3 rounded-xl bg-secondary">
                          <p className="text-sm font-semibold mb-1 flex items-center gap-1.5">
                            <MapPin className="w-4 h-4" /> Gefahrene Route
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {bgps.length} GPS-Punkte · von{" "}
                            {format(new Date(bgps[0].recorded_at), "HH:mm")} bis{" "}
                            {format(new Date(bgps[bgps.length - 1].recorded_at), "HH:mm")}
                          </p>
                          <a
                            href={`https://www.google.com/maps/dir/${bgps
                              .filter((_, i) => i % Math.max(1, Math.floor(bgps.length / 20)) === 0)
                              .map((p) => `${p.latitude},${p.longitude}`)
                              .join("/")}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-block mt-2 text-xs underline"
                          >
                            Route in Google Maps öffnen
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="p-3 rounded-xl bg-secondary">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}