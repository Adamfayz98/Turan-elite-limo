import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Send, Phone as PhoneIcon, Info, Plus, X as XIcon } from "lucide-react";

import { api, formatApiErrorDetail } from "@/lib/api";
import { getStoredUtm } from "@/lib/utm";
import { trackQuoteRequest, trackPhoneCall } from "@/lib/googleAdsEvents";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

// Pre-qualification dropdown options. Mandatory before Send button unlocks.
// Why these specific buckets:
//  - Trip type drives vehicle/route logic + helps admin route to the right affiliate fast.
//  - Service duration is the #1 missing data point on inbound vague leads — every
//    affiliate needs hours-of-service to give a real number.
const TRIP_TYPES = [
  "Wedding",
  "Prom / Homecoming",
  "Airport Transfer",
  "Night Out / Bar Crawl",
  "Corporate / Business",
  "Birthday Party",
  "Wine Tour",
  "Concert / Sports Event",
  "Funeral / Memorial",
  "Other",
];

const SERVICE_DURATIONS = [
  "One-way transfer",
  "1–2 hours",
  "3–4 hours",
  "5–6 hours",
  "7–8 hours",
  "Full day (8+ hrs)",
  "Not sure yet",
];

// Tiny inline info bubble. Hover on desktop / tap on mobile.
function InfoHint({ text, id }) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            data-testid={id}
            className="text-white/35 hover:text-[#D4AF37] focus:text-[#D4AF37] focus:outline-none transition-colors ml-1.5 align-middle"
            aria-label="More info"
          >
            <Info className="w-3 h-3" />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          className="max-w-[220px] bg-[#1A1A1A] border border-[#D4AF37]/30 text-white/85 text-[11px] leading-relaxed"
        >
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Quote-request modal for call-only vehicles (Party Bus, Sprinter Van, Stretch Limo).
 * Captures pre-qualified trip details + contact info and POSTs to /api/quote-requests.
 * Admin gets SMS + email + a row in the dashboard.
 *
 * Required fields are gated — submit stays disabled until ALL are filled. This stops
 * vague one-liner leads from landing in the inbox and saves the back-and-forth.
 */
