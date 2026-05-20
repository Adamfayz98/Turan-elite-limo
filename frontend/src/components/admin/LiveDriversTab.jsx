import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Loader2, MapPin, Navigation } from "lucide-react";

/**
 * Admin Live Map — polls /admin/drivers/live every 5s and overlays each driver's
 * latest GPS position on a single Google Static Map image of the Bay Area.
 */
export default function LiveDriversTab() {
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

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

  // Build Static Map URL with up to 30 markers
  const KEY = process.env.REACT_APP_GOOGLE_MAPS_BROWSER_KEY || "";
  const center = drivers.find(d => d.is_online) || drivers[0];
  const centerStr = center ? `${center.latitude},${center.longitude}` : "37.7749,-122.4194";
  const markers = drivers
    .filter(d => d.latitude != null)
    .slice(0, 30)
    .map((d, i) => `markers=color:${d.is_online ? "0xD4AF37" : "0x666666"}%7Clabel:${(i + 1).toString().slice(-1)}%7C${d.latitude},${d.longitude}`)
    .join("&");
  const dark = "&style=feature:all|element:labels.text.fill|color:0xb3a472&style=feature:all|element:geometry.fill|color:0x0a0a0a&style=feature:road|element:geometry|color:0x222222&style=feature:road.highway|element:geometry|color:0x8a6f24&style=feature:water|element:geometry|color:0x050a14";
  const mapUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${centerStr}&zoom=10&size=1280x520&scale=2&maptype=roadmap${dark}&${markers}${KEY ? `&key=${KEY}` : ""}`;

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-[#D4AF37]" /></div>;
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Live Driver Map</h2>
          <p className="text-sm text-white/55">Auto-refreshes every 5 seconds · {drivers.filter(d => d.is_online).length} online · {drivers.length} total</p>
        </div>
        <span className="px-3 py-1 rounded-full bg-[#D4AF37]/10 border border-[#D4AF37]/30 text-[#D4AF37] text-[10px] uppercase tracking-wider">Live</span>
      </div>

      {err && <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-red-400 text-sm">{err}</div>}

      <div className="relative rounded-xl overflow-hidden border border-white/10 bg-[#0a0a0a]">
        <img src={mapUrl} alt="Live driver map" className="w-full block" style={{ aspectRatio: "1280/520", objectFit: "cover" }} />
      </div>

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
            {drivers.map((d, i) => (
              <tr key={d.driver_id} className="border-t border-white/5">
                <td className="px-4 py-3 text-white/40 text-xs">{i + 1}</td>
                <td className="px-4 py-3 text-white text-sm">{d.name}</td>
                <td className="px-4 py-3 text-white/65 text-sm">{d.vehicle} {d.plate ? `· ${d.plate}` : ""}</td>
                <td className="px-4 py-3">
                  <span className={`text-[10px] uppercase tracking-wider font-medium px-2 py-1 rounded-full border ${d.is_online ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" : "bg-white/5 text-white/55 border-white/15"}`}>
                    {d.is_online ? "Online" : "Idle"}
                  </span>
                </td>
                <td className="px-4 py-3 text-white/55 text-xs">{d.stale_seconds < 60 ? `${d.stale_seconds}s ago` : `${Math.round(d.stale_seconds / 60)} min ago`}</td>
                <td className="px-4 py-3 text-white/45 text-[11px] font-mono">{d.latitude?.toFixed(4)}, {d.longitude?.toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
