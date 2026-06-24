import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, MessageSquare, Phone, Mail, Trash2, DollarSign, Send, Copy, CheckCircle2, Sparkles, ExternalLink, ClipboardPaste, Tag } from "lucide-react";

import { api, formatApiErrorDetail } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

import { RiskBadge } from "@/components/admin/SafetyTab";

// ----- Per-vehicle default quote notes (auto-fills the "Notes for customer"
// field when admin opens "Send Quote" for that vehicle type). Admin can still
// edit before sending. Keeps every quote consistent and professional.

const VEHICLE_NOTE_TEMPLATES = {
  "stretch limousine": `Includes 3-hour minimum (standard for stretch limousines on evening bookings). Additional time billed at $150/hr in 30-min increments — only if your group decides to extend on the night, never auto-charged without notice.

Vehicle features: full bar with crystal glassware, premium leather, LED mood lighting, climate control front + rear, professional suited chauffeur. Bring your own drinks (21+ only with valid ID).

Standard policy: 50% deposit confirms · remaining 50% charged day-before · Free cancel 7+ days out · 50% fee inside 7 days · Non-refundable inside 48 hrs. Chauffeur gratuity (20% suggested) not included.`,

  "party bus": `Includes 4-hour minimum (industry standard for party bus bookings). Additional time billed at $180/hr in 30-min increments, only if your group extends on the night.

Vehicle features: 14–30 passenger limo coach with LED ceiling lighting, dance floor, premium sound system, full bar with stocked ice, climate control, privacy curtains. Bring your own drinks and playlist — we handle the rest. Riders 21+ only with valid ID for alcohol.

Standard policy: 50% deposit confirms · remaining 50% charged day-before · Free cancel 7+ days out · 50% fee inside 7 days · Non-refundable inside 48 hrs. Underage drinking ends the trip immediately, no refund. Chauffeur gratuity (20% suggested) not included.`,

  "sprinter van": `Includes 3-hour minimum. Additional time billed at $135/hr in 30-min increments, only if extended on the day-of.

Vehicle features: Mercedes-Benz Sprinter, standard cloth/leather seats, climate control, USB charging, plenty of luggage space. Up to 14 passengers.

Standard policy: 50% deposit confirms · remaining 50% charged day-before · Free cancel 7+ days out · 50% fee inside 7 days · Non-refundable inside 48 hrs. Chauffeur gratuity (20% suggested) not included.`,

  "executive sprinter": `Includes 3-hour minimum. Additional time billed at $145/hr in 30-min increments, only if extended on the day-of.

Vehicle features: Mercedes-Benz Sprinter with captain's chairs, premium leather, divider partition, climate control front + rear, USB + AC outlets. Up to 12 passengers in executive comfort.

Standard policy: 50% deposit confirms · remaining 50% charged day-before · Free cancel 7+ days out · 50% fee inside 7 days · Non-refundable inside 48 hrs. Chauffeur gratuity (20% suggested) not included.`,

  "jet sprinter": `Includes 3-hour minimum. Additional time billed at $165/hr in 30-min increments, only if extended on the day-of.

Vehicle features: Mercedes-Benz Sprinter with first-class recliners, premium leather, full bar with mood lighting, climate control front + rear, USB + AC outlets. Up to 10 passengers in jet-cabin style.

Standard policy: 50% deposit confirms · remaining 50% charged day-before · Free cancel 7+ days out · 50% fee inside 7 days · Non-refundable inside 48 hrs. Chauffeur gratuity (20% suggested) not included.`,

  "luxury suv": `Includes 1-hour minimum for hourly bookings (transfers are flat-rate). Wait time after the first 15 minutes billed at $1/min.

Vehicle features: Cadillac Escalade ESV or GMC Yukon, premium leather, climate control, USB charging, bottled water complimentary, professional suited chauffeur. Up to 6 passengers + luggage.

Standard policy: 50% deposit confirms · remaining 50% charged day-before · Free cancel 24+ hrs out · 50% fee inside 24 hrs · Non-refundable inside 4 hrs. Chauffeur gratuity (20% suggested) not included.`,

  "executive sedan": `Flat-rate one-way transfer or hourly availability. Wait time after the first 15 minutes billed at $1/min.

Vehicle features: Cadillac XTS or equivalent executive sedan, premium leather, climate control, complimentary bottled water, professional suited chauffeur. Up to 3 passengers + luggage.

Standard policy: 50% deposit confirms · remaining 50% charged day-before · Free cancel 24+ hrs out · 50% fee inside 24 hrs · Non-refundable inside 4 hrs. Chauffeur gratuity (20% suggested) not included.`,

  "first class": `Flat-rate one-way transfer or hourly availability. Wait time after the first 15 minutes billed at $1/min.

Vehicle features: Mercedes-Benz S-Class, premium leather, dual-zone climate control, USB + AC outlets, complimentary bottled water, professional suited chauffeur. Up to 3 passengers + luggage.

Standard policy: 50% deposit confirms · remaining 50% charged day-before · Free cancel 24+ hrs out · 50% fee inside 24 hrs · Non-refundable inside 4 hrs. Chauffeur gratuity (20% suggested) not included.`,
};

