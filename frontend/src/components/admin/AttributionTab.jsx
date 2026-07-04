import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, TrendingUp, AlertCircle, RefreshCw, Ban, CheckCircle2, Download, FileText, Wrench, Ticket } from "lucide-react";

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
  const [adsPreview, setAdsPreview] = useState(null);
  const [adsDownloading, setAdsDownloading] = useState(false);
  const [quoteConvSummary, setQuoteConvSummary] = useState(null);
  const [quoteConvDownloading, setQuoteConvDownloading] = useState(false);
  const [backfillRunning, setBackfillRunning] = useState(false);
  const [backfillResult, setBackfillResult] = useState(null);

  const loadAdsPreview = async (d) => {
    try {
      const { data: resp } = await api.get(`/admin/ads/offline-conversions/preview?days=${d}`);
      setAdsPreview(resp);
    } catch {
      setAdsPreview(null);
    }
  };

  const loadQuoteConvSummary = async (d) => {
    try {
      const { data: resp } = await api.get(`/admin/ads/quote-conversions/summary?days=${d}`);
      setQuoteConvSummary(resp);
    } catch {
      setQuoteConvSummary(null);
    }
  };

  const runBackfillUtm = async () => {
    const ok = window.confirm(
      "Backfill historical UTM attribution?\n\n" +
      "This scans every booking with a linked quote request and copies the " +
      "utm/gclid data from the parent quote onto the booking. Safe to run " +
      "multiple times (idempotent) — only touches bookings that are currently missing gclid.\n\n" +
      "Run now?",
    );
    if (!ok) return;
    setBackfillRunning(true);
    setBackfillResult(null);
    try {
      const { data: resp } = await api.post("/admin/ads/offline-conversions/backfill-utm");
      setBackfillResult(resp);
      toast.success(
        `Backfill complete · ${resp.updated} bookings updated (${resp.scanned} scanned)`,
      );
      // Refresh both previews since backfill affects both.
      loadAdsPreview(days);
      loadQuoteConvSummary(days);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Backfill failed");
    } finally {
      setBackfillRunning(false);
    }
  };

  const downloadQuoteConvCsv = async () => {
    setQuoteConvDownloading(true);
    try {
      const token = localStorage.getItem("turon_admin_token");
      const url = `${process.env.REACT_APP_BACKEND_URL}/api/admin/ads/quote-conversions.csv?days=${days}`;
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const wonHeader = res.headers.get("X-Rows-Won");
      const lostHeader = res.headers.get("X-Rows-Lost");
      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      const filename = `quote-conversions-${new Date().toISOString().slice(0, 10)}.csv`;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(blobUrl);
      toast.success(`Downloaded ${filename} · ${wonHeader || 0} won, ${lostHeader || 0} lost`);
    } catch (err) {
      toast.error(`Couldn't download quote conversions CSV: ${err.message}`);
    } finally {
      setQuoteConvDownloading(false);
    }
  };

  const downloadAdsCsv = async () => {
    setAdsDownloading(true);
    try {
      const token = localStorage.getItem("turon_admin_token");
      const url = `${process.env.REACT_APP_BACKEND_URL}/api/admin/ads/offline-conversions.csv?days=${days}`;
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rowsHeader = res.headers.get("X-Rows-Written");
      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      const filename = `google-ads-offline-conversions-${new Date().toISOString().slice(0, 10)}.csv`;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(blobUrl);
      toast.success(`Downloaded ${filename}${rowsHeader ? ` · ${rowsHeader} conversions` : ""}`);
    } catch (err) {
      toast.error(`Couldn't download CSV: ${err.message}`);
    } finally {
      setAdsDownloading(false);
    }
  };

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
    loadAdsPreview(days);
    loadQuoteConvSummary(days);
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

      {/* Google Ads Offline Conversion Import (CSV) */}
      <div
        data-testid="ads-offline-conversion-panel"
        className="rounded-2xl border border-[#4285F4]/30 bg-gradient-to-br from-[#4285F4]/[0.04] to-transparent p-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-9 h-9 rounded-full bg-[#4285F4]/15 border border-[#4285F4]/30 flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4 text-[#4285F4]" />
            </div>
            <div className="min-w-0">
              <p className="text-white text-sm font-medium">Google Ads — Offline Conversion Import</p>
              <p className="text-white/55 text-xs mt-1 leading-relaxed max-w-xl">
                Export paid bookings with a Google Ads <code className="text-[#D4AF37]">gclid</code> as a
                CSV. Upload weekly at <span className="text-white/75">Google Ads → Tools → Conversions → Uploads</span>{" "}
                to recover ad-blocker / cookie-loss attribution.
              </p>
              {adsPreview ? (
                <p className="text-white/45 text-[11px] mt-2" data-testid="ads-offline-preview">
                  Last {adsPreview.days} days: <span className="text-white/75">{adsPreview.rows_with_gclid}</span> rows ready
                  ({adsPreview.paid_bookings} paid bookings · {adsPreview.skipped_no_gclid} skipped without gclid ·
                  total value <span className="text-[#D4AF37]">${(adsPreview.total_value || 0).toLocaleString()}</span>)
                </p>
              ) : null}
            </div>
          </div>
          <Button
            onClick={downloadAdsCsv}
            disabled={adsDownloading || !adsPreview?.rows_with_gclid}
            className="bg-[#4285F4] text-white hover:bg-[#4285F4]/90 shrink-0"
            data-testid="ads-offline-download-btn"
          >
            {adsDownloading ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Preparing…</>
            ) : (
              <><Download className="w-4 h-4 mr-2" /> Download CSV</>
            )}
          </Button>
        </div>
      </div>

      {/* Quote Conversions export + UTM backfill card.
          Different unit of analysis than the Offline Conversion CSV above:
          this exports one row per QUOTE REQUEST (won/lost/open) — the file
          format Google Ads Enhanced Conversions for Leads uses to receive
          real revenue signal per lead once the server-side API integration
          ships. Also hosts the one-shot "backfill historical UTM" button. */}
      <div
        className="rounded-2xl border border-[#D4AF37]/20 bg-[#D4AF37]/[0.03] p-5"
        data-testid="quote-conversions-card"
      >
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-[#D4AF37] text-sm font-semibold">
              <Ticket className="w-4 h-4" />
              Quote Conversions Feedback (per-lead)
            </div>
            <p className="text-white/60 text-xs mt-1.5 leading-relaxed max-w-xl">
              One row per quote request — won / lost / open — with gclid, quoted price,
              paid amount and payment timestamp. Feeds Google Ads Enhanced Conversions
              for Leads once the API Developer Token ships. Distinct from the Offline
              Conversion CSV above (which is bookings-first, minimal columns).
            </p>
            {quoteConvSummary ? (
              <div
                className="text-white/45 text-[11px] mt-2 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1"
                data-testid="quote-conversions-summary"
              >
                <div>
                  <span className="text-white/75">{quoteConvSummary.total_quotes}</span> total quotes ({quoteConvSummary.days}d)
                </div>
                <div>
                  <span className="text-green-400">{quoteConvSummary.won}</span> won ·{" "}
                  <span className="text-[#D4AF37]">${(quoteConvSummary.total_won_value || 0).toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-red-400">{quoteConvSummary.lost}</span> lost ·{" "}
                  <span className="text-white/50">{quoteConvSummary.open} open</span>
                </div>
                <div>
                  <span className="text-white/75">{quoteConvSummary.with_gclid}</span> with gclid ·
                  close rate <span className="text-white/75">{quoteConvSummary.close_rate_percent}%</span>
                </div>
              </div>
            ) : null}
          </div>
          <Button
            onClick={downloadQuoteConvCsv}
            disabled={quoteConvDownloading || !quoteConvSummary?.total_quotes}
            className="bg-[#D4AF37] text-black hover:bg-[#B3922E] shrink-0"
            data-testid="quote-conversions-download-btn"
          >
            {quoteConvDownloading ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Preparing…</>
            ) : (
              <><Download className="w-4 h-4 mr-2" /> Download CSV</>
            )}
          </Button>
        </div>

        {/* Backfill row — separate action, same card. Only affects historical
            data. Idempotent. */}
        <div className="mt-4 pt-4 border-t border-white/10 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="text-xs text-white/60 leading-relaxed max-w-2xl">
            <span className="text-white/85 font-semibold">Backfill historical UTM.</span>{" "}
            One-shot job that copies utm attribution from quote requests onto their linked
            bookings — fixes historical rows where gclid wasn&apos;t preserved during payment.
            Safe to run multiple times (idempotent). Run this once after deploying the fix.
            {backfillResult ? (
              <span className="block mt-1.5 text-[#D4AF37]" data-testid="backfill-result">
                Last run: scanned <span className="text-white">{backfillResult.scanned}</span> · updated{" "}
                <span className="text-green-400">{backfillResult.updated}</span> · skipped
                {" "}(no quote link: {backfillResult.skipped_quote_missing},
                parent had no utm: {backfillResult.skipped_parent_no_utm})
              </span>
            ) : null}
          </div>
          <Button
            onClick={runBackfillUtm}
            disabled={backfillRunning}
            variant="outline"
            className="border-[#D4AF37]/40 text-[#D4AF37] hover:bg-[#D4AF37]/10 hover:text-[#D4AF37] shrink-0"
            data-testid="backfill-utm-btn"
          >
            {backfillRunning ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Running…</>
            ) : (
              <><Wrench className="w-4 h-4 mr-2" /> Backfill Historical UTM</>
            )}
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
