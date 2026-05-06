import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { MapPin, Clock, Fuel, Gauge, AlertTriangle, Navigation } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { de } from "date-fns/locale";

interface ActiveDriveScreenProps {
  bookingId: string;
  startDate: Date;
  startHour: number;
  startKm: number;
  vehicleName: string;
  vehiclePlate: string;
  onReturn: () => void;
}

export function ActiveDriveScreen({
  bookingId,
  startDate,
  startHour,
  startKm,
  vehicleName,
  vehiclePlate,
  onReturn,
}: ActiveDriveScreenProps) {
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [elapsedStr, setElapsedStr] = useState("00:00:00");
  const [truckOffset, setTruckOffset] = useState(0);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any | null>(null);
  const markerRef = useRef<any | null>(null);
  const trackIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Elapsed time counter
  useEffect(() => {
    const st = new Date(startDate.getTime());
    st.setHours(startHour, 0, 0, 0);
    const interval = setInterval(() => {
      const diff = Date.now() - st.getTime();
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setElapsedStr(
        `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
      );
    }, 1000);
    return () => clearInterval(interval);
  }, [startDate, startHour]);

  // Truck animation
  useEffect(() => {
    const anim = setInterval(() => {
      setTruckOffset((prev) => (prev + 1) % 100);
    }, 50);
    return () => clearInterval(anim);
  }, []);

  // GPS tracking
  const recordPosition = useCallback(
    async (lat: number, lng: number) => {
      try {
        await supabase.from("gps_tracks").insert({
          booking_id: bookingId,
          latitude: lat,
          longitude: lng,
        });
      } catch (err) {
        console.error("GPS track error:", err);
      }
    },
    [bookingId]
  );

  useEffect(() => {
    if (!navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const newPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setPosition(newPos);
      },
      (err) => console.error("Geolocation error:", err),
      { enableHighAccuracy: true, maximumAge: 5000 }
    );

    // Record GPS every 30 seconds
    trackIntervalRef.current = setInterval(() => {
      navigator.geolocation.getCurrentPosition((pos) => {
        recordPosition(pos.coords.latitude, pos.coords.longitude);
      });
    }, 30000);

    // Record initial position
    navigator.geolocation.getCurrentPosition((pos) => {
      recordPosition(pos.coords.latitude, pos.coords.longitude);
    });

    return () => {
      navigator.geolocation.clearWatch(watchId);
      if (trackIntervalRef.current) clearInterval(trackIntervalRef.current);
    };
  }, [recordPosition]);

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const initMap = async () => {
      const L = await import("leaflet");
      await import("leaflet/dist/leaflet.css");

      const map = L.map(mapContainerRef.current!, {
        center: [52.52, 13.405],
        zoom: 14,
        zoomControl: false,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
      }).addTo(map);

      mapInstanceRef.current = map;

      // Create marker
      const icon = L.divIcon({
        html: '<div style="font-size:24px">🚛</div>',
        className: "truck-marker",
        iconSize: [30, 30],
      });
      markerRef.current = L.marker([52.52, 13.405], { icon }).addTo(map);
    };

    initMap();

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update marker position
  useEffect(() => {
    if (!position || !mapInstanceRef.current || !markerRef.current) return;
    markerRef.current.setLatLng([position.lat, position.lng]);
    mapInstanceRef.current.setView([position.lat, position.lng], 14);
  }, [position]);

  return (
    <div className="max-w-lg mx-auto animate-fade-in-up">
      {/* Animated truck */}
      <div className="relative h-24 bg-secondary rounded-2xl mb-6 overflow-hidden">
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-border" />
        {/* Road dashes */}
        {Array.from({ length: 20 }).map((_, i) => (
          <div
            key={i}
            className="absolute bottom-[2px] h-[2px] w-4 bg-muted-foreground/30"
            style={{
              left: `${((i * 6 - truckOffset * 1.2) % 120) + 0}%`,
            }}
          />
        ))}
        <div
          className="absolute bottom-2 text-4xl transition-transform"
          style={{ left: `${40 + Math.sin(truckOffset * 0.1) * 5}%` }}
        >
          🚛
        </div>
      </div>

      {/* Trip info cards */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="p-4 rounded-2xl bg-secondary">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Fahrtzeit</span>
          </div>
          <p className="text-xl font-mono font-bold text-foreground">{elapsedStr}</p>
        </div>
        <div className="p-4 rounded-2xl bg-secondary">
          <div className="flex items-center gap-2 mb-1">
            <Gauge className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Start-KM</span>
          </div>
          <p className="text-xl font-bold text-foreground">{startKm.toLocaleString("de-DE")} km</p>
        </div>
        <div className="p-4 rounded-2xl bg-secondary">
          <div className="flex items-center gap-2 mb-1">
            <MapPin className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Startdatum</span>
          </div>
          <p className="text-sm font-medium text-foreground">
            {format(startDate, "dd.MM.yyyy", { locale: de })} · {startHour}:00
          </p>
        </div>
        <div className="p-4 rounded-2xl bg-secondary">
          <div className="flex items-center gap-2 mb-1">
            <Navigation className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Fahrzeug</span>
          </div>
          <p className="text-sm font-medium text-foreground">{vehiclePlate}</p>
        </div>
      </div>

      {/* Hints */}
      <div className="p-3 rounded-xl bg-secondary mb-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>Nicht rauchen · Tank volltanken · Rückgabe bis 22:00 Uhr</span>
        </div>
      </div>

      {/* Map */}
      <div className="rounded-2xl overflow-hidden border border-border mb-6">
        <div ref={mapContainerRef} className="h-64 w-full" />
        {!position && (
          <div className="p-3 bg-secondary text-center">
            <p className="text-xs text-muted-foreground">
              GPS-Ortung wird aktiviert... Bitte Standortzugriff erlauben.
            </p>
          </div>
        )}
      </div>

      {/* Return button */}
      <button
        onClick={onReturn}
        className="w-full rounded-full bg-accent py-4 text-accent-foreground font-medium text-lg transition-all hover:scale-[1.02] hover:shadow-lg"
      >
        Fahrzeug zurückgeben
      </button>
    </div>
  );
}