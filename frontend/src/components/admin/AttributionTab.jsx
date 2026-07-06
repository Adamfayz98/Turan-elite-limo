import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, TrendingUp, AlertCircle, RefreshCw, Ban, CheckCircle2, Download, FileText, Wrench, Ticket, Zap, Send, ArrowRightLeft } from "lucide-react";

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
  // --- Google Ads server-side API integration state ---
  const [gadsStatus, setGadsStatus] = useState(null);
  const [gadsPingRunning, setGadsPingRunning] = useState(false);
  const [gadsPingResult, setGadsPingResult] = useState(null);
  const [gadsPreviewRunning, setGadsPreviewRunning] = useState(false);
  const [gadsPreview, setGadsPreview] = useState(null);
  const [gadsBackfillRunning, setGadsBackfillRunning] = useState(false);
  const [gadsBackfillResult, setGadsBackfillResult] = useState(null);
  const [gadsSwitching, setGadsSwitching] = useState(false);

  const loadGadsStatus = async () => {
    try {
      const { data } = await api.get("/admin/google-ads/status");
      setGadsStatus(data);
    } catch {
      setGadsStatus(null);
    }
  };

  const runGadsPing = async () => {
    setGadsPingRunning(true);
    setGadsPingResult(null);
    try {
      const { data } = await api.post("/admin/google-ads/ping");
      setGadsPingResult(data);
      if (data.ok) {
        toast.success(`Legacy Ads API OK · ${(data.accessible_customers || []).length} customer(s) visible`);
      } else {
        toast.error(`Legacy ping failed (expected post-Data-Manager migration): ${data.error || "unknown"}`);
      }
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Ping request failed");
    } finally {
      setGadsPingRunning(false);
    }
  };

  const [dmPingRunning, setDmPingRunning] = useState(false);
  const [dmPingResult, setDmPingResult] = useState(null);
  const [dmValidateRunning, setDmValidateRunning] = useState(false);
  const [dmValidateResult, setDmValidateResult] = useState(null);

  const runDmPing = async () => {
    setDmPingRunning(true);
    setDmPingResult(null);
    try {
      const { data } = await api.post("/admin/google-ads/dm-ping");
      setDmPingResult(data);
      if (data.ok && data.has_datamanager_scope) {
        toast.success(`Data Manager auth OK · scope: datamanager · expires in ${data.expires_in}s`);
      } else {
        toast.error(`DM ping failed: ${data.error || data.note || "unknown"}`);
      }
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "DM ping request failed");
    } finally {
      setDmPingRunning(false);
    }
  };

  const runDmValidateAdhoc = async () => {
    setDmValidateRunning(true);
    setDmValidateResult(null);
    try {
      // Dry-run with an example gclid — never records a real conversion.
      const { data } = await api.post("/admin/google-ads/dm-validate-adhoc", {
        gclid: "Cj0KCQjw4Oe4BhDcARIsADaM7kExamplePipeValidateGclid1234567890",
        value: 5.0,
      });
      setDmValidateResult(data);
      if (data.ok && data.request_id) {
        toast.success(`Data Manager pipe OK · requestId: ${data.request_id}`);
      } else {
        toast.error(`DM validate failed · HTTP ${data.http_status || "?"}`);
      }
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "DM validate request failed");
    } finally {
      setDmValidateRunning(false);
    }
  };

  const runGadsPreview = async () => {
    setGadsPreviewRunning(true);
    try {
      const { data } = await api.get(`/admin/google-ads/backfill-preview?days=90`);
      setGadsPreview(data);
      toast.success(
        `Preview: ${data.recoverable_total}/${data.total_paid_bookings} bookings recoverable ($${(data.total_profit_recoverable || 0).toLocaleString()} profit)`,
      );
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Preview failed");
    } finally {
      setGadsPreviewRunning(false);
    }
  };

  const runGadsBackfill = async () => {
    const activeLabel = gadsStatus?.active_is_test ? "TEST" : gadsStatus?.active_is_profit ? "PROFIT" : "active";
    const recoverable = gadsPreview?.recoverable_total ?? "?";
    const ok = window.confirm(
      `Upload the last 90 days of paid bookings to Google Ads (${activeLabel} conversion action)?\n\n` +
      `~${recoverable} bookings will be sent. Only rows with a stored gclid are eligible — no guessed or fake gclids are ever sent. Safe to re-run (idempotent).\n\nProceed?`,
    );
    if (!ok) return;
    setGadsBackfillRunning(true);
    setGadsBackfillResult(null);
    try {
      const { data } = await api.post(`/admin/google-ads/backfill?days=90`);
      setGadsBackfillResult(data);
      toast.success(`Queued ${data.queued} uploads to Google Ads (${activeLabel}) · runs in background`);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Backfill failed");
    } finally {
      setGadsBackfillRunning(false);
    }
  };

  const switchGadsAction = async (target) => {
    setGadsSwitching(true);
    try {
      const { data } = await api.post(`/admin/google-ads/switch-active-action`, { target });
      toast.success(`Switched active conversion action to ${target.toUpperCase()} (ID ${data.active_conversion_action_id})`);
      await loadGadsStatus();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Switch failed");
    } finally {
      setGadsSwitching(false);
    }
  };

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
    loadGadsStatus();
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
                  <span className="text-[#D4AF37]">${(quoteConvSummary.total_won_value || 0).toLocaleString()}</span> gross
                </div>
                <div>
                  <span className="text-emerald-400">${(quoteConvSummary.total_won_profit || 0).toLocaleString()}</span> profit
                  <span className="text-white/40"> · {quoteConvSummary.won_with_profit}/{quoteConvSummary.won} tracked</span>
                </div>
                <div>
                  <span className="text-red-400">{quoteConvSummary.lost}</span> lost ·{" "}
                  <span className="text-white/50">{quoteConvSummary.open} open</span> ·
                  close <span className="text-white/75">{quoteConvSummary.close_rate_percent}%</span>
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

      {/* Google Ads server-side API card. Replaces the manual CSV upload flow —
          this posts conversions directly to Google Ads via ConversionUploadService.
          Starts pointed at the TEST conversion action so uploads can be sanity-
          checked in the Ads UI before flipping to Profit for real Smart Bidding. */}
      <div
        className="rounded-2xl border border-[#4285F4]/25 bg-[#4285F4]/[0.04] p-5"
        data-testid="google-ads-api-card"
      >
        <div className="flex items-center gap-2 text-[#4285F4] text-sm font-semibold">
          <Zap className="w-4 h-4" /> Google Ads server-side API (direct upload)
        </div>
        <p className="text-white/60 text-xs mt-1.5 leading-relaxed max-w-2xl">
          Replaces the manual CSV upload above. Stripe webhook fires a background
          upload to Google Ads directly, using the booking&apos;s stored{" "}
          <code className="text-white/85">gclid</code> and real profit
          (retail − affiliate cost). Idempotent — same booking is never sent twice.
        </p>

        {/* Config health row */}
        {gadsStatus ? (
          <div
            className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 text-[11px]"
            data-testid="google-ads-status-row"
          >
            <div className="text-white/50">
              Config{" "}
              {gadsStatus.configured ? (
                <span className="text-emerald-400">✓ complete</span>
              ) : (
                <span className="text-red-400">✗ missing keys</span>
              )}
            </div>
            <div className="text-white/50">
              Customer <span className="text-white/85 font-mono">{gadsStatus.customer_id}</span>
            </div>
            <div className="text-white/50">
              MCC <span className="text-white/85 font-mono">{gadsStatus.login_customer_id || "—"}</span>
            </div>
            <div className="text-white/50">
              Active action:{" "}
              {gadsStatus.active_is_test ? (
                <span className="text-amber-300 font-semibold">TEST</span>
              ) : gadsStatus.active_is_profit ? (
                <span className="text-emerald-300 font-semibold">PROFIT</span>
              ) : (
                <span className="text-white/85">{gadsStatus.active_conversion_action_id}</span>
              )}
            </div>
          </div>
        ) : (
          <div className="mt-3 text-[11px] text-white/40">Loading config status…</div>
        )}

        {/* Action buttons row */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            onClick={runGadsPing}
            disabled={gadsPingRunning || !gadsStatus?.configured}
            variant="outline"
            size="sm"
            className="border-white/20 text-white/60 hover:bg-white/5"
            data-testid="google-ads-ping-btn"
            title="Legacy Ads API creds check — will FAIL post-Data-Manager migration (expected)"
          >
            {gadsPingRunning ? (
              <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> Pinging…</>
            ) : (
              <><CheckCircle2 className="w-3.5 h-3.5 mr-2" /> Legacy Ping</>
            )}
          </Button>

          <Button
            onClick={runDmPing}
            disabled={dmPingRunning || !gadsStatus?.configured}
            variant="outline"
            size="sm"
            className="border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 hover:text-emerald-200"
            data-testid="data-manager-ping-btn"
            title="Verify OAuth token has the datamanager scope"
          >
            {dmPingRunning ? (
              <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> Checking…</>
            ) : (
              <><CheckCircle2 className="w-3.5 h-3.5 mr-2" /> DM Auth Check</>
            )}
          </Button>

          <Button
            onClick={runDmValidateAdhoc}
            disabled={dmValidateRunning || !gadsStatus?.configured}
            variant="outline"
            size="sm"
            className="border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 hover:text-emerald-200"
            data-testid="data-manager-validate-btn"
            title="Dry-run a payload against Data Manager (never records a real conversion)"
          >
            {dmValidateRunning ? (
              <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> Validating…</>
            ) : (
              <><CheckCircle2 className="w-3.5 h-3.5 mr-2" /> DM Pipe Test</>
            )}
          </Button>

          <Button
            onClick={runGadsPreview}
            disabled={gadsPreviewRunning || !gadsStatus?.configured}
            variant="outline"
            size="sm"
            className="border-white/25 text-white hover:bg-white/10"
            data-testid="google-ads-preview-btn"
          >
            {gadsPreviewRunning ? (
              <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> Loading…</>
            ) : (
              <><FileText className="w-3.5 h-3.5 mr-2" /> Preview backfill (90d)</>
            )}
          </Button>

          <Button
            onClick={runGadsBackfill}
            disabled={gadsBackfillRunning || !gadsStatus?.configured}
            size="sm"
            className="bg-[#4285F4] text-white hover:bg-[#4285F4]/90"
            data-testid="google-ads-backfill-btn"
          >
            {gadsBackfillRunning ? (
              <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> Queuing…</>
            ) : (
              <><Send className="w-3.5 h-3.5 mr-2" /> Run backfill (90d) →{" "}
                {gadsStatus?.active_is_test ? "TEST" : gadsStatus?.active_is_profit ? "PROFIT" : "?"}
              </>
            )}
          </Button>

          {/* Toggle: only enabled once both action IDs are configured */}
          <div className="ml-auto flex items-center gap-1">
            <span className="text-[10px] uppercase tracking-wider text-white/40 mr-1">Target:</span>
            <Button
              onClick={() => switchGadsAction("test")}
              disabled={gadsSwitching || gadsStatus?.active_is_test}
              size="sm"
              variant="outline"
              className={cn(
                "border-white/20 text-xs h-7 px-2",
                gadsStatus?.active_is_test
                  ? "bg-amber-500/20 text-amber-200 border-amber-500/40"
                  : "text-white/70 hover:bg-white/5",
              )}
              data-testid="google-ads-switch-test-btn"
            >
              TEST
            </Button>
            <ArrowRightLeft className="w-3 h-3 text-white/30" />
            <Button
              onClick={() => switchGadsAction("profit")}
              disabled={gadsSwitching || gadsStatus?.active_is_profit || !gadsStatus?.profit_conversion_action_id}
              size="sm"
              variant="outline"
              className={cn(
                "border-white/20 text-xs h-7 px-2",
                gadsStatus?.active_is_profit
                  ? "bg-emerald-500/20 text-emerald-200 border-emerald-500/40"
                  : "text-white/70 hover:bg-white/5",
              )}
              data-testid="google-ads-switch-profit-btn"
            >
              PROFIT
            </Button>
          </div>
        </div>

        {/* Ping result panel */}
        {gadsPingResult ? (
          <div
            className={cn(
              "mt-3 rounded-lg border p-3 text-[11px]",
              gadsPingResult.ok
                ? "border-emerald-500/30 bg-emerald-500/[0.06] text-emerald-100"
                : "border-red-500/30 bg-red-500/[0.06] text-red-200",
            )}
            data-testid="google-ads-ping-result"
          >
            {gadsPingResult.ok ? (
              <>
                <div className="font-semibold text-emerald-300 mb-1">✓ Legacy Ads API connected</div>
                <div className="text-white/60">
                  Accessible customers:{" "}
                  <span className="font-mono text-white/85">
                    {(gadsPingResult.accessible_customers || []).join(", ") || "—"}
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className="font-semibold mb-1">✗ Legacy ping failed</div>
                <div className="text-white/70 leading-relaxed">{gadsPingResult.error}</div>
                <div className="mt-2 pt-2 border-t border-white/10 text-white/50 text-[10px] leading-relaxed">
                  Note: Post-Data-Manager migration, this button&apos;s underlying Ads API endpoint
                  requires the <code>adwords</code> scope while our refresh token now has the
                  <code> datamanager</code> scope. Failure here is <strong>expected</strong> — use the
                  <em> DM Auth Check</em> and <em>DM Pipe Test</em> buttons above to verify the new pipe.
                </div>
              </>
            )}
          </div>
        ) : null}

        {/* Data Manager auth-check result panel */}
        {dmPingResult ? (
          <div
            className={cn(
              "mt-3 rounded-lg border p-3 text-[11px]",
              dmPingResult.ok && dmPingResult.has_datamanager_scope
                ? "border-emerald-500/40 bg-emerald-500/[0.08] text-emerald-100"
                : "border-red-500/30 bg-red-500/[0.06] text-red-200",
            )}
            data-testid="data-manager-ping-result"
          >
            {dmPingResult.ok && dmPingResult.has_datamanager_scope ? (
              <>
                <div className="font-semibold text-emerald-300 mb-1">✓ Data Manager auth OK</div>
                <div className="text-white/60 space-y-0.5">
                  <div>Scope: <span className="font-mono text-white/85">{dmPingResult.scope}</span></div>
                  <div>Expires in: <span className="font-mono text-white/85">{dmPingResult.expires_in}s</span></div>
                  <div>Token: <span className="font-mono text-white/85">{dmPingResult.token_masked}</span></div>
                </div>
              </>
            ) : (
              <>
                <div className="font-semibold mb-1">✗ Data Manager auth failed</div>
                <div className="text-white/70 leading-relaxed">{dmPingResult.error || dmPingResult.note}</div>
              </>
            )}
          </div>
        ) : null}

        {/* Data Manager pipe-test (validateOnly) result panel */}
        {dmValidateResult ? (
          <div
            className={cn(
              "mt-3 rounded-lg border p-3 text-[11px]",
              dmValidateResult.ok
                ? "border-emerald-500/40 bg-emerald-500/[0.08] text-emerald-100"
                : "border-red-500/30 bg-red-500/[0.06] text-red-200",
            )}
            data-testid="data-manager-validate-result"
          >
            {dmValidateResult.ok ? (
              <>
                <div className="font-semibold text-emerald-300 mb-1">
                  ✓ Data Manager pipe verified (validateOnly)
                </div>
                <div className="text-white/60 space-y-0.5">
                  <div>
                    HTTP: <span className="font-mono text-white/85">{dmValidateResult.http_status}</span>
                  </div>
                  <div>
                    Request ID:{" "}
                    <span className="font-mono text-white/85">{dmValidateResult.request_id}</span>
                  </div>
                  <div className="text-white/45 text-[10px] mt-1">
                    Google accepted the payload schema, OAuth token, and destination.
                    No real conversion was recorded — flip <em>Target</em> to PROFIT + do
                    a live $5 click to confirm end-to-end attribution.
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="font-semibold mb-1">
                  ✗ Data Manager pipe failed · HTTP {dmValidateResult.http_status || "?"}
                </div>
                <div className="text-white/70 leading-relaxed">
                  {JSON.stringify(dmValidateResult.response, null, 2).slice(0, 400)}
                </div>
              </>
            )}
          </div>
        ) : null}

        {/* Preview result panel */}
        {gadsPreview ? (
          <div
            className="mt-3 rounded-lg border border-white/15 bg-black/40 p-3.5 space-y-2"
            data-testid="google-ads-preview-result"
          >
            <div className="text-[11px] uppercase tracking-[0.2em] text-white/45">
              Backfill preview · last {gadsPreview.days} days
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <div className="text-white/45 text-[10px] uppercase">Paid bookings</div>
                <div className="text-white text-lg font-semibold tabular-nums">{gadsPreview.total_paid_bookings}</div>
              </div>
              <div>
                <div className="text-white/45 text-[10px] uppercase">Revenue</div>
                <div className="text-[#D4AF37] text-lg font-semibold tabular-nums">
                  ${Math.round(gadsPreview.total_revenue || 0).toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-white/45 text-[10px] uppercase">Recoverable</div>
                <div className="text-emerald-300 text-lg font-semibold tabular-nums">
                  {gadsPreview.recoverable_total}{" "}
                  <span className="text-white/40 text-xs font-normal">({gadsPreview.recoverable_pct}%)</span>
                </div>
              </div>
              <div>
                <div className="text-white/45 text-[10px] uppercase">Unrecoverable</div>
                <div className="text-red-300 text-lg font-semibold tabular-nums">
                  {gadsPreview.permanently_unrecoverable}
                </div>
              </div>
            </div>
            <div className="text-[11px] text-white/55 leading-relaxed pt-1 border-t border-white/10">
              gclid on booking: <span className="text-white/85">{gadsPreview.gclid_directly_on_booking}</span> ·
              via parent quote: <span className="text-white/85">{gadsPreview.gclid_via_parent_quote}</span> ·
              already uploaded: <span className="text-white/85">{gadsPreview.already_uploaded_to_google}</span>
            </div>

            {gadsPreview.sample_unrecoverable_bookings?.length ? (
              <details className="mt-2">
                <summary className="text-[11px] text-white/55 cursor-pointer hover:text-white/80">
                  Show sample unrecoverable bookings ({gadsPreview.sample_unrecoverable_bookings.length}) —
                  sanity check against when the gclid bug was active
                </summary>
                <div className="mt-2 max-h-40 overflow-auto rounded border border-white/10 bg-black/30">
                  <table className="w-full text-[11px]">
                    <thead className="bg-white/[0.03] text-white/45 uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="px-2 py-1.5 text-left">Booked</th>
                        <th className="px-2 py-1.5 text-left">Conf #</th>
                        <th className="px-2 py-1.5 text-left">Customer</th>
                        <th className="px-2 py-1.5 text-left">Quote link?</th>
                      </tr>
                    </thead>
                    <tbody className="text-white/75">
                      {gadsPreview.sample_unrecoverable_bookings.map((b) => (
                        <tr key={b.id} className="border-t border-white/5">
                          <td className="px-2 py-1.5 tabular-nums">{(b.created_at || "").slice(0, 10)}</td>
                          <td className="px-2 py-1.5 font-mono text-white/85">{b.confirmation_number || "—"}</td>
                          <td className="px-2 py-1.5 text-white/60">{b.email || "—"}</td>
                          <td className="px-2 py-1.5">
                            {b.has_quote_link ? (
                              <span className="text-amber-300">yes (no gclid on either)</span>
                            ) : (
                              <span className="text-red-300">no</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            ) : null}
          </div>
        ) : null}

        {/* Backfill result panel */}
        {gadsBackfillResult ? (
          <div
            className="mt-3 rounded-lg border border-[#4285F4]/30 bg-[#4285F4]/[0.06] p-3 text-[11px]"
            data-testid="google-ads-backfill-result"
          >
            <div className="font-semibold text-[#4285F4] mb-1">Backfill queued</div>
            <div className="text-white/70 leading-relaxed">
              {gadsBackfillResult.queued} booking(s) queued to upload in the background over the next ~1 minute.
              Refresh this page or check the <span className="font-mono text-white/85">recent-uploads</span> endpoint
              to see per-row status. Sends may take a few hours to appear in Google Ads UI.
            </div>
          </div>
        ) : null}
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
