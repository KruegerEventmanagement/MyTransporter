import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  MapPin,
  Car,
  Clock,
  ChevronDown,
  ChevronUp,
  Check,
  X,
  Image,
  Navigation,
  User,
  LogIn,
} from "lucide-react";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "MyTransporter Admin – Dashboard" },
      { name: "description", content: "Admin-Dashboard für MyTransporter Buchungen" },
    ],
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

interface TripPhoto {
  id: string;
  photo_url: string;
  photo_type: string;
  created_at: string;
}

interface GpsPoint {
  latitude: number;
  longitude: number;
  recorded_at: string;
}

interface Profile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
}

function AdminDashboard() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [photos, setPhotos] = useState<Record<string, TripPhoto[]>>({});
  const [gpsData, setGpsData] = useState<Record<string, GpsPoint[]>>({});
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  useEffect(() => {
    checkAdmin();
  }, []);

  const checkAdmin = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin");

    if (roles && roles.length > 0) {
      setIsAdmin(true);
      await loadBookings();
    }
    setLoading(false);
  };

  const handleLogin = async () => {
    setLoginError("");
    const { error } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: loginPassword,
    });
    if (error) {
      setLoginError(error.message);
      return;
    }
    setLoading(true);
    await checkAdmin();
  };

  const loadBookings = async () => {
    const { data } = await supabase
      .from("bookings")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setBookings(data as Booking[]);
  };

  const loadDetails = async (bookingId: string, userId: string) => {
    if (photos[bookingId]) return;

    const [photosRes, gpsRes, profileRes] = await Promise.all([
      supabase.from("trip_photos").select("*").eq("booking_id", bookingId).order("created_at"),
      supabase.from("gps_tracks").select("latitude, longitude, recorded_at").eq("booking_id", bookingId).order("recorded_at"),
      supabase.from("profiles").select("*").eq("id", userId).single(),
    ]);

    if (photosRes.data) setPhotos((p) => ({ ...p, [bookingId]: photosRes.data as TripPhoto[] }));
    if (gpsRes.data) setGpsData((g) => ({ ...g, [bookingId]: gpsRes.data as GpsPoint[] }));
    if (profileRes.data) setProfiles((pr) => ({ ...pr, [userId]: profileRes.data as Profile }));
  };

  const confirmReturn = async (bookingId: string) => {
    await supabase
      .from("bookings")
      .update({ status: "completed" })
      .eq("id", bookingId);
    await loadBookings();
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "paid": return "bg-muted text-muted-foreground";
      case "active": return "bg-foreground text-background";
      case "returning": return "bg-secondary text-foreground border border-foreground";
      case "completed": return "bg-secondary text-muted-foreground";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case "paid": return "Bezahlt";
      case "active": return "Unterwegs";
      case "returning": return "Rückgabe";
      case "completed": return "Abgeschlossen";
      default: return status;
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Laden...</p>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="max-w-sm w-full">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mx-auto mb-4">
              <LogIn className="w-8 h-8 text-foreground" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">Admin-Login</h1>
            <p className="text-sm text-muted-foreground mt-1">Nur für MyTransporter-Mitarbeiter</p>
          </div>

          <div className="space-y-3">
            <input
              type="email"
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              placeholder="E-Mail"
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <input
              type="password"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              placeholder="Passwort"
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
            />
            {loginError && <p className="text-sm text-foreground">{loginError}</p>}
            <button
              onClick={handleLogin}
              className="w-full rounded-full bg-accent py-3 text-accent-foreground font-medium transition-all hover:scale-[1.02]"
            >
              Einloggen
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Admin-Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-1">{bookings.length} Buchungen</p>
          </div>
          <button
            onClick={loadBookings}
            className="px-4 py-2 rounded-full bg-secondary text-sm font-medium text-foreground hover:bg-secondary/80 transition-all"
          >
            Aktualisieren
          </button>
        </div>

        <div className="space-y-3">
          {bookings.map((booking) => (
            <div key={booking.id} className="rounded-2xl border border-border bg-card overflow-hidden">
              <button
                onClick={() => {
                  const next = expanded === booking.id ? null : booking.id;
                  setExpanded(next);
                  if (next) loadDetails(booking.id, booking.user_id);
                }}
                className="w-full p-4 flex items-center justify-between hover:bg-secondary/30 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center">
                    <Car className="w-5 h-5 text-foreground" />
                  </div>
                  <div className="text-left">
                    <p className="font-medium text-foreground">
                      {booking.vehicle_plate} · {booking.plan_label}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {booking.start_date} · {booking.start_hour}:00 Uhr · Code: {booking.pickup_code}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusColor(booking.status)}`}>
                    {statusLabel(booking.status)}
                  </span>
                  {expanded === booking.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
              </button>

              {expanded === booking.id && (
                <div className="px-4 pb-4 border-t border-border pt-4 space-y-4">
                  {/* User info */}
                  {profiles[booking.user_id] && (
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-secondary">
                      <User className="w-4 h-4 text-muted-foreground" />
                      <div className="text-sm">
                        <p className="text-foreground font-medium">
                          {profiles[booking.user_id].first_name} {profiles[booking.user_id].last_name}
                        </p>
                        <p className="text-muted-foreground">
                          {profiles[booking.user_id].email} · {profiles[booking.user_id].phone}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Booking details */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                    <div className="p-3 rounded-xl bg-secondary">
                      <p className="text-xs text-muted-foreground">Preis</p>
                      <p className="font-medium text-foreground">{booking.plan_price} €</p>
                    </div>
                    <div className="p-3 rounded-xl bg-secondary">
                      <p className="text-xs text-muted-foreground">Kaution</p>
                      <p className="font-medium text-foreground">{booking.deposit} €</p>
                    </div>
                    <div className="p-3 rounded-xl bg-secondary">
                      <p className="text-xs text-muted-foreground">Start-KM</p>
                      <p className="font-medium text-foreground">{booking.start_km ?? "–"}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-secondary">
                      <p className="text-xs text-muted-foreground">End-KM</p>
                      <p className="font-medium text-foreground">{booking.end_km ?? "–"}</p>
                    </div>
                  </div>

                  {/* Remarks */}
                  {booking.remarks && (
                    <div className="p-3 rounded-xl bg-secondary">
                      <p className="text-xs text-muted-foreground mb-1">Anmerkungen</p>
                      <p className="text-sm text-foreground">{booking.remarks}</p>
                    </div>
                  )}

                  {/* Codes */}
                  <div className="flex gap-3">
                    <div className="flex-1 p-3 rounded-xl bg-secondary">
                      <p className="text-xs text-muted-foreground">Abholcode</p>
                      <p className="font-mono font-bold text-foreground">{booking.pickup_code}</p>
                    </div>
                    {booking.return_code && (
                      <div className="flex-1 p-3 rounded-xl bg-secondary">
                        <p className="text-xs text-muted-foreground">Rückgabecode</p>
                        <p className="font-mono font-bold text-foreground">{booking.return_code}</p>
                      </div>
                    )}
                  </div>

                  {/* Photos */}
                  {photos[booking.id] && photos[booking.id].length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-foreground mb-2 flex items-center gap-1">
                        <Image className="w-4 h-4" /> Fotos ({photos[booking.id].length})
                      </p>
                      <div className="grid grid-cols-4 gap-2">
                        {photos[booking.id].map((photo) => (
                          <div key={photo.id} className="relative">
                            <img
                              src={photo.photo_url}
                              alt={photo.photo_type}
                              className="w-full h-20 object-cover rounded-lg border border-border"
                            />
                            <span className="absolute bottom-1 left-1 text-[10px] bg-black/60 text-white px-1.5 py-0.5 rounded">
                              {photo.photo_type}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* GPS data summary */}
                  {gpsData[booking.id] && gpsData[booking.id].length > 0 && (
                    <div className="p-3 rounded-xl bg-secondary">
                      <p className="text-sm font-medium text-foreground flex items-center gap-1 mb-1">
                        <Navigation className="w-4 h-4" /> GPS-Tracking
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {gpsData[booking.id].length} Punkte aufgezeichnet ·
                        Letzte Position: {gpsData[booking.id][gpsData[booking.id].length - 1].latitude.toFixed(4)}, {gpsData[booking.id][gpsData[booking.id].length - 1].longitude.toFixed(4)}
                      </p>
                    </div>
                  )}

                  {/* Confirm return button */}
                  {booking.status === "returning" && (
                    <button
                      onClick={() => confirmReturn(booking.id)}
                      className="w-full rounded-full bg-accent py-3 text-accent-foreground font-medium transition-all hover:scale-[1.02] flex items-center justify-center gap-2"
                    >
                      <Check className="w-5 h-5" /> Rückgabe bestätigen
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}

          {bookings.length === 0 && (
            <div className="text-center py-16">
              <Car className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">Noch keine Buchungen vorhanden.</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}