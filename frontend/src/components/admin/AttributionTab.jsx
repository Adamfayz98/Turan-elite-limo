import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, TrendingUp, AlertCircle, RefreshCw, Ban, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api, formatApiErrorDetail } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * Admin → Attribution
 *
 * Renders paid bookings + revenue grouped by first-touch UTM source bucket
 * (google_ads, yelp, facebook, direct, untracked, ...). Period selectable
 * (7 / 30 / 90 days). Powered by GET /api/admin/attribution/sources?days=N.
 *
 * The page surfaces an "attribution rate" — % of paid bookings that had any
 * UTM source attached. Low attribution rate = customers booking via direct
 * traffic / bookmarks, which is the bucket where Google Ads' broken
 * conversion tracking hides.
 */

const PERIOD_OPTIONS = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
];

// Pretty colors for the well-known source buckets — anything else gets a
// neutral border so the most-common channels are visually scannable.
const SOURCE_STYLE = {
  google_ads: { color: "#4285F4", label: "Google Ads" },
  google_organic: { color: "#34A853", label: "Google Organic" },
  yelp: { color: "#D32323", label: "Yelp" },
  facebook: { color: "#1877F2", label: "Facebook" },
  instagram: { color: "#E1306C", label: "Instagram" },
  bing_ads: { color: "#00809D", label: "Bing Ads" },
  bing_organic: { color: "#00809D", label: "Bing Organic" },
  tiktok: { color: "#FF0050", label: "TikTok" },
  duckduckgo: { color: "#DE5833", label: "DuckDuckGo" },
  social_organic: { color: "#9333EA", label: "Social (Organic)" },
  referrer: { color: "#888", label: "Referrer" },
  direct: { color: "#9CA3AF", label: "Direct / Bookmark" },
  untracked: { color: "#666", label: "Untracked (pre-UTM)" },
};

function styleFor(src) {
  return SOURCE_STYLE[src] || { color: "#888", label: src };
}

function fmtMoney(n) {
  if (!n && n !== 0) return "—";
  return `$${Math.round(n).toLocaleString()}`;
}

