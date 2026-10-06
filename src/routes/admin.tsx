import { AdminPrivacy } from "@/components/admin/AdminPrivacy";
import { createFileRoute, Link } from "@tanstack/react-router";
import { privateHead } from "@/lib/seo";
import { BrandHomeLink } from "@/components/BrandHomeLink";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Bell,
  BellRing,
  CalendarDays,
  Car,
  Check,
  ChevronLeft,
  FileText,
  Image as ImageIcon,
  LogOut,
  MapPin,
  Mail,
  Phone,
  IdCard,
  Search,
  User,
  Users,
  Volume2,
  VolumeX,
  Wallet,
  Gift,
} from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { AdminLogin } from "@/components/admin/AdminLogin";
import { VehiclesAdmin } from "@/components/admin/VehiclesAdmin";
import { CalendarAdmin } from "@/components/admin/CalendarAdmin";
import { DocumentBuilder } from "@/components/admin/DocumentBuilder";
import { IssuedDocumentsArchive } from "@/components/admin/IssuedDocumentsArchive";
import { BirthdayAdmin } from "@/components/admin/BirthdayAdmin";
import { useServerFn } from "@tanstack/react-start";
import { chargeBookingExtra, settleDeposit } from "@/lib/payments.functions";
import { sendTestAdminPush } from "@/lib/push.functions";
import {
  enablePushOnThisDevice,
  disablePushOnThisDevice,
  isSubscribedOnThisDevice,
  pushSupported,
  ensurePushSubscribed,
} from "@/lib/push-client";
import { getStripeEnvironment } from "@/lib/stripe";
import { toast } from "sonner";
import { resolveTripPhotoUrl } from "@/lib/trip-photos";