const DEFAULT_QUOTE_NOTE = `Flat-rate as quoted. Additional time or stops billed at our standard hourly rate, only if added on the day-of and notified in advance — never auto-charged without your approval.

Standard policy: 50% deposit confirms · remaining 50% charged day-before · Free cancel 7+ days out · 50% fee inside 7 days · Non-refundable inside 48 hrs. Chauffeur gratuity (20% suggested) not included.`;

function getDefaultNotesForVehicle(vehicleType) {
  if (!vehicleType) return DEFAULT_QUOTE_NOTE;
  const key = String(vehicleType).toLowerCase().trim();
  return VEHICLE_NOTE_TEMPLATES[key] || DEFAULT_QUOTE_NOTE;
}

const STATUS_BADGE = {
  new: { label: "New", className: "bg-[#D4AF37]/15 text-[#D4AF37] border-[#D4AF37]/30" },
  contacted: { label: "Contacted", className: "bg-blue-500/15 text-blue-300 border-blue-500/30" },
  quoted: { label: "Quoted", className: "bg-purple-500/15 text-purple-300 border-purple-500/30" },
  won: { label: "Won", className: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  lost: { label: "Lost", className: "bg-white/5 text-white/40 border-white/10" },
};

const fmtMoney = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(n || 0));

export default function QuoteRequestsTab() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [quoteModal, setQuoteModal] = useState(null); // { request, ... }

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/quote-requests");
      setItems(data || []);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Couldn't load quote requests");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const setStatus = (id, status) => {
    api
      .patch(`/admin/quote-requests/${id}`, { status })
      .then(() => {
        setItems((arr) => arr.map((q) => (q.id === id ? { ...q, status } : q)));
      })
      .catch((err) => {
        toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Update failed");
      });
  };

  const remove = async (q) => {
    if (!window.confirm(`Delete this quote request from ${q.full_name}?`)) return;
    try {
      await api.delete(`/admin/quote-requests/${q.id}`);
      setItems((arr) => arr.filter((x) => x.id !== q.id));
      toast.success("Removed");
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Delete failed");
    }
  };

  const onQuoteSent = (updatedRequest, confirmUrl, sentTo) => {
    setItems((arr) => arr.map((x) => (x.id === updatedRequest.id ? { ...x, ...updatedRequest } : x)));
    setQuoteModal({ request: updatedRequest, confirm_url: confirmUrl, sent_to: sentTo, phase: "sent" });
  };

  const newCount = items.filter((q) => (q.status || "new") === "new").length;

  // "Suggested affiliates" modal state (per-quote)
  const [suggestState, setSuggestState] = useState(null); // { request }

  // "Import Lead" modal — paste raw Yelp / Google / phone-call text and the
  // backend LLM extracts structured fields. See <ImportLeadModal/>.
  const [importOpen, setImportOpen] = useState(false);

  return (
    <div className="space-y-6" data-testid="quote-requests-tab">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-serif text-2xl text-white">Quote requests</h2>
          <p className="text-xs text-white/55 mt-1 max-w-2xl leading-relaxed">
            Customers who tapped <strong className="text-white/80">Request a quote</strong> on Party Bus, Sprinter Van, or Stretch Limo. Tap{" "}
            <span className="text-[#D4AF37] font-semibold">Send Quote</span> to email + SMS them a one-tap &ldquo;Confirm &amp; Pay Deposit&rdquo; link.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {newCount > 0 && (
            <Badge className="bg-[#D4AF37] text-black border-0 text-xs">
              {newCount} new
            </Badge>
          )}
          <Button
            onClick={() => setImportOpen(true)}
            data-testid="import-lead-open"
            variant="outline"
            size="sm"
            className="bg-transparent border-[#D4AF37]/40 text-[#D4AF37] hover:bg-[#D4AF37]/10"
          >
            <ClipboardPaste className="w-4 h-4 mr-1.5" />
            Import lead
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="py-10 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-[#D4AF37]" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-[#1F1F1F] bg-[#0A0A0A] p-10 text-center">
          <MessageSquare className="w-8 h-8 mx-auto text-white/30 mb-3" />
          <div className="text-white/65">No quote requests yet.</div>
          <div className="text-xs text-white/40 mt-1">
            They&apos;ll appear here the moment a customer submits one for a call-only vehicle.
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((q) => {
            const status = q.status || "new";
            const badge = STATUS_BADGE[status] || STATUS_BADGE.new;
            const phoneTel = (q.phone || "").replace(/[^\d+]/g, "");
            return (
              <div
                key={q.id}
                data-testid={`quote-row-${q.id}`}
                className="rounded-xl border border-[#1F1F1F] bg-[#0A0A0A] p-5"
              >
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white font-medium">{q.full_name}</span>
                      <Badge className={`${badge.className} text-[10px] uppercase tracking-wider border`}>{badge.label}</Badge>
                      <span className="text-[10px] uppercase tracking-[0.2em] text-[#D4AF37] bg-[#D4AF37]/10 px-2 py-0.5 rounded">{q.vehicle_type}</span>
                      {q.source && q.source !== "website" && (
                        <span
                          data-testid={`source-tag-${q.source}`}
                          className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.2em] text-blue-300 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded"
                          title={`Lead source: ${q.source}`}
                        >
                          <Tag className="w-2.5 h-2.5" /> {q.source}
                        </span>
                      )}
                      {(q.risk_score !== undefined && q.risk_score !== null) && (
                        <RiskBadge
                          score={q.risk_score ?? (q.blacklisted ? 100 : 0)}
                          band={q.risk_band || (q.blacklisted ? "red" : "green")}
                        />
                      )}
                      {q.blacklisted && (
                        <Badge className="bg-red-500/20 text-red-200 border border-red-500/40 text-[10px] uppercase">
                          ⚠ Blacklist
                        </Badge>
                      )}
                      {(q.trip_type || q.occasion) && (
                        <span className="text-[10px] uppercase tracking-wider text-[#D4AF37] bg-[#D4AF37]/10 border border-[#D4AF37]/20 px-2 py-0.5 rounded">{q.trip_type || q.occasion}</span>
                      )}
                      {q.service_duration && (
                        <span className="text-[10px] uppercase tracking-wider text-cyan-300 bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded">⏱ {q.service_duration}</span>
                      )}
                      {q.quoted_price && (
                        <span className="text-[10px] uppercase tracking-wider text-purple-300 bg-purple-500/10 px-2 py-0.5 rounded">
                          Quoted {fmtMoney(q.quoted_price)}
                        </span>
                      )}
                    </div>
                    {q.risk_flags?.length > 0 && (q.risk_band === "yellow" || q.risk_band === "red" || q.blacklisted) && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {q.risk_flags.slice(0, 4).map((f) => (
                          <span
                            key={f.code}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/10 text-white/55"
                            title={`+${f.weight} risk`}
                          >
                            {f.label}
                          </span>
                        ))}
                        {q.risk_flags.length > 4 && (
                          <span className="text-[10px] text-white/35">+{q.risk_flags.length - 4} more</span>
                        )}
                      </div>
                    )}
                    <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5 text-xs text-white/65">
                      <div className="flex items-center gap-1.5">
                        <Phone className="w-3 h-3 text-[#D4AF37]" />
                        <a href={`tel:${phoneTel}`} className="hover:text-white">{q.phone}</a>
                      </div>
                      {q.email && (
                        <div className="flex items-center gap-1.5">
                          <Mail className="w-3 h-3 text-[#D4AF37]" />
                          <a href={`mailto:${q.email}`} className="hover:text-white truncate">{q.email}</a>
                        </div>
                      )}
                      {(q.pickup_date || q.pickup_time) && (
                        <div>📅 {q.pickup_date} {q.pickup_time}</div>
                      )}
                      {q.passengers && <div>👥 {q.passengers} pax</div>}
                      {q.pickup_location && <div className="md:col-span-2 truncate">📍 Pick: {q.pickup_location}</div>}
                      {q.stops && q.stops.length > 0 && (
                        <div className="md:col-span-2 truncate">🚏 Stops: {q.stops.join(" → ")}</div>
                      )}
                      {q.dropoff_location && <div className="md:col-span-2 truncate">🎯 Drop: {q.dropoff_location}</div>}
                    </div>
                    {q.notes && (
                      <div className="mt-3 text-xs text-white/55 bg-white/[0.02] rounded-lg p-3 leading-relaxed">
                        <span className="text-[10px] uppercase tracking-wider text-white/35 mr-2">Notes</span>
                        {q.notes}
                      </div>
                    )}
                    <div className="text-[10px] text-white/35 mt-3">
                      Received {q.created_at ? new Date(q.created_at).toLocaleString() : "?"}
                      {q.confirmed_at && q.confirmation_number && (
                        <span className="ml-3 text-emerald-300/80">· Confirmed → #{q.confirmation_number}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 items-end flex-shrink-0">
                    {status !== "won" && (
                      <button
                        type="button"
                        onClick={() => setQuoteModal({ request: q, phase: "edit" })}
                        data-testid={`quote-send-${q.id}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#D4AF37] text-black text-xs font-semibold hover:bg-[#B3922E]"
                      >
                        <DollarSign className="w-3 h-3" /> {q.quoted_price ? "Re-send quote" : "Send quote"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setSuggestState({ request: q })}
                      data-testid={`quote-suggest-${q.id}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#D4AF37]/40 bg-[#D4AF37]/[0.07] text-[#D4AF37] text-xs hover:bg-[#D4AF37]/[0.15]"
                    >
                      <Sparkles className="w-3 h-3" /> Suggest affiliates
                    </button>
                    <a
                      href={`tel:${phoneTel}`}
                      data-testid={`quote-call-${q.id}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-transparent border border-white/15 text-white/75 text-xs hover:bg-white/5"
                    >
                      <Phone className="w-3 h-3" /> Call
                    </a>
                    <Select value={status} onValueChange={(v) => setStatus(q.id, v)}>
                      <SelectTrigger
                        data-testid={`quote-status-${q.id}`}
                        className="h-8 bg-[#0E0E0E] border-[#27272A] text-white text-xs w-32"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-[#0E0E0E] border-[#27272A] text-white">
                        <SelectItem value="new">New</SelectItem>
                        <SelectItem value="contacted">Contacted</SelectItem>
                        <SelectItem value="quoted">Quoted</SelectItem>
                        <SelectItem value="won">Won</SelectItem>
                        <SelectItem value="lost">Lost</SelectItem>
                      </SelectContent>
                    </Select>
                    <button
                      type="button"
                      onClick={() => remove(q)}
                      data-testid={`quote-delete-${q.id}`}
                      className="p-1.5 rounded text-white/35 hover:text-red-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <SendQuoteDialog
        state={quoteModal}
        onClose={() => setQuoteModal(null)}
        onSent={onQuoteSent}
      />

      <SuggestAffiliatesDialog
        state={suggestState}
        onClose={() => setSuggestState(null)}
      />

      <ImportLeadDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onCreated={(qr) => {
          // Prepend the freshly created lead so the operator sees it at the top
          setItems((arr) => [qr, ...arr]);
          setImportOpen(false);
        }}
      />
    </div>
  );
}

// ------- Modal: enter price/deposit/notes, optionally affiliate, then email + SMS -------

function SendQuoteDialog({ state, onClose, onSent }) {
  const q = state?.request;
  const phase = state?.phase || "edit";
  const [price, setPrice] = useState("");
  const [depositPct, setDepositPct] = useState("50");
  const [notes, setNotes] = useState("");
  const [affiliateCost, setAffiliateCost] = useState("");
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);
  // Editable trip details (added Feb 2026). Customers often text last-minute
  // changes — pickup time bump, new headcount, different drop. We let admin
  // patch these alongside the quote without forcing a resubmit.
  const [tripFields, setTripFields] = useState({
    full_name: "",
    phone: "",
    email: "",
    pickup_date: "",
    pickup_time: "",
    pickup_location: "",
    dropoff_location: "",
    passengers: "",
  });
  const updateTrip = (k) => (e) =>
    setTripFields((s) => ({ ...s, [k]: e.target.value }));

  useEffect(() => {
    if (q && phase === "edit") {
      setPrice(q.quoted_price ? String(q.quoted_price) : "");
      setDepositPct(q.deposit_pct ? String(q.deposit_pct) : "50");
      // Auto-fill notes from the vehicle-specific template when the field
      // is empty. Admin can edit or wipe; we never clobber existing notes.
      setNotes(q.quoted_notes || getDefaultNotesForVehicle(q.vehicle_type));
      setAffiliateCost(q.affiliate_cost ? String(q.affiliate_cost) : "");
      setTripFields({
        full_name: q.full_name || "",
        phone: q.phone || "",
        email: q.email || "",
        pickup_date: q.pickup_date || "",
        pickup_time: q.pickup_time || "",
        pickup_location: q.pickup_location || "",
        dropoff_location: q.dropoff_location || "",
        passengers: q.passengers != null ? String(q.passengers) : "",
      });
      setCopied(false);
    }
  }, [q, phase]);

  if (!state) return null;

  const numericPrice = Number(price);
  const numericPct = Number(depositPct);
  const deposit = isFinite(numericPrice) && isFinite(numericPct) ? (numericPrice * numericPct) / 100 : 0;
  const profit = isFinite(numericPrice) && affiliateCost ? numericPrice - Number(affiliateCost) : null;

  const send = async () => {
    if (!numericPrice || numericPrice < 1) {
      toast.error("Enter a valid price.");
      return;
    }
    setSending(true);
    try {
      // Strip blanks so we don't blow away unrelated fields. Number-cast
      // passengers since the input is a string.
      const tripPatch = {};
      Object.entries(tripFields).forEach(([k, v]) => {
        const t = (v ?? "").toString().trim();
        if (k === "passengers") {
          if (t !== "") tripPatch.passengers = Number(t);
        } else if (t !== "" || (q && q[k])) {
          tripPatch[k] = t || null;
        }
      });
      const { data } = await api.patch(`/admin/quote-requests/${q.id}`, {
        quoted_price: numericPrice,
        deposit_pct: numericPct,
        quoted_notes: notes || null,
        affiliate_cost: affiliateCost ? Number(affiliateCost) : null,
        status: "quoted",
        send_to_customer: true,
        ...tripPatch,
      });
      toast.success(data.sent_to ? `Quote emailed to ${data.sent_to}` : "Quote saved");
      onSent(data.quote, data.confirm_url, data.sent_to);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Couldn't send quote");
    } finally {
      setSending(false);
    }
  };

  const copyLink = async () => {
    if (!state.confirm_url) return;
    try {
      await navigator.clipboard.writeText(state.confirm_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Copy failed — long-press the link to copy manually.");
    }
  };

  return (
    <Dialog open={!!state} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        data-testid="send-quote-dialog"
        // Sticky form: accidental clicks outside the modal don't blow away
        // half-finished invoice text + custom pricing. ESC + X still close it.
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        className="bg-[#0c0c0c] border-[#1f1f1f] text-white max-w-lg max-h-[90vh] overflow-y-auto"
      >
        {phase === "sent" ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-white flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" /> Quote sent
              </DialogTitle>
              <DialogDescription className="text-white/55">
                {state.sent_to
                  ? <>Customer was emailed at <span className="text-white">{state.sent_to}</span> and texted at <span className="text-white">{q.phone}</span>.</>
                  : <>SMS was sent to <span className="text-white">{q.phone}</span>. No email on file.</>}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 mt-2">
              <label className="text-[10px] uppercase tracking-[0.18em] text-white/45">Confirm link (share manually if needed)</label>
              <div className="flex items-center gap-2">
                <Input
                  data-testid="quote-confirm-link"
                  readOnly
                  value={state.confirm_url || ""}
                  className="bg-[#0E0E0E] border-[#27272A] text-white text-xs"
                />
                <Button
                  type="button"
                  onClick={copyLink}
                  className="bg-[#D4AF37] text-black hover:bg-[#B3922E] flex-shrink-0"
                  data-testid="quote-copy-link"
                >
                  {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
              <p className="text-xs text-white/45 leading-relaxed">
                The customer can tap that link to view the trip details, then pay the deposit via Stripe in one tap. When they pay, this request flips to <span className="text-emerald-300">Won</span> automatically and a booking is created.
              </p>
            </div>
            <DialogFooter>
              <Button onClick={onClose} className="bg-white/10 hover:bg-white/15 text-white">Close</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="text-white">Send quote to {q?.full_name}</DialogTitle>
              <DialogDescription className="text-white/55">
                Sends a branded email + SMS with a one-tap <strong className="text-[#D4AF37]">Confirm &amp; Pay Deposit</strong> link.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {/* Editable trip + client fields. Lets admin patch last-minute
                  changes (pickup time bumps, new headcount, address fixes)
                  WITHOUT making the customer resubmit the quote form. */}
              <details className="rounded-lg border border-[#27272A] bg-[#0E0E0E] overflow-hidden">
                <summary className="cursor-pointer px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-white/55 hover:text-white/80 transition select-none">
                  Trip & client details (tap to edit)
                </summary>
                <div className="p-3 space-y-3 border-t border-[#1f1f1f]">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] uppercase tracking-[0.16em] text-white/45 block mb-1">Name</label>
                      <Input data-testid="qe-name" value={tripFields.full_name} onChange={updateTrip("full_name")} className="bg-[#0A0A0A] border-[#27272A] text-white h-9 text-sm" />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-[0.16em] text-white/45 block mb-1">Phone</label>
                      <Input data-testid="qe-phone" value={tripFields.phone} onChange={updateTrip("phone")} className="bg-[#0A0A0A] border-[#27272A] text-white h-9 text-sm" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-[0.16em] text-white/45 block mb-1">Email</label>
                    <Input data-testid="qe-email" value={tripFields.email} onChange={updateTrip("email")} className="bg-[#0A0A0A] border-[#27272A] text-white h-9 text-sm" />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[10px] uppercase tracking-[0.16em] text-white/45 block mb-1">Date</label>
                      <Input data-testid="qe-date" type="date" value={tripFields.pickup_date} onChange={updateTrip("pickup_date")} className="bg-[#0A0A0A] border-[#27272A] text-white h-9 text-sm" />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-[0.16em] text-white/45 block mb-1">Time</label>
                      <Input data-testid="qe-time" type="time" value={tripFields.pickup_time} onChange={updateTrip("pickup_time")} className="bg-[#0A0A0A] border-[#27272A] text-white h-9 text-sm" />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-[0.16em] text-white/45 block mb-1">Pax</label>
                      <Input data-testid="qe-pax" type="number" min="1" max="60" value={tripFields.passengers} onChange={updateTrip("passengers")} className="bg-[#0A0A0A] border-[#27272A] text-white h-9 text-sm" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-[0.16em] text-white/45 block mb-1">Pickup</label>
                    <Input data-testid="qe-pickup" value={tripFields.pickup_location} onChange={updateTrip("pickup_location")} className="bg-[#0A0A0A] border-[#27272A] text-white h-9 text-sm" />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-[0.16em] text-white/45 block mb-1">Drop-off</label>
                    <Input data-testid="qe-dropoff" value={tripFields.dropoff_location} onChange={updateTrip("dropoff_location")} className="bg-[#0A0A0A] border-[#27272A] text-white h-9 text-sm" />
                  </div>
                </div>
              </details>

              <div>
                <label className="text-[10px] uppercase tracking-[0.18em] text-white/45 mb-2 block">Flat rate (USD)</label>
                <Input
                  data-testid="quote-price-input"
                  type="number"
                  inputMode="decimal"
                  placeholder="e.g. 649"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="bg-[#0E0E0E] border-[#27272A] text-white text-lg h-12"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-[0.18em] text-white/45 mb-2 block">Deposit %</label>
                <Input
                  data-testid="quote-deposit-pct"
                  type="number"
                  inputMode="decimal"
                  value={depositPct}
                  onChange={(e) => setDepositPct(e.target.value)}
                  className="bg-[#0E0E0E] border-[#27272A] text-white"
                />
                {deposit > 0 && (
                  <div className="text-xs text-white/55 mt-2">
                    Customer pays <span className="text-[#D4AF37] font-semibold">{fmtMoney(deposit)}</span> deposit today, balance day-before.
                  </div>
                )}
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-[0.18em] text-white/45 mb-2 block">
                  Affiliate cost <span className="text-white/35 normal-case tracking-normal">(optional, internal only)</span>
                </label>
                <Input
                  data-testid="quote-affiliate-cost"
                  type="number"
                  inputMode="decimal"
                  placeholder="What you pay your affiliate (e.g. 480)"
                  value={affiliateCost}
                  onChange={(e) => setAffiliateCost(e.target.value)}
                  className="bg-[#0E0E0E] border-[#27272A] text-white"
                />
                {profit !== null && (
                  <div className="text-xs mt-2">
                    Your profit on this trip: <span className={profit >= 0 ? "text-emerald-400 font-semibold" : "text-red-400 font-semibold"}>{fmtMoney(profit)}</span>
                  </div>
                )}
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[10px] uppercase tracking-[0.18em] text-white/45 block">
                    Notes for customer <span className="text-white/35 normal-case tracking-normal">(shown on the confirm page · auto-filled from template)</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setNotes(getDefaultNotesForVehicle(q?.vehicle_type))}
                    data-testid="quote-notes-reset"
                    className="text-[10px] text-[#D4AF37] hover:text-[#B3922E] uppercase tracking-wider"
                  >
                    Reset to template
                  </button>
                </div>
                <Textarea
                  data-testid="quote-notes"
                  rows={8}
                  placeholder="e.g. Includes 3-hour minimum. Additional time billed at $150/hr in 30-min increments."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="bg-[#0E0E0E] border-[#27272A] text-white text-sm font-mono leading-relaxed"
                />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button onClick={onClose} disabled={sending} className="bg-white/10 hover:bg-white/15 text-white">Cancel</Button>
              <Button
                onClick={send}
                disabled={sending || !numericPrice}
                data-testid="quote-send-button"
                className="bg-[#D4AF37] text-black hover:bg-[#B3922E] disabled:opacity-60"
              >
                {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                Send quote to customer
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}


// ------- Modal: Suggested affiliates for a given quote request -------

function SuggestAffiliatesDialog({ state, onClose }) {
  const q = state?.request;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!q) {
      setData(null);
      return;
    }
    setLoading(true);
    api
      .get("/admin/affiliates/suggest", {
        params: {
          pickup: q.pickup_location || "",
          dropoff: q.dropoff_location || "",
          vehicle_type: q.vehicle_type || "",
        },
      })
      .then((res) => setData(res.data))
      .catch((err) => {
        toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Couldn't load suggestions");
        setData({ detected_region: null, affiliates: [], count: 0 });
      })
      .finally(() => setLoading(false));
  }, [q]);

  if (!state) return null;

  const copyAffiliateOutreachText = async (a) => {
    const text = `Hi ${a.contact_name || a.name},\n\nSourcing a ${q.vehicle_type} job:\n\n${q.pickup_date || ""} ${q.pickup_time || ""}\nPickup: ${q.pickup_location || "—"}\n${q.stops && q.stops.length > 0 ? `Stops: ${q.stops.join(" → ")}\n` : ""}Drop: ${q.dropoff_location || "—"}\n${q.passengers ? `Passengers: ${q.passengers}\n` : ""}${(q.trip_type || q.occasion) ? `Trip type: ${q.trip_type || q.occasion}\n` : ""}${q.service_duration ? `Duration: ${q.service_duration}\n` : ""}\nWhat's your best rate + minimum? Reply with quote.\n\nThanks — Adam · TuranElite Limo · (650) 410-0687`;
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`Outreach text copied — paste into SMS/email to ${a.name}`);
    } catch {
      toast.error("Couldn't copy. Long-press the text to copy manually.");
    }
  };

  return (
    <Dialog open={!!state} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        data-testid="suggest-affiliates-dialog"
        className="bg-[#0c0c0c] border-[#1f1f1f] text-white max-w-2xl max-h-[90vh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[#D4AF37]" /> Suggested affiliates
          </DialogTitle>
          <DialogDescription className="text-white/55">
            {loading
              ? "Finding affiliates that cover this trip..."
              : data?.detected_region
                ? <>Detected region: <span className="text-[#D4AF37] font-semibold">{data.detected_region}</span>{q?.vehicle_type ? <> · {q.vehicle_type}</> : null} · <span className="text-white">{data.count}</span> match{data.count === 1 ? "" : "es"}.</>
                : <>Couldn&apos;t auto-detect a region from the pickup/drop-off. Showing your full active roster.</>}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-12 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-[#D4AF37]" />
          </div>
        ) : data?.affiliates?.length === 0 ? (
          <div className="py-10 text-center text-white/55 text-sm">
            <div className="mb-3">No affiliates cover {data.detected_region || "this region"} yet.</div>
            <a
              href="/admin#affiliates"
              className="inline-flex items-center gap-1 text-[#D4AF37] text-xs underline"
            >
              Add one to your roster <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        ) : (
          <div className="space-y-3 mt-2">
            {data.affiliates.map((a) => {
              const phoneTel = (a.phone || "").replace(/[^\d+]/g, "");
              return (
                <div
                  key={a.id}
                  data-testid={`suggested-affiliate-${a.id}`}
                  className="rounded-xl border border-white/10 bg-white/[0.02] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-white font-medium">{a.name}</div>
                      {a.contact_name && <div className="text-white/50 text-xs mt-0.5">{a.contact_name}</div>}
                      <div className="flex flex-wrap gap-1.5 mt-2.5">
                        {(a.service_areas || []).slice(0, 4).map((s) => (
                          <span key={s} className="px-2 py-0.5 rounded-full bg-white/5 text-white/55 text-[10px]">{s}</span>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 flex-shrink-0">
                      {a.phone && (
                        <a
                          href={`tel:${phoneTel}`}
                          className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-300 text-xs border border-emerald-500/30 hover:bg-emerald-500/20"
                        >
                          <Phone className="w-3 h-3" /> Call
                        </a>
                      )}
                      {a.phone && (
                        <a
                          href={`sms:${phoneTel}`}
                          className="inline-flex items-center gap-1 px-3 py-1 rounded-full border border-white/15 text-white/75 text-xs hover:bg-white/5"
                        >
                          <MessageSquare className="w-3 h-3" /> SMS
                        </a>
                      )}
                      {a.email && (
                        <a
                          href={`mailto:${a.email}`}
                          className="inline-flex items-center gap-1 px-3 py-1 rounded-full border border-white/15 text-white/75 text-xs hover:bg-white/5"
                        >
                          <Mail className="w-3 h-3" /> Email
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between gap-3">
                    <div className="text-[11px] text-white/45">
                      {(a.vehicle_types || []).join(" · ") || "Vehicle types not set"}
                    </div>
                    <button
                      type="button"
                      onClick={() => copyAffiliateOutreachText(a)}
                      data-testid={`copy-outreach-${a.id}`}
                      className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[#D4AF37] text-black text-xs font-semibold hover:bg-[#B3922E]"
                    >
                      <Copy className="w-3 h-3" /> Copy outreach text
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <DialogFooter className="mt-4">
          <Button onClick={onClose} className="bg-white/10 hover:bg-white/15 text-white">Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


// ------- Modal: paste-import an off-platform lead (Yelp / Google / phone) -------
//
// Two-step flow: (1) PARSE — paste raw text + source, LLM extracts fields and
// returns a risk score; (2) COMMIT — admin reviews/edits the extracted fields
// and clicks "Create Quote Request" which inserts the row into the same
// quote_requests collection as website-submitted leads.

const LEAD_SOURCES = [
  { value: "yelp", label: "Yelp" },
  { value: "google_business", label: "Google Business Profile" },
  { value: "phone_call", label: "Phone Call" },
  { value: "email", label: "Email" },
  { value: "referral", label: "Referral" },
  { value: "other", label: "Other" },
];

function ImportLeadDialog({ open, onClose, onCreated }) {
  const [source, setSource] = useState("yelp");
  const [rawText, setRawText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [extracted, setExtracted] = useState(null);
  const [risk, setRisk] = useState(null);

  useEffect(() => {
    if (!open) {
      // Reset everything on close so the next open is a clean slate
      setRawText("");
      setExtracted(null);
      setRisk(null);
      setSource("yelp");
    }
  }, [open]);

  const parse = async () => {
    if (!rawText.trim()) {
      toast.error("Paste the lead text first.");
      return;
    }
    setParsing(true);
    setExtracted(null);
    setRisk(null);
    try {
      const { data } = await api.post("/admin/quote-requests/import-lead", {
        source,
        raw_text: rawText.trim(),
      });
      setExtracted(data.extracted || {});
      setRisk(data.risk || null);
      toast.success("Lead parsed. Review the fields below before importing.");
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Parsing failed");
    } finally {
      setParsing(false);
    }
  };

  const commit = async () => {
    if (!extracted) return;
    if (
      !(extracted.full_name || "").trim() &&
      !(extracted.phone || "").trim() &&
      !(extracted.email || "").trim()
    ) {
      toast.error("At least one of name, phone, or email is required.");
      return;
    }
    setCommitting(true);
    try {
      const { data } = await api.post("/admin/quote-requests/import-lead/commit", {
        source,
        raw_text: rawText.trim(),
        fields: extracted,
      });
      toast.success("Lead imported into Quote Requests.");
      onCreated && onCreated(data.quote_request);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Couldn't import lead");
    } finally {
      setCommitting(false);
    }
  };

  // Tiny helper to keep the field-update glue DRY
  const update = (key, value) => setExtracted((prev) => ({ ...(prev || {}), [key]: value }));

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="bg-[#0A0A0A] border border-[#1F1F1F] text-white max-w-3xl max-h-[90vh] overflow-y-auto"
        data-testid="import-lead-dialog"
      >
        <DialogHeader>
          <DialogTitle className="text-white font-serif text-xl">Import off-platform lead</DialogTitle>
          <DialogDescription className="text-white/55 text-xs leading-relaxed">
            Paste the raw lead text from Yelp, Google Business Profile, a voicemail transcript,
            or an inbound email. AI extracts the structured fields and runs the safety risk score
            automatically. Review the extracted fields before importing.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-white/45 mb-1">Lead source</div>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger
                className="bg-[#0E0E0E] border-[#27272A] text-white h-10"
                data-testid="import-lead-source"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#0A0A0A] border-[#1F1F1F] text-white">
                {LEAD_SOURCES.map((s) => (
                  <SelectItem key={s.value} value={s.value} className="focus:bg-white/10">
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-wider text-white/45 mb-1">Raw lead text</div>
            <Textarea
              data-testid="import-lead-raw"
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="Paste the full lead message here. Include name, phone, dates, addresses — anything the customer wrote."
              rows={8}
              className="bg-[#0E0E0E] border-[#27272A] text-white font-mono text-xs leading-relaxed"
            />
            <div className="text-[10px] text-white/40 mt-1">{rawText.length} / 8000 chars</div>
          </div>

          <Button
            onClick={parse}
            disabled={parsing || !rawText.trim()}
            data-testid="import-lead-parse"
            className="bg-[#D4AF37] text-black hover:bg-[#B3922E]"
          >
            {parsing ? (
              <>
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Parsing…
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-1.5" /> Parse with AI
              </>
            )}
          </Button>

          {extracted && (
            <div
              className="rounded-xl border border-[#1F1F1F] bg-[#0E0E0E] p-4 space-y-4"
              data-testid="import-lead-extracted"
            >
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="text-xs uppercase tracking-wider text-[#D4AF37] font-semibold">
                  Extracted fields — review &amp; edit
                </div>
                {risk && (
                  <RiskBadge score={risk.score} band={risk.band} />
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Full name" value={extracted.full_name || ""} onChange={(v) => update("full_name", v)} testid="il-name" />
                <Field label="Phone" value={extracted.phone || ""} onChange={(v) => update("phone", v)} testid="il-phone" />
                <Field label="Email" value={extracted.email || ""} onChange={(v) => update("email", v)} testid="il-email" />
                <Field label="Vehicle type" value={extracted.vehicle_type || ""} onChange={(v) => update("vehicle_type", v)} testid="il-vehicle" />
                <Field label="Pickup date" value={extracted.pickup_date || ""} onChange={(v) => update("pickup_date", v)} placeholder="YYYY-MM-DD" testid="il-date" />
                <Field label="Pickup time" value={extracted.pickup_time || ""} onChange={(v) => update("pickup_time", v)} placeholder="HH:MM" testid="il-time" />
                <Field label="Pickup location" value={extracted.pickup_location || ""} onChange={(v) => update("pickup_location", v)} testid="il-pickup" />
                <Field label="Dropoff location" value={extracted.dropoff_location || ""} onChange={(v) => update("dropoff_location", v)} testid="il-dropoff" />
                <Field
                  label="Passengers"
                  value={extracted.passengers != null ? String(extracted.passengers) : ""}
                  onChange={(v) => update("passengers", v ? Number(v.replace(/[^\d]/g, "")) || null : null)}
                  testid="il-pax"
                />
                <Field label="Occasion" value={extracted.occasion || ""} onChange={(v) => update("occasion", v)} testid="il-occasion" />
              </div>

              <div>
                <div className="text-[10px] uppercase tracking-wider text-white/45 mb-1">Notes</div>
                <Textarea
                  data-testid="il-notes"
                  value={extracted.notes || ""}
                  onChange={(e) => update("notes", e.target.value)}
                  rows={3}
                  className="bg-[#0A0A0A] border-[#27272A] text-white text-sm"
                />
              </div>

              {risk && risk.flags && risk.flags.length > 0 && (
                <div className="rounded-lg border border-[#1F1F1F] bg-[#0A0A0A] p-3 space-y-1">
                  <div className="text-[10px] uppercase tracking-wider text-white/45">Risk flags</div>
                  {risk.flags.map((f, i) => (
                    <div key={i} className="text-xs text-white/80 flex justify-between">
                      <span>{f.label}</span>
                      <span className="text-amber-300 tabular-nums">+{f.weight}</span>
                    </div>
                  ))}
                </div>
              )}

              {extracted.suggested_reply && (
                <div
                  className="rounded-lg border border-[#D4AF37]/30 bg-[#D4AF37]/5 p-3 space-y-2"
                  data-testid="suggested-reply"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="text-[10px] uppercase tracking-wider text-[#D4AF37] font-semibold flex items-center gap-1">
                      <Sparkles className="w-3 h-3" /> AI-drafted reply for the customer
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      data-testid="copy-reply"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(extracted.suggested_reply || "");
                          toast.success("Reply copied — paste it into Yelp / SMS / email.");
                        } catch (e) {
                          toast.error("Couldn't copy to clipboard");
                        }
                      }}
                      className="h-7 px-2 text-xs bg-transparent border-[#D4AF37]/40 text-[#D4AF37] hover:bg-[#D4AF37]/10"
                    >
                      <Copy className="w-3 h-3 mr-1" /> Copy
                    </Button>
                  </div>
                  <Textarea
                    value={extracted.suggested_reply || ""}
                    onChange={(e) => update("suggested_reply", e.target.value)}
                    rows={6}
                    className="bg-[#0A0A0A] border-[#27272A] text-white text-sm leading-relaxed"
                  />
                  <div className="text-[10px] text-white/45 leading-relaxed">
                    Edit anything that doesn&apos;t match your voice, then copy & paste back to the customer.
                    Sends as plain text — works on Yelp, SMS, email, or in-app messaging.
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="mt-4 gap-2">
          <Button
            onClick={onClose}
            variant="outline"
            className="bg-transparent border-[#27272A] text-white/70 hover:bg-white/5"
          >
            Cancel
          </Button>
          <Button
            onClick={commit}
            disabled={!extracted || committing}
            data-testid="import-lead-commit"
            className="bg-[#D4AF37] text-black hover:bg-[#B3922E]"
          >
            {committing ? (
              <>
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Importing…
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4 mr-1.5" /> Create quote request
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Small labelled input. Local to the ImportLeadDialog so we don't pollute the
// global component surface — kept inline because it's truly a one-off use case.
function Field({ label, value, onChange, placeholder, testid }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-white/45 mb-1">{label}</div>
      <Input
        data-testid={testid}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="bg-[#0A0A0A] border-[#27272A] text-white h-9 text-sm"
      />
    </div>
  );
}
