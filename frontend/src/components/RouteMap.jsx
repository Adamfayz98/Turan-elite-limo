import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin, Route as RouteIcon, Clock } from "lucide-react";

// Reuse the same dynamic-load pattern as LiveDriversTab so we don't pull
// the Maps SDK in on initial page load — it only loads once both pickup
// and dropoff are filled, which is when the map first becomes useful.
function loadGoogleMaps(apiKey) {
  if (typeof window === "undefined") return Promise.reject(new Error("SSR"));
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  const existing = document.getElementById("google-maps-loader");
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve(window.google.maps));
      existing.addEventListener("error", reject);
    });
  }
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.id = "google-maps-loader";
    s.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve(window.google.maps);
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

const TURAN_DARK_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#0E0E0E" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0E0E0E" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#9AA0A6" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#D4AF37" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#222222" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#3A3A3A" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#888888" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0a0a0a" }] },
  { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "transit", elementType: "labels", stylers: [{ visibility: "off" }] },
];

/**
 * Live route preview shown on the booking form once pickup + dropoff are set.
 *
 * Renders a Google Map with a DirectionsRenderer polyline + markers, plus a
 * compact "distance · duration" bar above the map. Re-renders whenever any
 * address changes (debounced internally by the parent's autocomplete debounce).
 *
 * Address-string input only — we don't need lat/lng because Directions API
 * geocodes internally. Keeps the prop surface trivial.
 */
export default function RouteMap({ pickup, dropoff, stops = [] }) {
  const mapDivRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const rendererRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState(null); // { distance, duration }

  const apiKey =
    process.env.REACT_APP_GOOGLE_MAPS_BROWSER_KEY ||
    process.env.REACT_APP_GOOGLE_MAPS_API_KEY ||
    "";

  // Boot the Map exactly once when both addresses are present
  useEffect(() => {
    if (!pickup || !dropoff || !mapDivRef.current || mapInstanceRef.current) return;
    if (!apiKey) {
      setError("Google Maps key not configured");
      return;
    }
    let cancelled = false;
    loadGoogleMaps(apiKey)
      .then((maps) => {
        if (cancelled || !mapDivRef.current) return;
        const map = new maps.Map(mapDivRef.current, {
          center: { lat: 37.7749, lng: -122.4194 }, // SF default; route fit overrides
          zoom: 10,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "cooperative",
          styles: TURAN_DARK_STYLE,
        });
        mapInstanceRef.current = map;
        rendererRef.current = new maps.DirectionsRenderer({
          map,
          suppressMarkers: false,
          polylineOptions: {
            strokeColor: "#D4AF37",
            strokeWeight: 4,
            strokeOpacity: 0.9,
          },
        });
      })
      .catch((e) => {
        if (!cancelled) setError(`Map failed to load: ${e?.message || e}`);
      });
    return () => {
      cancelled = true;
    };
  }, [apiKey, pickup, dropoff]);

  // Recompute the route any time addresses change. We re-call Directions
  // even if Maps is still booting — the second effect picks it up once
  // the renderer is ready (via the dependency list).
  useEffect(() => {
    if (!pickup || !dropoff) {
      setSummary(null);
      return;
    }
    if (!window.google?.maps || !rendererRef.current) return;
    setLoading(true);
    setError("");
    const svc = new window.google.maps.DirectionsService();
    const waypoints = (stops || [])
      .filter((s) => s && s.trim())
      .map((s) => ({ location: s, stopover: true }));
    svc.route(
      {
        origin: pickup,
        destination: dropoff,
        waypoints,
        travelMode: window.google.maps.TravelMode.DRIVING,
      },
      (res, status) => {
        setLoading(false);
        if (status !== "OK" || !res) {
          setError(
            status === "ZERO_RESULTS"
              ? "No route found between these locations."
              : `Couldn't draw route (${status}).`,
          );
          setSummary(null);
          return;
        }
        rendererRef.current.setDirections(res);
        // Sum up legs so we report the WHOLE trip including stops, not just
        // the first leg. Google returns distance/duration as { text, value }
        // per leg; we collapse to a single text+value pair.
        const legs = res.routes?.[0]?.legs || [];
        const totalMeters = legs.reduce((a, l) => a + (l.distance?.value || 0), 0);
        const totalSeconds = legs.reduce((a, l) => a + (l.duration?.value || 0), 0);
        setSummary({
          distanceText: `${(totalMeters / 1609.344).toFixed(1)} mi`,
          durationText: humanDuration(totalSeconds),
        });
      },
    );
  }, [pickup, dropoff, stops]);

  // Skeleton state — show nothing until BOTH addresses are filled so the
  // form doesn't show an empty map slot when only pickup is set.
  if (!pickup || !dropoff) {
    return (
      <div
        data-testid="route-map-hint"
        className="rounded-xl border border-dashed border-[#27272A] bg-[#0A0A0A] p-6 text-center"
      >
        <MapPin className="w-6 h-6 text-[#D4AF37]/60 mx-auto mb-2" />
        <div className="text-white/55 text-sm">
          Enter pickup and drop-off to see your route + estimated distance.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2" data-testid="route-map">
      <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
        <div className="flex items-center gap-3">
          {loading && (
            <span className="inline-flex items-center gap-1.5 text-[#D4AF37]">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Calculating…
            </span>
          )}
          {summary && !loading && (
            <>
              <span className="inline-flex items-center gap-1.5 text-white/80">
                <RouteIcon className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span className="tabular-nums" data-testid="route-distance">{summary.distanceText}</span>
              </span>
              <span className="inline-flex items-center gap-1.5 text-white/80">
                <Clock className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span className="tabular-nums" data-testid="route-duration">~{summary.durationText}</span>
              </span>
            </>
          )}
        </div>
        {error && (
          <span className="text-red-400 text-[11px]" data-testid="route-error">
            {error}
          </span>
        )}
      </div>
      <div
        ref={mapDivRef}
        data-testid="route-map-canvas"
        className="w-full h-[280px] md:h-[320px] rounded-xl border border-[#1F1F1F] overflow-hidden bg-[#0A0A0A]"
      />
    </div>
  );
}

function humanDuration(seconds) {
  if (!seconds) return "—";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} hr`;
  return `${hours} hr ${minutes} min`;
}
