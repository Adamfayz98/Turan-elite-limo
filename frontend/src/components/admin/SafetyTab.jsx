import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Loader2, Shield, Trash2, Plus, Globe, AlertTriangle,
  CheckCircle2, Phone, Mail, User, Network, Eye,
} from "lucide-react";

import { api, formatApiErrorDetail } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const KIND_META = {
  email: { icon: Mail, label: "Email" },
  phone: { icon: Phone, label: "Phone" },
  ip: { icon: Network, label: "IP" },
  name: { icon: User, label: "Name" },
};

const BAND_COLOR = {
  green: "text-emerald-300 bg-emerald-500/10 border-emerald-500/30",
  yellow: "text-amber-300 bg-amber-500/10 border-amber-500/30",
  red: "text-red-300 bg-red-500/10 border-red-500/30",
};

const fmtMoney = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(n || 0));

export default function SafetyTab() {
  const [tab, setTab] = useState("queue");

  return (
    <div className="space-y-6" data-testid="safety-tab">
      <div className="flex items-center gap-3 flex-wrap">
        <Shield className="w-5 h-5 text-[#D4AF37]" />
        <div>
          <h2 className="font-serif text-2xl text-white">Safety &amp; anti-fraud</h2>
          <p className="text-xs text-white/55 mt-1">
            Review-queue, blacklist, and IP-lookup tools. Risk scores apply automatically as quotes &amp; bookings come in.
          </p>
        </div>
      </div>

      <div className="flex gap-2 border-b border-[#1F1F1F] flex-wrap">
        {[
          { id: "queue", label: "Review queue" },
          { id: "quick-check", label: "Quick risk check" },
          { id: "blacklist", label: "Blacklist" },
          { id: "iplookup", label: "IP lookup" },
          { id: "otps", label: "Pending OTPs" },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            data-testid={`safety-subtab-${t.id}`}
            className={`px-3 py-2 text-xs uppercase tracking-wider font-semibold border-b-2 transition-colors ${
              tab === t.id
                ? "border-[#D4AF37] text-[#D4AF37]"
                : "border-transparent text-white/50 hover:text-white/80"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "queue" && <ReviewQueue />}
      {tab === "quick-check" && <QuickRiskCheck />}
      {tab === "blacklist" && <BlacklistManager />}
      {tab === "iplookup" && <IpLookup />}
      {tab === "otps" && <PendingOtps />}
    </div>
  );
}

// ---- Review Queue ----
function ReviewQueue() {
  const [data, setData] = useState({ quotes: [], bookings: [], threshold: 0 });
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/safety/review-queue");
      setData(data || { quotes: [], bookings: [] });
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Couldn't load review queue");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const clearQuote = async (id) => {
    try {
      await api.post(`/admin/safety/quote-requests/${id}/clear-risk`);
      toast.success("Cleared from queue");
      load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Couldn't clear");
    }
  };
  const clearBooking = async (id) => {
    try {
      await api.post(`/admin/safety/bookings/${id}/clear-risk`);
      toast.success("Cleared from queue");
      load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Couldn't clear");
    }
  };

  if (loading) {
    return <div className="py-12 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-[#D4AF37]" /></div>;
  }

  const empty = !data.quotes?.length && !data.bookings?.length;

  return (
    <div className="space-y-6" data-testid="review-queue">
      <div className="text-xs text-white/45">
        Shows quotes &amp; bookings flagged <span className="text-amber-300">yellow</span> or <span className="text-red-300">red</span>, blacklisted matches, or above the <strong className="text-white/70">${data.threshold || 0}</strong> review threshold. Configure the threshold in <em>Settings</em>.
      </div>

      {empty && (
        <div className="rounded-xl border border-[#1F1F1F] bg-[#0A0A0A] p-10 text-center">
          <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-400/70 mb-3" />
          <div className="text-white/65">Nothing needs review right now.</div>
        </div>
      )}

      {data.quotes?.length > 0 && (
        <div>
          <h3 className="text-xs uppercase tracking-[0.18em] text-white/45 mb-3">Quote requests ({data.quotes.length})</h3>
          <div className="space-y-3">
            {data.quotes.map((q) => (
              <RiskItem
                key={q.id}
                item={q}
                amount={q.quoted_price}
                label="Quote"
                onClear={() => clearQuote(q.id)}
              />
            ))}
          </div>
        </div>
      )}

      {data.bookings?.length > 0 && (
        <div>
          <h3 className="text-xs uppercase tracking-[0.18em] text-white/45 mb-3 mt-6">Bookings ({data.bookings.length})</h3>
          <div className="space-y-3">
            {data.bookings.map((b) => (
              <RiskItem
                key={b.id}
                item={b}
                amount={b.amount}
                label="Booking"
                onClear={() => clearBooking(b.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RiskItem({ item, amount, label, onClear }) {
  const band = item.risk_band || (item.blacklisted ? "red" : "yellow");
  const flags = item.risk_flags || [];
  const name = item.full_name || item.name || "—";

  return (
    <div
      data-testid={`risk-item-${item.id}`}
      className="rounded-xl border border-[#1F1F1F] bg-[#0A0A0A] p-4"
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-[0.18em] text-white/45">{label}</span>
            <span className="text-white font-medium">{name}</span>
            <RiskBadge score={item.risk_score} band={band} />
            {item.blacklisted && (
              <Badge className="bg-red-500/15 text-red-300 border border-red-500/40 text-[10px] uppercase">
                Blacklist match
              </Badge>
            )}
            <span className="text-xs text-white/55">{fmtMoney(amount)}</span>
          </div>
          <div className="mt-2 text-xs text-white/55 space-x-3">
            {item.phone && <span>📞 {item.phone}</span>}
            {item.email && <span>✉ {item.email}</span>}
            {item.vehicle_type && <span className="text-[#D4AF37]">{item.vehicle_type}</span>}
          </div>
          {item.ip_address && (
            <div className="mt-2 text-[11px] text-white/40 flex items-center gap-2 flex-wrap">
              <Globe className="w-3 h-3" />
              {item.ip_address}
              {item.ip_geo?.country && (
                <span>
                  · {item.ip_geo.city || item.ip_geo.region_name || ""}{item.ip_geo.region ? `, ${item.ip_geo.region}` : ""}{item.ip_geo.country ? `, ${item.ip_geo.country}` : ""}
                </span>
              )}
              {item.ip_geo?.isp && <span>· {item.ip_geo.isp}</span>}
            </div>
          )}
          {flags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {flags.map((f) => (
                <span
                  key={f.code}
                  className="text-[10px] px-2 py-0.5 rounded bg-white/5 border border-white/10 text-white/65"
                  title={`+${f.weight} risk`}
                >
                  {f.label}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1.5 items-end flex-shrink-0">
          <Button
            type="button"
            onClick={onClear}
            data-testid={`risk-clear-${item.id}`}
            size="sm"
            className="bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 border border-emerald-500/30 h-8 text-xs"
          >
            <CheckCircle2 className="w-3 h-3 mr-1.5" /> Mark safe
          </Button>
        </div>
      </div>
    </div>
  );
}

export function RiskBadge({ score, band, compact = false }) {
  if (score === undefined || score === null) return null;
  const resolvedBand = band || "yellow";
  const cls = BAND_COLOR[resolvedBand] || BAND_COLOR.yellow;
  const isGreen = resolvedBand === "green";
  const Icon = isGreen ? CheckCircle2 : AlertTriangle;
  const label = isGreen ? "Clean" : `Risk ${score}`;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] uppercase tracking-wider border ${cls}`}
      title={isGreen ? `Safety screened · score ${score}/100` : `Risk score ${score}/100`}
      data-testid={`risk-badge-${resolvedBand}`}
    >
      <Icon className="w-3 h-3" />
      {compact ? score : label}
    </span>
  );
}

// ---- Blacklist Manager ----
function BlacklistManager() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState("email");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [adding, setAdding] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/safety/blacklist");
      setItems(data || []);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Failed to load");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!value.trim()) {
      toast.error("Enter a value");
      return;
    }
    setAdding(true);
    try {
      await api.post("/admin/safety/blacklist", { kind, value: value.trim(), reason: reason.trim() });
      toast.success("Added to blacklist");
      setValue(""); setReason("");
      load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Add failed");
    } finally {
      setAdding(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm("Remove this blacklist entry?")) return;
    try {
      await api.delete(`/admin/safety/blacklist/${id}`);
      setItems((arr) => arr.filter((x) => x.id !== id));
      toast.success("Removed");
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Delete failed");
    }
  };

  return (
    <div className="space-y-5" data-testid="blacklist-manager">
      <div className="text-xs text-white/45 leading-relaxed">
        Add emails, phone numbers, IPs, or names you want auto-flagged. Submissions still go through (silent-accept) so the customer doesn&apos;t know — but they&apos;re tagged in admin and skipped from auto-confirm.
        <br />
        <span className="text-white/35">Tip: prefix an email with <code className="text-[#D4AF37]">@</code> to match the whole domain (e.g., <code className="text-[#D4AF37]">@scamdomain.com</code>). For IPs, end with <code className="text-[#D4AF37]">/24</code> to match a CIDR block.</span>
      </div>

      <div className="rounded-xl border border-[#1F1F1F] bg-[#0A0A0A] p-4">
        <div className="grid grid-cols-1 md:grid-cols-[120px_1fr_1fr_auto] gap-2 items-end">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-white/45">Kind</label>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger
                data-testid="blacklist-kind"
                className="h-10 bg-[#0E0E0E] border-[#27272A] text-white"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#0E0E0E] border-[#27272A] text-white">
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="phone">Phone</SelectItem>
                <SelectItem value="ip">IP</SelectItem>
                <SelectItem value="name">Name</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-white/45">Value</label>
            <Input
              data-testid="blacklist-value"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={kind === "email" ? "name@evil.com or @evil.com" : kind === "ip" ? "1.2.3.4 or 1.2.3.0/24" : ""}
              className="bg-[#0E0E0E] border-[#27272A] text-white h-10"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-white/45">Reason (internal)</label>
            <Input
              data-testid="blacklist-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Chargeback Dec 2025"
              className="bg-[#0E0E0E] border-[#27272A] text-white h-10"
            />
          </div>
          <Button
            onClick={add}
            disabled={adding}
            data-testid="blacklist-add"
            className="bg-[#D4AF37] text-black hover:bg-[#B3922E] h-10"
          >
            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4 mr-1" /> Add</>}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-[#D4AF37]" /></div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-[#1F1F1F] bg-[#0A0A0A] p-8 text-center text-white/45 text-sm">
          Blacklist is empty.
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((e) => {
            const Meta = KIND_META[e.kind] || KIND_META.email;
            const Icon = Meta.icon;
            return (
              <div
                key={e.id}
                data-testid={`blacklist-row-${e.id}`}
                className="rounded-lg border border-[#1F1F1F] bg-[#0A0A0A] p-3 flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded bg-red-500/10 text-red-300 flex-shrink-0">
                    <Icon className="w-3.5 h-3.5" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-white text-sm font-mono">{e.value}</div>
                    {e.reason && <div className="text-xs text-white/45 mt-0.5">{e.reason}</div>}
                  </div>
                </div>
                <div className="text-[11px] text-white/35 hidden sm:block">
                  {e.created_at ? new Date(e.created_at).toLocaleDateString() : ""}
                </div>
                <button
                  type="button"
                  onClick={() => remove(e.id)}
                  data-testid={`blacklist-remove-${e.id}`}
                  className="p-1.5 rounded text-white/35 hover:text-red-400"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---- Quick Risk Check (ad-hoc lookup for off-platform leads) ----
function QuickRiskCheck() {
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const canSubmit = (phone.trim() || email.trim() || name.trim()) && !loading;

  const go = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setResult(null);
    try {
      const { data } = await api.post("/admin/safety/risk-check", {
        phone: phone.trim(),
        email: email.trim(),
        name: name.trim(),
        amount: amount ? Number(amount) : 0,
      });
      setResult(data);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Risk check failed");
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setPhone(""); setEmail(""); setName(""); setAmount(""); setResult(null);
  };

  // Plain-English recommendation derived from the band returned by the
  // backend so the user gets an action item, not just a colour.
  const recommendation = result && (
    result.band === "red"
      ? "DECLINE or require verified ID + full pre-pay before dispatch."
      : result.band === "yellow"
        ? "Proceed with caution: deposit-only-by-card, OTP phone verify, and no off-session charges until first trip completes."
        : "Proceed normally: standard 35% deposit + saved card flow is fine."
  );

  return (
    <div className="space-y-5" data-testid="quick-risk-check">
      <div className="text-xs text-white/45 leading-relaxed max-w-2xl">
        Score an off-platform lead (Yelp, Google Business Profile, walk-in call) against the same risk engine
        that runs on website quote requests. Paste any combination of phone, email, name, and quote amount.
        Result is identical to the green/yellow/red badges you see on incoming quotes.
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-2xl">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-white/45 mb-1">Phone</div>
          <Input
            data-testid="risk-check-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && go()}
            placeholder="(415) 518-4873"
            className="bg-[#0E0E0E] border-[#27272A] text-white h-11"
          />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-white/45 mb-1">Email</div>
          <Input
            data-testid="risk-check-email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && go()}
            placeholder="customer@example.com"
            className="bg-[#0E0E0E] border-[#27272A] text-white h-11"
          />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-white/45 mb-1">Name</div>
          <Input
            data-testid="risk-check-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && go()}
            placeholder="Spencer Pahlke"
            className="bg-[#0E0E0E] border-[#27272A] text-white h-11"
          />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-white/45 mb-1">Quote amount (USD, optional)</div>
          <Input
            data-testid="risk-check-amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && go()}
            placeholder="1650"
            inputMode="decimal"
            className="bg-[#0E0E0E] border-[#27272A] text-white h-11"
          />
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          onClick={go}
          disabled={!canSubmit}
          data-testid="risk-check-go"
          className="bg-[#D4AF37] text-black hover:bg-[#B3922E] h-11"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4 mr-1" />} Run risk check
        </Button>
        {result && (
          <Button
            onClick={reset}
            variant="outline"
            data-testid="risk-check-reset"
            className="bg-transparent border-[#27272A] text-white/70 hover:bg-white/5 h-11"
          >
            Clear
          </Button>
        )}
      </div>

      {result && (
        <div
          className="rounded-xl border border-[#1F1F1F] bg-[#0A0A0A] p-5 space-y-4 max-w-2xl"
          data-testid="risk-check-result"
        >
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-white/45">Result</div>
              <div className="text-2xl font-bold text-white mt-1 tabular-nums">
                Score {result.score}<span className="text-white/40 text-base"> / 100</span>
              </div>
            </div>
            <RiskBadge score={result.score} band={result.band} />
          </div>

          <div className="rounded-lg border border-[#1F1F1F] bg-[#0E0E0E] p-3 text-sm text-white/90">
            <span className="text-[10px] uppercase tracking-wider text-white/45 block mb-1">Recommendation</span>
            {recommendation}
          </div>

          {result.blacklisted && (
            <div className="rounded-lg border border-red-900/60 bg-red-950/40 p-3 text-sm text-red-200">
              ⛔ Matches blacklist ({(result.blacklist_hits || []).length} entry).
              {(result.blacklist_hits || []).slice(0, 3).map((h, i) => (
                <div key={i} className="text-xs text-red-300/80 mt-1">
                  • {h.kind}: {h.value} {h.reason ? `· ${h.reason}` : ""}
                </div>
              ))}
            </div>
          )}

          <div>
            <div className="text-[10px] uppercase tracking-wider text-white/45 mb-2">
              Flags ({(result.flags || []).length})
            </div>
            {(result.flags || []).length === 0 ? (
              <div className="text-white/55 text-sm italic">
                No risk flags raised. Lead looks clean.
              </div>
            ) : (
              <div className="space-y-1.5">
                {(result.flags || []).map((f, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between text-sm border border-[#1F1F1F] rounded px-3 py-2 bg-[#0E0E0E]"
                  >
                    <span className="text-white/85">{f.label}</span>
                    <span className="text-amber-300 tabular-nums text-xs">+{f.weight}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- IP Lookup ----
function IpLookup() {
  const [ip, setIp] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const go = async () => {
    if (!ip.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const { data } = await api.get("/admin/safety/ip-lookup", { params: { ip: ip.trim() } });
      setResult(data);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Lookup failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4" data-testid="ip-lookup">
      <div className="text-xs text-white/45">
        Paste an IP address from any quote/booking and we&apos;ll pull the country, ISP, and proxy/hosting flags from ip-api.com. Useful for debugging suspicious bookings or chargebacks.
      </div>
      <div className="flex gap-2">
        <Input
          data-testid="ip-lookup-input"
          value={ip}
          onChange={(e) => setIp(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && go()}
          placeholder="8.8.8.8"
          className="bg-[#0E0E0E] border-[#27272A] text-white h-11 max-w-xs"
        />
        <Button
          onClick={go}
          disabled={loading || !ip.trim()}
          data-testid="ip-lookup-go"
          className="bg-[#D4AF37] text-black hover:bg-[#B3922E] h-11"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4 mr-1" />} Look up
        </Button>
      </div>
      {result && (
        <div className="rounded-xl border border-[#1F1F1F] bg-[#0A0A0A] p-5">
          <div className="text-xs uppercase tracking-wider text-white/45 mb-3">Result for {result.ip}</div>
          {!result.geo || Object.keys(result.geo).length === 0 ? (
            <div className="text-white/50 text-sm">No data found.</div>
          ) : (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Field label="Country" value={result.geo.country || "—"} />
              <Field label="Region" value={result.geo.region_name || result.geo.region || "—"} />
              <Field label="City" value={result.geo.city || "—"} />
              <Field label="ISP" value={result.geo.isp || "—"} />
              <Field label="Proxy / VPN" value={result.geo.proxy ? "Yes ⚠" : "No"} highlight={result.geo.proxy} />
              <Field label="Hosting / datacenter" value={result.geo.hosting ? "Yes ⚠" : "No"} highlight={result.geo.hosting} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, value, highlight }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-white/40">{label}</div>
      <div className={`mt-1 ${highlight ? "text-amber-300" : "text-white"}`}>{value}</div>
    </div>
  );
}

// ---- Pending OTPs (MOCK helper) ----
function PendingOtps() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/safety/pending-otps");
      setItems(data || []);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Failed");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="space-y-3" data-testid="pending-otps">
      <div className="text-xs text-white/45">
        <strong className="text-amber-300">MOCK mode</strong> — Twilio Verify isn&apos;t configured yet. Active OTP codes show here so you can read them to the customer over the phone if needed. Auto-refreshes every 15s.
      </div>
      {loading ? (
        <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-[#D4AF37]" /></div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-[#1F1F1F] bg-[#0A0A0A] p-8 text-center text-white/45 text-sm">
          No pending codes.
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((o, idx) => (
            <div
              key={`${o.phone}-${idx}`}
              data-testid={`otp-row-${idx}`}
              className="rounded-lg border border-[#1F1F1F] bg-[#0A0A0A] p-3 flex items-center justify-between gap-4"
            >
              <div>
                <div className="text-white font-mono text-sm">{o.phone}</div>
                <div className="text-[11px] text-white/40">{o.purpose} · expires {o.expires_at ? new Date(o.expires_at).toLocaleTimeString() : "?"}</div>
              </div>
              <div className="text-[#D4AF37] text-2xl font-mono tracking-widest font-semibold">{o.code}</div>
              <div className="text-[11px] text-white/40">{o.attempts || 0}/5 tries</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
