/// <reference types="google.maps" />
import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "@tanstack/react-router";
import {
  MapPin,
  Clock,
  Gauge,
  Locate,
  ChevronUp,
  ChevronDown,
  AlertTriangle,
  Navigation,
  Search,
  X,
  Route as RouteIcon,
  Flag,
  Bell,
  ListChecks,
  RotateCcw,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";
import { formatBerlin, formatDuration, returnTimeState, type ReturnTimeState } from "@/lib/trip-time";
import { rankRoutes, createRequestGate, type RouteAlt } from "@/lib/trip-routes";
import { loadTripNav, saveTripNav } from "@/lib/return-draft";
import { enablePushOnThisDevice, getPushStatus, isSubscribedOnThisDevice } from "@/lib/push-client";
import { BrandHomeLink } from "@/components/BrandHomeLink";

const GOOGLE_MAPS_API_KEY =
  (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) ||
  "AIzaSyAidsYmswSyYosN9yKXswFF3RtJxk8pclc";


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

const CHECKLIST = [
  "8 Außenfotos (vorne, vorne rechts, rechts, hinten rechts, hinten, hinten links, links, vorne links)",
  "Innenraum-Foto",
  "Kilometerstand (Tacho-Foto)",
  "Tankstand (Foto der Tankanzeige)",
  "Tankbeleg",
  "Gebuchtes Zubehör zurücklegen",
  "Schlüssel mit Rückgabecode abgeben",
];

type LatLng = { lat: number; lng: number };
type Dest = LatLng & { label: string };

interface Props {
  bookingId: string;
  userId?: string | null;
  /** Bestätigter Mietbeginn / Mietende (zentraler Resolver, Europe/Berlin). */
  startAtMs: number;
  endAtMs: number;
  /** null = Start-Kilometerstand unbekannt (manuelle Prüfung). */
  startKm: number | null;
  vehicleName: string;
  vehiclePlate: string;
  planLabel: string;
  addons?: Array<{ id: string; label: string }>;
  /** Nur bestätigte fahrzeugbezogene Adresse aus der Fahrzeugdatenbank; nie geraten. */
  pickupAddress?: string | null;
  pickupStatus?: "loading" | "ok" | "missing" | "error";
  onReturn: () => void;
}

export function ActiveTripDashboard({
  bookingId,
  userId,
  startAtMs,
  endAtMs,
  startKm,
  vehicleName,
  vehiclePlate,
  planLabel,
  addons,
  pickupAddress,
  pickupStatus = pickupAddress ? "ok" : "missing",
  onReturn,
}: Props) {
  const nav0 = useRef(userId ? loadTripNav(userId, bookingId) : null).current;
  const [position, setPosition] = useState<LatLng | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [sheetExpanded, setSheetExpanded] = useState(!nav0?.navMode);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [gpsChoice, setGpsChoice] = useState<"granted" | "declined" | null>(nav0?.gpsChoice ?? null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [destinationQuery, setDestinationQuery] = useState(nav0?.destination?.label ?? "");
  const [destination, setDestination] = useState<Dest | null>(nav0?.destination ?? null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [mapAttempt, setMapAttempt] = useState(0);
  const [mapReady, setMapReady] = useState(false);
  const [routeInfo, setRouteInfo] = useState<{ distance: string; duration: string } | null>(null);
  const [routeAlternatives, setRouteAlternatives] = useState<RouteAlt[]>([]);
  const [selectedRouteIdx, setSelectedRouteIdx] = useState(nav0?.routeIndex ?? 0);
  const [navMode, setNavMode] = useState(nav0?.navMode ?? false);
  const [arrivalTime, setArrivalTime] = useState<Date | null>(null);
  const [routeFromPickup, setRouteFromPickup] = useState(false);
  const [showChecklist, setShowChecklist] = useState(false);
  const [pushState, setPushState] = useState<"unknown" | "on" | "off" | "denied" | "unsupported" | "busy" | "iframe">("unknown");
  const lastDirectionsResult = useRef<google.maps.DirectionsResult | null>(null);
  const positionRef = useRef<LatLng | null>(null);
  const pickupRef = useRef<LatLng | null>(null);
  const destinationRef = useRef<Dest | null>(nav0?.destination ?? null);
  const preferredRouteIdx = useRef(nav0?.routeIndex ?? 0);
  const inputRef = useRef<HTMLInputElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const directionsRendererRef = useRef<google.maps.DirectionsRenderer | null>(null);
  const directionsServiceRef = useRef<google.maps.DirectionsService | null>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  const trackInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const gate = useRef(createRequestGate()).current;
  /** Adresssuche: späte Geocoder-Antworten nach neuer Suche/Entfernen/Unmount verwerfen. */
  const searchSeq = useRef(0);
  const [pickupGeoFailed, setPickupGeoFailed] = useState(false);
  const confirmedPickup = pickupStatus === "ok" && pickupAddress ? pickupAddress : null;

  // Persistenz pro Nutzer + Buchung
  useEffect(() => {
    if (!userId) return;
    saveTripNav(userId, bookingId, { destination, routeIndex: selectedRouteIdx, navMode, gpsChoice });
  }, [userId, bookingId, destination, selectedRouteIdx, navMode, gpsChoice]);

  // Uhr: Laufzeit ab bestätigtem Mietbeginn; Fokus/Resume/Online sofort aktualisieren.
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const i = setInterval(tick, 1000);
    window.addEventListener("focus", tick);
    window.addEventListener("online", tick);
    window.addEventListener("pageshow", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(i);
      window.removeEventListener("focus", tick);
      window.removeEventListener("online", tick);
      window.removeEventListener("pageshow", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      if (typeof window !== "undefined" && window.top !== window.self) {
        if (alive) setPushState("iframe");
        return;
      }
      const s = await getPushStatus();
      if (!alive) return;
      if (s === "unsupported") setPushState("unsupported");
      else if (s === "denied") setPushState("denied");
      else setPushState((await isSubscribedOnThisDevice()) ? "on" : "off");
    })();
    return () => {
      alive = false;
    };
  }, []);

  const elapsed = Math.max(0, now - startAtMs);
  const timeState: ReturnTimeState = returnTimeState(now, endAtMs);
  const remaining = endAtMs - now;
  const planDurationHours = Math.round((endAtMs - startAtMs) / 3600000);

  // GPS (freiwillig; nur nach ausdrücklicher Zustimmung)
  const recordPosition = useCallback(
    async (lat: number, lng: number) => {
      if (bookingId.startsWith("demo-")) return;
      try {
        await supabase.from("gps_tracks").insert({ booking_id: bookingId, latitude: lat, longitude: lng });
      } catch (e) {
        console.error("GPS track:", e);
      }
    },
    [bookingId],
  );

  useEffect(() => {
    if (gpsChoice !== "granted") return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGpsError("Dieses Gerät stellt keinen Standort bereit. Die Karte funktioniert trotzdem.");
      return;
    }
    let active = true;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (!active) return;
        setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGpsError(null);
      },
      (err) => {
        if (!active) return;
        if (err.code === err.PERMISSION_DENIED) {
          setGpsError("Standortzugriff wurde abgelehnt. Du kannst ihn in den Browser-Einstellungen erlauben.");
          setGpsChoice("declined");
        } else {
          setGpsError("Standort gerade nicht verfügbar. Wir versuchen es weiter.");
        }
      },
      { enableHighAccuracy: true, maximumAge: 5000 },
    );
    trackInterval.current = setInterval(() => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (active) void recordPosition(pos.coords.latitude, pos.coords.longitude);
        },
        () => {},
      );
    }, 30000);
    return () => {
      active = false;
      positionRef.current = null;
      navigator.geolocation.clearWatch(watchId);
      if (trackInterval.current) clearInterval(trackInterval.current);
    };
  }, [recordPosition, gpsChoice]);

  const showLegs = useCallback((result: google.maps.DirectionsResult, idx: number) => {
    const leg = result.routes[idx]?.legs[0];
    if (leg) {
      setRouteInfo({ distance: leg.distance?.text || "", duration: leg.duration?.text || "" });
      setArrivalTime(new Date(Date.now() + (leg.duration?.value || 0) * 1000));
    }
  }, []);

  // Route berechnen; veraltete Antworten werden verworfen.
  const computeRoute = useCallback(
    (dest: Dest) => {
      const svc = directionsServiceRef.current;
      const renderer = directionsRendererRef.current;
      const map = mapInstance.current;
      if (!svc || !renderer || !map) return;
      const origin = positionRef.current ?? pickupRef.current;
      if (!origin) {
        map.panTo({ lat: dest.lat, lng: dest.lng });
        map.setZoom(14);
        setSearchError("Noch kein Startpunkt: Erlaube deinen Standort, um eine Route zu berechnen.");
        return;
      }
      setRouteFromPickup(!positionRef.current);
      const token = gate.next();
      svc.route(
        {
          origin: new google.maps.LatLng(origin.lat, origin.lng),
          destination: new google.maps.LatLng(dest.lat, dest.lng),
          travelMode: google.maps.TravelMode.DRIVING,
          provideRouteAlternatives: true,
        },
        (result, status) => {
          if (!gate.isCurrent(token) || !mapInstance.current) return;
          if (status === google.maps.DirectionsStatus.OK && result) {
            lastDirectionsResult.current = result;
            const alts = rankRoutes(result.routes as never);
            const wanted = preferredRouteIdx.current;
            const idx = wanted < result.routes.length ? wanted : (alts[0]?.originalIndex ?? 0);
            renderer.setDirections(result);
            renderer.setRouteIndex(idx);
            setSelectedRouteIdx(idx);
            setRouteAlternatives(alts);
            showLegs(result, idx);
            setSearchError(null);
          } else {
            setSearchError("Route konnte nicht berechnet werden. Bitte erneut versuchen.");
          }
        },
      );
    },
    [gate, showLegs],
  );

  const applyDestination = useCallback(
    (dest: Dest) => {
      setDestination(dest);
      destinationRef.current = dest;
      preferredRouteIdx.current = 0;
      setDestinationQuery(dest.label);
      setSearchError(null);
      lastDirectionsResult.current = null;
      setRouteInfo(null);
      setRouteAlternatives([]);
      setArrivalTime(null);
      computeRoute(dest);
    },
    [computeRoute],
  );
  const applyDestinationRef = useRef(applyDestination);
  applyDestinationRef.current = applyDestination;

  // Google Maps init – mit Abbruch bei Unmount und Aufräumen aller Objekte.
  useEffect(() => {
    if (!mapRef.current) return;
    let cancelled = false;
    const listeners: google.maps.MapsEventListener[] = [];
    setMapError(null);
    setMapReady(false);
    (async () => {
      try {
        setOptions({ key: GOOGLE_MAPS_API_KEY, v: "weekly" });
        await Promise.all([importLibrary("maps"), importLibrary("places"), importLibrary("routes"), importLibrary("marker")]);
        if (cancelled || !mapRef.current) return;
        const map = new google.maps.Map(mapRef.current, {
          center: { lat: 48.8, lng: 9.01 },
          zoom: 13,
          disableDefaultUI: true,
          gestureHandling: "greedy",
          styles: MONOCHROME_STYLE,
          clickableIcons: false,
        });
        directionsServiceRef.current = new google.maps.DirectionsService();
        geocoderRef.current = new google.maps.Geocoder();
        directionsRendererRef.current = new google.maps.DirectionsRenderer({
          map,
          suppressMarkers: false,
          polylineOptions: { strokeColor: "#000", strokeWeight: 5, strokeOpacity: 0.8 },
        });
        if (inputRef.current) {
          autocompleteRef.current = new google.maps.places.Autocomplete(inputRef.current, {
            fields: ["geometry", "formatted_address", "name"],
            componentRestrictions: { country: ["de", "at", "ch"] },
          });
          listeners.push(
            autocompleteRef.current.addListener("place_changed", () => {
              const place = autocompleteRef.current?.getPlace();
              if (!place?.geometry?.location) {
                setSearchError("Ort konnte nicht gefunden werden.");
                return;
              }
              applyDestinationRef.current({
                lat: place.geometry.location.lat(),
                lng: place.geometry.location.lng(),
                label: place.formatted_address || place.name || "",
              });
            }),
          );
        }
        mapInstance.current = map;
        setMapReady(true);
        // Nur bestätigter Abholort als neutraler Ausgangsort (keine Standortbehauptung, kein Ersatzort).
        pickupRef.current = null;
        setPickupGeoFailed(false);
        if (confirmedPickup) geocoderRef.current.geocode({ address: confirmedPickup }, (res, status) => {
          if (cancelled) return;
          if (status !== "OK" || !res?.[0]) {
            setPickupGeoFailed(true);
            return;
          }
          pickupRef.current = { lat: res[0].geometry.location.lat(), lng: res[0].geometry.location.lng() };
          if (!positionRef.current && !destinationRef.current) map.panTo(pickupRef.current);
          if (destinationRef.current && !lastDirectionsResult.current) computeRoute(destinationRef.current);
        });
        if (destinationRef.current) computeRoute(destinationRef.current);
      } catch (err) {
        if (cancelled) return;
        console.error("Google Maps load error:", err);
        setMapError("Karte konnte nicht geladen werden. Die Rückgabe funktioniert trotzdem.");
      }
    })();
    return () => {
      cancelled = true;
      gate.invalidate();
      listeners.forEach((l) => l.remove());
      directionsRendererRef.current?.setMap(null);
      markerRef.current?.setMap(null);
      directionsRendererRef.current = null;
      directionsServiceRef.current = null;
      markerRef.current = null;
      autocompleteRef.current = null;
      geocoderRef.current = null;
      mapInstance.current = null;
      lastDirectionsResult.current = null;
    };
  }, [mapAttempt, confirmedPickup, computeRoute, gate]);

  // Karte nach Reconnect erneut laden, falls sie fehlgeschlagen war.
  useEffect(() => {
    if (!mapError) return;
    const retry = () => setMapAttempt((n) => n + 1);
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [mapError]);

  // Echter Standort-Marker nur bei echter Position
  useEffect(() => {
    positionRef.current = position;
    const map = mapInstance.current;
    if (!position || !map) return;
    if (!markerRef.current) {
      markerRef.current = new google.maps.Marker({
        position,
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
    } else markerRef.current.setPosition(position);
    if (!destinationRef.current) map.panTo(position);
    if (destinationRef.current && (!lastDirectionsResult.current || routeFromPickup)) computeRoute(destinationRef.current);
  }, [position, mapReady, computeRoute, routeFromPickup]);

  const recenter = () => {
    if (position && mapInstance.current) {
      mapInstance.current.panTo(position);
      mapInstance.current.setZoom(16);
    }
  };

  const selectRoute = (originalIndex: number) => {
    if (!directionsRendererRef.current || !lastDirectionsResult.current) return;
    preferredRouteIdx.current = originalIndex;
    setSelectedRouteIdx(originalIndex);
    directionsRendererRef.current.setRouteIndex(originalIndex);
    showLegs(lastDirectionsResult.current, originalIndex);
  };

  const startNavigation = () => {
    setNavMode(true);
    setSheetExpanded(false);
    if (mapInstance.current && position) {
      mapInstance.current.panTo(position);
      mapInstance.current.setZoom(16);
    }
  };

  const stopNavigation = () => {
    setNavMode(false);
    setSheetExpanded(true);
  };

  const clearDestination = () => {
    gate.invalidate();
    searchSeq.current++;
    setDestination(null);
    destinationRef.current = null;
    preferredRouteIdx.current = 0;
    setSelectedRouteIdx(0);
    setDestinationQuery("");
    setRouteInfo(null);
    setSearchError(null);
    setRouteAlternatives([]);
    setArrivalTime(null);
    setNavMode(false);
    lastDirectionsResult.current = null;
    directionsRendererRef.current?.set("directions", null);
  };

  const enablePush = async () => {
    setPushState("busy");
    const r = await enablePushOnThisDevice().catch(() => ({ ok: false as const, reason: "" }));
    setPushState(r.ok ? "on" : (await getPushStatus()) === "denied" ? "denied" : "off");
  };

  const reminderBanner =
    timeState !== "running" ? (
      <div
        role="status"
        className="mt-3 pointer-events-auto rounded-2xl bg-foreground text-background px-4 py-3 shadow-lg"
        data-testid="return-reminder"
      >
        <p className="text-sm font-semibold">
          {timeState === "reminder"
            ? `Noch ${Math.max(1, Math.ceil(remaining / 60000))} Min. bis zur Rückgabe (${formatBerlin(endAtMs)} Uhr)`
            : `Rückgabezeit überschritten (${formatBerlin(endAtMs)} Uhr)`}
        </p>
        <p className="text-xs opacity-80">Sobald du sicher geparkt hast, starte die Rückgabe. Bitte nicht während der Fahrt bedienen.</p>
      </div>
    ) : null;

  return (
    <div className="fixed inset-0 bg-background overflow-hidden">
      <div ref={mapRef} className="absolute inset-0 z-0" aria-label="Karte" />

      {mapError && (
        <div className="absolute inset-0 z-[1] flex items-center justify-center p-6">
          <div className="rounded-2xl bg-background p-4 text-center shadow-lg max-w-xs">
            <p className="text-sm text-foreground mb-3">{mapError}</p>
            <button
              onClick={() => setMapAttempt((n) => n + 1)}
              className="min-h-11 rounded-full bg-foreground px-5 text-sm font-semibold text-background inline-flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" /> Karte neu laden
            </button>
          </div>
        </div>
      )}

      {gpsChoice === null && (
        <div className="absolute inset-0 z-40 bg-foreground/60 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-background rounded-3xl p-6 max-w-sm w-full text-center shadow-2xl">
            <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mx-auto mb-4">
              <Navigation className="w-8 h-8 text-foreground" />
            </div>
            <h2 className="text-xl font-bold mb-2">Standort verwenden?</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Freiwillig: Mit deinem Standort zeigen wir dich auf der Karte und berechnen Routen ab deiner Position, solange diese Seite geöffnet ist.
              Ohne Standort starten Routen am bestätigten Abholort des Fahrzeugs, sofern hinterlegt.
            </p>
            <div className="space-y-2">
              <button onClick={() => setGpsChoice("granted")} className="w-full min-h-12 rounded-full bg-accent py-3 text-accent-foreground font-semibold">
                Ja, Standort erlauben
              </button>
              <button
                onClick={() => setGpsChoice("declined")}
                className="w-full min-h-12 rounded-full bg-secondary py-3 text-foreground font-medium text-sm"
              >
                Nicht jetzt
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top-Leiste mit Logo → Startseite */}
      <div className="absolute top-0 left-0 right-0 z-20 p-4 pointer-events-none" style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}>
        <div className="flex items-center justify-between gap-3">
          <BrandHomeLink className="pointer-events-auto rounded-full bg-background/95 px-3 shadow-lg" />
          <div className="pointer-events-auto inline-flex min-h-11 items-center gap-2 bg-foreground text-background rounded-full px-4 shadow-lg">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-background opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-background" />
            </span>
            <span className="text-sm font-semibold font-mono tabular-nums">{formatDuration(elapsed)}</span>
          </div>
        </div>

        {reminderBanner}

        {gpsError && (
          <div className="mt-3 pointer-events-auto bg-background/95 backdrop-blur rounded-2xl px-4 py-3 shadow-lg flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-foreground">{gpsError}</p>
          </div>
        )}
      </div>

      {position && (
        <button
          onClick={recenter}
          className="absolute right-4 z-20 bg-background rounded-full p-3 shadow-lg hover:scale-105 transition-all"
          style={{ bottom: sheetExpanded ? "calc(60vh + 16px)" : "200px" }}
          aria-label="Auf meine Position zentrieren"
        >
          <Locate className="w-5 h-5 text-foreground" />
        </button>
      )}

      {/* Bottom-Sheet */}
      <div
        className="absolute left-0 right-0 bottom-0 z-10 bg-background rounded-t-3xl shadow-2xl transition-all duration-300 ease-out"
        style={{ maxHeight: sheetExpanded ? "60vh" : navMode ? "210px" : "170px", paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <button
          onClick={() => setSheetExpanded((v) => !v)}
          className="w-full pt-3 pb-2 flex flex-col items-center gap-1 cursor-pointer"
          aria-label={sheetExpanded ? "Einklappen" : "Ausklappen"}
        >
          <div className="w-10 h-1 rounded-full bg-border" />
          {sheetExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
        </button>

        <div className="px-5 pb-6 overflow-y-auto" style={{ maxHeight: "calc(60vh - 50px)" }}>
          {navMode && !sheetExpanded && destination && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div className="p-2.5 rounded-2xl bg-secondary text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Ankunft</p>
                  <p className="text-sm font-bold tabular-nums">
                    {arrivalTime ? arrivalTime.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" }) : "--:--"}
                  </p>
                </div>
                <div className="p-2.5 rounded-2xl bg-secondary text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Dauer</p>
                  <p className="text-sm font-bold">{routeInfo?.duration || "-"}</p>
                </div>
                <div className="p-2.5 rounded-2xl bg-secondary text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Distanz</p>
                  <p className="text-sm font-bold">{routeInfo?.distance || "-"}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={stopNavigation} className="flex-1 min-h-12 rounded-full bg-secondary py-3 text-foreground font-medium text-sm">
                  Navigation beenden
                </button>
                <button onClick={onReturn} className="flex-1 min-h-12 rounded-full bg-accent py-3 text-accent-foreground font-semibold text-sm">
                  Rückgabe starten
                </button>
              </div>
            </div>
          )}

          {!(navMode && !sheetExpanded && destination) && (
            <>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-xs text-muted-foreground">{planLabel}</p>
                  <h2 className="text-lg font-bold text-foreground">{vehicleName}</h2>
                  <p className="text-xs text-muted-foreground font-mono">{vehiclePlate}</p>
                </div>
              </div>

              {sheetExpanded && (
                <>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="p-3 rounded-2xl bg-secondary">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Mietdauer bisher</span>
                      </div>
                      <p className="text-lg font-mono font-bold tabular-nums">{formatDuration(elapsed)}</p>
                    </div>
                    <div className="p-3 rounded-2xl bg-secondary">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Gauge className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Start-KM</span>
                      </div>
                      <p className="text-lg font-bold" data-testid="start-km">{typeof startKm === "number" ? startKm.toLocaleString("de-DE") : "unbekannt – wird geprüft"}</p>
                    </div>
                    <div className="p-3 rounded-2xl bg-secondary">
                      <div className="flex items-center gap-1.5 mb-1">
                        <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Mietbeginn</span>
                      </div>
                      <p className="text-sm font-semibold">{formatBerlin(startAtMs)} Uhr</p>
                    </div>
                    <div className="p-3 rounded-2xl bg-foreground text-background">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Clock className="w-3.5 h-3.5 opacity-70" />
                        <span className="text-xs opacity-70">Rückgabe bis</span>
                      </div>
                      <p className="text-sm font-semibold" data-testid="return-deadline">{formatBerlin(endAtMs)} Uhr</p>
                      <p className="text-[11px] opacity-70">
                        {planDurationHours} h · {remaining > 0 ? `noch ${formatDuration(remaining)}` : "überschritten"}
                      </p>
                    </div>
                  </div>

                  <div className="mb-4">
                    <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                      <Navigation className="w-3.5 h-3.5" /> Navigation
                    </p>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const q = destinationQuery.trim();
                        if (!q) return;
                        if (!geocoderRef.current) {
                          setSearchError("Karte ist noch nicht bereit. Bitte gleich erneut versuchen.");
                          return;
                        }
                        const mySearch = ++searchSeq.current;
                        geocoderRef.current.geocode({ address: q }, (results, status) => {
                          if (mySearch !== searchSeq.current || !mapInstance.current) return;
                          if (status === "OK" && results && results[0]) {
                            const r = results[0];
                            applyDestination({ lat: r.geometry.location.lat(), lng: r.geometry.location.lng(), label: r.formatted_address });
                          } else setSearchError("Adresse nicht gefunden.");
                        });
                      }}
                      className="flex gap-2"
                    >
                      <div className="relative flex-1">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                        <input
                          ref={inputRef}
                          type="text"
                          value={destinationQuery}
                          onChange={(e) => setDestinationQuery(e.target.value)}
                          placeholder="Zieladresse eingeben..."
                          className="w-full min-h-11 rounded-full bg-secondary pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-foreground"
                        />
                      </div>
                      <button type="submit" className="min-h-11 rounded-full bg-foreground text-background px-4 text-sm font-semibold">
                        Suchen
                      </button>
                    </form>
                    {searchError && (
                      <div className="mt-2 flex items-center gap-2">
                        <p className="text-xs text-muted-foreground flex-1">{searchError}</p>
                        {destination && (
                          <button onClick={() => computeRoute(destination)} className="min-h-11 text-xs font-semibold underline">
                            Erneut versuchen
                          </button>
                        )}
                      </div>
                    )}
                    {!position && (pickupStatus !== "ok" || pickupGeoFailed) && (
                      <p className="mt-2 text-xs text-muted-foreground" data-testid="pickup-hint">
                        {pickupStatus === "loading"
                          ? "Abholort wird geladen …"
                          : pickupStatus === "error" || pickupGeoFailed
                            ? "Abholort konnte gerade nicht geladen werden. Routen starten erst mit deinem Standort; die Rückgabe funktioniert trotzdem."
                            : "Für dieses Fahrzeug ist kein Abholort hinterlegt. Routen starten erst mit deinem Standort; die Rückgabe funktioniert trotzdem."}
                      </p>
                    )}
                    {gpsChoice === "declined" && (
                      <button onClick={() => setGpsChoice("granted")} className="mt-2 min-h-11 text-xs font-medium underline">
                        Standort jetzt verwenden
                      </button>
                    )}
                    {destination && (
                      <div className="mt-2 p-3 rounded-2xl bg-secondary">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-muted-foreground">Ziel</p>
                            <p className="text-sm font-medium break-words">{destination.label}</p>
                            {routeFromPickup && routeInfo && (
                              <p className="text-[11px] text-muted-foreground">Route ab Abholort – nicht ab deinem Standort.</p>
                            )}
                          </div>
                          <button
                            onClick={clearDestination}
                            aria-label="Ziel entfernen"
                            className="w-11 h-11 rounded-full bg-background flex items-center justify-center flex-shrink-0"
                          >
                            <X className="w-4 h-4" />
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
                        {routeAlternatives.length > 1 && (
                          <div className="mt-2 space-y-1.5">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Routen</p>
                            {routeAlternatives.map((alt, rank) => (
                              <button
                                key={alt.originalIndex}
                                onClick={() => selectRoute(alt.originalIndex)}
                                className={`w-full min-h-11 flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-left transition-all ${
                                  selectedRouteIdx === alt.originalIndex ? "bg-foreground text-background" : "bg-background text-foreground"
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <RouteIcon className="w-3.5 h-3.5" />
                                  <span className="text-xs font-medium">{rank === 0 ? "Schnellste" : `Alternative ${rank}`}</span>
                                </div>
                                <span className="text-xs font-bold tabular-nums">
                                  {alt.duration} · {alt.distance}
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                        <button
                          onClick={startNavigation}
                          disabled={!routeInfo}
                          className="mt-3 w-full min-h-12 rounded-full bg-foreground text-background py-3 font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                          <Flag className="w-4 h-4" />
                          {routeInfo ? "Route starten" : "Route wird berechnet…"}
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="mb-4 rounded-2xl border border-border p-3">
                    <button
                      onClick={() => setShowChecklist((v) => !v)}
                      aria-expanded={showChecklist}
                      className="w-full min-h-11 flex items-center justify-between text-sm font-medium"
                    >
                      <span className="flex items-center gap-2">
                        <ListChecks className="w-4 h-4" /> Rückgabe-Checkliste
                      </span>
                      {showChecklist ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                    {showChecklist && (
                      <ul className="mt-2 space-y-1 text-xs text-muted-foreground" data-testid="return-checklist">
                        {CHECKLIST.map((c) => (
                          <li key={c}>• {c}</li>
                        ))}
                        {(addons ?? []).map((a) => (
                          <li key={a.id}>• Zubehör: {a.label}</li>
                        ))}
                        <li className="pt-1">Sobald du sicher geparkt hast, starte die Rückgabe.</li>
                      </ul>
                    )}
                  </div>

                  {pushState !== "unknown" && pushState !== "unsupported" && (
                    <div className="mb-4 rounded-2xl bg-secondary p-3 text-xs text-muted-foreground">
                      {pushState === "on" ? (
                        <p className="flex items-center gap-2">
                          <Bell className="w-4 h-4" /> Erinnerung aufs Gerät ist aktiv.
                        </p>
                      ) : pushState === "denied" ? (
                        <p>Benachrichtigungen sind blockiert. Du kannst sie in den Browser-Einstellungen erlauben. Die Erinnerung auf dieser Seite bleibt.</p>
                      ) : pushState === "iframe" ? (
                        <p>Für Erinnerungen aufs Gerät öffne die App in einem eigenen Tab.</p>
                      ) : (
                        <button onClick={enablePush} disabled={pushState === "busy"} className="min-h-11 inline-flex items-center gap-2 font-medium text-foreground underline">
                          <Bell className="w-4 h-4" /> Rückgabe-Erinnerung aufs Gerät erhalten (freiwillig)
                        </button>
                      )}
                    </div>
                  )}

                  <div className="p-3 rounded-xl bg-secondary mb-4 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">Nicht rauchen · Vollgetankt zurückgeben · Rückgabe pünktlich</p>
                  </div>
                </>
              )}

              {!confirmEnd ? (
                <button
                  onClick={() => setConfirmEnd(true)}
                  className="w-full min-h-12 rounded-full bg-accent py-4 text-accent-foreground font-semibold text-base shadow-lg"
                >
                  Rückgabe starten
                </button>
              ) : (
                <div className="space-y-2">
                  <p className="text-center text-sm text-muted-foreground">Hast du sicher geparkt? Dann starte jetzt die Rückgabe.</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => setConfirmEnd(false)} className="min-h-12 rounded-full bg-secondary py-3 text-foreground font-medium text-sm">
                      Abbrechen
                    </button>
                    <button onClick={onReturn} className="min-h-12 rounded-full bg-accent py-3 text-accent-foreground font-semibold text-sm">
                      Ja, Rückgabe starten
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