export default function QuoteRequestDialog({
  open,
  onOpenChange,
  vehicleType,
  defaultTripType = "",
  vehicleOptions = null,
  supportPhone = "(650) 410-0687",
}) {
  const [vehicle, setVehicle] = useState(vehicleType || "");
  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    email: "",
    trip_type: defaultTripType || "",
    service_duration: "",
    pickup_date: "",
    pickup_time: "",
    pickup_location: "",
    dropoff_location: "",
    passengers: "",
    notes: "",
  });
  // Intermediate stops list (optional). Common for weddings: hotel → church →
  // reception; proms: home → dinner → venue → after-party. Kept separate from
  // pickup/dropoff so admin sees the full route at a glance.
  const [stops, setStops] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  // ---- Twilio A2P / TCPA consent ----
  // We text the customer their custom quote, so we need express written
  // consent for transactional SMS. Required to submit. Promotional SMS is
  // a separate optional opt-in.
  const [smsConsent, setSmsConsent] = useState(false);
  const [smsPromoOptIn, setSmsPromoOptIn] = useState(false);

  // Sync vehicle + default trip type each time the dialog opens (landing pages
  // open the same dialog instance with different vehicle contexts).
  useEffect(() => {
    if (open) {
      setVehicle(vehicleType || (vehicleOptions && vehicleOptions[0]) || "");
      if (defaultTripType) {
        setForm((s) => (s.trip_type ? s : { ...s, trip_type: defaultTripType }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, vehicleType]);

  const addStop = () => setStops((s) => (s.length >= 5 ? s : [...s, ""]));
  const removeStop = (i) => setStops((s) => s.filter((_, idx) => idx !== i));
  const updateStop = (i) => (e) =>
    setStops((s) => s.map((v, idx) => (idx === i ? e.target.value : v)));

  const update = (k) => (e) => setForm((s) => ({ ...s, [k]: e.target.value }));
  const updateSelect = (k) => (v) => setForm((s) => ({ ...s, [k]: v }));

  // Required-field gate. Submit button stays disabled until every "*" field has
  // a value. Phone needs at least a few digits — light sanity check, not a regex.
  const isValid = useMemo(() => {
    const phoneDigits = (form.phone || "").replace(/\D/g, "");
    return (
      form.full_name.trim().length >= 2 &&
      phoneDigits.length >= 7 &&
      !!form.trip_type &&
      !!form.service_duration &&
      !!form.pickup_date &&
      !!form.pickup_time &&
      form.pickup_location.trim().length >= 2 &&
      form.dropoff_location.trim().length >= 2 &&
      !!form.passengers &&
      Number(form.passengers) > 0
    );
  }, [form]);

  const submit = async () => {
    if (!isValid) return;
    setSubmitting(true);
    try {
      const { data } = await api.post("/quote-requests", {
        ...form,
        vehicle_type: vehicle || vehicleType,
        passengers: form.passengers ? Number(form.passengers) : null,
        // Keep `occasion` populated for backward-compat with old admin/email
        // templates that read it. Trip type is the new canonical field.
        occasion: form.trip_type,
        // Filter empty stop inputs out before sending.
        stops: stops.map((s) => s.trim()).filter(Boolean),
        // ---- Twilio A2P / TCPA voluntary opt-in ----
        // Consent is NOT required to submit the quote (carrier rule: consent
        // cannot be a condition of service). If unchecked, we respond by
        // email + phone call only, no SMS to that number.
        sms_consent: smsConsent,
        sms_promo_opt_in: smsPromoOptIn,
        utm: getStoredUtm(),
      });
      try {
        trackQuoteRequest({
          requestId: data?.id,
          vehicleType: vehicle || vehicleType,
          email: form.email,
          phone: form.phone,
        });
      } catch {/* never block UX on tracking */}
      setDone(true);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Couldn't submit, try again");
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setDone(false);
    setForm({
      full_name: "", phone: "", email: "", trip_type: defaultTripType || "", service_duration: "",
      pickup_date: "", pickup_time: "", pickup_location: "", dropoff_location: "",
      passengers: "", notes: "",
    });
    setStops([]);
    setSmsConsent(false);
    setSmsPromoOptIn(false);
  };

  const tel = (supportPhone || "").replace(/[^\d+]/g, "");
  const inputCls = "bg-[#0E0E0E] border-[#27272A] text-white focus-visible:ring-[#D4AF37] focus-visible:border-[#D4AF37] mt-1 h-11";
  const selectTriggerCls = "bg-[#0E0E0E] border-[#27272A] text-white focus:ring-[#D4AF37] focus:border-[#D4AF37] mt-1 h-11 data-[placeholder]:text-white/40";
  const labelCls = "text-[10px] uppercase tracking-[0.2em] text-white/55 flex items-center";

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent
        data-testid="quote-request-dialog"
        // Don't dismiss the form when the user accidentally taps outside the
        // modal — we've seen them tap-near-an-input and lose all their typing.
        // ESC + the X button still close it.
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        className="bg-[#0A0A0A] border-[#1F1F1F] text-white max-w-xl max-h-[90vh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">
            {done ? "Got it — we'll text you shortly" : `Request a quote${(vehicle || vehicleType) ? ` · ${vehicle || vehicleType}` : ""}`}
          </DialogTitle>
          <DialogDescription className="text-xs text-white/55 mt-1">
            {done
              ? "Your request is in. Our team will text or call you with a custom quote — usually within 15 minutes during business hours."
              : "A few quick details so we can send you an accurate quote on the first reply — no back-and-forth."}
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="space-y-4 mt-2">
            <div className="rounded-xl border border-[#D4AF37]/30 bg-[#D4AF37]/5 p-5 text-center">
              <div className="font-serif text-3xl text-[#D4AF37]">Thanks, {form.full_name.split(" ")[0]}</div>
              <p className="text-xs text-white/60 mt-2 leading-relaxed">
                Need an answer right now? Call us — we usually pick up.
              </p>
              <a
                href={`tel:${tel}`}
                onClick={() => trackPhoneCall({ source: "quote-success" })}
                data-testid="quote-success-call-btn"
                className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#D4AF37] text-black text-sm font-semibold hover:bg-[#B3922E]"
              >
                <PhoneIcon className="w-4 h-4" /> {supportPhone}
              </a>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => { reset(); onOpenChange(false); }}
              data-testid="quote-success-close-btn"
              className="w-full bg-transparent border-white/15 text-white hover:bg-white/5"
            >
              Done
            </Button>
          </div>
        ) : (
          <div className="space-y-3 mt-2">
            {/* Vehicle picker — only when opened from a landing page offering
                multiple quote-only vehicles */}
            {vehicleOptions && vehicleOptions.length > 0 && (
              <div>
                <Label className={labelCls}>
                  Vehicle *
                  <InfoHint id="qr-info-vehicle" text="Pick the vehicle you have in mind — we'll confirm the best fit for your group size." />
                </Label>
                <Select value={vehicle} onValueChange={setVehicle}>
                  <SelectTrigger data-testid="qr-vehicle" className={selectTriggerCls}>
                    <SelectValue placeholder="Select a vehicle" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0E0E0E] border-[#27272A] text-white">
                    {vehicleOptions.map((v) => (
                      <SelectItem key={v} value={v} data-testid={`qr-vehicle-${v.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Contact row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className={labelCls}>
                  Name *
                  <InfoHint id="qr-info-name" text="So our chauffeur knows who they're picking up." />
                </Label>
                <Input data-testid="qr-name" value={form.full_name} onChange={update("full_name")} placeholder="Jane Doe" className={inputCls} />
              </div>
              <div>
                <Label className={labelCls}>
                  Phone *
                  <InfoHint id="qr-info-phone" text="We text your custom quote here — usually within 15 minutes." />
                </Label>
                <Input data-testid="qr-phone" value={form.phone} onChange={update("phone")} placeholder="(650) 555-0123" className={inputCls} />
              </div>
            </div>

            <div>
              <Label className={labelCls}>
                Email (optional)
                <InfoHint id="qr-info-email" text="Optional backup if we can't reach you by text." />
              </Label>
              <Input data-testid="qr-email" type="email" value={form.email} onChange={update("email")} placeholder="you@email.com" className={inputCls} />
            </div>

            {/* Pre-qual: Trip type + Duration */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className={labelCls}>
                  Trip type *
                  <InfoHint id="qr-info-trip" text="Helps us match you with the right vehicle, route, and chauffeur for your occasion." />
                </Label>
                <Select value={form.trip_type} onValueChange={updateSelect("trip_type")}>
                  <SelectTrigger data-testid="qr-trip-type" className={selectTriggerCls}>
                    <SelectValue placeholder="Select trip type" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0E0E0E] border-[#27272A] text-white">
                    {TRIP_TYPES.map((t) => (
                      <SelectItem key={t} value={t} data-testid={`qr-trip-${t.toLowerCase().replace(/[^a-z]+/g, "-")}`}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className={labelCls}>
                  Service duration *
                  <InfoHint id="qr-info-duration" text="Pricing depends on hours-of-service vs. a flat one-way transfer. Helps us quote accurately on the first reply." />
                </Label>
                <Select value={form.service_duration} onValueChange={updateSelect("service_duration")}>
                  <SelectTrigger data-testid="qr-duration" className={selectTriggerCls}>
                    <SelectValue placeholder="How long do you need it?" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0E0E0E] border-[#27272A] text-white">
                    {SERVICE_DURATIONS.map((d) => (
                      <SelectItem key={d} value={d} data-testid={`qr-duration-${d.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Date + Time + Passengers */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className={labelCls}>
                  Date *
                  <InfoHint id="qr-info-date" text="To check vehicle availability and lock in seasonal pricing." />
                </Label>
                <Input data-testid="qr-date" type="date" value={form.pickup_date} onChange={update("pickup_date")} className={inputCls} />
              </div>
              <div>
                <Label className={labelCls}>
                  Time *
                  <InfoHint id="qr-info-time" text="Helps us plan the chauffeur's schedule and any pre-trip prep." />
                </Label>
                <Input data-testid="qr-time" type="time" value={form.pickup_time} onChange={update("pickup_time")} className={inputCls} />
              </div>
              <div>
                <Label className={labelCls}>
                  Passengers *
                  <InfoHint id="qr-info-pax" text="So we recommend a vehicle that fits everyone comfortably with their luggage." />
                </Label>
                <Input data-testid="qr-pax" type="number" min="1" max="60" value={form.passengers} onChange={update("passengers")} placeholder="14" className={inputCls} />
              </div>
            </div>

            {/* Pickup + Dropoff */}
            <div>
              <Label className={labelCls}>
                Pickup location *
                <InfoHint id="qr-info-pickup" text="Street, hotel, airport, or general area — exact address can come later." />
              </Label>
              <Input data-testid="qr-pickup" value={form.pickup_location} onChange={update("pickup_location")} placeholder="123 Main St, San Jose CA" className={inputCls} />
            </div>

            {/* Stops (optional, between pickup and dropoff). Each stop is a
                separate input with a remove button — much easier for admin to
                read than a comma-separated string buried in Notes. */}
            {stops.length > 0 && (
              <div className="space-y-2">
                {stops.map((stop, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="flex-1">
                      <Label className={labelCls}>
                        Stop {i + 1}
                        {i === 0 && (
                          <InfoHint id="qr-info-stops" text="Add any stops between pickup and final destination — church, hotel, restaurant, after-party venue, etc." />
                        )}
                      </Label>
                      <Input
                        data-testid={`qr-stop-${i}`}
                        value={stop}
                        onChange={updateStop(i)}
                        placeholder={`Stop ${i + 1} address`}
                        className={inputCls}
                      />
                    </div>
                    <button
                      type="button"
                      data-testid={`qr-stop-remove-${i}`}
                      onClick={() => removeStop(i)}
                      aria-label={`Remove stop ${i + 1}`}
                      className="mt-5 h-11 w-11 rounded-full border border-white/10 text-white/50 hover:text-white hover:border-white/30 flex items-center justify-center transition"
                    >
                      <XIcon className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {stops.length < 5 && (
              <button
                type="button"
                data-testid="qr-add-stop"
                onClick={addStop}
                className="self-start inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] text-[#D4AF37]/80 hover:text-[#D4AF37] transition"
              >
                <Plus className="w-3 h-3" /> Add a stop
              </button>
            )}

            <div>
              <Label className={labelCls}>
                Drop-off / destination *
                <InfoHint id="qr-info-dropoff" text="Where you're going. If it's a multi-stop tour, add the stops in Notes below." />
              </Label>
              <Input data-testid="qr-dropoff" value={form.dropoff_location} onChange={update("dropoff_location")} placeholder="SFO Terminal 1, or destination" className={inputCls} />
            </div>

            {/* Optional notes */}
            <div>
              <Label className={labelCls}>
                Notes (optional)
                <InfoHint id="qr-info-notes" text="Decorations, multi-stop itinerary, accessibility needs, child seats, anything special." />
              </Label>
              <Textarea
                data-testid="qr-notes"
                value={form.notes}
                onChange={update("notes")}
                rows={3}
                placeholder="Multi-stop itinerary, decorations, special requests..."
                className="bg-[#0E0E0E] border-[#27272A] text-white focus-visible:ring-[#D4AF37] focus-visible:border-[#D4AF37] mt-1 resize-none"
              />
            </div>

            {/* ---- Twilio A2P 10DLC compliant SMS opt-in (VOLUNTARY) ----
                Per carrier rules (2024+), SMS consent cannot be a condition
                of getting a quote. Both checkboxes are optional. Customers
                who don't opt in still receive their quote via email + phone.
                All 7 Twilio-required disclosures included. */}
            <div
              data-testid="qr-sms-consent-block"
              className="mt-2 pt-4 border-t border-white/10 space-y-3"
            >
              <label
                data-testid="qr-sms-consent-label"
                className="flex items-start gap-3 cursor-pointer"
              >
                <input
                  type="checkbox"
                  data-testid="qr-sms-consent-checkbox"
                  checked={smsConsent}
                  onChange={(e) => setSmsConsent(e.target.checked)}
                  className="mt-1 h-5 w-5 accent-[#D4AF37] cursor-pointer flex-shrink-0"
                />
                <span className="text-sm text-white/85 leading-relaxed">
                  <strong className="text-white">Yes, text me my quote.</strong>{" "}
                  By checking this box, I agree to receive SMS messages from TuranEliteLimo at the phone number above for{" "}
                  <strong className="text-white">my custom quote response, booking confirmations, and trip-related updates</strong>.
                  Message frequency varies (typically 2–5 messages per booking).{" "}
                  <strong className="text-white">Msg &amp; data rates may apply.</strong>{" "}
                  Reply <strong className="text-white">STOP</strong> to unsubscribe or <strong className="text-white">HELP</strong> for help.
                  See our <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-[#D4AF37] underline">Terms</a> and <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-[#D4AF37] underline">Privacy Policy</a>.{" "}
                  <span className="text-white/50">Optional — leave unchecked for email + phone only.</span>
                </span>
              </label>

              <label
                data-testid="qr-sms-promo-optin-label"
                className="flex items-start gap-3 cursor-pointer"
              >
                <input
                  type="checkbox"
                  data-testid="qr-sms-promo-optin-checkbox"
                  checked={smsPromoOptIn}
                  onChange={(e) => setSmsPromoOptIn(e.target.checked)}
                  className="mt-1 h-5 w-5 accent-[#D4AF37] cursor-pointer flex-shrink-0"
                />
                <span className="text-sm text-white/70 leading-relaxed">
                  Optionally, send me <strong className="text-white">promotional SMS</strong> — exclusive offers, seasonal promos, event packages. Up to 4 messages per month. Msg &amp; data rates may apply. Reply STOP to unsubscribe anytime.
                </span>
              </label>
            </div>

            <Button
              onClick={submit}
              disabled={submitting || !isValid}
              data-testid="qr-submit"
              title={!isValid ? "Please fill in all required (*) fields to send your request" : undefined}
              className="w-full bg-[#D4AF37] text-black hover:bg-[#B3922E] rounded-full h-11 font-medium disabled:bg-white/10 disabled:text-white/30 disabled:cursor-not-allowed"
            >
              {submitting
                ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                : <Send className="w-4 h-4 mr-2" />}
              {isValid ? "Send request" : "Fill required fields to send"}
            </Button>
            <p className="text-[10px] text-center text-white/40 pt-1">
              We reply within ~15 min during business hours. No payment now.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
