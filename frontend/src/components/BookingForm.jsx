import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon, Loader2, Plus, X, MapPin, Car, User, Info, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import FleetPicker from "@/components/FleetPicker";
import PlacesAutocompleteInput from "@/components/PlacesAutocompleteInput";
import RouteMap from "@/components/RouteMap";
import StripeBadge from "@/components/StripeBadge";
import TrustPaymentBadges from "@/components/TrustPaymentBadges";
import CancellationPolicy from "@/components/CancellationPolicy";
// Google Ads events: fire begin_checkout the moment a booking is created +
// fire the "lead" event for Call-for-Quote paths (no instant Stripe price).
// Firing these BEFORE the Stripe redirect ensures Google sees the funnel step
// even when the customer bounces from Stripe (abandoned checkout) — otherwise
// Google Smart Bidding has no signal on which clicks made it this far.
import { trackBeginCheckout, trackQuoteRequest } from "@/lib/googleAdsEvents";
import CheckoutRedirectOverlay from "@/components/CheckoutRedirectOverlay";
import { api, formatApiErrorDetail } from "@/lib/api";
import { getStoredUtm } from "@/lib/utm";
import { cn } from "@/lib/utils";

const inputCls =
  "bg-[#0E0E0E] border-[#27272A] text-white placeholder:text-white/40 focus-visible:ring-[#D4AF37] focus-visible:border-[#D4AF37] h-11";

// 12-hour time slots in 15-min increments — wire format stays HH:MM (24h)
// for backend compatibility; UI splits into time + AM/PM dropdowns.
const TIME_SLOTS_12H = (() => {
  const out = [];
  for (let h = 1; h <= 12; h++) {
    for (const m of [0, 15, 30, 45]) {
      out.push(`${h}:${String(m).padStart(2, "0")}`);
    }
  }
  return out;
})();