export default function AttributionTab() {
  const [days, setDays] = useState("30");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState([]);
  const [togglingSource, setTogglingSource] = useState(null);

  const loadBlocked = async () => {
    try {
      const { data: resp } = await api.get("/admin/attribution/blocked-sources");
      setBlocked(resp.blocked || []);
    } catch (err) {
      // non-fatal
    }
  };

  const toggleBlock = async (source, shouldBlock) => {
    setTogglingSource(source);
    try {
      const { data: resp } = await api.post("/admin/attribution/block-source", { source, blocked: shouldBlock });
      setBlocked(resp.blocked || []);
      toast.success(shouldBlock ? `Blocked new bookings from ${source}` : `Unblocked ${source}`);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Failed to update blocklist");
    } finally {
      setTogglingSource(null);
    }
  };

  const load = async (d = days) => {
    setLoading(true);
    try {
      const { data: resp } = await api.get(`/admin/attribution/sources?days=${d}`);
      setData(resp);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Failed to load attribution");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(days);
    loadBlocked();
  }, [days]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20 text-white/40" data-testid="attribution-loading">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading attribution data…
      </div>
    );
  }

  if (!data) return null;

  const t = data.totals || {};

  return (
    <div className="space-y-8" data-testid="attribution-tab">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[#D4AF37] text-[11px] tracking-[0.3em] uppercase mb-2">
            <TrendingUp className="w-3.5 h-3.5" /> Bookings by Ad Source
          </div>
          <h2 className="text-white text-2xl font-light">Where are paid bookings actually coming from?</h2>
          <p className="text-white/45 text-sm mt-2 max-w-2xl leading-relaxed">
            First-touch UTM attribution. Every booking is tagged with the source the customer arrived from
            (Google Ads <code className="text-[#D4AF37] text-[11px]">gclid</code>, Yelp{" "}
            <code className="text-[#D4AF37] text-[11px]">utm_source=yelp</code>, etc.) persisted for 90 days,
            then stamped on the booking on submit.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Select value={days} onValueChange={(v) => setDays(v)}>
            <SelectTrigger
              className="w-[180px] bg-[#0E0E0E] border-[#27272A] text-white h-10"
              data-testid="attribution-period"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            onClick={() => load(days)}
            disabled={loading}
            className="rounded-full border-white/15 hover:bg-white/5 w-10 h-10"
            data-testid="attribution-refresh"
          >
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Totals row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="attribution-totals">
        <Stat label="Paid bookings" value={t.bookings_paid ?? 0} accent />
        <Stat label="Total revenue" value={fmtMoney(t.revenue)} accent />
        <Stat label="Created (pre-payment)" value={t.bookings_created ?? 0} />
        <Stat
          label="Attribution rate"
          value={`${t.attribution_rate ?? 0}%`}
          subtle={
            (t.attribution_rate ?? 0) < 50
              ? "Low — most bookings have no source. UTM tracking is new; expect this to climb."
              : null
          }
        />
      </div>

      {/* Attribution gap callout */}
      {(t.attribution_rate ?? 0) < 70 && (
        <div
          className="flex gap-3 rounded-xl border border-[#D4AF37]/30 bg-[#D4AF37]/[0.04] p-4"
          data-testid="attribution-gap-callout"
        >
          <AlertCircle className="w-4 h-4 text-[#D4AF37] flex-shrink-0 mt-0.5" />
          <div className="text-sm text-white/75 leading-relaxed">
            <strong className="text-[#D4AF37]">Heads up:</strong> {100 - (t.attribution_rate ?? 0)}% of paid bookings
            have no UTM source. That&apos;s the bucket where Google Ads&apos; broken conversion tag hides — these customers
            likely clicked an ad weeks ago and booked direct later. As UTM tracking matures (90-day window), this
            number should climb. If it stays low, Google Ads isn&apos;t auto-tagging clicks with <code className="text-[#D4AF37] text-[11px]">gclid</code> — check Ads → Settings → Auto-tagging.
          </div>
        </div>
      )}

      {/* Blocklist banner (only when something is blocked) */}
      {blocked.length > 0 && (
        <div
          className="flex gap-3 rounded-xl border border-red-500/30 bg-red-500/[0.05] p-4"
          data-testid="attribution-blocklist-banner"
        >
          <Ban className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-white/80 leading-relaxed">
            <strong className="text-red-300">Active blocklist:</strong>{" "}
            New bookings are being rejected from{" "}
            <strong className="text-white">{blocked.map((b) => `"${b}"`).join(", ")}</strong>. Customers see a polite
            &quot;please call us directly&quot; message instead of the checkout form. Unblock from the table below.
          </div>
        </div>
      )}

      {/* Source table */}
      <div className="rounded-xl border border-[#1F1F1F] overflow-hidden bg-[#0A0A0A]">
        <table className="w-full text-sm" data-testid="attribution-source-table">
          <thead className="bg-[#0E0E0E] border-b border-[#1F1F1F]">
            <tr className="text-left text-[10px] uppercase tracking-[0.2em] text-white/50">
              <th className="px-5 py-3">Source</th>
              <th className="px-5 py-3 text-right">Paid</th>
              <th className="px-5 py-3 text-right">Created</th>
              <th className="px-5 py-3 text-right">Revenue</th>
              <th className="px-5 py-3 text-right">Avg. value</th>
              <th className="px-5 py-3">Top campaign</th>
              <th className="px-5 py-3 text-right">Block</th>
            </tr>
          </thead>
          <tbody>
            {(data.sources || []).length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-white/40">
                  No bookings in the selected period yet.
                </td>
              </tr>
            )}
            {(data.sources || []).map((s) => {
              const style = styleFor(s.source);
              const topCamp = s.top_campaigns?.[0];
              const isBlocked = blocked.includes(s.source);
              const isProtected = s.source === "untracked" || s.source === "direct";
              const isToggling = togglingSource === s.source;
              return (
                <tr
                  key={s.source}
                  data-testid={`attribution-row-${s.source}`}
                  className={cn(
                    "border-b border-[#1A1A1A] last:border-0 transition",
                    isBlocked ? "bg-red-500/[0.04]" : "hover:bg-white/[0.02]",
                  )}
                >
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ background: style.color }}
                      />
                      <span className="text-white">{style.label}</span>
                      {isBlocked && (
                        <span className="text-[10px] tracking-widest uppercase px-2 py-0.5 rounded-full border border-red-500/40 text-red-300 bg-red-500/10">
                          Blocked
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-white/35 mt-0.5 font-mono">{s.source}</p>
                  </td>
                  <td className="px-5 py-4 text-right text-[#D4AF37] font-medium">{s.bookings_paid}</td>
                  <td className="px-5 py-4 text-right text-white/60">{s.bookings_created}</td>
                  <td className="px-5 py-4 text-right text-[#D4AF37] font-medium">{fmtMoney(s.revenue)}</td>
                  <td className="px-5 py-4 text-right text-white/70">{fmtMoney(s.avg_booking_value)}</td>
                  <td className="px-5 py-4 text-white/55 text-xs">
                    {topCamp ? (
                      <>
                        <span className="text-white/75">{topCamp.campaign}</span>
                        <span className="text-white/40 ml-2">· {topCamp.count}</span>
                      </>
                    ) : (
                      <span className="text-white/30">—</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-right">
                    {isProtected ? (
                      <span
                        className="text-[10px] text-white/30"
                        title="'untracked' and 'direct' cannot be blocked — it would kill all organic and direct bookings."
                      >
                        protected
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => toggleBlock(s.source, !isBlocked)}
                        disabled={isToggling}
                        data-testid={`attribution-block-${s.source}`}
                        className={cn(
                          "rounded-full text-xs h-7 px-3 border",
                          isBlocked
                            ? "border-green-500/40 text-green-300 hover:bg-green-500/10"
                            : "border-red-500/30 text-red-300 hover:bg-red-500/10",
                        )}
                      >
                        {isToggling ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : isBlocked ? (
                          <>
                            <CheckCircle2 className="w-3 h-3 mr-1" /> Unblock
                          </>
                        ) : (
                          <>
                            <Ban className="w-3 h-3 mr-1" /> Block
                          </>
                        )}
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value, accent = false, subtle = null }) {
  return (
    <div className="rounded-xl border border-[#1F1F1F] bg-[#0A0A0A] p-5">
      <p className="text-white/40 text-[10px] tracking-[0.25em] uppercase mb-2">{label}</p>
      <p className={cn("text-3xl font-light", accent ? "text-[#D4AF37]" : "text-white")}>{value}</p>
      {subtle && <p className="text-white/40 text-[11px] mt-2 leading-relaxed">{subtle}</p>}
    </div>
  );
}
