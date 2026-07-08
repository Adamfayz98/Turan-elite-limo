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
  // Roads: kept dark but a shade lighter than the base so the gold polyline
  // still contrasts at low zoom levels (SF→LA, SF→Big Sur, etc.). Was #222/#3A3A3A
  // which made the whole map read as solid black when zoomed out to fit a 300-mile route.
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#2A2A2A" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#4A4A4A" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#3A3A3A" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#888888" }] },
  { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#141414" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#050B18" }] },
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
export default function RouteMap({ pickup, dropoff, stops = [], onRouteSummary }) {
  const mapDivRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const rendererRef = useRef(null);
  const requestSeqRef = useRef(0); // rolling request id to discard stale replies
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState(null); // { distance, duration }

  const apiKey =
    process.env.REACT_APP_GOOGLE_MAPS_BROWSER_KEY ||
    process.env.REACT_APP_GOOGLE_MAPS_API_KEY ||
    "";

  // Stops is a new array reference every render (default `stops = []`), which
  // caused the "recompute on every keystroke" bug that made long-distance
  // routes flash black — Google was returning stale results OUT OF ORDER
  // (the last-arrived response wiped the correctly-drawn polyline).
  // Serialising to a string gives us a stable dep signature.
  const stopsKey = (stops || []).filter(Boolean).join("|");

  // Extracted so the boot effect can trigger the first route directly, and
  // the address-change effect can trigger subsequent routes. Kept above both
  // effects to avoid any temporal-dead-zone risk when the boot effect's
  // async .then callback closes over it.
  const _computeRoute = (pu, doff, sp) => {
    if (!pu || !doff) {
      setSummary(null);
      return;
    }
    if (!window.google?.maps || !rendererRef.current) return;
    // Bump the request id so any earlier in-flight route callback discards
    // itself when it returns. Prevents a stale short-distance response from
    // overwriting a fresh long-distance one on the map.
    const mySeq = ++requestSeqRef.current;
    setLoading(true);
    setError("");
    const svc = new window.google.maps.DirectionsService();
    const waypoints = (sp || [])
      .filter((s) => s && s.trim())
      .map((s) => ({ location: s, stopover: true }));
    svc.route(
      {
        origin: pu,
        destination: doff,
        waypoints,
        travelMode: window.google.maps.TravelMode.DRIVING,
      },
      (res, status) => {
        // Discard if a newer request has been fired since (protects the map
        // from stale replies overwriting the current route).
        if (mySeq !== requestSeqRef.current) return;
        setLoading(false);
        if (status !== "OK" || !res) {
          setError(
            status === "ZERO_RESULTS"
              ? "No driving route found — try a nearby landmark or the venue name."
              : `Couldn't draw route (${status}). Try again in a moment.`,
          );
          setSummary(null);
          return;
        }
        rendererRef.current.setDirections(res);
        // Snap the viewport to the polyline bounds — for long-distance rides
        // this is what actually makes the route visible after the initial
        // zoom=10 center on SF.
        try {
          const bounds = res.routes?.[0]?.bounds;
          if (bounds && mapInstanceRef.current) {
            mapInstanceRef.current.fitBounds(bounds, 40);
          }
        } catch (e) {
          // fitBounds is best-effort; DirectionsRenderer's default fit still works
        }
        const legs = res.routes?.[0]?.legs || [];
        const totalMeters = legs.reduce((a, l) => a + (l.distance?.value || 0), 0);
        const totalSeconds = legs.reduce((a, l) => a + (l.duration?.value || 0), 0);
        const miles = totalMeters / 1609.344;
        setSummary({
          distanceText: `${miles.toFixed(1)} mi`,
          durationText: humanDuration(totalSeconds),
        });
        // Surface the computed distance so the parent form can render
        // context-aware banners (e.g. "long distance — consider round trip").
        if (typeof onRouteSummary === "function") {
          try {
            onRouteSummary({ miles, seconds: totalSeconds });
          } catch (e) {
            // never let the consumer crash the map
          }
        }
      },
    );
  };

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
            strokeWeight: 5,
            strokeOpacity: 0.95,
            // A thin black backdrop makes the gold polyline pop even when the
            // route zoom is low enough that the road becomes 1-2px wide.
            geodesic: true,
          },
        });
        // Kick off the initial route computation now that the renderer is
        // ready. Without this, the route-computation effect below can miss
        // the first render if both addresses were already filled at mount
        // (React batches; the effect saw no renderer + didn't re-run).
        _computeRoute(pickup, dropoff, stops);
      })
      .catch((e) => {
        if (!cancelled) setError(`Map failed to load: ${e?.message || e}`);
      });
    return () => {
      cancelled = true;
    };
  }, [apiKey, pickup, dropoff]);

  // Recompute the route any time addresses OR waypoints change. Uses
  // `stopsKey` (a serialised string) rather than the raw array so
  // reference-inequality doesn't fire this effect on every render.
  useEffect(() => {
    _computeRoute(pickup, dropoff, stops);
  }, [pickup, dropoff, stopsKey]);

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