function to24h(time12, meridiem) {
  if (!time12 || !meridiem) return "";
  const [h, m] = time12.split(":").map(Number);
  let hh = h % 12;
  if (meridiem === "PM") hh += 12;
  return `${String(hh).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function from24h(time24) {
  if (!time24 || !time24.includes(":")) return { time12: "", meridiem: "AM" };
  const [h24, m] = time24.split(":").map(Number);
  const meridiem = h24 >= 12 ? "PM" : "AM";
  let h12 = h24 % 12;
  if (h12 === 0) h12 = 12;
  return { time12: `${h12}:${String(m).padStart(2, "0")}`, meridiem };
}

const initialForm = {
  full_name: "",
  email: "",
  phone: "",
  service_type: "",
  pickup_time: "",
  pickup_location: "",
  dropoff_location: "",
  passengers: 1,
  luggage_count: 0,
  child_seat: false,
  child_seat_count: 0,
  return_trip: false,
  return_location: "",
  return_date: "",
  return_time: "",
  vehicle_type: "",
  notes: "",
  hours: "",
  meet_and_greet: false,
  flight_number: "",
};

function SectionHead({ icon: Icon, step, title, sub }) {
  return (
    <div className="flex items-start gap-4 mb-6">
      <div className="w-10 h-10 rounded-full bg-[#D4AF37]/10 border border-[#D4AF37]/30 flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-[#D4AF37]" />
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-[0.3em] text-[#D4AF37]">Step {step}</div>
        <h3 className="font-serif text-2xl mt-1 leading-tight">{title}</h3>
        {sub && <p className="text-xs text-white/50 mt-1">{sub}</p>}
      </div>
    </div>
  );
}

export default function BookingForm() {
  const [options, setOptions] = useState({ vehicle_types: [], service_types: [] });
  const [date, setDate] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [stops, setStops] = useState([]); // [{id, value}]
  const stopIdRef = useRef(0);
  const newStopId = () => {
    stopIdRef.current += 1;
    return `s${stopIdRef.current}`;
  };
  const [quote, setQuote] = useState(null);
  const [quoting, setQuoting] = useState(false);
  // Friendly out-of-service-area banner copy. Set when the backend rejects
  // the pickup as outside our Bay Area service radius.
  const [outOfArea, setOutOfArea] = useState(null);
  const quoteTimer = useRef(null);
  const [form, setForm] = useState(initialForm);
  const [waitConsent, setWaitConsent] = useState(false);
  const [waitPolicy, setWaitPolicy] = useState(null);
  // Payment timing — "now" (charge at checkout) or "after" (card saved via
  // Stripe setup mode, charged after ride completion). Default is "now" so
  // we don't tilt customers away from prepayment (which is preferred for
  // cashflow + no-shows). Customers who want to pay after ride can pick it
  // explicitly — both options are equally weighted in the UI.
  const [payTiming, setPayTiming] = useState("now");
  // ---- Twilio A2P / TCPA consent (REQUIRED to submit) ----
  // `smsConsent` is the express written consent for transactional SMS — must
  // be explicitly checked, not pre-checked. `smsPromoOptIn` is the optional
  // second checkbox for promotional SMS.
  const [smsConsent, setSmsConsent] = useState(false);
  const [smsPromoOptIn, setSmsPromoOptIn] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  // Promo code state
  const [promoCode, setPromoCode] = useState("");
  const [promoApplied, setPromoApplied] = useState(null); // {code, discount, final_amount, description, auto_applied?}
  const [promoStatus, setPromoStatus] = useState({ checking: false, error: null });
  // Codes the customer explicitly dismissed via Remove — prevents the
  // auto-apply mirror from immediately re-applying them.
  const [dismissedAutoCodes, setDismissedAutoCodes] = useState([]);
  // Visible "Opening secure checkout..." overlay with manual-click fallback
  // for browsers that silently block window.location.href to Stripe.
  const [checkoutOverlay, setCheckoutOverlay] = useState(null); // { url, bookingId, sessionId } | null

  // Active first-ride promo displayed as a chip above the booking form.
  // Sourced from the same endpoint as the site-wide PromoBanner so the
  // percentage/dollar amount always matches the current admin config.
  // Hidden entirely when no active promo is flagged for the banner.
  const [firstRidePromo, setFirstRidePromo] = useState(null);

  // Long-distance one-way advisory. When RouteMap reports > 100 mi and the
  // customer hasn't checked round-trip, we surface a dismissible banner
  // recommending they book the return leg on the same reservation — solves
  // the real-world problem of the return-trip form choking on a further-out
  // pickup address that our autocomplete can't hard-bias.
  const [routeMiles, setRouteMiles] = useState(null);
  const [longTripBannerDismissed, setLongTripBannerDismissed] = useState(false);

  useEffect(() => {
    api.get("/options").then((r) => setOptions(r.data)).catch(() => {});
    api.get("/pricing/wait-rates").then((r) => setWaitPolicy(r.data)).catch(() => {});
    api.get("/promos/banner").then((r) => {
      if (r.data?.code) setFirstRidePromo(r.data);
    }).catch(() => {});
  }, []);

  // Auto-detect airport in pickup/drop-off and pre-select Service Type = "Airport
  // Transfer" so the Flight Number field and the Meet & Greet toggle reveal
  // themselves without the customer needing to know to click the Service Type
  // dropdown. Only fires when service_type is currently empty — respects an
  // explicit choice if the customer has already picked something else.
  useEffect(() => {
    if (form.service_type) return; // don't clobber explicit selection
    const AIRPORT_RE = /\b(airport|international terminal|terminal [12345abc]|sfo|oak|sjc|smf|lax|jfk|lga|ewr|ord|mia|sea|den|las|phx|dfw|atl|bos|iad|dca|hnl|pdx)\b/i;
    const p = (form.pickup_location || "").toLowerCase();
    const d = (form.dropoff_location || "").toLowerCase();
    if (AIRPORT_RE.test(p) || AIRPORT_RE.test(d)) {
      setForm((f) => (f.service_type ? f : { ...f, service_type: "Airport Transfer" }));
    }
  }, [form.pickup_location, form.dropoff_location, form.service_type]);

  // Pre-fill from URL query params (used by FloatingQuoteWidget on landing pages
  // and referral redirects). Runs once on mount.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const pickup = params.get("pickup");
      const dropoff = params.get("dropoff");
      const d = params.get("date");
      if (pickup || dropoff) {
        setForm((f) => ({
          ...f,
          pickup_location: pickup || f.pickup_location,
          dropoff_location: dropoff || f.dropoff_location,
        }));
      }
      if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
        const parsed = new Date(`${d}T12:00:00`);
        if (!isNaN(parsed.getTime())) setDate(parsed);
      }
      // Auto-apply referral promo code (WELCOME20) if a referral was followed
      const ref = localStorage.getItem("ref_code");
      if (ref && !promoCode) {
        setPromoCode("WELCOME20");
      }
    } catch (e) {
      // non-fatal — never block the form
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  // Debounced live quote
  useEffect(() => {
    const pickup = form.pickup_location.trim();
    const dropoff = form.dropoff_location.trim();
    const isHourly = form.service_type === "Hourly Chauffeur";
    const hoursNum = Number(form.hours);
    const hourlyReady = isHourly && hoursNum >= 2 && hoursNum <= 24;

    if (quoteTimer.current) clearTimeout(quoteTimer.current);

    // Hourly mode with bad hours value → block the quote entirely so the customer
    // doesn't see misleading distance-based prices.
    if (isHourly && (!hoursNum || hoursNum < 2 || hoursNum > 24)) {
      setQuote(null);
      return;
    }

    // For non-hourly: need pickup + dropoff
    // For hourly: only need a valid hour count (distance ignored)
    if (!hourlyReady && (pickup.length < 3 || dropoff.length < 3)) {
      setQuote(null);
      return;
    }
    quoteTimer.current = setTimeout(async () => {
      setQuoting(true);
      try {
        const cleanStops = stops.map((s) => s.value.trim()).filter(Boolean);
        const { data } = await api.post("/quote", {
          pickup_location: pickup || "n/a",
          dropoff_location: dropoff || "n/a",
          service_type: form.service_type || null,
          hours: hourlyReady ? hoursNum : null,
          pickup_date: date ? format(date, "yyyy-MM-dd") : null,
          meet_and_greet: !!form.meet_and_greet,
          additional_stops_count: cleanStops.length,
          additional_stops: cleanStops,
          child_seat_count: Number(form.child_seat_count) || 0,
          return_trip: !!form.return_trip,
          return_location: form.return_location || "",
          return_date: form.return_date || null,
          return_time: form.return_time || null,
        });
        setQuote(data);
        setOutOfArea(null);
      } catch (e) {
        // Service area gate: backend rejects pickups outside the Bay Area.
        // Show the friendly message inline above the quote panel instead of
        // letting the customer continue and waste payment time.
        const detail = e?.response?.data?.detail;
        if (detail && typeof detail === "object" && detail.code === "out_of_service_area") {
          setOutOfArea(detail.message);
        } else {
          setOutOfArea(null);
        }
        console.warn("[BookingForm] live quote failed:", e);
        setQuote(null);
      } finally {
        setQuoting(false);
      }
    }, 1100);
    return () => quoteTimer.current && clearTimeout(quoteTimer.current);
  }, [form.pickup_location, form.dropoff_location, form.service_type, form.hours, form.meet_and_greet, form.child_seat_count, form.return_trip, form.return_location, form.return_date, date, stops]);

  const addStop = () => setStops((s) => [...s, { id: newStopId(), value: "" }]);
  const removeStop = (id) => setStops((s) => s.filter((x) => x.id !== id));
  const updateStop = (id, v) =>
    setStops((s) => s.map((x) => (x.id === id ? { ...x, value: v } : x)));

  const currentVehiclePrice = () => {
    const vq = (quote?.quotes || []).find((q) => q.vehicle_type === form.vehicle_type);
    return vq && vq.price != null ? vq.price : null;
  };

  const applyPromo = async () => {
    const code = promoCode.trim().toUpperCase();
    if (!code) return;
    // Guard against re-applying a code that's already on the booking — e.g.
    // when the customer types the same code that the backend already
    // auto-applied. Without this guard, the validate endpoint would compute
    // a second discount against the already-discounted price.
    if (promoApplied && promoApplied.code === code) {
      setPromoStatus({ checking: false, error: "This code is already applied to your quote." });
      return;
    }
    const price = currentVehiclePrice();
    if (!price) {
      setPromoStatus({ checking: false, error: "Select a vehicle with an instant price first" });
      return;
    }
    setPromoStatus({ checking: true, error: null });
    try {
      const { data } = await api.post("/promos/validate", {
        code,
        amount: price,
        email: form.email || null,
        vehicle_type: form.vehicle_type || null,
      });
      if (data.ok) {
        setPromoApplied(data);
        setPromoStatus({ checking: false, error: null });
        toast.success(`Code ${data.code} applied — you save $${data.discount.toFixed(2)}!`);
      } else {
        setPromoApplied(null);
        setPromoStatus({ checking: false, error: data.reason || "Invalid code" });
      }
    } catch (e) {
      console.warn("[BookingForm] promo validate failed:", e);
      setPromoApplied(null);
      setPromoStatus({ checking: false, error: "Could not validate code, try again" });
    }
  };

  const clearPromo = () => {
    // If the customer removes an auto-applied promo, remember the code so
    // the mirror effect doesn't immediately re-apply it on the next quote
    // refresh. If they switch vehicles or refresh the page the auto-apply
    // will eventually come back — that's the right behavior.
    if (promoApplied?.auto_applied && promoApplied.code) {
      setDismissedAutoCodes((arr) =>
        arr.includes(promoApplied.code) ? arr : [...arr, promoApplied.code],
      );
    }
    setPromoApplied(null);
    setPromoCode("");
    setPromoStatus({ checking: false, error: null });
  };

  // If the vehicle changes after applying, re-validate against new amount.
  // SKIP for auto-applied promos: the backend already handles auto-promo
  // pricing inside _apply_auto_promo_to_quote_response, and re-validating
  // against the already-discounted price would double-apply the discount.
  useEffect(() => {
    if (promoApplied?.auto_applied) return;
    if (promoApplied && currentVehiclePrice() !== null) {
      // re-validate silently
      (async () => {
        try {
          const { data } = await api.post("/promos/validate", {
            code: promoApplied.code,
            amount: currentVehiclePrice(),
            email: form.email || null,
            vehicle_type: form.vehicle_type || null,
          });
          if (data.ok) {
            setPromoApplied(data);
          } else {
            // Vehicle changed and promo no longer applies — auto-clear with a soft toast
            clearPromo();
            toast(data.reason || "Promo removed — doesn't apply to this vehicle", {
              description: "You can apply a different code if you'd like.",
            });
          }
        } catch (e) {
          console.warn("[BookingForm] promo re-validate failed:", e);
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.vehicle_type, quote]);

  // When the quote response carries an auto-applied promo on the selected
  // vehicle, surface it as ALREADY-APPLIED (green chip) — NOT as a pre-filled
  // input the customer can re-apply. Previously the input was pre-filled with
  // the auto-applied code and a customer click on "Apply" stacked the discount
  // on top of the already-discounted price (silent revenue leak).
  //
  // Now: we mirror the auto-applied promo into `promoApplied` state so the UI
  // renders the green chip + Remove button. If the customer hits Remove, they
  // get the empty input back and can type a different code if they have one.
  useEffect(() => {
    try {
      const vq = (quote?.quotes || []).find((q) => q.vehicle_type === form.vehicle_type);
      const auto = vq?.applied_promo;
      // The auto-apply promo metadata lives on `q.applied_promo` (code,
      // description, type, value) and the resolved discount amount lives on
      // `q.discount_amount` + `q.original_price` (see _apply_auto_promo_to_quote_response).
      const discountAmt = Number(vq?.discount_amount || 0);
      const finalAmt = Number(vq?.price || 0);
      if (!auto?.code || discountAmt <= 0) return;

      // Customer already explicitly removed this auto-apply code — respect
      // their choice and don't immediately re-apply it.
      if (dismissedAutoCodes.includes(auto.code)) return;

      // Don't clobber a manually-applied promo if it's a DIFFERENT code.
      if (promoApplied && promoApplied.code && promoApplied.code !== auto.code) return;

      // Idempotent: skip if we've already mirrored this exact code + amount.
      if (
        promoApplied &&
        promoApplied.code === auto.code &&
        Math.abs((promoApplied.discount || 0) - discountAmt) < 0.01
      ) {
        return;
      }

      setPromoApplied({
        code: auto.code,
        discount: discountAmt,
        final_amount: finalAmt,
        description: auto.description || "Automatically applied",
        auto_applied: true,
      });
      // Clear the manual input — if the customer later hits Remove, they
      // should see an empty field, not a pre-filled one (which is what
      // caused the original double-apply bug).
      setPromoCode("");
      setPromoStatus({ checking: false, error: null });
    } catch (e) {
      // silent — never block the form
    }
  }, [quote, form.vehicle_type, promoApplied, dismissedAutoCodes]);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!date) return toast.error("Please pick a date.");
    if (!form.service_type) return toast.error("Please choose a service type.");
    if (!form.vehicle_type) return toast.error("Please select a vehicle.");
    if (!form.pickup_time) return toast.error("Please select a pickup time (and AM/PM).");
    if (form.service_type === "Hourly Chauffeur") {
      const h = Number(form.hours);
      if (!h || h < 2 || h > 24)
        return toast.error("Hourly bookings require a minimum of 2 hours.");
    }
    if (form.service_type === "Airport Transfer" && !form.flight_number.trim())
      return toast.error("Please enter your flight number so we can track your arrival.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim()))
      return toast.error("Please enter a valid email — your confirmation goes there.");
    // Return location is optional — defaults to pickup on the backend.
    if (form.return_trip && !form.return_date)
      return toast.error("Please pick a return date.");
    if (form.return_trip && !form.return_time)
      return toast.error("Please pick a return time.");
    if (form.return_trip && form.return_date && form.pickup_date && form.return_date < form.pickup_date)
      return toast.error("Return date cannot be before the pickup date.");
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        passengers: Number(form.passengers) || 1,
        luggage_count: Number(form.luggage_count) || 0,
        child_seat_count: Number(form.child_seat_count) || 0,
        child_seat: (Number(form.child_seat_count) || 0) > 0,
        additional_stops: stops.map((s) => s.value.trim()).filter(Boolean),
        return_location: form.return_trip ? (form.return_location || form.pickup_location) : "",
        return_date: form.return_trip ? form.return_date : null,
        return_time: form.return_trip ? form.return_time : null,
        pickup_date: format(date, "yyyy-MM-dd"),
        meet_and_greet: form.service_type === "Airport Transfer" && !!form.meet_and_greet,
        flight_number:
          form.service_type === "Airport Transfer"
            ? form.flight_number.trim().toUpperCase()
            : null,
        hours:
          form.service_type === "Hourly Chauffeur" && form.hours
            ? Number(form.hours)
            : null,
        promo_code: promoApplied ? promoApplied.code : null,
        wait_time_consent: waitConsent,
        sms_consent: smsConsent,
        sms_promo_opt_in: smsPromoOptIn,
        marketing_opt_in: marketingOptIn,
        utm: getStoredUtm(),
      };
      const { data: booking } = await api.post("/bookings", payload);

      // Determine if this vehicle has an instant price (i.e., not "Call for quote")
      const vQuote = (quote?.quotes || []).find((q) => q.vehicle_type === form.vehicle_type);
      const hasInstantPrice = vQuote && vQuote.price != null;

      // Fire the appropriate Google Ads funnel event BEFORE the Stripe
      // redirect — otherwise if the customer bails from Stripe, Google sees
      // nothing. Both paths use `booking.id` (UUID) as transaction_id so it
      // matches downstream purchase-event dedupe in GoogleAdsConversion.jsx.
      try {
        if (hasInstantPrice) {
          trackBeginCheckout({
            bookingId: booking.id,
            amount: vQuote.price,
          });
        } else {
          // "Call for quote" path — the customer submitted intent to book but
          // there's no Stripe checkout yet. This IS a qualified lead.
          trackQuoteRequest({
            requestId: booking.id,
            email: booking.email,
            phone: booking.phone,
            vehicleType: form.vehicle_type,
          });
        }
      } catch (e) {
        console.warn("[BookingForm] gtag funnel event failed:", e);
      }

      if (hasInstantPrice) {
        // Show a visible "Opening secure checkout…" overlay that triggers the
        // redirect AND offers a manual fallback button if the browser blocks
        // the auto-redirect (iOS Safari ITP, popup blockers, etc).
        try {
          const endpoint = payTiming === "after" ? "/payments/checkout-setup" : "/payments/checkout";
          const { data: co } = await api.post(endpoint, {
            booking_id: booking.id,
            origin_url: window.location.origin,
          });
          setCheckoutOverlay({
            url: co.url,
            bookingId: booking.id,
            sessionId: co.session_id,
          });
          return; // don't reset state — redirect imminent
        } catch (err) {
          toast.error(
            formatApiErrorDetail(err.response?.data?.detail) ||
              "Booking saved, but couldn't start payment. We'll call you to finalize.",
          );
        }
      } else {
        toast.success(
          "Reservation request received. We'll call you with a custom quote shortly.",
        );
      }

      // Reset form (only reached when no redirect)
      setForm(initialForm);
      setStops([]);
      setDate(null);
      setQuote(null);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Booking failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section
      id="booking"
      data-testid="booking-section"
      translate="no"
      className="notranslate relative py-24 md:py-32 px-6 md:px-10 border-t border-white/5"
    >
      {checkoutOverlay && (
        <CheckoutRedirectOverlay
          stripeUrl={checkoutOverlay.url}
          bookingId={checkoutOverlay.bookingId}
          sessionId={checkoutOverlay.sessionId}
          onClose={() => setCheckoutOverlay(null)}
        />
      )}
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-10">
          <span className="text-xs tracking-[0.3em] uppercase text-[#D4AF37]">02 — Reserve</span>
          <h2 className="font-serif text-4xl md:text-5xl mt-6 leading-tight">
            Reserve your <span className="italic">private</span> chauffeur
          </h2>
          <p className="mt-5 text-white/55 max-w-2xl mx-auto leading-relaxed">
            Three quick steps. Live pricing as soon as you tell us where you're going.
          </p>
          {firstRidePromo && (() => {
            const label =
              firstRidePromo.discount_type === "percent"
                ? `${firstRidePromo.value}% off`
                : `$${firstRidePromo.value} off`;
            const scope = firstRidePromo.first_ride_only ? "your first ride" : "your ride";
            // First-ride-only promos require the code to be typed manually so
            // we can validate the customer hasn't ridden before. Non-restricted
            // promos can auto-apply at the quote engine level.
            const applyHint = firstRidePromo.first_ride_only
              ? `use code ${firstRidePromo.code || "at checkout"}`
              : "applied automatically at checkout — no code needed";
            return (
              <div
                data-testid="first-ride-banner"
                className="mt-6 inline-flex items-center gap-2 text-xs md:text-sm bg-[#D4AF37]/10 border border-[#D4AF37]/30 text-[#D4AF37] px-4 py-2 rounded-full"
              >
                <span className="font-semibold">{label} {scope}</span>
                <span className="text-[#D4AF37]/70">·</span>
                <span className="text-[#D4AF37]/85">{applyHint}</span>
              </div>
            );
          })()}
        </div>

        <form
          onSubmit={onSubmit}
          data-testid="booking-form"
          className="bg-[#0A0A0A] border border-[#1F1F1F] rounded-2xl p-6 md:p-10"
        >
          {/* STEP 1 — Trip details */}
          <SectionHead icon={MapPin} step="1" title="Trip details" />

          <div className="grid md:grid-cols-2 gap-5">
            <div className="md:col-span-2">
              <PlacesAutocompleteInput
                label="Pickup location"
                testId="booking-pickup"
                required
                value={form.pickup_location}
                onChange={update("pickup_location")}
                placeholder="SFO Airport, Terminal 2"
              />
            </div>

            {stops.map((stop, i) => (
              <div key={stop.id} className="md:col-span-2">
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <PlacesAutocompleteInput
                      label={`Additional stop #${i + 1}`}
                      testId={`booking-stop-${i}`}
                      strict={false}
                      value={stop.value}
                      onChange={(v) => updateStop(stop.id, v)}
                      placeholder="123 Market St, San Francisco"
                    />
                  </div>
                  <Button
                    type="button"
                    onClick={() => removeStop(stop.id)}
                    variant="outline"
                    size="icon"
                    data-testid={`booking-stop-remove-${i}`}
                    className="h-11 w-11 bg-transparent border-white/15 hover:bg-red-500/10 hover:border-red-500/40 text-white/70 hover:text-red-400"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}

            <div className="md:col-span-2">
              <PlacesAutocompleteInput
                label="Drop-off location"
                testId="booking-dropoff"
                required
                strict={false}
                value={form.dropoff_location}
                onChange={update("dropoff_location")}
                placeholder="Four Seasons San Francisco"
              />
            </div>

            {/* Out-of-service-area banner. Shown when backend /quote returns
                the `out_of_service_area` rejection — i.e. customer's pickup is
                outside the Bay Area radius. Friendly redirect to the phone
                line so we don't kill the lead, just route it correctly. */}
            {outOfArea && (
              <div
                data-testid="booking-out-of-area-banner"
                className="md:col-span-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-200/90 leading-relaxed"
              >
                {outOfArea}
              </div>
            )}

            <div className="md:col-span-2 -mt-1">
              <Button
                type="button"
                onClick={addStop}
                variant="outline"
                data-testid="booking-add-stop"
                className="bg-transparent border-[#D4AF37]/30 text-[#D4AF37] hover:bg-[#D4AF37]/10 hover:text-[#D4AF37] rounded-full"
              >
                <Plus className="w-4 h-4 mr-2" /> Add stop
              </Button>
            </div>

            {/* Live route preview — only renders meaningfully once pickup + dropoff are set */}
            <div className="md:col-span-2">
              <RouteMap
                pickup={form.pickup_location}
                dropoff={form.dropoff_location}
                stops={stops.map((s) => s.value).filter(Boolean)}
                onRouteSummary={({ miles }) => setRouteMiles(miles)}
              />
            </div>

            {/* Long-distance one-way advisory */}
            {routeMiles != null && routeMiles > 100 && !form.return_trip && !longTripBannerDismissed && (
              <div
                data-testid="long-trip-banner"
                className="md:col-span-2 flex items-start gap-3 rounded-xl border border-[#D4AF37]/40 bg-[#D4AF37]/10 px-4 py-3"
              >
                <div className="mt-0.5 h-8 w-8 shrink-0 rounded-full bg-[#D4AF37]/20 grid place-items-center">
                  <span className="text-[#D4AF37] text-base">↔</span>
                </div>
                <div className="flex-1 text-sm text-white/85 leading-relaxed">
                  <div className="font-medium text-white">
                    Long trip — book the return leg now?
                  </div>
                  <div className="text-white/70 text-xs mt-0.5">
                    Your route is ~{Math.round(routeMiles)} miles. If you&apos;re planning to come back,
                    add the return leg here — bookings started from far-out pickups sometimes glitch
                    when we can&apos;t find the address, and it&apos;s cheaper to lock both legs in one reservation.
                  </div>
                  <button
                    type="button"
                    data-testid="long-trip-add-return"
                    onClick={() => {
                      update("return_trip")(true);
                      // Prefill the return leg as a mirror of the outbound
                      if (!form.return_location) update("return_location")(form.pickup_location || "");
                    }}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-[#D4AF37] px-3 py-1.5 text-xs font-medium text-black hover:bg-[#B3922E] transition"
                  >
                    Add return trip
                  </button>
                </div>
                <button
                  type="button"
                  data-testid="long-trip-dismiss"
                  onClick={() => setLongTripBannerDismissed(true)}
                  aria-label="Dismiss"
                  className="p-1 text-white/50 hover:text-white transition"
                >
                  <span aria-hidden="true">×</span>
                </button>
              </div>
            )}

            <div>
              <Label className="text-white/80 text-xs uppercase tracking-wider">Pickup date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    data-testid="booking-date-trigger"
                    className={cn(
                      "mt-2 w-full justify-start text-left font-normal h-11",
                      "bg-[#0E0E0E] border-[#27272A] text-white hover:bg-[#151515] hover:text-white",
                      !date && "text-white/40"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4 text-[#D4AF37]" />
                    {date ? format(date, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 bg-[#111111] border-[#27272A] text-white" align="start">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={setDate}
                    initialFocus
                    disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div>
              <Label className="text-white/80 text-xs uppercase tracking-wider">Pickup time</Label>
              <div className="mt-2 flex gap-2">
                <Select
                  value={from24h(form.pickup_time).time12}
                  onValueChange={(v) =>
                    update("pickup_time")(to24h(v, from24h(form.pickup_time).meridiem || "AM"))
                  }
                >
                  <SelectTrigger
                    data-testid="booking-time"
                    className={cn(inputCls, "flex-1")}
                  >
                    <SelectValue placeholder="Time" />
                  </SelectTrigger>
                  <SelectContent
                  side="bottom"
                  sideOffset={6}
                  avoidCollisions={false}
                  className="bg-[#111111] border-[#27272A] text-white max-h-64"
                >
                    {TIME_SLOTS_12H.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={from24h(form.pickup_time).meridiem}
                  onValueChange={(v) => {
                    const t12 = from24h(form.pickup_time).time12 || "12:00";
                    update("pickup_time")(to24h(t12, v));
                  }}
                >
                  <SelectTrigger
                    data-testid="booking-time-meridiem"
                    className={cn(inputCls, "w-[88px] flex-shrink-0")}
                  >
                    <SelectValue placeholder="AM" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#111111] border-[#27272A] text-white">
                    <SelectItem value="AM">AM</SelectItem>
                    <SelectItem value="PM">PM</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-white/80 text-xs uppercase tracking-wider">Service type</Label>
              <Select value={form.service_type} onValueChange={update("service_type")}>
                <SelectTrigger
                  data-testid="booking-service-type"
                  className={cn(inputCls, "mt-2")}
                >
                  <SelectValue placeholder="Select service" />
                </SelectTrigger>
                <SelectContent
                  side="bottom"
                  sideOffset={6}
                  avoidCollisions={false}
                  className="bg-[#111111] border-[#27272A] text-white"
                >
                  {options.service_types?.map((s) => (
                    <SelectItem key={s} value={s} data-testid={`service-option-${s}`}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <label
              className="flex items-center gap-3 px-4 py-3 rounded-xl border border-[#27272A] bg-[#0E0E0E] cursor-pointer hover:border-[#D4AF37]/30 transition-colors"
              data-testid="booking-return-toggle"
            >
              <Switch
                checked={form.return_trip}
                onCheckedChange={(v) => update("return_trip")(!!v)}
                className="data-[state=checked]:bg-[#D4AF37]"
              />
              <span className="text-sm">
                <span className="text-white">Return / round trip</span>
                <span className="block text-xs text-white/50">Different drop-off OK</span>
              </span>
            </label>

            {form.service_type === "Airport Transfer" && (
              <div className="md:col-span-2" data-testid="airport-extras">
                <Label className="text-white/80 text-xs uppercase tracking-wider">
                  Flight number <span className="text-[#D4AF37]">*</span>
                </Label>
                <Input
                  data-testid="booking-flight-number"
                  required
                  className={cn(inputCls, "mt-2 uppercase tracking-wider")}
                  value={form.flight_number}
                  onChange={(e) => update("flight_number")(e.target.value)}
                  placeholder="e.g. UA1234, AA567, DL890"
                  maxLength={20}
                />
                <p className="text-[11px] text-white/50 mt-1.5">
                  Required for airport transfers. Your chauffeur monitors your flight live and
                  adjusts pickup automatically if you're delayed — at no extra charge.
                </p>
              </div>
            )}

            {form.service_type === "Airport Transfer" && (
              <div className="md:col-span-2" data-testid="meet-greet-wrap">
                <label
                  className="flex items-start gap-3 px-4 py-3 rounded-xl border border-[#27272A] bg-[#0E0E0E] cursor-pointer hover:border-[#D4AF37]/30 transition-colors"
                  data-testid="meet-greet-toggle"
                >
                  <Switch
                    checked={form.meet_and_greet}
                    onCheckedChange={(v) => update("meet_and_greet")(!!v)}
                    className="mt-0.5 data-[state=checked]:bg-[#D4AF37]"
                  />
                  <span className="text-sm flex-1">
                    <span className="text-white flex items-center gap-2 flex-wrap">
                      Add Meet &amp; Greet
                      <span
                        data-testid="meet-greet-popular-badge"
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#D4AF37]/15 border border-[#D4AF37]/40 text-[#D4AF37] text-[9px] font-semibold uppercase tracking-[0.18em]"
                      >
                        <Sparkles className="w-2.5 h-2.5" /> Most popular add-on
                      </span>
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            data-testid="meet-greet-info"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center justify-center w-5 h-5 rounded-full border border-[#D4AF37]/40 text-[#D4AF37] hover:bg-[#D4AF37]/10 transition-colors"
                            aria-label="What is Meet & Greet?"
                          >
                            <Info className="w-3 h-3" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent
                          align="start"
                          side="top"
                          className="w-80 bg-[#0A0A0A] border-[#27272A] text-white text-xs leading-relaxed"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="text-[#D4AF37] uppercase tracking-[0.2em] text-[10px] mb-2">
                            What is Meet &amp; Greet?
                          </div>
                          <p className="text-white/80">
                            Your chauffeur will park, walk inside the terminal, and meet you at
                            baggage claim holding a sign with your name. They'll help with your
                            luggage and escort you directly to your vehicle.
                          </p>
                          <p className="text-white/55 mt-2">
                            Ideal for international arrivals, families, and first-time visitors.
                            A flat fee is added to your fare.
                          </p>
                        </PopoverContent>
                      </Popover>
                    </span>
                    <span className="block text-xs text-white/55 mt-0.5">
                      Chauffeur meets you at baggage claim, assists with luggage, escorts you to the vehicle.
                    </span>
                    {quote?.meet_and_greet_fee ? (
                      <span
                        data-testid="meet-greet-fee"
                        className="inline-block mt-1.5 text-[11px] text-[#D4AF37] font-medium"
                      >
                        +${Number(quote.meet_and_greet_fee).toFixed(0)} flat fee
                      </span>
                    ) : null}
                  </span>
                </label>
              </div>
            )}

            {form.service_type === "Hourly Chauffeur" && (
              <div className="md:col-span-2" data-testid="booking-hours-wrap">
                <Label className="text-white/80 text-xs uppercase tracking-wider">
                  How many hours do you need? <span className="text-[#D4AF37]">*</span>
                </Label>
                <Input
                  data-testid="booking-hours"
                  required
                  type="number"
                  min={2}
                  max={24}
                  step={1}
                  inputMode="numeric"
                  className={cn(inputCls, "mt-2")}
                  value={form.hours}
                  onChange={(e) => update("hours")(e.target.value)}
                  placeholder="e.g. 4"
                />
                {(() => {
                  const h = Number(form.hours);
                  const valid = h >= 2 && h <= 24;
                  const tooLow = form.hours && h < 2;
                  if (valid) {
                    return (
                      <p
                        data-testid="booking-hours-included-miles"
                        className="text-[12px] text-[#D4AF37] mt-2 font-medium"
                      >
                        {h} hour{h > 1 ? "s" : ""} · ~{h * 20} miles included
                        <span className="text-white/45 font-normal"> (20 mi per hour)</span>
                      </p>
                    );
                  }
                  if (tooLow) {
                    return (
                      <p
                        data-testid="booking-hours-error"
                        className="text-[12px] text-red-400 mt-2 font-medium"
                      >
                        Minimum 2 hours required. Please increase your duration.
                      </p>
                    );
                  }
                  return (
                    <p className="text-[11px] text-white/50 mt-1.5">
                      Minimum 2 hours, maximum 24. Each hour includes 20 miles of driving.
                    </p>
                  );
                })()}
              </div>
            )}
          </div>

          {form.return_trip && (
            <div className="mt-4 space-y-4 rounded-xl border border-[#D4AF37]/25 bg-[#0E0E0E] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[#D4AF37] text-xs uppercase tracking-[0.25em] font-medium">
                    Return leg
                  </div>
                  <p className="text-white/60 text-xs mt-1">
                    Priced as a second leg (base + per-mile). Both legs are combined into your total.
                  </p>
                </div>
                <div className="text-[10px] uppercase tracking-widest text-[#D4AF37]/70 border border-[#D4AF37]/30 rounded-full px-2 py-1">
                  Round trip
                </div>
              </div>
              <PlacesAutocompleteInput
                label="Return drop-off location"
                testId="booking-return-location"
                strict={false}
                value={form.return_location}
                onChange={update("return_location")}
                placeholder="Defaults to your original pickup address"
              />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-white/80 text-xs uppercase tracking-wider">
                    Return date
                  </Label>
                  <Input
                    data-testid="booking-return-date"
                    type="date"
                    className={cn(inputCls, "mt-2")}
                    min={form.pickup_date || undefined}
                    value={form.return_date}
                    onChange={(e) => update("return_date")(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-white/80 text-xs uppercase tracking-wider">
                    Return time
                  </Label>
                  <Input
                    data-testid="booking-return-time"
                    type="time"
                    className={cn(inputCls, "mt-2")}
                    value={form.return_time}
                    onChange={(e) => update("return_time")(e.target.value)}
                  />
                </div>
              </div>
              <p className="text-[11px] text-white/45 leading-relaxed">
                Leave the address empty if the return drops off at the same place you were picked up.
              </p>
            </div>
          )}

          {/* Trip summary chip when quote available */}
          {(quoting || quote) && (
            <div
              data-testid="quote-summary"
              className="mt-6 rounded-xl border border-[#D4AF37]/20 bg-[#0E0E0E] px-5 py-3 flex flex-wrap items-center justify-between gap-3"
            >
              <span className="text-xs uppercase tracking-[0.25em] text-[#D4AF37]">
                {quoting
                  ? "Calculating…"
                  : quote?.pricing_mode === "hourly"
                  ? "Hourly chauffeur estimate"
                  : "Live trip estimate"}
              </span>
              {quote?.pricing_mode === "hourly" ? (
                <span className="text-sm text-white/70">
                  {quote.hours} hr · {quote.included_miles} miles included
                </span>
              ) : quote?.round_trip ? (
                <span className="text-sm text-white/70" data-testid="quote-round-trip-miles">
                  Round trip · leg 1 ~{quote.distance_miles} mi + leg 2 ~{quote.return_leg_miles} mi = ~{quote.total_round_trip_miles} mi total
                </span>
              ) : (
                quote?.distance_miles != null && (
                  <span className="text-sm text-white/70">
                    ~{quote.distance_miles} mi · ~{quote.duration_minutes} min
                  </span>
                )
              )}
              {quote?.fallback && (
                <span className="text-xs text-white/50">
                  Couldn't pin one address — try adding city or state
                </span>
              )}
            </div>
          )}

          {/* Surcharge explainer banner — appears when a long-distance area zone matches */}
          {quote?.surcharge_applied && (
            <div
              data-testid="surcharge-banner"
              className="mt-3 rounded-xl border border-amber-400/30 bg-amber-400/5 px-5 py-4 flex items-start gap-3"
            >
              <div className="w-7 h-7 rounded-full bg-amber-400/15 border border-amber-400/40 flex items-center justify-center flex-shrink-0">
                <span className="text-amber-300 text-sm font-bold">i</span>
              </div>
              <div className="flex-1 text-sm">
                <div className="text-amber-200 font-medium" data-testid="surcharge-zone-name">
                  Long-distance area fee · +${Number(quote.surcharge_applied.amount).toFixed(0)} ({quote.surcharge_applied.zone_name})
                </div>
                <p className="text-white/65 mt-1 leading-relaxed" data-testid="surcharge-reason">
                  {quote.surcharge_applied.reason}
                </p>
              </div>
            </div>
          )}

          {/* Surge / event date pricing banner */}
          {quote?.surge_applied && (
            <div
              data-testid="surge-banner"
              className="mt-3 rounded-xl border border-fuchsia-400/30 bg-fuchsia-400/5 px-5 py-4 flex items-start gap-3"
            >
              <div className="w-7 h-7 rounded-full bg-fuchsia-400/15 border border-fuchsia-400/40 flex items-center justify-center flex-shrink-0">
                <span className="text-fuchsia-300 text-sm font-bold">★</span>
              </div>
              <div className="flex-1 text-sm">
                <div className="text-fuchsia-200 font-medium" data-testid="surge-event-name">
                  Special event pricing
                  {quote.surge_applied.pricing_type === "multiplier" && quote.surge_applied.multiplier ? (
                    <span> · ×{Number(quote.surge_applied.multiplier).toFixed(2)}</span>
                  ) : null}
                  {quote.surge_applied.pricing_type === "flat_surcharge" && quote.surge_applied.flat_surcharge ? (
                    <span> · +${Number(quote.surge_applied.flat_surcharge).toFixed(0)}</span>
                  ) : null}
                  <span className="text-white/55"> · {quote.surge_applied.event_name}</span>
                </div>
                <p className="text-white/65 mt-1 leading-relaxed" data-testid="surge-reason">
                  {quote.surge_applied.reason}
                </p>
              </div>
            </div>
          )}

          {quote?.stop_fee_total ? (
            <div
              data-testid="stop-fee-banner"
              className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] px-5 py-3 flex items-start gap-3"
            >
              <div className="w-6 h-6 rounded-full bg-white/5 border border-white/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-white/65 text-xs">+</span>
              </div>
              <div className="flex-1 text-xs text-white/65 leading-relaxed">
                <strong className="text-white/85">
                  {quote.additional_stops_count} additional stop{quote.additional_stops_count > 1 ? "s" : ""} · +${Number(quote.stop_fee_total).toFixed(0)} total
                </strong>{" "}
                — flat ${Number(quote.per_stop_fee).toFixed(0)}/stop. Mileage detour is already included in the trip distance above.
              </div>
            </div>
          ) : null}

          {quote?.service_fee_percent ? (
            <div
              data-testid="service-fee-banner"
              className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] px-5 py-3 flex items-start gap-3"
            >
              <div className="w-6 h-6 rounded-full bg-white/5 border border-white/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-white/65 text-xs">i</span>
              </div>
              <div className="flex-1 text-xs text-white/65 leading-relaxed">
                <strong className="text-white/85">Quoted prices include a {Number(quote.service_fee_percent).toFixed(quote.service_fee_percent % 1 ? 1 : 0)}% service fee</strong> — this covers Stripe's secure card processing so refunds you receive (full or partial) come back at 100% rather than minus their processing cut. No hidden surprises.
              </div>
            </div>
          ) : null}

          {/* Divider */}
          <div className="my-12 gold-divider" />

          {/* STEP 2 — Vehicle picker */}
          <div id="fleet" className="scroll-mt-24">
            <SectionHead
              icon={Car}
              step="2"
              title="Choose your vehicle"
              sub="Tap a vehicle to select. Prices update once pickup & drop-off are entered."
            />

            <FleetPicker
              quote={quote}
              selected={form.vehicle_type}
              onSelect={(v) => update("vehicle_type")(v)}
            />
          </div>

          {/* Divider */}
          <div className="my-12 gold-divider" />

          {/* STEP 3 — Passenger details */}
          <SectionHead icon={User} step="3" title="Passenger details" />

          <div className="grid md:grid-cols-2 gap-5">
            <div>
              <Label className="text-white/80 text-xs uppercase tracking-wider">Full name</Label>
              <Input
                data-testid="booking-name"
                required
                className={cn(inputCls, "mt-2")}
                value={form.full_name}
                onChange={(e) => update("full_name")(e.target.value)}
                placeholder="Jane Doe"
              />
            </div>
            <div>
              <Label className="text-white/80 text-xs uppercase tracking-wider">Email</Label>
              <Input
                data-testid="booking-email"
                required
                type="email"
                pattern="^[^\s@]+@[^\s@]+\.[^\s@]{2,}$"
                title="Please enter a valid email address (e.g. name@example.com)"
                className={cn(inputCls, "mt-2")}
                value={form.email}
                onChange={(e) => update("email")(e.target.value)}
                placeholder="jane@example.com"
              />
              <p className="text-[11px] text-white/40 mt-1.5">
                Double-check your email — your confirmation number will be sent here.
              </p>
            </div>
            <div>
              <Label className="text-white/80 text-xs uppercase tracking-wider">Phone</Label>
              <Input
                data-testid="booking-phone"
                required
                className={cn(inputCls, "mt-2")}
                value={form.phone}
                onChange={(e) => update("phone")(e.target.value)}
                placeholder="(650) 410-0687"
              />
              <p className="text-[10px] text-white/40 mt-1.5">
                US numbers — we'll auto-add the +1 country code for SMS updates.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-white/80 text-xs uppercase tracking-wider">Passengers</Label>
                <Input
                  data-testid="booking-passengers"
                  type="number"
                  min={1}
                  max={60}
                  required
                  className={cn(inputCls, "mt-2")}
                  value={form.passengers}
                  onChange={(e) => update("passengers")(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-white/80 text-xs uppercase tracking-wider">Luggage</Label>
                <Input
                  data-testid="booking-luggage"
                  type="number"
                  min={0}
                  max={60}
                  className={cn(inputCls, "mt-2")}
                  value={form.luggage_count}
                  onChange={(e) => update("luggage_count")(e.target.value)}
                />
              </div>
            </div>

            {/* Child seat quantity picker — $20 per seat, up to 6.
                Legacy `child_seat` boolean is derived from the count on submit
                so older admin views + emails still show correctly. */}
            <div
              className="md:col-span-2 flex flex-wrap items-center justify-between gap-4 px-4 py-3 rounded-xl border border-[#27272A] bg-[#0E0E0E]"
              data-testid="booking-child-seat-block"
            >
              <div className="min-w-0">
                <div className="text-sm text-white">Child seats</div>
                <div className="text-xs text-white/50">
                  DOT-compliant, forward-facing · <span className="text-[#D4AF37]">$20 per seat</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  data-testid="child-seat-decrement"
                  onClick={() =>
                    update("child_seat_count")(Math.max(0, (Number(form.child_seat_count) || 0) - 1))
                  }
                  disabled={(Number(form.child_seat_count) || 0) === 0}
                  className="w-9 h-9 rounded-full border border-[#D4AF37]/40 text-[#D4AF37] hover:bg-[#D4AF37]/10 disabled:opacity-30 disabled:cursor-not-allowed text-lg leading-none"
                  aria-label="Decrease child seat count"
                >
                  −
                </button>
                <div
                  data-testid="child-seat-count-value"
                  className="min-w-[2.5rem] text-center text-white font-medium tabular-nums"
                >
                  {Number(form.child_seat_count) || 0}
                </div>
                <button
                  type="button"
                  data-testid="child-seat-increment"
                  onClick={() =>
                    update("child_seat_count")(Math.min(6, (Number(form.child_seat_count) || 0) + 1))
                  }
                  disabled={(Number(form.child_seat_count) || 0) >= 6}
                  className="w-9 h-9 rounded-full border border-[#D4AF37]/40 text-[#D4AF37] hover:bg-[#D4AF37]/10 disabled:opacity-30 disabled:cursor-not-allowed text-lg leading-none"
                  aria-label="Increase child seat count"
                >
                  +
                </button>
              </div>
            </div>

            <div className="md:col-span-2">
              <Label className="text-white/80 text-xs uppercase tracking-wider">Special requests</Label>
              <Textarea
                data-testid="booking-notes"
                className={cn(
                  "bg-[#0E0E0E] border-[#27272A] text-white placeholder:text-white/40 focus-visible:ring-[#D4AF37] focus-visible:border-[#D4AF37] mt-2 min-h-[100px]"
                )}
                value={form.notes}
                onChange={(e) => update("notes")(e.target.value)}
                placeholder="Complimentary water, sign with name, scenic route, etc."
              />
            </div>
          </div>

          {/* Two-step confirmation notice — sets expectation BEFORE submit */}
          <div
            data-testid="two-step-notice"
            className="mt-8 rounded-xl border border-[#D4AF37]/30 bg-[#D4AF37]/[0.06] px-4 py-3 flex items-start gap-3"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-4 h-4 text-[#D4AF37] flex-shrink-0 mt-0.5"
            >
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
            <div className="text-xs text-white/75 leading-relaxed">
              <span className="text-white font-medium">How it works.</span>{" "}
              You'll pay now via Stripe to hold your slot. We personally review every
              booking and send you a final{" "}
              <span className="text-[#D4AF37]">chauffeur confirmation within an hour</span>.
              In the rare case we can't fulfill your request, we'll refund you instantly.
            </div>
          </div>

          {/* Promo Code — always visible so customers can type their code early.
              Apply still requires a vehicle to be selected (guarded in applyPromo). */}
          <div data-testid="promo-section" className="mt-4 rounded-xl border border-[#1F1F1F] bg-[#0A0A0A] p-4">
              {promoApplied ? (
                <>
                  <div className="flex flex-wrap items-center gap-3 justify-between">
                    <div className="flex items-center gap-3">
                      <div className="px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-mono tracking-wider">
                        {promoApplied.code}
                      </div>
                      <div className="text-sm">
                        <div className="text-emerald-300 flex items-center gap-2 flex-wrap">
                          Saved ${promoApplied.discount.toFixed(2)} ·{" "}
                          <span className="text-white/65">
                            New total ${promoApplied.final_amount.toFixed(2)}
                          </span>
                          {promoApplied.auto_applied && (
                            <span className="text-[9px] uppercase tracking-[0.18em] text-[#D4AF37] bg-[#D4AF37]/10 border border-[#D4AF37]/30 rounded px-1.5 py-[1px]">
                              Auto-applied
                            </span>
                          )}
                        </div>
                        {promoApplied.description && (
                          <div className="text-white/45 text-xs mt-0.5">{promoApplied.description}</div>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={clearPromo}
                      data-testid="promo-remove"
                      className="text-xs text-white/55 hover:text-white underline"
                    >
                      Remove
                    </button>
                  </div>

                  {/* Override input — visible only when the CURRENT promo is
                      auto-applied. Lets customers redeem a personal code
                      (e.g. referral, VIP) without first manually removing the
                      default promo. Typing + Apply replaces the auto-promo. */}
                  {promoApplied.auto_applied && (
                    <div className="mt-3 pt-3 border-t border-white/5">
                      <div className="text-[10px] uppercase tracking-[0.22em] text-white/55 mb-2">
                        Have a personal code? Enter it below to replace the auto-applied one.
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={promoCode}
                          onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                          placeholder="e.g. FRIEND10"
                          data-testid="promo-override-input"
                          className="flex-1 h-10 px-3 rounded-lg bg-[#0E0E0E] border border-[#27272A] text-white placeholder:text-white/35 text-sm font-mono tracking-wider focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]"
                          maxLength={40}
                        />
                        <Button
                          type="button"
                          onClick={applyPromo}
                          disabled={promoStatus.checking || !promoCode.trim()}
                          data-testid="promo-override-apply"
                          className="bg-white/10 hover:bg-white/15 text-white rounded-lg h-10 px-4 text-sm font-medium border border-white/15"
                        >
                          {promoStatus.checking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Apply"}
                        </Button>
                      </div>
                      {promoStatus.error && (
                        <div data-testid="promo-error" className="mt-2 text-xs text-red-400">
                          {promoStatus.error}
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="text-[10px] uppercase tracking-[0.25em] text-[#D4AF37] mb-2">
                    Have a promo code?
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={promoCode}
                      onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                      placeholder="e.g. WELCOME20"
                      data-testid="promo-input"
                      className="flex-1 h-10 px-3 rounded-lg bg-[#0E0E0E] border border-[#27272A] text-white placeholder:text-white/35 text-sm font-mono tracking-wider focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]"
                      maxLength={40}
                    />
                    <Button
                      type="button"
                      onClick={applyPromo}
                      disabled={promoStatus.checking || !promoCode.trim()}
                      data-testid="promo-apply"
                      className="bg-white/10 hover:bg-white/15 text-white rounded-lg h-10 px-4 text-sm font-medium border border-white/15"
                    >
                      {promoStatus.checking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Apply"}
                    </Button>
                  </div>
                  {promoStatus.error && (
                    <div data-testid="promo-error" className="mt-2 text-xs text-red-400">
                      {promoStatus.error}
                    </div>
                  )}
                </>
              )}
            </div>

          {/* Cancellation policy chip — collapsed by default, expandable */}
          <div className="mt-4">
            <CancellationPolicy
              airport={form.service_type === "Airport Transfer"}
              variant="compact"
            />
          </div>

          {/* Wait time policy + consent (REQUIRED for all bookings) */}
          {waitPolicy && (
            <div data-testid="wait-time-consent-block" className="mt-3 rounded-xl border border-[#1F1F1F] bg-[#0A0A0A] p-5">
              <div className="text-xs uppercase tracking-[0.25em] text-[#D4AF37] mb-3">
                Wait time &amp; damages policy
              </div>
              <div className="text-sm text-white/75 leading-relaxed space-y-2">
                <p>
                  <strong className="text-white">Airport pickups</strong> include a
                  <strong className="text-white"> 45-minute</strong> grace period after your flight lands.
                </p>
                <p>
                  <strong className="text-white">All other trips</strong> include a
                  <strong className="text-white"> 15-minute</strong> grace period after your scheduled pickup.
                </p>
                {(() => {
                  const rate = form.vehicle_type ? Number(waitPolicy?.rates?.[form.vehicle_type] || 0) : 0;
                  if (form.vehicle_type && rate > 0) {
                    return (
                      <p data-testid="wait-rate-dynamic">
                        Beyond the grace period, a per-minute wait fee of{" "}
                        <strong className="text-[#D4AF37]">${rate.toFixed(2)}/min</strong>{" "}
                        applies for the <strong className="text-white">{form.vehicle_type}</strong>.
                      </p>
                    );
                  }
                  return (
                    <p data-testid="wait-rate-generic">
                      Beyond the grace period, a per-minute wait fee applies based on your selected vehicle class (rate is shown above on the vehicle card and on your receipt).
                    </p>
                  );
                })()}
                <p>
                  If we wait <strong className="text-white">45 minutes beyond the grace period</strong> without contact, the reservation is treated as a no-show — no refund.
                </p>
                <p className="pt-1 border-t border-white/5">
                  <strong className="text-white">Damages &amp; incidentals.</strong> If the vehicle is damaged, soiled, or requires special cleaning during your trip, the actual repair/cleaning cost may be charged to the card on file. Every charge is itemized with the reason and emailed to you.
                </p>
                <p className="pt-2 text-white/65 text-[13px]">
                  Your card stays securely on file with <strong className="text-white">Stripe</strong> (we never see or store the full card number). <strong className="text-white">We only charge it if something actually happens</strong> — the remaining balance the day before your trip, plus wait time, damages, or extra stops only if they occur. If your trip goes smoothly, nothing extra is charged. Every charge is emailed to you with a receipt.
                </p>
              </div>
              <label
                data-testid="wait-consent-label"
                className="flex items-start gap-3 mt-4 pt-4 border-t border-white/10 cursor-pointer"
              >
                <input
                  type="checkbox"
                  data-testid="wait-consent-checkbox"
                  checked={waitConsent}
                  onChange={(e) => setWaitConsent(e.target.checked)}
                  required
                  className="mt-1 h-5 w-5 accent-[#D4AF37] cursor-pointer flex-shrink-0"
                />
                <span className="text-sm text-white/85 leading-relaxed">
                  I authorize TuranEliteLimo to charge the card I&apos;m about to enter (kept securely on file by Stripe) for the{" "}
                  <strong className="text-white">remaining balance</strong> the day before service, plus any{" "}
                  <strong className="text-white">wait time, damages, or extra stops</strong> that actually occur during my trip, per the policy above. I&apos;ll get an email receipt for every charge.
                </span>
              </label>

              {/* ---- Twilio A2P 10DLC compliant SMS opt-in (VOLUNTARY) ----
                  Two separate, non-pre-checked checkboxes. Neither is required
                  to submit the booking — per carrier rules (2024+), SMS consent
                  cannot be a condition of service. Customers who opt out still
                  receive booking confirmations & trip updates via EMAIL.
                    1. Transactional SMS (optional) — confirmations, trip
                       updates, driver dispatch, reminders.
                    2. Promotional SMS (optional) — offers, seasonal promos.
                  Includes all 7 required disclosures per Twilio's reviewer
                  checklist: phone capture, consent language, message description,
                  frequency, msg & data rates, STOP/HELP, T&C + Privacy links. */}
              <div
                data-testid="sms-consent-block"
                className="mt-4 pt-4 border-t border-white/10 space-y-3"
              >
                <label
                  data-testid="sms-consent-label"
                  className="flex items-start gap-3 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    data-testid="sms-consent-checkbox"
                    checked={smsConsent}
                    onChange={(e) => setSmsConsent(e.target.checked)}
                    className="mt-1 h-5 w-5 accent-[#D4AF37] cursor-pointer flex-shrink-0"
                  />
                  <span className="text-sm text-white/85 leading-relaxed">
                    <strong className="text-white">Yes, text me about my trip.</strong>{" "}
                    By checking this box, I agree to receive SMS messages from TuranEliteLimo at the phone number above for{" "}
                    <strong className="text-white">booking confirmations, trip status updates, driver dispatch notifications, pickup reminders, and quote responses</strong>.
                    Message frequency varies (typically 2–5 messages per booking).{" "}
                    <strong className="text-white">Msg &amp; data rates may apply.</strong>{" "}
                    Reply <strong className="text-white">STOP</strong> to unsubscribe or <strong className="text-white">HELP</strong> for help.
                    See our <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-[#D4AF37] underline">Terms of Service</a> and <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-[#D4AF37] underline">Privacy Policy</a>.{" "}
                    <span className="text-white/50">Optional — leave unchecked for email-only updates.</span>
                  </span>
                </label>

                <label
                  data-testid="sms-promo-optin-label"
                  className="flex items-start gap-3 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    data-testid="sms-promo-optin-checkbox"
                    checked={smsPromoOptIn}
                    onChange={(e) => setSmsPromoOptIn(e.target.checked)}
                    className="mt-1 h-5 w-5 accent-[#D4AF37] cursor-pointer flex-shrink-0"
                  />
                  <span className="text-sm text-white/70 leading-relaxed">
                    Optionally, send me occasional <strong className="text-white">promotional SMS</strong> from TuranEliteLimo — exclusive offers, seasonal promos, and event packages. Up to 4 messages per month. Msg &amp; data rates may apply. Reply STOP to unsubscribe anytime.
                  </span>
                </label>
              </div>

              {/* Optional marketing EMAIL opt-in. Default OFF — CAN-SPAM compliant.
                  Separate from SMS so customers control each channel independently. */}
              <label
                data-testid="marketing-optin-label"
                className="flex items-start gap-3 mt-3 cursor-pointer"
              >
                <input
                  type="checkbox"
                  data-testid="marketing-optin-checkbox"
                  checked={marketingOptIn}
                  onChange={(e) => setMarketingOptIn(e.target.checked)}
                  className="mt-1 h-5 w-5 accent-[#D4AF37] cursor-pointer flex-shrink-0"
                />
                <span className="text-sm text-white/70 leading-relaxed">
                  Email me occasional offers, seasonal promos, and updates from TuranEliteLimo. Unsubscribe anytime via any email&apos;s footer link.
                </span>
              </label>
            </div>
          )}

          {/* ---- Payment timing choice (instant-price vehicles only) ---- */}
          {(() => {
            const vq = (quote?.quotes || []).find((q) => q.vehicle_type === form.vehicle_type);
            if (!vq || vq.price == null) return null;
            const optCls = (active) =>
              `text-left rounded-xl border p-4 transition cursor-pointer relative ${
                active
                  ? "border-[#D4AF37] bg-[#D4AF37]/10 ring-1 ring-[#D4AF37]/40"
                  : "border-[#1F1F1F] bg-[#0E0E0E] hover:border-[#D4AF37]/40"
              }`;
            return (
              <div className="mt-6" data-testid="pay-timing-block">
                <div className="text-[10px] uppercase tracking-[0.25em] text-white/55 mb-2.5">
                  How would you like to pay?
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    data-testid="pay-timing-now"
                    onClick={() => setPayTiming("now")}
                    className={optCls(payTiming === "now")}
                  >
                    <div className="text-white text-sm font-medium">Pay now</div>
                    <div className="text-white/55 text-xs mt-1.5 leading-relaxed">
                      Secure checkout via Stripe. Locks in your reservation instantly. Apple Pay &amp; Google Pay ready.
                    </div>
                  </button>
                  <button
                    type="button"
                    data-testid="pay-timing-after"
                    onClick={() => setPayTiming("after")}
                    className={optCls(payTiming === "after")}
                  >
                    <div className="text-white text-sm font-medium flex items-center gap-2">
                      Book Now · Pay After Ride
                      <span className="text-[9px] uppercase tracking-widest bg-[#D4AF37]/25 border border-[#D4AF37]/50 text-[#D4AF37] px-1.5 py-0.5 rounded-full font-semibold">
                        $0 today
                      </span>
                    </div>
                    <div className="text-white/60 text-xs mt-1.5 leading-relaxed">
                      Card securely verified &amp; saved by Stripe — <span className="text-white/85">never charged today</span>. Pay only after your ride is complete. Apple Pay &amp; Google Pay ready.
                    </div>
                  </button>
                </div>
              </div>
            );
          })()}

          {/* Submit */}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
            <div className="text-xs text-white/55">
              {(() => {
                const vq = (quote?.quotes || []).find((q) => q.vehicle_type === form.vehicle_type);
                const isCallOnly = vq && vq.price == null;
                if (form.vehicle_type && isCallOnly) {
                  return (
                    <span>We'll call you with a custom quote — no payment required now.</span>
                  );
                }
                return <StripeBadge />;
              })()}
            </div>
            <Button
              type="submit"
              data-testid="booking-submit"
              disabled={submitting || (form.vehicle_type && waitPolicy && !waitConsent)}
              className="bg-[#D4AF37] text-black hover:bg-[#B3922E] rounded-full px-8 h-12 font-medium disabled:opacity-50"
            >
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {submitting
                ? "Processing…"
                : (() => {
                    const vq = (quote?.quotes || []).find((q) => q.vehicle_type === form.vehicle_type);
                    if (vq && vq.price != null) {
                      const finalPrice = promoApplied ? promoApplied.final_amount : vq.price;
                      if (payTiming === "after") {
                        return `Reserve Now · $0 Due Today →`;
                      }
                      return `Secure Checkout · $${finalPrice.toFixed(2)} →`;
                    }
                    if (vq && vq.price == null) {
                      return "Request Reservation";
                    }
                    return "Proceed to Payment";
                  })()}
            </Button>
          </div>

          {/* Wallet accept-marks + Google Reviews trust strip — shown as soon
              as the vehicle is picked so customers see they can Apple Pay /
              Google Pay in one tap on the Stripe page (no card entry). */}
          {(() => {
            const vq = (quote?.quotes || []).find((q) => q.vehicle_type === form.vehicle_type);
            if (!vq || vq.price == null) return null;
            return (
              <div className="mt-5 pt-5 border-t border-white/5">
                <TrustPaymentBadges testId="booking-trust-badges" />
              </div>
            );
          })()}
        </form>
      </div>
    </section>
  );
}
