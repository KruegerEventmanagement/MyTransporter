import { useState, useEffect, useRef, useCallback } from "react";
import { MapPin, Clock, Gauge, Locate, ChevronUp, ChevronDown, AlertTriangle, Navigation, Search, ExternalLink, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { de } from "date-fns/locale";

interface Props {
  bookingId: string;
  startDate: Date;
  startHour: number;
  startKm: number;
  vehicleName: string;
  vehiclePlate: string;
  planLabel: string;
  onReturn: () => void;
}

export function ActiveTripDashboard({
  bookingId,
  startDate,
  startHour,
  startKm,
  vehicleName,
  vehiclePlate,
  planLabel,
  onReturn,
}: Props) {
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [elapsedStr, setElapsedStr] = useState("00:00:00");
  const [sheetExpanded, setSheetExpanded] = useState(true);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [gpsDenied, setGpsDenied] = useState(false);
  const [gpsAsked, setGpsAsked] = useState(false);
  const [destinationQuery, setDestinationQuery] = useState("");
  const [destination, setDestination] = useState<{ lat: number; lng: number; label: string } | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const destMarkerRef = useRef<any>(null);
  const routeLineRef = useRef<any>(null);
  const trackInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // Plan-Dauer aus Label/ID parsen (z.B. "6 Stunden", "1 Tag", "24h")
  const planDurationHours: number = (() => {
    const src = planLabel || "";
    const dayMatch = src.match(/(\d+)\s*Tag/i);
    if (dayMatch) return parseInt(dayMatch[1], 10) * 24;
    const hMatch = src.match(/(\d+)\s*(?:Stunden|Std|h)\b/i);
    if (hMatch) return parseInt(hMatch[1], 10);
    const numMatch = src.match(/(\d+)/);
    return numMatch ? parseInt(numMatch[1], 10) : 6;
  })();

  const startDateTime = (() => {
    const d = new Date(startDate.getTime());
    d.setHours(startHour, 0, 0, 0);
    return d;
  })();
  const returnDateTime = new Date(startDateTime.getTime() + planDurationHours * 3600000);

  // Timer
  useEffect(() => {
    const st = new Date(startDate.getTime());
    st.setHours(startHour, 0, 0, 0);
    const tick = () => {
      const diff = Math.max(0, Date.now() - st.getTime());
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setElapsedStr(
        `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
      );
    };
    tick();
    const i = setInterval(tick, 1000);
    return () => clearInterval(i);
  }, [startDate, startHour]);

  // GPS
  const recordPosition = useCallback(
    async (lat: number, lng: number) => {
      if (bookingId.startsWith("demo-")) return;
      try {
        await supabase.from("gps_tracks").insert({
          booking_id: bookingId,
          latitude: lat,
          longitude: lng,
        });
      } catch (e) {
        console.error("GPS track:", e);
      }
    },
    [bookingId]
  );

  useEffect(() => {
    if (!gpsAsked) return;
    if (!navigator.geolocation) {
      setGpsDenied(true);
      return;
    }
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGpsDenied(false);
      },
      (err) => {
        console.error("Geo:", err);
        if (err.code === err.PERMISSION_DENIED) setGpsDenied(true);
      },
      { enableHighAccuracy: true, maximumAge: 5000 }
    );

    trackInterval.current = setInterval(() => {
      navigator.geolocation.getCurrentPosition((pos) => {
        recordPosition(pos.coords.latitude, pos.coords.longitude);
      });
    }, 30000);

    navigator.geolocation.getCurrentPosition(
      (pos) => recordPosition(pos.coords.latitude, pos.coords.longitude),
      () => {}
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
      if (trackInterval.current) clearInterval(trackInterval.current);
    };
  }, [recordPosition, gpsAsked]);

  // Map init
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;
    const init = async () => {
      const L = await import("leaflet");
      await import("leaflet/dist/leaflet.css");

      const map = L.map(mapRef.current!, {
        center: [52.52, 13.405],
        zoom: 14,
        zoomControl: false,
        attributionControl: false,
      });

      // Monochrome tiles (CartoDB Positron - schwarz/weiß/grau passt zur Markenidentität)
      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
        subdomains: "abcd",
        maxZoom: 19,
      }).addTo(map);

      const icon = L.divIcon({
        html: `<div style="
          width:36px;height:36px;border-radius:50%;
          background:#000;color:#fff;display:flex;align-items:center;justify-content:center;
          font-size:18px;box-shadow:0 0 0 4px rgba(0,0,0,0.15),0 4px 12px rgba(0,0,0,0.3);
          border:2px solid #fff;">🚛</div>`,
        className: "",
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });
      markerRef.current = L.marker([52.52, 13.405], { icon }).addTo(map);
      mapInstance.current = map;
    };
    init();
    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, []);

  // Update marker
  useEffect(() => {
    if (!position || !mapInstance.current || !markerRef.current) return;
    markerRef.current.setLatLng([position.lat, position.lng]);
    mapInstance.current.setView([position.lat, position.lng], 15);
  }, [position]);

  const recenter = () => {
    if (position && mapInstance.current) {
      mapInstance.current.setView([position.lat, position.lng], 16);
    }
  };

  // Ziel-Suche via Nominatim (OpenStreetMap, kein API-Key nötig)
  const handleSearchDestination = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!destinationQuery.trim()) return;
    setSearching(true);
    setSearchError(null);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(destinationQuery)}`;
      const res = await fetch(url, { headers: { "Accept-Language": "de" } });
      const data: Array<{ lat: string; lon: string; display_name: string }> = await res.json();
      if (!data.length) {
        setSearchError("Kein Ort gefunden. Bitte genauer eingeben.");
        return;
      }
      const d = data[0];
      const dest = { lat: parseFloat(d.lat), lng: parseFloat(d.lon), label: d.display_name };
      setDestination(dest);

      if (mapInstance.current) {
        const L = await import("leaflet");
        if (destMarkerRef.current) destMarkerRef.current.remove();
        const destIcon = L.divIcon({
          html: `<div style="width:32px;height:32px;border-radius:50% 50% 50% 0;background:#000;border:2px solid #fff;transform:rotate(-45deg);box-shadow:0 4px 12px rgba(0,0,0,0.3);"></div>`,
          className: "",
          iconSize: [32, 32],
          iconAnchor: [16, 32],
        });
        destMarkerRef.current = L.marker([dest.lat, dest.lng], { icon: destIcon }).addTo(mapInstance.current);

        if (routeLineRef.current) routeLineRef.current.remove();
        if (position) {
          routeLineRef.current = L.polyline(
            [[position.lat, position.lng], [dest.lat, dest.lng]],
            { color: "#000", weight: 3, dashArray: "8 6", opacity: 0.7 }
          ).addTo(mapInstance.current);
          mapInstance.current.fitBounds(
            [[position.lat, position.lng], [dest.lat, dest.lng]],
            { padding: [60, 60] }
          );
        } else {
          mapInstance.current.setView([dest.lat, dest.lng], 14);
        }
      }
    } catch (err) {
      console.error("Geocode error:", err);
      setSearchError("Suche fehlgeschlagen. Bitte erneut versuchen.");
    } finally {
      setSearching(false);
    }
  };

  const clearDestination = () => {
    setDestination(null);
    setDestinationQuery("");
    if (destMarkerRef.current) {
      destMarkerRef.current.remove();
      destMarkerRef.current = null;
    }
    if (routeLineRef.current) {
      routeLineRef.current.remove();
      routeLineRef.current = null;
    }
  };

  const openInGoogleMaps = () => {
    if (!destination) return;
    const origin = position ? `${position.lat},${position.lng}` : "";
    const dest = `${destination.lat},${destination.lng}`;
    const url = origin
      ? `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}&travelmode=driving`
      : `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="fixed inset-0 bg-background overflow-hidden">
      {/* Vollbild-Karte */}
      <div ref={mapRef} className="absolute inset-0 z-0" />

      {/* GPS-Berechtigungs-Dialog */}
      {!gpsAsked && (
        <div className="absolute inset-0 z-40 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-background rounded-3xl p-6 max-w-sm w-full text-center shadow-2xl">
            <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mx-auto mb-4">
              <Navigation className="w-8 h-8 text-foreground" />
            </div>
            <h2 className="text-xl font-bold mb-2">Standort verwenden?</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Darf MyTransporter dein GPS verwenden, um deinen Standort auf der Karte anzuzeigen und die Fahrt aufzuzeichnen?
            </p>
            <div className="space-y-2">
              <button
                onClick={() => setGpsAsked(true)}
                className="w-full rounded-full bg-accent py-3 text-accent-foreground font-semibold"
              >
                Ja, Standort erlauben
              </button>
              <button
                onClick={() => { setGpsAsked(true); setGpsDenied(true); }}
                className="w-full rounded-full bg-secondary py-3 text-foreground font-medium text-sm"
              >
                Nicht jetzt
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top-Statusbar */}
      <div className="absolute top-0 left-0 right-0 z-20 p-4 pt-safe pointer-events-none">
        <div className="flex items-center justify-between gap-3">
          <div className="pointer-events-auto inline-flex items-center gap-2 bg-foreground text-background rounded-full px-4 py-2 shadow-lg">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-background opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-background" />
            </span>
            <span className="text-sm font-semibold">Fahrt läuft</span>
          </div>
          <div className="pointer-events-auto bg-background/95 backdrop-blur rounded-full px-4 py-2 shadow-lg">
            <p className="text-sm font-mono font-bold tabular-nums">{elapsedStr}</p>
          </div>
        </div>

        {gpsDenied && (
          <div className="mt-3 pointer-events-auto bg-background/95 backdrop-blur rounded-2xl px-4 py-3 shadow-lg flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-foreground">
              GPS-Zugriff wurde abgelehnt. Bitte in den Browser-Einstellungen erlauben, damit deine Fahrt aufgezeichnet werden kann.
            </p>
          </div>
        )}
      </div>

      {/* Recenter-Button */}
      {position && (
        <button
          onClick={recenter}
          className="absolute right-4 z-20 bg-background rounded-full p-3 shadow-lg hover:scale-105 transition-all"
          style={{ bottom: sheetExpanded ? "calc(60vh + 16px)" : "180px" }}
          aria-label="Auf meine Position zentrieren"
        >
          <Locate className="w-5 h-5 text-foreground" />
        </button>
      )}

      {/* Bottom-Sheet */}
      <div
        className={`absolute left-0 right-0 bottom-0 z-10 bg-background rounded-t-3xl shadow-2xl transition-all duration-300 ease-out`}
        style={{ maxHeight: sheetExpanded ? "60vh" : "150px" }}
      >
        {/* Drag-Handle */}
        <button
          onClick={() => setSheetExpanded((v) => !v)}
          className="w-full pt-3 pb-2 flex flex-col items-center gap-1 cursor-pointer"
          aria-label={sheetExpanded ? "Einklappen" : "Ausklappen"}
        >
          <div className="w-10 h-1 rounded-full bg-border" />
          {sheetExpanded ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          )}
        </button>

        <div className="px-5 pb-6 overflow-y-auto" style={{ maxHeight: "calc(60vh - 50px)" }}>
          {/* Fahrzeug-Header */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-xs text-muted-foreground">{planLabel}</p>
              <h2 className="text-lg font-bold text-foreground">{vehicleName}</h2>
              <p className="text-xs text-muted-foreground font-mono">{vehiclePlate}</p>
            </div>
          </div>

          {sheetExpanded && (
            <>
              {/* Trip-Stats */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="p-3 rounded-2xl bg-secondary">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Fahrtzeit</span>
                  </div>
                  <p className="text-lg font-mono font-bold tabular-nums">{elapsedStr}</p>
                </div>
                <div className="p-3 rounded-2xl bg-secondary">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Gauge className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Start-KM</span>
                  </div>
                  <p className="text-lg font-bold">{startKm.toLocaleString("de-DE")}</p>
                </div>
                <div className="p-3 rounded-2xl bg-secondary">
                  <div className="flex items-center gap-1.5 mb-1">
                    <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Start</span>
                  </div>
                  <p className="text-sm font-semibold">{startHour}:00 Uhr</p>
                  <p className="text-[11px] text-muted-foreground">
                    {format(startDate, "EEE, dd.MM.", { locale: de })}
                  </p>
                </div>
                <div className="p-3 rounded-2xl bg-foreground text-background">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Clock className="w-3.5 h-3.5 opacity-70" />
                    <span className="text-xs opacity-70">Rückgabe bis</span>
                  </div>
                  <p className="text-sm font-semibold">
                    {format(returnDateTime, "HH:mm", { locale: de })} Uhr
                  </p>
                  <p className="text-[11px] opacity-70">
                    {format(returnDateTime, "EEE, dd.MM.", { locale: de })} · {planDurationHours}h
                  </p>
                </div>
              </div>

              {/* Navigation */}
              <div className="mb-4">
                <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                  <Navigation className="w-3.5 h-3.5" /> Navigation
                </p>
                <form onSubmit={handleSearchDestination} className="flex gap-2">
                  <div className="flex-1 relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="text"
                      value={destinationQuery}
                      onChange={(e) => setDestinationQuery(e.target.value)}
                      placeholder="Zieladresse eingeben..."
                      className="w-full rounded-full bg-secondary pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-foreground"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={searching || !destinationQuery.trim()}
                    className="rounded-full bg-foreground text-background px-4 py-2.5 text-sm font-medium disabled:opacity-40"
                  >
                    {searching ? "..." : "OK"}
                  </button>
                </form>
                {searchError && (
                  <p className="text-xs text-muted-foreground mt-2">{searchError}</p>
                )}
                {destination && (
                  <div className="mt-2 p-3 rounded-2xl bg-secondary">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-muted-foreground">Ziel</p>
                        <p className="text-sm font-medium truncate">{destination.label}</p>
                      </div>
                      <button
                        onClick={clearDestination}
                        aria-label="Ziel entfernen"
                        className="w-6 h-6 rounded-full bg-background flex items-center justify-center flex-shrink-0"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <button
                      onClick={openInGoogleMaps}
                      className="w-full rounded-full bg-foreground text-background py-2 text-xs font-semibold flex items-center justify-center gap-1.5"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Route in Google Maps öffnen
                    </button>
                  </div>
                )}
              </div>

              {/* Hinweise */}
              <div className="p-3 rounded-xl bg-secondary mb-4 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">
                  Nicht rauchen · Tank volltanken · Rückgabe pünktlich
                </p>
              </div>
            </>
          )}

          {/* Beenden-Button */}
          {!confirmEnd ? (
            <button
              onClick={() => setConfirmEnd(true)}
              className="w-full rounded-full bg-accent py-4 text-accent-foreground font-semibold text-base hover:scale-[1.02] transition-all shadow-lg"
            >
              Fahrt beenden
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-center text-sm text-muted-foreground">
                Fahrt wirklich beenden?
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setConfirmEnd(false)}
                  className="rounded-full bg-secondary py-3 text-foreground font-medium text-sm hover:bg-secondary/80 transition-all"
                >
                  Abbrechen
                </button>
                <button
                  onClick={onReturn}
                  className="rounded-full bg-accent py-3 text-accent-foreground font-semibold text-sm hover:scale-[1.02] transition-all"
                >
                  Ja, beenden
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
