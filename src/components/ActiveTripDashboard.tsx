import { useState, useEffect, useRef, useCallback } from "react";
import { MapPin, Clock, Gauge, Locate, ChevronUp, ChevronDown, AlertTriangle } from "lucide-react";
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
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const trackInterval = useRef<ReturnType<typeof setInterval> | null>(null);

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
  }, [recordPosition]);

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

  return (
    <div className="fixed inset-0 bg-background overflow-hidden">
      {/* Vollbild-Karte */}
      <div ref={mapRef} className="absolute inset-0 z-0" />

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
                <div className="p-3 rounded-2xl bg-secondary col-span-2">
                  <div className="flex items-center gap-1.5 mb-1">
                    <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Start</span>
                  </div>
                  <p className="text-sm font-medium">
                    {format(startDate, "EEEE, dd. MMMM", { locale: de })} · {startHour}:00 Uhr
                  </p>
                </div>
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
