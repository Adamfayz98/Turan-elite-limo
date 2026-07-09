import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, MessageSquare, Phone, Mail, Trash2, DollarSign, Send, Copy, CheckCircle2, Sparkles, ExternalLink, ClipboardPaste, Tag, TrendingUp, Gift, FileText, Download, Truck, Wand2 } from "lucide-react";

import VehiclePickerDialog from "@/components/admin/VehiclePickerDialog";

import { api, formatApiErrorDetail } from "@/lib/api";
import {
  estimateQuote,
  parseHours,
  computeMargin,
  marginBand,
  fmtPct,
  MARGIN_FLOOR,
  MARGIN_TARGET,
} from "@/lib/pricingReference";
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

// ----- Profit Preview Chip -----
// Tiny inline pill showing the recommended floor + target retail prices for a
// quote based on its vehicle type and service duration. Pulled from
// pricingReference.js so it stays in sync with PRICING_REFERENCE.md. Renders
// nothing if we don't have rate data for that vehicle.

function ProfitPreviewChip({ request }) {
  const hours = parseHours(request?.service_duration);
  const est = estimateQuote({ vehicleType: request?.vehicle_type, hours });
  if (!est) return null;

  // If a quote was already sent, color-code based on the actual margin.
  if (request?.quoted_price) {
    const margin = computeMargin(request.quoted_price, est.net);
    const band = margin ? marginBand(margin.margin_pct) : "neutral";
    const styles = {
      red: "text-red-300 bg-red-500/10 border-red-500/30",
      yellow: "text-amber-300 bg-amber-500/10 border-amber-500/30",
      green: "text-emerald-300 bg-emerald-500/10 border-emerald-500/30",
      gold: "text-[#D4AF37] bg-[#D4AF37]/10 border-[#D4AF37]/30",
      neutral: "text-white/55 bg-white/5 border-white/10",
    };
    return (
      <span
        data-testid={`profit-margin-${request.id}`}
        title={`Net ~${fmtMoney(est.net)} for ${est.billable_hours}hr @ $${est.hourly}/hr`}
        className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border ${styles[band]}`}
      >
        <TrendingUp className="w-2.5 h-2.5" />
        {margin ? fmtPct(margin.margin_pct) : "—"} margin
      </span>
    );
  }

  return (
    <span
      data-testid={`profit-floor-${request.id}`}
      title={`Suggested net ${fmtMoney(est.net)} (${est.billable_hours}hr @ $${est.hourly}/hr). Floor ${fmtMoney(est.floor)} = 20% margin · Target ${fmtMoney(est.target)} = 27.5%.`}
      className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-[#D4AF37] bg-[#D4AF37]/10 border border-[#D4AF37]/20 px-2 py-0.5 rounded"
    >
      <TrendingUp className="w-2.5 h-2.5" />
      Floor {fmtMoney(est.floor)} · Target {fmtMoney(est.target)}
    </span>
  );
}

export default function QuoteRequestsTab({ onQuoteChange } = {}) {
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
        onQuoteChange?.(id, { status });
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
      onQuoteChange?.(q.id, null);
      toast.success("Removed");
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Delete failed");
    }
  };

  const onQuoteSent = (updatedRequest, confirmUrl, sentTo) => {
    setItems((arr) => arr.map((x) => (x.id === updatedRequest.id ? { ...x, ...updatedRequest } : x)));
    onQuoteChange?.(updatedRequest.id, updatedRequest);
    setQuoteModal({ request: updatedRequest, confirm_url: confirmUrl, sent_to: sentTo, phase: "sent" });
  };

  const newCount = items.filter((q) => (q.status || "new") === "new").length;

  // "Suggested affiliates" modal state (per-quote)
  const [suggestState, setSuggestState] = useState(null); // { request }

  // "Save with promo code" modal — auto-generates a single-use discount code
  // we can offer a price-sensitive lead as a sweetener instead of dropping
  // below the floor on the current trip.
  const [promoState, setPromoState] = useState(null); // { request }

  // "Dispatch PDF" modal — lets the operator stamp the affiliate name + agreed
  // rate + custom instructions onto the PII-stripped dispatch sheet before
  // downloading. Avoids round-trips to retype operator info each time.
  const [dispatchState, setDispatchState] = useState(null); // { request }

  // "Draft SMS" modal — AI-generates a context-aware SMS for any of the
  // common scenarios (initial outreach, follow-up nudge, final close,
  // thank-you-after-deposit). One-tap copy-to-clipboard.
  const [smsState, setSmsState] = useState(null); // { request }

  // "Import Lead" modal — paste raw Yelp / Google / phone-call text and the
  // backend LLM extracts structured fields. See <ImportLeadModal/>.
  const [importOpen, setImportOpen] = useState(false);

  // "Vehicle Picker" — decision-support tool: pax + occasion → ranked
  // vehicle recommendations + margin bands. Pulled from PRICING_REFERENCE.
  const [pickerOpen, setPickerOpen] = useState(false);

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
            onClick={() => setPickerOpen(true)}
            data-testid="vehicle-picker-open"
            variant="outline"
            size="sm"
            className="bg-transparent border-white/15 text-white/75 hover:bg-white/5 hover:text-white"
          >
            <Truck className="w-4 h-4 mr-1.5" />
            Vehicle picker
          </Button>
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
                      {/* Big green PAID pill — primary signal that the
                          customer ran the deposit. Operator MUST see this
                          first because it changes everything downstream
                          (no more "send quote", switch to "edit trip"). */}
                      {q.confirmed_at && q.confirmation_number && (
                        <span
                          data-testid={`quote-paid-badge-${q.id}`}
                          className="inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.16em] font-bold text-emerald-100 bg-emerald-500/25 border border-emerald-400/60 px-2.5 py-0.5 rounded-full shadow-[0_0_12px_rgba(16,185,129,0.25)]"
                          title={`Customer paid deposit at ${new Date(q.confirmed_at).toLocaleString()}`}
                        >
                          <CheckCircle2 className="w-3 h-3" /> PAID · #{q.confirmation_number}
                        </span>
                      )}
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
                      <ProfitPreviewChip request={q} />
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
                    {status === "won" ? (
                      // Customer already paid — the "Send quote" path is gone,
                      // but the operator STILL needs the same dialog to edit
                      // trip details (pickup time, stops, etc.) via the
                      // "Save trip changes only" button inside. Replacing the
                      // button with an "Edit trip" label keeps the workflow
                      // discoverable.
                      <button
                        type="button"
                        onClick={() => setQuoteModal({ request: q, phase: "edit" })}
                        data-testid={`quote-edit-trip-${q.id}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/15 text-emerald-200 border border-emerald-500/40 text-xs font-semibold hover:bg-emerald-500/25"
                        title="Customer already paid — edit pickup time, stops, or trip details without re-emailing them"
                      >
                        <CheckCircle2 className="w-3 h-3" /> Edit trip details
                      </button>
                    ) : (
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
                    <button
                      type="button"
                      onClick={() => setPromoState({ request: q })}
                      data-testid={`quote-promo-${q.id}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/[0.07] text-emerald-300 text-xs hover:bg-emerald-500/[0.15]"
                      title="Generate a single-use future-trip promo code to close a price-sensitive lead"
                    >
                      <Gift className="w-3 h-3" /> Save with promo
                    </button>
                    <button
                      type="button"
                      onClick={() => setDispatchState({ request: q })}
                      data-testid={`quote-dispatch-${q.id}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-sky-500/40 bg-sky-500/[0.07] text-sky-300 text-xs hover:bg-sky-500/[0.15]"
                      title="Generate PII-stripped affiliate dispatch PDF (last-name initial only, no phone, no full address)"
                    >
                      <FileText className="w-3 h-3" /> Affiliate dispatch PDF
                    </button>
                    <button
                      type="button"
                      onClick={() => setSmsState({ request: q })}
                      data-testid={`quote-sms-${q.id}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-purple-500/40 bg-purple-500/[0.07] text-purple-300 text-xs hover:bg-purple-500/[0.15]"
                      title="AI-draft an SMS reply (initial outreach, follow-up, final nudge, or thank-you)"
                    >
                      <Wand2 className="w-3 h-3" /> Draft SMS
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
        onSavedOnly={(updatedRequest) => {
          // Save-only path: update the row in the list, close the dialog,
          // don't flip to the "Quote sent" success screen. This is the
          // post-payment edit flow — customer was NOT re-contacted.
          setItems((arr) => arr.map((x) => (x.id === updatedRequest.id ? { ...x, ...updatedRequest } : x)));
          onQuoteChange?.(updatedRequest.id, updatedRequest);
          setQuoteModal(null);
        }}
      />

      <SuggestAffiliatesDialog
        state={suggestState}
        onClose={() => setSuggestState(null)}
      />

      <SavePromoDialog
        state={promoState}
        onClose={() => setPromoState(null)}
      />

      <DispatchPdfDialog
        state={dispatchState}
        onClose={() => setDispatchState(null)}
      />

      <DraftSmsDialog
        state={smsState}
        onClose={() => setSmsState(null)}
      />

      <ImportLeadDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onCreated={(qr) => {
          // Prepend the freshly created lead so the operator sees it at the top
          setItems((arr) => [qr, ...arr]);
          onQuoteChange?.(qr.id, qr);
          setImportOpen(false);
        }}
      />

      <VehiclePickerDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
      />
    </div>
  );
}

// ------- Modal: enter price/deposit/notes, optionally affiliate, then email + SMS -------

function SendQuoteDialog({ state, onClose, onSent, onSavedOnly }) {
  const q = state?.request;
  const phase = state?.phase || "edit";
  const [price, setPrice] = useState("");
  const [depositPct, setDepositPct] = useState("50");
  const [notes, setNotes] = useState("");
  // `invoiceNotes` = trip-specific text rendered ABOVE the policies on the
  // auto-generated PDF invoice. The 10 standard policies are baked in by the
  // backend; this textarea is just for one-off details per booking.
  const [invoiceNotes, setInvoiceNotes] = useState("");
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
  // Stops are stored as an array (not a flat input). Customer often forgets
  // to enter them at request time; we learn them on the phone/SMS. Editing
  // them here flows into both the invoice PDF and the affiliate dispatch PDF.
  const [stops, setStops] = useState([]);
  const updateTrip = (k) => (e) =>
    setTripFields((s) => ({ ...s, [k]: e.target.value }));

  useEffect(() => {
    if (q && phase === "edit") {
      setPrice(q.quoted_price ? String(q.quoted_price) : "");
      setDepositPct(q.deposit_pct ? String(q.deposit_pct) : "50");
      // Auto-fill notes from the vehicle-specific template when the field
      // is empty. Admin can edit or wipe; we never clobber existing notes.
      setNotes(q.quoted_notes || getDefaultNotesForVehicle(q.vehicle_type));
      setInvoiceNotes(q.invoice_notes || "");
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
      setStops(Array.isArray(q.stops) ? q.stops.filter(Boolean) : []);
      setCopied(false);
    }
  }, [q, phase]);

  if (!state) return null;

  const numericPrice = Number(price);
  const numericPct = Number(depositPct);
  const deposit = isFinite(numericPrice) && isFinite(numericPct) ? (numericPrice * numericPct) / 100 : 0;

  // ----- Profit Preview math -----
  // Pull suggested net cost from the affiliate rate table. Customer-entered
  // affiliate_cost wins, but if blank we fall back to the suggested net so the
  // margin chip stays useful as soon as the price is typed.
  const hoursFromRequest = parseHours(q?.service_duration);
  const estimate = estimateQuote({ vehicleType: q?.vehicle_type, hours: hoursFromRequest });
  const effectiveNet = affiliateCost ? Number(affiliateCost) : (estimate ? estimate.net : null);
  const margin = isFinite(numericPrice) && numericPrice > 0 && effectiveNet != null
    ? computeMargin(numericPrice, effectiveNet)
    : null;
  const band = margin ? marginBand(margin.margin_pct) : "neutral";
  const bandStyles = {
    red: { chip: "bg-red-500/15 text-red-300 border-red-500/40", num: "text-red-300" },
    yellow: { chip: "bg-amber-500/15 text-amber-300 border-amber-500/40", num: "text-amber-300" },
    green: { chip: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40", num: "text-emerald-300" },
    gold: { chip: "bg-[#D4AF37]/20 text-[#D4AF37] border-[#D4AF37]/40", num: "text-[#D4AF37]" },
    neutral: { chip: "bg-white/5 text-white/55 border-white/15", num: "text-white/70" },
  };
  const usingSuggestedNet = !affiliateCost && estimate != null;

  const send = async () => {
    if (!numericPrice || numericPrice < 1) {
      toast.error("Enter a valid price.");
      return;
    }
    // Affiliate cost is required on the send-to-customer path because it
    // feeds the profit-based Google Ads offline-conversion CSV. If it's
    // blank we'd upload $0 profit and destroy Smart Bidding signal.
    const numericAffiliateCost = Number(affiliateCost);
    if (!affiliateCost || !isFinite(numericAffiliateCost) || numericAffiliateCost <= 0) {
      toast.error("Enter the affiliate cost — required so Google Ads bids on real profit.");
      return;
    }
    if (numericAffiliateCost >= numericPrice) {
      toast.error("Affiliate cost is ≥ retail price — that's a loss. Double-check before sending.");
      return;
    }
    await _submit(true);
  };

  // "Save trip changes only" — same patch endpoint, but skips the customer
  // email. Use this when the customer has already paid (booking is locked)
  // and just texts in changes: noon instead of 1pm, added a stop, etc.
  // Skips price validation since we're not (re-)quoting.
  const saveTripOnly = async () => {
    await _submit(false);
  };

  const _submit = async (sendEmail) => {
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
      const body = {
        deposit_pct: numericPct,
        quoted_notes: notes || null,
        invoice_notes: invoiceNotes || null,
        affiliate_cost: affiliateCost ? Number(affiliateCost) : null,
        // Stops are stored as an array. Empty values are filtered so a customer
        // who never had stops doesn't get an awkward "[]" on their PDF.
        stops: stops.map((s) => (s || "").trim()).filter(Boolean),
        ...tripPatch,
      };
      // Price + status + email-send only on the "send to customer" path.
      // Save-only never re-prices and never re-emails (avoids confusing a
      // customer who's already paid the deposit).
      if (sendEmail) {
        body.quoted_price = numericPrice;
        body.status = "quoted";
        body.send_to_customer = true;
      } else if (numericPrice) {
        body.quoted_price = numericPrice;
      }
      const { data } = await api.patch(`/admin/quote-requests/${q.id}`, body);
      if (sendEmail) {
        toast.success(data.sent_to ? `Quote emailed to ${data.sent_to}` : "Quote saved");
        onSent(data.quote, data.confirm_url, data.sent_to);
      } else {
        // Save-only path: nothing was emailed or texted. DON'T flip the dialog
        // to the "sent" success screen (that screen says "SMS was sent to ..."
        // which would be a lie). Just refresh the row + close the dialog.
        toast.success("Trip details saved · customer was NOT emailed or texted");
        onSavedOnly(data.quote);
      }
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Save failed");
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

                {/* Stops editor — customers often forget to list these at
                    request time and we hear about them on the call. Adding
                    them here flows them into BOTH the customer invoice PDF
                    AND the affiliate dispatch PDF automatically. */}
                <div className="mt-3">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] uppercase tracking-[0.16em] text-white/45 block">
                      Additional stops <span className="text-white/35 normal-case tracking-normal">({stops.length} added — appears on both PDFs)</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setStops((s) => [...s, ""])}
                      data-testid="qe-add-stop"
                      className="text-[10px] text-[#D4AF37] hover:text-[#B3922E] uppercase tracking-wider"
                    >
                      + Add stop
                    </button>
                  </div>
                  {stops.length === 0 ? (
                    <div className="text-[11px] text-white/35 italic px-1">No stops yet — customer route is direct pickup → drop-off.</div>
                  ) : (
                    <div className="space-y-1.5">
                      {stops.map((s, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="text-[10px] text-white/30 font-mono w-6 text-right">{i + 1}.</span>
                          <Input
                            data-testid={`qe-stop-${i}`}
                            value={s}
                            placeholder={`Stop ${i + 1} — e.g. "Safeway, Palo Alto" or "Stanford Memorial Church"`}
                            onChange={(e) => setStops((arr) => arr.map((v, idx) => idx === i ? e.target.value : v))}
                            className="bg-[#0A0A0A] border-[#27272A] text-white h-9 text-sm flex-1"
                          />
                          <button
                            type="button"
                            onClick={() => setStops((arr) => arr.filter((_, idx) => idx !== i))}
                            data-testid={`qe-remove-stop-${i}`}
                            className="text-white/35 hover:text-red-300 px-2"
                            title="Remove this stop"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
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
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[10px] uppercase tracking-[0.18em] text-white/45 block">
                    Affiliate cost <span className="text-red-400 normal-case tracking-normal" aria-label="required">*</span>
                    <span className="text-white/35 normal-case tracking-normal"> (internal · required for profit-based Google Ads)</span>
                  </label>
                  {estimate && !affiliateCost && (
                    <button
                      type="button"
                      onClick={() => setAffiliateCost(String(estimate.net))}
                      data-testid="affiliate-cost-autofill"
                      className="text-[10px] text-[#D4AF37] hover:text-[#B3922E] uppercase tracking-wider"
                      title={`${estimate.billable_hours}hr × $${estimate.hourly}/hr = ${fmtMoney(estimate.net)}`}
                    >
                      Use suggested {fmtMoney(estimate.net)}
                    </button>
                  )}
                </div>
                <Input
                  data-testid="quote-affiliate-cost"
                  type="number"
                  inputMode="decimal"
                  placeholder={estimate ? `Suggested ${fmtMoney(estimate.net)} — ${estimate.billable_hours}hr × $${estimate.hourly}/hr` : "What you pay your affiliate (e.g. 680)"}
                  value={affiliateCost}
                  onChange={(e) => setAffiliateCost(e.target.value)}
                  className="bg-[#0E0E0E] border-[#27272A] text-white"
                />
                {usingSuggestedNet && (
                  <div className="text-[10px] text-white/40 mt-1.5 leading-relaxed">
                    Using suggested net of {fmtMoney(estimate.net)} from <code className="text-white/60">PRICING_REFERENCE.md</code> for {q?.vehicle_type}.
                    Override the field above if your affiliate quoted differently.
                  </div>
                )}
              </div>

              {/* Live margin preview — always visible once price + net exist */}
              {margin && (
                <div
                  data-testid="profit-preview-panel"
                  className={`rounded-xl border p-3.5 space-y-2 ${bandStyles[band].chip}`}
                >
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4" />
                      <span className="text-[10px] uppercase tracking-[0.18em] font-semibold">Profit preview</span>
                    </div>
                    <div className={`text-lg font-bold tabular-nums ${bandStyles[band].num}`}>
                      {fmtPct(margin.margin_pct)} margin
                    </div>
                  </div>
                  <div className="text-xs text-white/75 leading-relaxed">
                    Retail <span className="font-semibold">{fmtMoney(numericPrice)}</span> − Net <span className="font-semibold">{fmtMoney(effectiveNet)}</span> = <span className={`font-semibold ${bandStyles[band].num}`}>{fmtMoney(margin.profit)}</span> profit
                  </div>
                  {margin.margin_pct < MARGIN_FLOOR && (
                    <div className="text-xs leading-relaxed border-t border-current/20 pt-2 mt-2 opacity-90">
                      ⚠ <strong>Below 20% floor.</strong> {estimate
                        ? <>Raise retail to at least <span className="font-semibold">{fmtMoney(estimate.floor)}</span> for 20% or <span className="font-semibold">{fmtMoney(estimate.target)}</span> for 27.5% target.</>
                        : <>This trip is razor-thin or losing money. Renegotiate net cost or raise retail.</>}
                    </div>
                  )}
                  {margin.margin_pct >= MARGIN_FLOOR && margin.margin_pct < MARGIN_TARGET && estimate && (
                    <div className="text-xs leading-relaxed border-t border-current/20 pt-2 mt-2 opacity-90">
                      Acceptable. Target retail is <span className="font-semibold">{fmtMoney(estimate.target)}</span> (27.5%) if customer isn&apos;t price-shopping.
                    </div>
                  )}
                </div>
              )}

              {/* Recommended retail bands reference card — shows when we know the
                  vehicle's rates AND the operator hasn't typed a price yet */}
              {estimate && !numericPrice && (
                <div
                  data-testid="retail-bands-card"
                  className="rounded-xl border border-[#D4AF37]/25 bg-[#D4AF37]/[0.04] p-3.5 space-y-2"
                >
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-[#D4AF37]" />
                    <span className="text-[10px] uppercase tracking-[0.18em] font-semibold text-[#D4AF37]">
                      Recommended retail · {estimate.billable_hours}hr × ${estimate.hourly}/hr net
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <button
                      type="button"
                      onClick={() => setPrice(String(estimate.floor))}
                      data-testid="band-floor"
                      className="rounded-lg bg-red-500/10 border border-red-500/30 px-2 py-2 hover:bg-red-500/15 transition"
                    >
                      <div className="text-[9px] uppercase tracking-wider text-red-300/80">Floor 20%</div>
                      <div className="text-sm font-semibold text-red-200 tabular-nums">{fmtMoney(estimate.floor)}</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPrice(String(estimate.target))}
                      data-testid="band-target"
                      className="rounded-lg bg-emerald-500/10 border border-emerald-500/40 px-2 py-2 hover:bg-emerald-500/15 transition"
                    >
                      <div className="text-[9px] uppercase tracking-wider text-emerald-300/80">Target 27.5%</div>
                      <div className="text-sm font-semibold text-emerald-200 tabular-nums">{fmtMoney(estimate.target)}</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPrice(String(estimate.premium))}
                      data-testid="band-premium"
                      className="rounded-lg bg-[#D4AF37]/10 border border-[#D4AF37]/40 px-2 py-2 hover:bg-[#D4AF37]/15 transition"
                    >
                      <div className="text-[9px] uppercase tracking-wider text-[#D4AF37]/80">Premium 35%</div>
                      <div className="text-sm font-semibold text-[#D4AF37] tabular-nums">{fmtMoney(estimate.premium)}</div>
                    </button>
                  </div>
                  <div className="text-[10px] text-white/45 leading-relaxed pt-1">
                    Tap a band to autofill the retail price field.
                  </div>
                </div>
              )}
              <div>
                <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                  <label className="text-[10px] uppercase tracking-[0.18em] text-white/45 block">
                    Notes for customer <span className="text-white/35 normal-case tracking-normal">(shown on the confirm page · auto-filled from template)</span>
                  </label>
                  <div className="flex items-center gap-3">
                    <AIDraftButton
                      data-testid="ai-draft-customer-notes"
                      mode="customer_notes"
                      context={{
                        vehicle_type: q?.vehicle_type,
                        occasion: q?.trip_type || q?.occasion,
                        passengers: tripFields.passengers || q?.passengers,
                        pickup_date: tripFields.pickup_date || q?.pickup_date,
                        pickup_time: tripFields.pickup_time || q?.pickup_time,
                        pickup_location: tripFields.pickup_location || q?.pickup_location,
                        dropoff_location: tripFields.dropoff_location || q?.dropoff_location,
                        stops: stops.filter(Boolean),
                        service_duration: q?.service_duration,
                        special_notes: q?.notes,
                      }}
                      onDraft={(text) => setNotes(text)}
                      label="Draft with AI"
                    />
                    <button
                      type="button"
                      onClick={() => setNotes(getDefaultNotesForVehicle(q?.vehicle_type))}
                      data-testid="quote-notes-reset"
                      className="text-[10px] text-[#D4AF37] hover:text-[#B3922E] uppercase tracking-wider"
                    >
                      Reset to template
                    </button>
                  </div>
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

              {/* Trip-specific notes for the PDF invoice. Rendered ABOVE the
                  standard policies — the 10 policies are baked in automatically
                  by the backend, so this field is purely for one-off details
                  per booking. */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[10px] uppercase tracking-[0.18em] text-white/45 block">
                    Trip-specific notes for invoice PDF <span className="text-white/35 normal-case tracking-normal">(appears on the attached PDF · standard policies are baked in automatically)</span>
                  </label>
                </div>
                <Textarea
                  data-testid="quote-invoice-notes"
                  rows={4}
                  placeholder={`Examples:\n• Pickup at hotel lobby door 5\n• Stop at Safeway for cake — group will direct\n• Lead pax has wheelchair — please bring ramp`}
                  value={invoiceNotes}
                  onChange={(e) => setInvoiceNotes(e.target.value)}
                  className="bg-[#0E0E0E] border-[#27272A] text-white text-sm leading-relaxed"
                />
                <div className="text-[10px] text-white/40 mt-1.5 leading-relaxed flex items-center gap-2">
                  <FileText className="w-3 h-3 text-[#D4AF37]" />
                  On send, a branded PDF invoice is auto-attached to the customer email.
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        // Persist invoice_notes first so the preview matches
                        // what would be emailed. Best-effort — non-blocking.
                        if (invoiceNotes && invoiceNotes !== (q?.invoice_notes || "")) {
                          await api.patch(`/admin/quote-requests/${q.id}`, {
                            invoice_notes: invoiceNotes,
                          });
                        }
                        // Stream the PDF into a new tab via the admin endpoint.
                        const { data } = await api.get(
                          `/admin/quote-requests/${q.id}/invoice-pdf`,
                          { responseType: "blob" }
                        );
                        const url = window.URL.createObjectURL(new Blob([data], { type: "application/pdf" }));
                        window.open(url, "_blank");
                      } catch {
                        toast.error("Couldn't open invoice preview.");
                      }
                    }}
                    data-testid="invoice-preview-btn"
                    className="ml-auto text-[#D4AF37] hover:text-[#B3922E] uppercase tracking-wider text-[10px]"
                  >
                    Preview PDF
                  </button>
                </div>
              </div>
            </div>
            <DialogFooter className="gap-2 flex-wrap">
              <Button onClick={onClose} disabled={sending} className="bg-white/10 hover:bg-white/15 text-white">Cancel</Button>
              <Button
                onClick={saveTripOnly}
                disabled={sending}
                data-testid="quote-save-only-button"
                title="Update pickup time / stops / details WITHOUT emailing the customer. Use after they've already paid."
                className="bg-transparent border border-white/20 text-white/80 hover:bg-white/5"
              >
                {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Save trip changes only
              </Button>
              <Button
                onClick={send}
                disabled={sending || !numericPrice || !affiliateCost || Number(affiliateCost) <= 0}
                data-testid="quote-send-button"
                title={
                  !affiliateCost || Number(affiliateCost) <= 0
                    ? "Enter affiliate cost first — required for profit-based Google Ads bidding"
                    : undefined
                }
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
    const text = `Hi ${a.contact_name || a.name},\n\nSourcing a ${q.vehicle_type} job:\n\n${q.pickup_date || ""} ${q.pickup_time || ""}\nPickup: ${q.pickup_location || "—"}\n${q.stops && q.stops.length > 0 ? `Stops: ${q.stops.join(" → ")}\n` : ""}Drop: ${q.dropoff_location || "—"}\n${q.passengers ? `Passengers: ${q.passengers}\n` : ""}${(q.trip_type || q.occasion) ? `Trip type: ${q.trip_type || q.occasion}\n` : ""}${q.service_duration ? `Duration: ${q.service_duration}\n` : ""}\nWhat's your best rate + minimum? Reply with quote.\n\nThanks — Adam · TuranElite Limo · (650) 672-3520`;
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

        {loading || !data ? (
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
                  <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between gap-3 flex-wrap">
                    <div className="text-[11px] text-white/45">
                      {(a.vehicle_types || []).join(" · ") || "Vehicle types not set"}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {a.email && (
                        <EmailDispatchPdfButton
                          affiliate={a}
                          quoteId={q?.id}
                        />
                      )}
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

// ------- Modal: "Affiliate Dispatch PDF" — lets the operator stamp affiliate
// name, agreed net rate, and optional driver instructions onto the PII-stripped
// dispatch sheet, then downloads the PDF. Default behavior pulls the affiliate
// rate from the quote's `affiliate_cost` if set, so most trips are one-click.

function DispatchPdfDialog({ state, onClose }) {
  const q = state?.request;
  const [affiliateName, setAffiliateName] = useState("");
  const [affiliateRate, setAffiliateRate] = useState("");
  const [extraNotes, setExtraNotes] = useState("");
  // When true, the dispatch PDF will show real pickup/drop-off addresses
  // and every planned stop. Off by default to keep PII stripping intact.
  // Useful for paid trips where the customer has a defined multi-stop
  // itinerary the affiliate must follow (e.g. wine-country day trips).
  const [includeFullItinerary, setIncludeFullItinerary] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (q) {
      setAffiliateName("");
      // Pre-fill from the quote's affiliate_cost if the operator already set it
      setAffiliateRate(q.affiliate_cost ? String(q.affiliate_cost) : "");
      setExtraNotes("");
      // Default ON when the trip already has planned stops — odds are the
      // operator wants the affiliate to see them.
      setIncludeFullItinerary(Array.isArray(q.stops) && q.stops.filter(Boolean).length > 0);
    }
  }, [q]);

  if (!state) return null;

  const downloadPdf = async () => {
    setBusy(true);
    try {
      const params = new URLSearchParams();
      if (affiliateName.trim()) params.set("affiliate_name", affiliateName.trim());
      if (affiliateRate && Number(affiliateRate) > 0) params.set("affiliate_rate", String(Number(affiliateRate)));
      if (extraNotes.trim()) params.set("extra_notes", extraNotes.trim());
      if (includeFullItinerary) params.set("include_full_itinerary", "true");

      const { data } = await api.get(
        `/admin/quote-requests/${q.id}/dispatch-pdf?${params.toString()}`,
        { responseType: "blob" }
      );
      const blob = new Blob([data], { type: "application/pdf" });
      const dispatchId = `TEL-DISPATCH-${(q.id || "").slice(0, 8).toUpperCase()}`;

      // Trigger browser download
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${dispatchId}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success("Dispatch PDF downloaded");
      onClose();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Couldn't generate dispatch PDF");
    } finally {
      setBusy(false);
    }
  };

  const previewPdf = async () => {
    setBusy(true);
    try {
      const params = new URLSearchParams();
      if (affiliateName.trim()) params.set("affiliate_name", affiliateName.trim());
      if (affiliateRate && Number(affiliateRate) > 0) params.set("affiliate_rate", String(Number(affiliateRate)));
      if (extraNotes.trim()) params.set("extra_notes", extraNotes.trim());
      if (includeFullItinerary) params.set("include_full_itinerary", "true");
      const { data } = await api.get(
        `/admin/quote-requests/${q.id}/dispatch-pdf?${params.toString()}`,
        { responseType: "blob" }
      );
      const url = window.URL.createObjectURL(new Blob([data], { type: "application/pdf" }));
      window.open(url, "_blank");
    } catch {
      toast.error("Couldn't open dispatch preview");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!state} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        data-testid="dispatch-pdf-dialog"
        className="bg-[#0c0c0c] border-[#1f1f1f] text-white max-w-lg max-h-[90vh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <FileText className="w-5 h-5 text-sky-300" /> Affiliate Dispatch PDF
          </DialogTitle>
          <DialogDescription className="text-white/55 leading-relaxed">
            Generates a branded, PII-stripped dispatch sheet for the assigned affiliate operator.
            Last-name initial only · no phone, email, or full address · operational standards + pre/post-trip checklists baked in.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-[10px] uppercase tracking-[0.18em] text-white/45 block mb-1.5">
              Affiliate operator name <span className="text-white/35 normal-case tracking-normal">(printed on the PDF)</span>
            </label>
            <Input
              data-testid="dispatch-affiliate-name"
              placeholder="e.g. Napa Premium Transport LLC"
              value={affiliateName}
              onChange={(e) => setAffiliateName(e.target.value)}
              className="bg-[#0E0E0E] border-[#27272A] text-white"
            />
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-[0.18em] text-white/45 block mb-1.5">
              Agreed net rate ($)
              <span className="text-white/35 normal-case tracking-normal"> (optional · prefilled from quote)</span>
            </label>
            <Input
              data-testid="dispatch-affiliate-rate"
              type="number"
              inputMode="decimal"
              placeholder="e.g. 680"
              value={affiliateRate}
              onChange={(e) => setAffiliateRate(e.target.value)}
              className="bg-[#0E0E0E] border-[#27272A] text-white"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2">
              <label className="text-[10px] uppercase tracking-[0.18em] text-white/45 block">
                Special requests / driver instructions <span className="text-white/35 normal-case tracking-normal">(optional)</span>
              </label>
              <AIDraftButton
                data-testid="ai-draft-dispatch"
                mode="dispatch_instructions"
                context={{
                  vehicle_type: q?.vehicle_type,
                  occasion: q?.trip_type || q?.occasion,
                  passengers: q?.passengers,
                  pickup_date: q?.pickup_date,
                  pickup_time: q?.pickup_time,
                  pickup_area: q?.pickup_location,
                  dropoff_area: q?.dropoff_location,
                  stops: q?.stops || [],
                  service_duration: q?.service_duration,
                  customer_notes: q?.notes,
                }}
                onDraft={(text) => setExtraNotes(text)}
                label="Draft with AI"
              />
            </div>
            <Textarea
              data-testid="dispatch-extra-notes"
              rows={5}
              placeholder={`Examples:\nBirthday party — group expects party vibe\nConfirm club lights + sound system tested before pickup\nMini-bar cooler stocked with ice + water`}
              value={extraNotes}
              onChange={(e) => setExtraNotes(e.target.value)}
              className="bg-[#0E0E0E] border-[#27272A] text-white text-sm leading-relaxed"
            />
          </div>

          <div className="rounded-lg border border-sky-500/30 bg-sky-500/[0.04] p-3 text-xs text-sky-200/90 leading-relaxed">
            <div className="flex items-center gap-1.5 mb-2">
              <CheckCircle2 className="w-3 h-3" />
              <span className="text-[10px] uppercase tracking-wider font-semibold">PII handling</span>
            </div>
            <label className="flex items-start gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                data-testid="dispatch-full-itinerary"
                checked={includeFullItinerary}
                onChange={(e) => setIncludeFullItinerary(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-sky-500/40 bg-transparent accent-sky-400"
              />
              <div className="flex-1">
                <div className="text-white text-[12px] font-medium leading-tight">
                  Include full itinerary (addresses visible)
                </div>
                <div className="text-sky-200/70 text-[11px] mt-0.5 leading-relaxed">
                  Prints actual pickup + drop-off addresses and every stop. Use when the
                  customer has a paid, pre-planned multi-stop trip the affiliate must follow
                  (wine tour, wedding venues, concert routes). Otherwise leave OFF for default
                  PII-stripped sheet (last-name initial only, phone/email withheld, city/area only).
                </div>
              </div>
            </label>
          </div>
        </div>

        <DialogFooter className="gap-2 mt-4">
          <Button
            onClick={onClose}
            disabled={busy}
            className="bg-white/10 hover:bg-white/15 text-white"
            data-testid="dispatch-close-btn"
          >
            Cancel
          </Button>
          <Button
            onClick={previewPdf}
            disabled={busy}
            data-testid="dispatch-preview-btn"
            className="bg-white/10 hover:bg-white/15 text-white border border-white/15"
          >
            {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ExternalLink className="w-4 h-4 mr-2" />}
            Preview
          </Button>
          <Button
            onClick={downloadPdf}
            disabled={busy}
            data-testid="dispatch-download-btn"
            className="bg-sky-500 hover:bg-sky-600 text-black disabled:opacity-60"
          >
            {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
            Download PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


// ------- Modal: "Save with promo" — generates a single-use future-trip
// discount code when a customer is haggling below your floor. Creates the
// promo via POST /admin/promos, then drops a ready-to-send SMS draft on the
// clipboard so the operator pastes & goes.
//
// Default policy:
//   - 10% off, single use, expires 6 months from creation
//   - Restricted to Executive Sedan / Luxury SUV / First Class (cheap
//     sedan-tier trips so the discount eats only ~$10-20 of margin)
//   - Code format: <FIRSTNAME_UPPER><value>  (e.g. LETICIA10)

const PROMO_VEHICLE_DEFAULTS = ["executive sedan", "luxury suv", "first class"];

function buildPromoCode(fullName, value) {
  const first = String(fullName || "GUEST")
    .trim()
    .split(/\s+/)[0]
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
  const stem = first.slice(0, 10) || "GUEST";
  const num = String(value || 10).replace(/[^\d]/g, "") || "10";
  return `${stem}${num}`;
}

function isoDatePlusMonths(months) {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function SavePromoDialog({ state, onClose }) {
  const q = state?.request;
  const [code, setCode] = useState("");
  const [value, setValue] = useState("10");
  const [discountType, setDiscountType] = useState("percent");
  const [expiresAt, setExpiresAt] = useState(isoDatePlusMonths(6));
  const [allowedTypes, setAllowedTypes] = useState(PROMO_VEHICLE_DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState(null); // Promo doc after create

  useEffect(() => {
    if (q) {
      setCode(buildPromoCode(q.full_name, "10"));
      setValue("10");
      setDiscountType("percent");
      setExpiresAt(isoDatePlusMonths(6));
      setAllowedTypes(PROMO_VEHICLE_DEFAULTS);
      setCreated(null);
    }
  }, [q]);

  // Auto-update the code when value changes (e.g. switching from 10 → 15%)
  useEffect(() => {
    if (q && !created) setCode(buildPromoCode(q.full_name, value));
  }, [value, q, created]);

  if (!state) return null;

  const firstName = String(q?.full_name || "").trim().split(/\s+/)[0] || "there";
  const expiryHuman = expiresAt
    ? new Date(expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "—";

  const smsDraft = `Hi ${firstName}, thanks for considering TuranEliteLimo! As a thank-you, here's ${value}% off your next executive Sedan or SUV trip — perfect for airport runs, date nights, or business travel.

Code: ${code.toUpperCase()}
Valid through: ${expiryHuman}

Book anytime at turanelitelimo.com. Looking forward to riding with you!

— Turan, TuranEliteLimo`;

  const toggleVehicleType = (vt) => {
    setAllowedTypes((arr) =>
      arr.includes(vt) ? arr.filter((x) => x !== vt) : [...arr, vt]
    );
  };

  const createAndCopy = async () => {
    if (!code.trim() || code.length < 3) {
      toast.error("Promo code must be at least 3 chars.");
      return;
    }
    if (!value || Number(value) <= 0) {
      toast.error("Discount value must be > 0.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        code: code.trim().toUpperCase(),
        description: `One-time offer extended to ${q.full_name} (${q.id?.slice(0, 8)}) on ${new Date().toLocaleDateString()}.`,
        discount_type: discountType,
        value: Number(value),
        min_ride_amount: 0,
        max_uses: 1,
        expires_at: expiresAt || null,
        first_ride_only: false,
        active: true,
        show_on_banner: false,
        auto_apply: false,
        allowed_vehicle_types: allowedTypes,
      };
      const { data } = await api.post("/admin/promos", payload);
      setCreated(data);
      // Attempt clipboard copy — non-fatal if it fails (mobile Safari quirks)
      try {
        await navigator.clipboard.writeText(smsDraft);
        toast.success(`Code ${data.code} created · SMS copied to clipboard`);
      } catch {
        toast.success(`Code ${data.code} created — copy the SMS below manually`);
      }
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Couldn't create promo");
    } finally {
      setSaving(false);
    }
  };

  const copySms = async () => {
    try {
      await navigator.clipboard.writeText(smsDraft);
      toast.success("SMS copied — paste into Messages");
    } catch {
      toast.error("Couldn't copy. Long-press the text to copy manually.");
    }
  };

  return (
    <Dialog open={!!state} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        data-testid="save-promo-dialog"
        className="bg-[#0c0c0c] border-[#1f1f1f] text-white max-w-lg max-h-[90vh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Gift className="w-5 h-5 text-emerald-300" /> Save the deal with a promo
          </DialogTitle>
          <DialogDescription className="text-white/55 leading-relaxed">
            Generates a single-use future-trip code (restricted to lower-AOV vehicles by default) so you can close a price-sensitive lead without dropping below your floor. The SMS gets copied to your clipboard on create.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-[0.18em] text-white/45 block mb-1.5">Code</label>
              <Input
                data-testid="promo-code-input"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className="bg-[#0E0E0E] border-[#27272A] text-white font-mono uppercase tracking-wider"
                maxLength={40}
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-[0.18em] text-white/45 block mb-1.5">
                Discount {discountType === "percent" ? "(%)" : "($)"}
              </label>
              <div className="flex gap-1.5">
                <Input
                  data-testid="promo-value-input"
                  type="number"
                  inputMode="decimal"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  className="bg-[#0E0E0E] border-[#27272A] text-white"
                  min="1"
                />
                <Select value={discountType} onValueChange={setDiscountType}>
                  <SelectTrigger
                    className="bg-[#0E0E0E] border-[#27272A] text-white w-20"
                    data-testid="promo-type-select"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0E0E0E] border-[#27272A] text-white">
                    <SelectItem value="percent">%</SelectItem>
                    <SelectItem value="fixed">$</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-[0.18em] text-white/45 block mb-1.5">Expires</label>
            <Input
              data-testid="promo-expires-input"
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="bg-[#0E0E0E] border-[#27272A] text-white"
            />
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-[0.18em] text-white/45 block mb-2">
              Applies to <span className="text-white/35 normal-case tracking-normal">(restrict to lower-AOV vehicles to protect margin)</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {[
                "executive sedan",
                "first class",
                "luxury suv",
                "sprinter van",
                "executive sprinter",
                "stretch limousine",
                "party bus",
              ].map((vt) => {
                const on = allowedTypes.includes(vt);
                return (
                  <button
                    key={vt}
                    type="button"
                    onClick={() => toggleVehicleType(vt)}
                    data-testid={`promo-vt-${vt.replace(/\s+/g, "-")}`}
                    className={`text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-full border transition ${
                      on
                        ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
                        : "bg-white/[0.02] text-white/45 border-white/10 hover:bg-white/5"
                    }`}
                  >
                    {vt}
                  </button>
                );
              })}
            </div>
            {allowedTypes.length === 0 && (
              <div className="text-[10px] text-amber-300/75 mt-1.5">
                ⚠ No vehicle restriction = applies to ANY trip. Margin risk.
              </div>
            )}
          </div>

          {/* SMS preview — always shown, gets copied on create */}
          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.04] p-3 space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-300 font-semibold flex items-center gap-1.5">
                <MessageSquare className="w-3 h-3" /> SMS preview · auto-copies on create
              </div>
              {created && (
                <Button
                  size="sm"
                  onClick={copySms}
                  data-testid="promo-copy-sms"
                  className="h-7 px-2 text-xs bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-500/40"
                >
                  <Copy className="w-3 h-3 mr-1" /> Copy again
                </Button>
              )}
            </div>
            <Textarea
              data-testid="promo-sms-preview"
              value={smsDraft}
              readOnly
              rows={9}
              className="bg-[#0A0A0A] border-[#1F1F1F] text-white/85 text-xs leading-relaxed font-mono"
            />
          </div>

          {created && (
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-200 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>
                Promo <span className="font-mono font-semibold">{created.code}</span> is live · single use · expires {expiryHuman}.
              </span>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 mt-4">
          <Button
            onClick={onClose}
            className="bg-white/10 hover:bg-white/15 text-white"
            data-testid="promo-close-btn"
          >
            {created ? "Done" : "Cancel"}
          </Button>
          {!created && (
            <Button
              onClick={createAndCopy}
              disabled={saving}
              data-testid="promo-create-btn"
              className="bg-emerald-500 hover:bg-emerald-600 text-black disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Gift className="w-4 h-4 mr-2" />
              )}
              Create & copy SMS
            </Button>
          )}
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


// ------- Shared: "Email PDF to affiliate" 1-tap button -------
// Lives inside SuggestAffiliatesDialog. Generates the PII-stripped dispatch
// PDF on the backend, emails it to the affiliate's saved address, and BCCs
// support@ for our records. Saves the operator from downloading + composing.
function EmailDispatchPdfButton({ affiliate, quoteId }) {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const send = async () => {
    if (!affiliate?.email || !quoteId) return;
    setBusy(true);
    try {
      await api.post(`/admin/quote-requests/${quoteId}/dispatch-pdf/email`, {
        affiliate_email: affiliate.email,
        affiliate_name: affiliate.name || "",
        // Rate is left blank here — operator can stamp via the DispatchPdfDialog
        // if they want to lock the agreed net. This 1-tap path is for "send the
        // sourcing sheet now, we'll confirm rate on reply."
        cc_admin: true,
      });
      toast.success(`Dispatch PDF emailed to ${affiliate.name}`);
      setSent(true);
      // Reset the "sent" state after 4s so the operator can re-send if needed
      setTimeout(() => setSent(false), 4000);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Couldn't email dispatch PDF");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={send}
      disabled={busy || !affiliate?.email}
      data-testid={`email-dispatch-${affiliate.id}`}
      title={affiliate?.email ? `Email PII-stripped dispatch PDF to ${affiliate.email}` : "No email on file for this affiliate"}
      className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-sky-500/15 text-sky-300 text-xs border border-sky-500/40 hover:bg-sky-500/25 disabled:opacity-40"
    >
      {busy ? <Loader2 className="w-3 h-3 animate-spin" />
        : sent ? <CheckCircle2 className="w-3 h-3" />
        : <FileText className="w-3 h-3" />}
      {busy ? "Sending…" : sent ? "Sent!" : "Email dispatch PDF"}
    </button>
  );
}


// ------- Shared: "Draft with AI" inline button -------
// Used by both SendQuoteDialog (customer-facing notes) and DispatchPdfDialog
// (affiliate driver instructions). Calls /admin/ai/draft-quote-text with the
// trip context; on success, drops the returned plain text into the parent's
// Textarea via the onDraft callback. The mode param selects the prompt the
// backend uses.
function AIDraftButton({ mode, context, onDraft, label = "Draft with AI", "data-testid": testid }) {
  const [busy, setBusy] = useState(false);

  const draft = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/admin/ai/draft-quote-text", {
        mode,
        context: context || {},
      });
      const text = (data && data.text) || "";
      if (!text.trim()) {
        toast.error("AI returned empty text — try filling in more trip details first.");
        return;
      }
      onDraft(text);
      toast.success("Draft inserted — edit before sending.");
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "AI drafting failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={draft}
      disabled={busy}
      data-testid={testid || `ai-draft-${mode}`}
      className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-purple-300 hover:text-purple-200 disabled:opacity-50"
      title="Generate a context-aware draft from trip details. Always edit before sending."
    >
      {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
      {busy ? "Drafting…" : label}
    </button>
  );
}


// ------- Modal: AI-drafted SMS reply (initial outreach / followup / etc) -------
// Opens from each quote row's "Draft SMS" button. Operator picks a scenario,
// AI generates an SMS using the lead's context (name, vehicle, occasion,
// price, etc), then one-tap copy puts it on the clipboard ready for iMessage.
//
// Backend: POST /admin/ai/draft-sms with sms_intent + context.
const SMS_INTENT_PRESETS = [
  {
    value: "initial_outreach",
    label: "Initial outreach",
    hint: "Warm opener after they first submit. Acknowledge occasion + ask 1–2 clarifying questions.",
    emoji: "👋",
  },
  {
    value: "quote_followup",
    label: "Quote follow-up",
    hint: "Polite nudge after quote sent. Re-anchors price + scarcity if hold release time set.",
    emoji: "⏳",
  },
  {
    value: "final_nudge",
    label: "Final nudge",
    hint: "Last polite check before marking lost. One line, no guilt-trip.",
    emoji: "🎯",
  },
  {
    value: "thank_you_confirm",
    label: "Thank-you confirm",
    hint: "After deposit lands. Confirms the booking + sets expectations.",
    emoji: "🎉",
  },
  {
    value: "custom",
    label: "Custom",
    hint: "Tell the AI exactly what to write below.",
    emoji: "✍️",
  },
];

function DraftSmsDialog({ state, onClose }) {
  const q = state?.request;
  const [intent, setIntent] = useState("initial_outreach");
  const [holdRelease, setHoldRelease] = useState("");
  const [customInstruction, setCustomInstruction] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  // Operator-saved custom prompts. Loaded on dialog open, refreshed after
  // save / delete so the chip list reflects the latest set without a hard
  // page reload.
  const [presets, setPresets] = useState([]);
  const [savePresetName, setSavePresetName] = useState("");
  const [showSaveInput, setShowSaveInput] = useState(false);

  const loadPresets = async () => {
    try {
      const { data } = await api.get("/admin/sms-presets");
      setPresets(Array.isArray(data) ? data : []);
    } catch {
      // Non-fatal — just hide the preset row
      setPresets([]);
    }
  };

  // Reset state on each open so a stale draft from one lead doesn't bleed
  // into the next.
  useEffect(() => {
    if (q) {
      setIntent(q.quoted_price ? "quote_followup" : "initial_outreach");
      setHoldRelease("");
      setCustomInstruction("");
      setText("");
      setCopied(false);
      setShowSaveInput(false);
      setSavePresetName("");
      loadPresets();
    }
  }, [q]);

  if (!state) return null;

  const phoneTel = (q?.phone || "").replace(/[^\d+]/g, "");

  // Click a saved preset → switch to "custom" intent and pre-fill the
  // instruction. Operator can then tweak before hitting Generate.
  const applyPreset = (preset) => {
    setIntent("custom");
    setCustomInstruction(preset.instruction);
    toast.success(`Loaded "${preset.name}" — edit then generate`);
  };

  const savePreset = async () => {
    const name = savePresetName.trim();
    if (!name) {
      toast.error("Give your preset a short name (e.g. \"Wine tour reply\")");
      return;
    }
    if (!customInstruction.trim()) {
      toast.error("Write a custom instruction first.");
      return;
    }
    try {
      await api.post("/admin/sms-presets", {
        name,
        instruction: customInstruction.trim(),
      });
      toast.success(`Preset "${name}" saved`);
      setShowSaveInput(false);
      setSavePresetName("");
      loadPresets();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Save failed");
    }
  };

  const deletePreset = async (preset) => {
    if (!window.confirm(`Delete preset "${preset.name}"?`)) return;
    try {
      await api.delete(`/admin/sms-presets/${preset.id}`);
      toast.success("Preset deleted");
      loadPresets();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Delete failed");
    }
  };

  const buildContext = () => {
    const firstName = (q?.full_name || "").trim().split(" ")[0] || "";
    const ctx = {
      first_name: firstName,
      vehicle_type: q?.vehicle_type || "",
      occasion: q?.trip_type || q?.occasion || "",
      passengers: q?.passengers,
      pickup_date: q?.pickup_date || "",
      pickup_time: q?.pickup_time || "",
      pickup_location: q?.pickup_location || "",
      dropoff_location: q?.dropoff_location || "",
      service_duration: q?.service_duration || "",
    };
    if (q?.quoted_price) ctx.quoted_price = `$${Number(q.quoted_price).toLocaleString()}`;
    if (q?.deposit_pct) ctx.deposit_pct = q.deposit_pct;
    if (holdRelease.trim()) ctx.hold_release_time = holdRelease.trim();
    if (intent === "custom" && customInstruction.trim()) {
      ctx.custom_instruction = customInstruction.trim();
    }
    return ctx;
  };

  const generate = async () => {
    setBusy(true);
    setCopied(false);
    try {
      const { data } = await api.post("/admin/ai/draft-sms", {
        sms_intent: intent,
        context: buildContext(),
      });
      setText((data && data.text) || "");
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "SMS drafting failed");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("SMS copied — paste into iMessage.");
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error("Copy failed — long-press the text to copy manually.");
    }
  };

  const activePreset = SMS_INTENT_PRESETS.find((p) => p.value === intent) || SMS_INTENT_PRESETS[0];

  return (
    <Dialog open={!!state} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        data-testid="draft-sms-dialog"
        className="bg-[#0c0c0c] border-[#1f1f1f] text-white max-w-xl max-h-[90vh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Wand2 className="w-5 h-5 text-purple-300" /> Draft SMS — {q?.full_name}
          </DialogTitle>
          <DialogDescription className="text-white/55 leading-relaxed">
            AI-generates a warm, on-brand SMS using this lead&apos;s context. Always
            review before pasting into iMessage. Stays under 480 chars.
          </DialogDescription>
        </DialogHeader>

        {/* Intent picker — chips so operator can swap scenario fast */}
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-white/45 mb-2">
            Scenario
          </div>
          <div className="flex flex-wrap gap-1.5">
            {SMS_INTENT_PRESETS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setIntent(p.value)}
                data-testid={`sms-intent-${p.value}`}
                className={`text-[11px] px-3 py-1.5 rounded-full border transition ${
                  intent === p.value
                    ? "bg-purple-500/20 text-purple-200 border-purple-500/50 font-semibold"
                    : "bg-white/[0.02] text-white/55 border-white/10 hover:bg-white/5"
                }`}
              >
                <span className="mr-1">{p.emoji}</span>{p.label}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-white/40 mt-2 leading-relaxed">{activePreset.hint}</p>

          {/* Saved presets — operator's own custom phrasings, persisted in DB */}
          {presets.length > 0 && (
            <div className="mt-3 pt-3 border-t border-white/[0.06]">
              <div className="text-[10px] uppercase tracking-[0.18em] text-white/45 mb-1.5">
                Your saved presets
              </div>
              <div className="flex flex-wrap gap-1.5">
                {presets.map((p) => (
                  <span
                    key={p.id}
                    className="inline-flex items-center gap-1 rounded-full bg-cyan-500/[0.08] border border-cyan-500/30 text-cyan-200 text-[11px] pl-3 pr-1 py-0.5"
                  >
                    <button
                      type="button"
                      onClick={() => applyPreset(p)}
                      data-testid={`sms-preset-${p.id}`}
                      className="hover:text-cyan-100"
                      title={p.instruction}
                    >
                      {p.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => deletePreset(p)}
                      data-testid={`sms-preset-delete-${p.id}`}
                      className="ml-1 w-4 h-4 inline-flex items-center justify-center rounded-full hover:bg-red-500/30 text-cyan-300/60 hover:text-red-300"
                      title="Delete preset"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Quote-followup gets an optional hold-release hint */}
        {intent === "quote_followup" && (
          <div>
            <label className="text-[10px] uppercase tracking-[0.18em] text-white/45 block mb-1.5">
              Affiliate hold release <span className="text-white/35 normal-case tracking-normal">(optional · creates real scarcity if set)</span>
            </label>
            <Input
              data-testid="sms-hold-release"
              placeholder="e.g. end of day today"
              value={holdRelease}
              onChange={(e) => setHoldRelease(e.target.value)}
              className="bg-[#0E0E0E] border-[#27272A] text-white text-sm"
            />
          </div>
        )}

        {/* Custom intent gets a free-form instruction box */}
        {intent === "custom" && (
          <div>
            <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2">
              <label className="text-[10px] uppercase tracking-[0.18em] text-white/45 block">
                Tell the AI what to write
              </label>
              {customInstruction.trim().length > 0 && !showSaveInput && (
                <button
                  type="button"
                  onClick={() => setShowSaveInput(true)}
                  data-testid="sms-preset-save-btn"
                  className="text-[10px] uppercase tracking-wider text-cyan-300 hover:text-cyan-200"
                >
                  + Save as preset
                </button>
              )}
            </div>
            <Textarea
              data-testid="sms-custom-instruction"
              rows={3}
              placeholder="e.g. Apologize for the delay and offer them a 10% future-trip promo code"
              value={customInstruction}
              onChange={(e) => setCustomInstruction(e.target.value)}
              className="bg-[#0E0E0E] border-[#27272A] text-white text-sm"
            />
            {showSaveInput && (
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <Input
                  data-testid="sms-preset-name-input"
                  placeholder="Preset name (e.g. Wine tour reply)"
                  value={savePresetName}
                  onChange={(e) => setSavePresetName(e.target.value)}
                  className="flex-1 min-w-[180px] bg-[#0E0E0E] border-[#27272A] text-white text-sm h-8"
                />
                <Button
                  onClick={savePreset}
                  data-testid="sms-preset-save-confirm"
                  className="h-8 px-3 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-100 border border-cyan-500/40 text-xs"
                >
                  Save preset
                </Button>
                <button
                  type="button"
                  onClick={() => { setShowSaveInput(false); setSavePresetName(""); }}
                  className="text-[11px] text-white/50 hover:text-white/80"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}

        <Button
          onClick={generate}
          disabled={busy || (intent === "custom" && !customInstruction.trim())}
          data-testid="sms-generate-btn"
          className="bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 border border-purple-500/40 disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Wand2 className="w-4 h-4 mr-2" />}
          {text ? "Regenerate" : "Generate SMS"}
        </Button>

        {/* Output — appears once generated */}
        {text && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-[0.18em] text-white/45">
                Draft <span className="text-white/35 normal-case tracking-normal">({text.length} chars · edit freely)</span>
              </div>
              {text.length > 480 && (
                <span className="text-[10px] text-amber-300 uppercase tracking-wider">⚠ Over 480 chars — trim before sending</span>
              )}
            </div>
            <Textarea
              data-testid="sms-output"
              rows={9}
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="bg-[#0E0E0E] border-[#27272A] text-white text-sm leading-relaxed font-mono"
            />
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                onClick={copy}
                data-testid="sms-copy-btn"
                className="bg-[#D4AF37] text-black hover:bg-[#B3922E]"
              >
                {copied ? <CheckCircle2 className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
                {copied ? "Copied!" : "Copy to clipboard"}
              </Button>
              {phoneTel && (
                <a
                  href={`sms:${phoneTel}&body=${encodeURIComponent(text)}`}
                  data-testid="sms-open-imessage"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-white/10 hover:bg-white/15 text-white text-sm"
                >
                  <MessageSquare className="w-4 h-4" /> Open in iMessage
                </a>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button onClick={onClose} className="bg-white/10 hover:bg-white/15 text-white">Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
