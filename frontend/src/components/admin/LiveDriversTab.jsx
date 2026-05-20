import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Loader2 } from "lucide-react";

/**
 * Admin Live Map — polls /admin/drivers/live every 5s and renders each driver
 * on an interactive Google Map (pan/zoom). Clicking a driver row pans+zooms
 * the map to that driver and highlights the row.
 */

const DARK_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#0a0a0a" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#b3a472" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#050505" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#d4af37" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#222222" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#8a8a8a" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#8a6f24" }] },
  { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#d4af37" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#050a14" }] },
];

const CAR_SVG_URL = "data:image/svg+xml;utf8," + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="42" height="42" viewBox="0 0 42 42">
    <g transform="translate(21 21)">
      <circle r="18" fill="rgba(212,175,55,0.15)" />
      <circle r="14" fill="#D4AF37" stroke="#000" stroke-width="1" />
      <g transform="rotate(-90)">
        <rect x="-7" y="-10" width="14" height="20" rx="3" fill="#0a0a0a" stroke="#D4AF37" stroke-width="1" />
        <rect x="-5" y="-7" width="10" height="5" rx="1" fill="#1a1a1a" />
        <rect x="-5" y="2" width="10" height="5" rx="1" fill="#1a1a1a" />
      </g>
    </g>
  </svg>`
);

function loadGoogleMaps(apiKey) {
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  if (window.__gmaps_loading__) return window.__gmaps_loading__;
  window.__gmaps_loading__ = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}`;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve(window.google.maps);
    s.onerror = () => reject(new Error("Google Maps failed to load"));
    document.head.appendChild(s);
  });
  return window.__gmaps_loading__;
}

export default function LiveDriversTab() {
  const apiKey = process.env.REACT_APP_GOOGLE_MAPS_BROWSER_KEY || "";
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [focusId, setFocusId] = useState(null);
  const mapElRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef({});

  // Poll drivers
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const { data } = await api.get("/admin/drivers/live");
        if (alive) { setDrivers(data || []); setErr(null); }
      } catch (e) {
        if (alive) setErr(e?.response?.data?.detail || "Could not load");
      } finally {
        if (alive) setLoading(false);
      }
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  // Initialize map once
  useEffect(() => {
    if (!mapElRef.current || mapRef.current) return;
    let cancelled = false;
    loadGoogleMaps(apiKey).then((maps) => {
      if (cancelled || !mapElRef.current) return;
      mapRef.current = new maps.Map(mapElRef.current, {
        center: { lat: 37.7749, lng: -122.4194 },
        zoom: 10,
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: "greedy",
        styles: DARK_STYLE,
        backgroundColor: "#050505",
      });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [apiKey]);

  // Sync markers when drivers change
  useEffect(() => {
    const map = mapRef.current;
    const maps = window.google?.maps;
    if (!map || !maps) return;

    const visible = drivers.filter(d => d.latitude != null && d.longitude != null);
    const seen = {};

    visible.forEach((d) => {
      seen[d.driver_id] = true;
      const pos = new maps.LatLng(d.latitude, d.longitude);
      const existing = markersRef.current[d.driver_id];
      if (existing) {
        existing.setPosition(pos);
        existing.setOpacity(d.is_online ? 1 : 0.5);
      } else {
        const marker = new maps.Marker({
          position: pos,
          map,
          title: d.name,
          opacity: d.is_online ? 1 : 0.5,
          icon: {
            url: CAR_SVG_URL,
            scaledSize: new maps.Size(42, 42),
            anchor: new maps.Point(21, 21),
          },
          zIndex: d.is_online ? 999 : 500,
        });
        marker.addListener("click", () => setFocusId(d.driver_id));
        markersRef.current[d.driver_id] = marker;
      }
    });

    // Remove stale
    Object.keys(markersRef.current).forEach((id) => {
      if (!seen[id]) { markersRef.current[id].setMap(null); delete markersRef.current[id]; }
    });

    // Auto-fit bounds when no focus and we have markers
    if (!focusId && visible.length > 0) {
      const bounds = new maps.LatLngBounds();
      visible.forEach(d => bounds.extend(new maps.LatLng(d.latitude, d.longitude)));
      if (visible.length === 1) {
        map.setCenter(bounds.getCenter());
        map.setZoom(13);
      } else {
        map.fitBounds(bounds, 80);
      }
    }
  }, [drivers, focusId]);

  // When focusId changes, pan/zoom to that driver
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusId) return;
    const marker = markersRef.current[focusId];
    if (marker) {
      map.panTo(marker.getPosition());
      map.setZoom(15);
    }
  }, [focusId]);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-[#D4AF37]" /></div>;
  }

  const onlineCount = drivers.filter(d => d.is_online).length;

  return (
    <div className="space-y-4" data-testid="live-drivers-tab">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Live Driver Map</h2>
          <p className="text-sm text-white/55">
            Auto-refreshes every 5 seconds · {onlineCount} online · {drivers.length} total
            {focusId && <button onClick={() => setFocusId(null)} className="ml-3 text-[#D4AF37] underline">Reset view</button>}
          </p>
        </div>
        <span className="px-3 py-1 rounded-full bg-[#D4AF37]/10 border border-[#D4AF37]/30 text-[#D4AF37] text-[10px] uppercase tracking-wider">Live</span>
      </div>

      {err && <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-red-400 text-sm">{err}</div>}

      <div ref={mapElRef} data-testid="admin-live-map" className="w-full rounded-xl overflow-hidden border border-white/10" style={{ height: 520, background: "#050505" }} />

      <div className="rounded-xl border border-white/8 bg-[#0C0C0C] overflow-hidden">
        <table className="w-full">
          <thead className="bg-white/5">
            <tr className="text-left text-[10px] uppercase tracking-wider text-white/50">
              <th className="px-4 py-2">#</th>
              <th className="px-4 py-2">Driver</th>
              <th className="px-4 py-2">Vehicle</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Last fix</th>
              <th className="px-4 py-2">Coordinates</th>
            </tr>
          </thead>
          <tbody>
            {drivers.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-white/45 text-sm">No drivers have shared their location yet. They'll appear here as soon as they start a trip in the mobile app.</td></tr>
            )}
            {drivers.map((d, i) => {
              const isFocused = focusId === d.driver_id;
              return (
                <tr
                  key={d.driver_id}
                  data-testid={`driver-row-${d.driver_id}`}
                  onClick={() => setFocusId(isFocused ? null : d.driver_id)}
                  className={`border-t border-white/5 cursor-pointer transition-colors ${isFocused ? "bg-[#D4AF37]/8" : "hover:bg-white/3"}`}
                >
                  <td className="px-4 py-3 text-white/40 text-xs">{i + 1}</td>
                  <td className={`px-4 py-3 text-sm ${isFocused ? "text-[#D4AF37] font-semibold" : "text-white"}`}>{d.name}</td>
                  <td className="px-4 py-3 text-white/65 text-sm">{d.vehicle} {d.plate ? `· ${d.plate}` : ""}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] uppercase tracking-wider font-medium px-2 py-1 rounded-full border ${d.is_online ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" : "bg-white/5 text-white/55 border-white/15"}`}>
                      {d.is_online ? "Online" : "Idle"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-white/55 text-xs">{d.stale_seconds < 60 ? `${d.stale_seconds}s ago` : `${Math.round(d.stale_seconds / 60)} min ago`}</td>
                  <td className="px-4 py-3 text-white/45 text-[11px] font-mono">{d.latitude?.toFixed(4)}, {d.longitude?.toFixed(4)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
