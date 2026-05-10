import { useState, useEffect, useRef, useCallback } from "react";
import { MapPin, Clock, Gauge, Locate, ChevronUp, ChevronDown, AlertTriangle, Navigation, Search, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { Loader } from "@googlemaps/js-api-loader";

const GOOGLE_MAPS_API_KEY = "AIzaSyAidsYmswSyYosN9yKXswFF3RtJxk8pclc";

// Monochromer Karten-Style passend zur Marke
const MONOCHROME_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#f5f5f5" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#616161" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#f5f5f5" }] },
  { featureType: "administrative.land_parcel", stylers: [{ visibility: "off" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#e0e0e0" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#dadada" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#c9c9c9" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#9e9e9e" }] },
];

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
  const [searchError, setSearchError] = useState<string | null>(null);
  const [routeInfo, setRouteInfo] = useState<{ distance: string; duration: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const directionsRendererRef = useRef<google.maps.DirectionsRenderer | null>(null);
  const directionsServiceRef = useRef<google.maps.DirectionsService | null>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
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
    // Tatsächlicher Fahrtstart: erste Mal, wenn dieses Panel geöffnet wird
    const key = `mt_trip_started_${bookingId}`;
    let startedAtMs = parseInt(localStorage.getItem(key) || "0", 10);
    if (!startedAtMs) {
      startedAtMs = Date.now();
      localStorage.setItem(key, String(startedAtMs));
    }
    const tick = () => {
      const diff = Math.max(0, Date.now() - startedAtMs);
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
  }, [bookingId]);

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

  // Google Maps init
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;
    const init = async () => {
      try {
        const loader = new Loader({
          apiKey: GOOGLE_MAPS_API_KEY,
          version: "weekly",
        });
        await loader.importLibrary("maps");
        await loader.importLibrary("places");
        await loader.importLibrary("routes");
        await loader.importLibrary("marker");

        const map = new google.maps.Map(mapRef.current!, {
          center: { lat: 52.52, lng: 13.405 },
          zoom: 14,
          disableDefaultUI: true,
          gestureHandling: "greedy",
          styles: MONOCHROME_STYLE,
          clickableIcons: false,
        });

        markerRef.current = new google.maps.Marker({
          position: { lat: 52.52, lng: 13.405 },
          map,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 10,
            fillColor: "#000",
            fillOpacity: 1,
            strokeColor: "#fff",
            strokeWeight: 3,
          },
        });

        directionsServiceRef.current = new google.maps.DirectionsService();
        directionsRendererRef.current = new google.maps.DirectionsRenderer({
          map,
          suppressMarkers: false,
          polylineOptions: { strokeColor: "#000", strokeWeight: 5, strokeOpacity: 0.8 },
        });

        // Autocomplete an Eingabefeld binden
        if (inputRef.current) {
          autocompleteRef.current = new google.maps.places.Autocomplete(inputRef.current, {
            fields: ["geometry", "formatted_address", "name"],
            componentRestrictions: { country: ["de", "at", "ch"] },
          });
          autocompleteRef.current.addListener("place_changed", () => {
            const place = autocompleteRef.current?.getPlace();
            if (!place?.geometry?.location) {
              setSearchError("Ort konnte nicht gefunden werden.");
              return;
            }
            const lat = place.geometry.location.lat();
            const lng = place.geometry.location.lng();
            const label = place.formatted_address || place.name || "";
            applyDestination({ lat, lng, label });
          });
        }

        mapInstance.current = map;
      } catch (err) {
        console.error("Google Maps load error:", err);
        setSearchError("Karte konnte nicht geladen werden.");
      }
    };
    init();
    // Google Maps wird vom Browser entsorgt, kein remove() nötig
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update marker
  useEffect(() => {
    if (!position || !mapInstance.current || !markerRef.current) return;
    markerRef.current.setPosition({ lat: position.lat, lng: position.lng });
    if (!destination) {
      mapInstance.current.panTo({ lat: position.lat, lng: position.lng });
    }
  }, [position]);

  const recenter = () => {
    if (position && mapInstance.current) {
      mapInstance.current.panTo({ lat: position.lat, lng: position.lng });
      mapInstance.current.setZoom(16);
    }
  };

  // Ziel setzen + Route zeichnen via Google Directions API
  const applyDestination = (dest: { lat: number; lng: number; label: string }) => {
    setDestination(dest);
    setDestinationQuery(dest.label);
    setSearchError(null);

    if (
      directionsServiceRef.current &&
      directionsRendererRef.current &&
      mapInstance.current
    ) {
      const origin = position
        ? new google.maps.LatLng(position.lat, position.lng)
        : null;
      if (!origin) {
        // Kein Standort -> nur zentrieren
        mapInstance.current.panTo({ lat: dest.lat, lng: dest.lng });
        mapInstance.current.setZoom(14);
        return;
      }
      directionsServiceRef.current.route(
        {
          origin,
          destination: new google.maps.LatLng(dest.lat, dest.lng),
          travelMode: google.maps.TravelMode.DRIVING,
        },
        (result, status) => {
          if (status === google.maps.DirectionsStatus.OK && result) {
            directionsRendererRef.current!.setDirections(result);
            const leg = result.routes[0]?.legs[0];
            if (leg) {
              setRouteInfo({
                distance: leg.distance?.text || "",
                duration: leg.duration?.text || "",
              });
            }
          } else {
            setSearchError("Route konnte nicht berechnet werden.");
          }
        }
      );
    }
  };

  const clearDestination = () => {
    setDestination(null);
    setDestinationQuery("");
    setRouteInfo(null);
    setSearchError(null);
    if (directionsRendererRef.current) {
      directionsRendererRef.current.set("directions", null);
    }
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
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  <input
                    ref={inputRef}
                    type="text"
                    value={destinationQuery}
                    onChange={(e) => setDestinationQuery(e.target.value)}
                    placeholder="Zieladresse eingeben..."
                    className="w-full rounded-full bg-secondary pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-foreground"
                  />
                </div>
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
                    {routeInfo && (
                      <div className="grid grid-cols-2 gap-2">
                        <div className="p-2 rounded-xl bg-background text-center">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Distanz</p>
                          <p className="text-sm font-bold">{routeInfo.distance}</p>
                        </div>
                        <div className="p-2 rounded-xl bg-background text-center">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Fahrzeit</p>
                          <p className="text-sm font-bold">{routeInfo.duration}</p>
                        </div>
                      </div>
                    )}
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