export const Route = createFileRoute("/admin")({
  head: () => privateHead("MyTransporter · Admin"),
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
  free_km?: number | null;
  km_price_cents?: number | null;
  extra_km?: number | null;
  extra_km_charge_cents?: number | null;
  extra_charge_status?: string | null;
  extra_charge_cents?: number | null;
  deposit_deducted_cents?: number | null;
  stripe_payment_method_id?: string | null;
  ai_start_km?: number | null;
  ai_end_km?: number | null;
  ai_start_fuel_percent?: number | null;
  ai_end_fuel_percent?: number | null;
  addons?: Array<{ id: string; label: string; price_cents: number }> | null;
  addons_total_cents?: number | null;
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
  deleted_by_user_at?: string | null;
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

type Tab = "customers" | "bookings" | "calendar" | "vehicles" | "documents" | "birthdays" | "notifications" | "privacy";

function AdminDashboard() {
  const [authReady, setAuthReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [tab, setTab] = useState<Tab>("customers");
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [search, setSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);
  const [initialBookingId, setInitialBookingId] = useState<string | null>(null);
  const lastNotificationId = useRef<string | null>(null);
  const [alertNotification, setAlertNotification] = useState<AdminNotification | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const beepIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);
  const [pushState, setPushState] = useState<"unknown" | "off" | "on" | "unsupported" | "busy">("unknown");
  const triggerTestPush = useServerFn(sendTestAdminPush);

  useEffect(() => {
    if (!isAdmin) return;
    if (!pushSupported()) {
      setPushState("unsupported");
      return;
    }
    const restore = async () => {
      // Wenn Berechtigung schon erteilt: still wiederherstellen.
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        const ok = await ensurePushSubscribed();
        setPushState(ok ? "on" : (await isSubscribedOnThisDevice()) ? "on" : "off");
        return;
      }
      const sub = await isSubscribedOnThisDevice();
      setPushState(sub ? "on" : "off");
    };
    restore();
    const onVisible = () => {
      if (document.visibilityState === "visible") restore();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [isAdmin]);

  const handleTogglePush = async () => {
    if (pushState === "unsupported" || pushState === "busy") return;
    setPushState("busy");
    if (pushState === "on") {
      await disablePushOnThisDevice();
      setPushState("off");
      toast.success("Push deaktiviert");
      return;
    }
    const res = await enablePushOnThisDevice();
    if (res.ok) {
      setPushState("on");
      toast.success("Push aktiviert", { description: "Du bekommst jetzt Buchungen aufs Handy." });
      try {
        await triggerTestPush({});
      } catch (e) {
        console.warn(e);
      }
    } else {
      setPushState("off");
      toast.error("Push konnte nicht aktiviert werden", { description: res.reason });
    }
  };

  const checkAdmin = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
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

  // Wake-Lock anfragen, sobald Admin eingeloggt ist, iPad-Bildschirm bleibt an.
  useEffect(() => {
    if (!isAdmin) return;
    const requestWakeLock = async () => {
      try {
        const nav = navigator as Navigator & {
          wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> };
        };
        if (nav.wakeLock?.request) {
          wakeLockRef.current = await nav.wakeLock.request("screen");
        }
      } catch {
        // ignore
      }
    };
    requestWakeLock();
    const onVisible = () => {
      if (document.visibilityState === "visible") requestWakeLock();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      wakeLockRef.current?.release().catch(() => {});
      wakeLockRef.current = null;
    };
  }, [isAdmin]);

  const playBeep = () => {
    try {
      if (!audioCtxRef.current) {
        const Ctx = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
        audioCtxRef.current = new Ctx();
      }
      const ctx = audioCtxRef.current!;
      if (ctx.state === "suspended") ctx.resume();
      const now = ctx.currentTime;
      [0, 0.18, 0.36].forEach((offset) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0, now + offset);
        gain.gain.linearRampToValueAtTime(0.35, now + offset + 0.02);
        gain.gain.linearRampToValueAtTime(0, now + offset + 0.14);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now + offset);
        osc.stop(now + offset + 0.16);
      });
    } catch {
      // ignore
    }
  };

  const startBeepLoop = () => {
    if (beepIntervalRef.current) return;
    playBeep();
    beepIntervalRef.current = setInterval(playBeep, 1500);
  };

  const stopBeepLoop = () => {
    if (beepIntervalRef.current) {
      clearInterval(beepIntervalRef.current);
      beepIntervalRef.current = null;
    }
  };

  const enableSound = async () => {
    try {
      const Ctx = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
      audioCtxRef.current = new Ctx();
      await audioCtxRef.current.resume();
      // kurzer Ping zur Bestätigung
      playBeep();
      setSoundEnabled(true);
      try { localStorage.setItem("admin_sound_on", "1"); } catch {}
    } catch {
      setSoundEnabled(false);
    }
  };

  // Signalton-Schalter aus localStorage wiederherstellen.
  useEffect(() => {
    if (!isAdmin) return;
    try {
      if (localStorage.getItem("admin_sound_on") === "1") {
        setSoundEnabled(true);
        const Ctx = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
        if (!audioCtxRef.current) audioCtxRef.current = new Ctx();
        // Resume klappt ohne Geste evtl. nicht – beim ersten Tap auf der Seite ist er dann scharf.
        audioCtxRef.current.resume().catch(() => {});
        const resumeOnGesture = () => {
          audioCtxRef.current?.resume().catch(() => {});
        };
        window.addEventListener("pointerdown", resumeOnGesture, { once: true });
        window.addEventListener("keydown", resumeOnGesture, { once: true });
      }
    } catch {}
  }, [isAdmin]);

  // Beep läuft, solange ein Alert-Popup offen ist.
  useEffect(() => {
    if (alertNotification && soundEnabled) startBeepLoop();
    else stopBeepLoop();
    return () => stopBeepLoop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alertNotification, soundEnabled]);

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
        { event: "*", schema: "public", table: "profiles" },
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
            // Großes Popup für jede neue Benachrichtigung, iPad-tauglich
            setAlertNotification(n);
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
    // Jeden registrierten User aufnehmen – auch ohne Buchung
    profiles.forEach((p) => {
      map.set(p.id, { profile: p, bookings: [] });
    });
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
        initialBookingId={initialBookingId}
        onBack={() => {
          setSelectedCustomer(null);
          setInitialBookingId(null);
        }}
        onConfirmReturn={confirmReturn}
        onReloadBookings={loadAll}
      />
    );
  }

  return (
    <>
    <main className="min-h-screen bg-background">
      <header className="sticky top-trip-bar z-10 bg-background border-b border-border">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <BrandHomeLink imageClassName="h-7 w-auto" />
            <div className="min-w-0">
              <h1 className="text-xl font-bold truncate">MyTransporter · Admin</h1>
              <p className="text-xs text-muted-foreground truncate">
                {profiles.length} Registrierungen · {customers.length} Kunden · {bookings.length} Buchungen
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {pushState !== "unsupported" && (
              <button
                onClick={handleTogglePush}
                disabled={pushState === "busy" || pushState === "unknown"}
                className={`rounded-full px-3 py-2 text-xs font-medium flex items-center gap-1.5 ${
                  pushState === "on" ? "bg-foreground text-background" : "bg-secondary"
                }`}
                title="Push-Benachrichtigungen auf dieses Gerät. iPhone/iPad: nur möglich, wenn die Seite zum Home-Bildschirm hinzugefügt wurde."
              >
                {pushState === "on" ? <BellRing className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
                {pushState === "on" ? "Push an" : pushState === "busy" ? "…" : "Push aktivieren"}
              </button>
            )}
            <button
              onClick={() => {
                if (soundEnabled) {
                  setSoundEnabled(false);
                  try { localStorage.removeItem("admin_sound_on"); } catch {}
                } else {
                  enableSound();
                }
              }}
              className={`rounded-full px-3 py-2 text-xs font-medium flex items-center gap-1.5 ${
                soundEnabled ? "bg-foreground text-background" : "bg-secondary"
              }`}
              title="iPad-Modus: Signal-Ton bei neuen Benachrichtigungen"
            >
              {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              {soundEnabled ? "Signal an" : "Signal aus"}
            </button>
            <button
              onClick={handleLogout}
              className="rounded-full bg-secondary px-3 py-2 text-xs font-medium flex items-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" /> Abmelden
            </button>
          </div>
        </div>
        <nav className="max-w-5xl mx-auto px-4 flex gap-1">
          <TabButton active={tab === "customers"} onClick={() => setTab("customers")}>
            <Users className="w-4 h-4" /> Kunden
          </TabButton>
          <TabButton active={tab === "bookings"} onClick={() => setTab("bookings")}>
            <Car className="w-4 h-4" /> Buchungen
          </TabButton>
          <TabButton active={tab === "calendar"} onClick={() => setTab("calendar")}>
            <CalendarDays className="w-4 h-4" /> Kalender
          </TabButton>
          <TabButton active={tab === "vehicles"} onClick={() => setTab("vehicles")}>
            <Car className="w-4 h-4" /> Fahrzeuge
          </TabButton>
          <TabButton active={tab === "documents"} onClick={() => setTab("documents")}>
            <FileText className="w-4 h-4" /> Dokumente
          </TabButton>
          <TabButton active={tab === "birthdays"} onClick={() => setTab("birthdays")}>
            <Gift className="w-4 h-4" /> Geburtstage
          </TabButton>
          <TabButton active={tab === "privacy"} onClick={() => setTab("privacy")}>
            <FileText className="w-4 h-4" /> Löschungen
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
              const name = [p?.first_name, p?.last_name].filter(Boolean).join(" ") || p?.email || "-";
              return (
                <li key={b.id}>
                  <button
                    onClick={() => {
                      setInitialBookingId(b.id);
                      setSelectedCustomer(b.user_id);
                    }}
                    className="w-full text-left p-4 rounded-2xl bg-card border border-border flex items-center justify-between hover:bg-secondary/40 transition-all"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {b.vehicle_plate} · {b.plan_label} · {b.start_date} {b.start_hour}:00
                      </p>
                      {Array.isArray(b.addons) && b.addons.length > 0 && (
                        <p className="text-[11px] text-foreground mt-0.5 truncate">
                          📦 {b.addons.map((a) => a.label).join(", ")}
                        </p>
                      )}
                    </div>
                    <StatusBadge status={b.status} />
                  </button>
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

        {tab === "calendar" && <CalendarAdmin />}

        {tab === "vehicles" && <VehiclesAdmin />}

        {tab === "documents" && (
          <div className="space-y-8">
            <IssuedDocumentsArchive />
            <DocumentBuilder />
          </div>
        )}

        {tab === "birthdays" && <BirthdayAdmin />}
        {tab === "privacy" && <AdminPrivacy />}
      </div>
    </main>
      {alertNotification && (
        <div className="fixed inset-0 z-[100] bg-black/85 flex items-center justify-center p-6 animate-in fade-in">
          <div className="bg-background border-4 border-foreground rounded-3xl max-w-xl w-full p-8 text-center shadow-2xl animate-in zoom-in-95">
            <div className="w-20 h-20 rounded-full bg-foreground text-background flex items-center justify-center mx-auto mb-5 animate-pulse">
              <BellRing className="w-10 h-10" />
            </div>
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">
              Neue Benachrichtigung
            </p>
            <h2 className="text-3xl font-bold mb-3">{alertNotification.title}</h2>
            {alertNotification.body && (
              <p className="text-base text-muted-foreground mb-6 whitespace-pre-line">
                {alertNotification.body}
              </p>
            )}
            <p className="text-xs text-muted-foreground mb-6">
              {format(new Date(alertNotification.created_at), "dd.MM.yyyy · HH:mm:ss", { locale: de })}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={async () => {
                  const id = alertNotification.id;
                  setAlertNotification(null);
                  await supabase.from("admin_notifications").update({ read: true }).eq("id", id);
                  setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
                }}
                className="rounded-full bg-foreground text-background px-8 py-4 text-base font-semibold flex items-center justify-center gap-2"
              >
                <Check className="w-5 h-5" /> Bestätigen
              </button>
              {alertNotification.booking_id && (
                <button
                  onClick={() => {
                    const bookingId = alertNotification.booking_id!;
                    const booking = bookings.find((b) => b.id === bookingId);
                    setAlertNotification(null);
                    if (booking) {
                      setInitialBookingId(bookingId);
                      setSelectedCustomer(booking.user_id);
                    }
                  }}
                  className="rounded-full bg-secondary px-8 py-4 text-base font-semibold"
                >
                  Buchung öffnen
                </button>
              )}
            </div>
            {!soundEnabled && (
              <p className="mt-5 text-xs text-muted-foreground">
                Tipp: „Signal an" oben aktivieren, damit das iPad einen Ton abspielt.
              </p>
            )}
          </div>
        </div>
      )}
    </>
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
  initialBookingId,
  onBack,
  onConfirmReturn,
  onReloadBookings,
}: {
  customer: { id: string; profile: Profile | undefined; bookings: Booking[] };
  initialBookingId?: string | null;
  onBack: () => void;
  onConfirmReturn: (id: string) => Promise<void>;
  onReloadBookings: () => Promise<void>;
}) {
  const [photos, setPhotos] = useState<TripPhoto[]>([]);
  const [gps, setGps] = useState<GpsPoint[]>([]);
  const [openBooking, setOpenBooking] = useState<string | null>(initialBookingId ?? null);
  const [documents, setDocuments] = useState<UserDocument[]>([]);
  const [docUrls, setDocUrls] = useState<Record<string, string>>({});
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});

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
      if (p.data) {
        const rows = p.data as TripPhoto[];
        setPhotos(rows);
        // Signed URLs für den privaten trip-photos Bucket auflösen
        const entries = await Promise.all(
          rows.map(async (ph) => [ph.id, await resolveTripPhotoUrl(ph.photo_url)] as const)
        );
        setPhotoUrls(Object.fromEntries(entries));
      }
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
      <header className="sticky top-trip-bar z-10 bg-background border-b border-border">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <BrandHomeLink className="mr-1" imageClassName="h-7 w-auto" />
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
            {customer.profile?.email || "-"}
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
                  {doc.deleted_by_user_at && (
                    <span className="absolute top-1 right-1 text-[9px] bg-destructive text-destructive-foreground px-1.5 py-0.5 rounded font-medium">
                      Vom Nutzer entfernt
                    </span>
                  )}
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
                        <Stat label="Start-KM" value={b.start_km ?? "-"} />
                        <Stat label="End-KM" value={b.end_km ?? "-"} />
                      </div>
                      {(b.ai_start_km != null || b.ai_end_km != null || b.ai_start_fuel_percent != null || b.ai_end_fuel_percent != null) && (
                        <div className="rounded-xl bg-secondary px-3 py-2 text-xs text-muted-foreground space-y-0.5">
                          <p className="font-medium text-foreground">🤖 KI-Erkennung</p>
                          {b.ai_start_km != null && (
                            <p>Start: {b.ai_start_km.toLocaleString("de-DE")} km{b.start_km != null && b.start_km !== b.ai_start_km ? ` (Nutzer: ${b.start_km.toLocaleString("de-DE")} km ⚠️)` : ""}</p>
                          )}
                          {b.ai_end_km != null && (
                            <p>Ende: {b.ai_end_km.toLocaleString("de-DE")} km{b.end_km != null && b.end_km !== b.ai_end_km ? ` (Nutzer: ${b.end_km.toLocaleString("de-DE")} km ⚠️)` : ""}</p>
                          )}
                          {b.ai_start_fuel_percent != null && <p>Tank Start: {b.ai_start_fuel_percent}%</p>}
                          {b.ai_end_fuel_percent != null && <p>Tank Ende: {b.ai_end_fuel_percent}%</p>}
                        </div>
                      )}

                      <SettlementPanel booking={b} onChanged={onReloadBookings} />

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
                        <div className="space-y-4">
                          <PhotoGroup
                            title="Fahrzeug vor der Fahrt"
                            photos={bphotos.filter(
                              (p) =>
                                !p.photo_type.startsWith("post_") &&
                                p.photo_type !== "tank_receipt"
                            )}
                            urls={photoUrls}
                          />
                          <PhotoGroup
                            title="Fahrzeug nach der Fahrt"
                            photos={bphotos.filter((p) => p.photo_type.startsWith("post_"))}
                            urls={photoUrls}
                          />
                          <PhotoGroup
                            title="Tankbeleg"
                            photos={bphotos.filter((p) => p.photo_type === "tank_receipt")}
                            urls={photoUrls}
                          />
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
                          <RouteMap points={bgps} />
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

                      {bgps.length > 0 && (
                        <div className="p-3 rounded-xl bg-secondary text-xs text-muted-foreground">
                          Fahrt gestartet um{" "}
                          <span className="font-semibold text-foreground">
                            {format(new Date(bgps[0].recorded_at), "dd.MM.yyyy HH:mm:ss", { locale: de })}
                          </span>
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

function RouteMap({ points }: { points: GpsPoint[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  useEffect(() => {
    if (!ref.current || points.length === 0) return;
    let cancelled = false;
    (async () => {
      const L = await import("leaflet");
      await import("leaflet/dist/leaflet.css");
      if (cancelled || !ref.current) return;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      const latlngs = points.map((p) => [p.latitude, p.longitude]) as [number, number][];
      const map = L.map(ref.current, { zoomControl: true });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
      }).addTo(map);
      const poly = L.polyline(latlngs, { color: "#000", weight: 4 }).addTo(map);
      L.marker(latlngs[0]).addTo(map).bindTooltip("Start");
      L.marker(latlngs[latlngs.length - 1]).addTo(map).bindTooltip("Ende");
      map.fitBounds(poly.getBounds(), { padding: [20, 20] });
      mapRef.current = map;
    })();
    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [points]);
  return <div ref={ref} className="mt-2 h-56 w-full rounded-lg overflow-hidden border border-border" />;
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="p-3 rounded-xl bg-secondary">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}

const PHOTO_TYPE_LABELS: Record<string, string> = {
  front: "Front",
  back: "Heck",
  left: "Links",
  right: "Rechts",
  interior: "Innenraum",
  pre_damage: "Schaden (vorher)",
  post_front: "Front",
  post_back: "Heck",
  post_left: "Links",
  post_right: "Rechts",
  post_interior: "Innenraum",
  post_damage: "Schaden (nachher)",
  tank_receipt: "Tankbeleg",
};

function PhotoGroup({ title, photos, urls }: { title: string; photos: TripPhoto[]; urls?: Record<string, string> }) {
  if (photos.length === 0) return null;
  return (
    <div>
      <p className="text-sm font-semibold mb-2 flex items-center gap-1.5">
        <ImageIcon className="w-4 h-4" /> {title} ({photos.length})
      </p>
      <div className="grid grid-cols-3 gap-2">
        {photos.map((ph) => {
          const src = urls?.[ph.id] ?? ph.photo_url;
          return (
          <a
            key={ph.id}
            href={src}
            target="_blank"
            rel="noreferrer"
            className="relative block"
          >
            <img
              src={src}
              alt={ph.photo_type}
              className="w-full aspect-square object-cover rounded-lg border border-border"
            />
            <span className="absolute bottom-1 left-1 right-1 text-[10px] bg-black/70 text-white px-1.5 py-0.5 rounded truncate">
              {PHOTO_TYPE_LABELS[ph.photo_type] ?? ph.photo_type}
            </span>
          </a>
          );
        })}
      </div>
    </div>
  );
}

function SettlementPanel({
  booking,
  onChanged,
}: {
  booking: Booking;
  onChanged: () => Promise<void>;
}) {
  const chargeExtra = useServerFn(chargeBookingExtra);
  const settle = useServerFn(settleDeposit);

  const extraOwedCents = booking.extra_km_charge_cents ?? 0;
  const extraAlreadyCharged = booking.extra_charge_status === "succeeded";
  const depositSettled = booking.deposit_status === "released";
  const depositCents = Math.round(Number(booking.deposit ?? 200) * 100);

  const [deductEuro, setDeductEuro] = useState<string>(
    extraOwedCents > 0 ? (extraOwedCents / 100).toFixed(2) : "0",
  );
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const deductCents = Math.max(
    0,
    Math.min(depositCents, Math.round(parseFloat(deductEuro.replace(",", ".") || "0") * 100)),
  );
  const refundCents = depositCents - deductCents;

  const hasStripe = !!booking.stripe_payment_method_id;

  const handleChargeExtra = async () => {
    if (!extraOwedCents) return;
    setBusy(true);
    try {
      const res = await chargeExtra({
        data: {
          bookingId: booking.id,
          amountCents: extraOwedCents,
          description: `Mehrkilometer · ${booking.extra_km ?? 0} km`,
          environment: getStripeEnvironment(),
        },
      });
      toast.success(
        res.status === "succeeded"
          ? `Mehrkilometer (${(extraOwedCents / 100).toFixed(2)} €) eingezogen.`
          : `Status: ${res.status}`,
      );
      await onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Abbuchung fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  };

  const handleSettle = async () => {
    setBusy(true);
    try {
      await settle({ data: { bookingId: booking.id, deductCents, environment: getStripeEnvironment() } });
      toast.success(
        refundCents > 0
          ? `${(refundCents / 100).toFixed(2)} € zurückerstattet, ${(deductCents / 100).toFixed(2)} € einbehalten.`
          : `Komplette Kaution (${(depositCents / 100).toFixed(2)} €) einbehalten.`,
      );
      setConfirm(false);
      await onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Abrechnung fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Wallet className="w-4 h-4" />
        <h3 className="text-sm font-semibold">Kaution & Mehrkilometer</h3>
      </div>

      {/* Zusatzpakete */}
      {Array.isArray(booking.addons) && booking.addons.length > 0 && (
        <div className="rounded-xl bg-secondary p-3">
          <p className="text-xs text-muted-foreground mb-1">Gebuchtes Umzugspaket</p>
          <ul className="text-sm space-y-1">
            {booking.addons.map((a) => (
              <li key={a.id} className="flex items-center justify-between">
                <span>📦 {a.label}</span>
                <span className="text-muted-foreground">{(a.price_cents / 100).toFixed(2)} €</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground mt-2">
            Summe: <strong>{((booking.addons_total_cents ?? 0) / 100).toFixed(2)} €</strong> · vor Übergabe bereitlegen, bei Rückgabe auf Vollständigkeit prüfen.
          </p>
        </div>
      )}

      {/* Mehrkilometer */}
      <div className="rounded-xl bg-secondary p-3">
        <p className="text-xs text-muted-foreground">Mehrkilometer-Forderung</p>
        <p className="text-lg font-bold">
          {extraOwedCents > 0 ? `${(extraOwedCents / 100).toFixed(2)} €` : "-"}
          {booking.extra_km != null && booking.extra_km > 0 && (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              ({booking.extra_km} km × 0,90 €)
            </span>
          )}
        </p>
        {extraOwedCents > 0 && (
          <button
            onClick={handleChargeExtra}
            disabled={busy || extraAlreadyCharged || !hasStripe}
            className="mt-2 rounded-full bg-foreground text-background px-4 py-2 text-xs font-semibold disabled:opacity-50"
          >
            {extraAlreadyCharged
              ? "Bereits eingezogen ✓"
              : !hasStripe
              ? "Keine gespeicherte Karte"
              : `Jetzt ${(extraOwedCents / 100).toFixed(2)} € einziehen`}
          </button>
        )}
      </div>

      {/* Kautionsabrechnung */}
      <div className="rounded-xl bg-secondary p-3 space-y-3">
        <div>
          <p className="text-xs text-muted-foreground">Kaution</p>
          <p className="text-lg font-bold">{(depositCents / 100).toFixed(2)} €</p>
        </div>

        {depositSettled ? (
          <div className="text-xs text-muted-foreground">
            Abgerechnet am{" "}
            {booking.deposit_released_at
              ? format(new Date(booking.deposit_released_at), "dd.MM.yyyy HH:mm", { locale: de })
              : "-"}
            {booking.deposit_deducted_cents != null && (
              <>
                {" · einbehalten "}
                <strong>{(booking.deposit_deducted_cents / 100).toFixed(2)} €</strong>
                {" · erstattet "}
                <strong>{((depositCents - booking.deposit_deducted_cents) / 100).toFixed(2)} €</strong>
              </>
            )}
          </div>
        ) : (
          <>
            <label className="block">
              <span className="text-xs text-muted-foreground">Abzug von Kaution (€)</span>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                max={(depositCents / 100).toFixed(2)}
                value={deductEuro}
                onChange={(e) => setDeductEuro(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground"
              />
            </label>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Einbehalten</span>
              <strong>{(deductCents / 100).toFixed(2)} €</strong>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Erstattung an Kunden</span>
              <strong>{(refundCents / 100).toFixed(2)} €</strong>
            </div>

            {!confirm ? (
              <button
                onClick={() => setConfirm(true)}
                disabled={busy}
                className="w-full rounded-full bg-foreground text-background py-2.5 text-sm font-semibold disabled:opacity-50"
              >
                Kaution abrechnen
              </button>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-center">
                  Wirklich <strong>{(deductCents / 100).toFixed(2)} €</strong> einbehalten und{" "}
                  <strong>{(refundCents / 100).toFixed(2)} €</strong> erstatten?
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setConfirm(false)}
                    disabled={busy}
                    className="rounded-full bg-background border border-border py-2 text-sm font-semibold"
                  >
                    Abbrechen
                  </button>
                  <button
                    onClick={handleSettle}
                    disabled={busy}
                    className="rounded-full bg-foreground text-background py-2 text-sm font-semibold disabled:opacity-50"
                  >
                    {busy ? "…" : "Bestätigen"}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}