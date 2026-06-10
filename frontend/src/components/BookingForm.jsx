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
import StripeBadge from "@/components/StripeBadge";
import CancellationPolicy from "@/components/CancellationPolicy";
import CheckoutRedirectOverlay from "@/components/CheckoutRedirectOverlay";
import { api, formatApiErrorDetail } from "@/lib/api";
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
  return_trip: false,
  return_location: "",
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
  const quoteTimer = useRef(null);
  const [form, setForm] = useState(initialForm);
  const [waitConsent, setWaitConsent] = useState(false);
  const [waitPolicy, setWaitPolicy] = useState(null);
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  // Promo code state
  const [promoCode, setPromoCode] = useState("");
  const [promoApplied, setPromoApplied] = useState(null); // {code, discount, final_amount, description}
  const [promoStatus, setPromoStatus] = useState({ checking: false, error: null });
  // Visible "Opening secure checkout..." overlay with manual-click fallback
  // for browsers that silently block window.location.href to Stripe.
  const [checkoutOverlay, setCheckoutOverlay] = useState(null); // { url, bookingId, sessionId } | null

  useEffect(() => {
    api.get("/options").then((r) => setOptions(r.data)).catch(() => {});
    api.get("/pricing/wait-rates").then((r) => setWaitPolicy(r.data)).catch(() => {});
  }, []);

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
        });
        setQuote(data);
      } catch (e) {
        console.warn("[BookingForm] live quote failed:", e);
        setQuote(null);
      } finally {
        setQuoting(false);
      }
    }, 1100);
    return () => quoteTimer.current && clearTimeout(quoteTimer.current);
  }, [form.pickup_location, form.dropoff_location, form.service_type, form.hours, form.meet_and_greet, date, stops]);

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
    setPromoApplied(null);
    setPromoCode("");
    setPromoStatus({ checking: false, error: null });
  };

  // If the vehicle changes after applying, re-validate against new amount
  useEffect(() => {
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
  // vehicle, surface it in the promo code field so the customer pays the
  // discounted amount at checkout (no manual typing required).
  useEffect(() => {
    try {
      const vq = (quote?.quotes || []).find((q) => q.vehicle_type === form.vehicle_type);
      const autoCode = vq?.applied_promo?.code;
      if (autoCode && !promoCode) {
        setPromoCode(autoCode);
      }
    } catch (e) {
      // silent — never block the form
    }
  }, [quote, form.vehicle_type, promoCode]);

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
    if (form.return_trip && !form.return_location.trim())
      return toast.error("Please enter a return drop-off location.");
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        passengers: Number(form.passengers) || 1,
        luggage_count: Number(form.luggage_count) || 0,
        additional_stops: stops.map((s) => s.value.trim()).filter(Boolean),
        return_location: form.return_trip ? form.return_location : "",
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
        marketing_opt_in: marketingOptIn,
      };
      const { data: booking } = await api.post("/bookings", payload);

      // Determine if this vehicle has an instant price (i.e., not "Call for quote")
      const vQuote = (quote?.quotes || []).find((q) => q.vehicle_type === form.vehicle_type);
      const hasInstantPrice = vQuote && vQuote.price != null;

      if (hasInstantPrice) {
        // Show a visible "Opening secure checkout…" overlay that triggers the
        // redirect AND offers a manual fallback button if the browser blocks
        // the auto-redirect (iOS Safari ITP, popup blockers, etc).
        try {
          const { data: co } = await api.post("/payments/checkout", {
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
      className="relative py-24 md:py-32 px-6 md:px-10 border-t border-white/5"
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
        <div className="text-center mb-14">
          <span className="text-xs tracking-[0.3em] uppercase text-[#D4AF37]">02 — Reserve</span>
          <h2 className="font-serif text-4xl md:text-5xl mt-6 leading-tight">
            Reserve your <span className="italic">private</span> chauffeur
          </h2>
          <p className="mt-5 text-white/55 max-w-2xl mx-auto leading-relaxed">
            Three quick steps. Live pricing as soon as you tell us where you're going.
          </p>
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
                value={form.dropoff_location}
                onChange={update("dropoff_location")}
                placeholder="Four Seasons San Francisco"
              />
            </div>

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
            <div className="mt-4">
              <Label className="text-white/80 text-xs uppercase tracking-wider">
                Return drop-off location
              </Label>
              <Input
                data-testid="booking-return-location"
                className={cn(inputCls, "mt-2")}
                value={form.return_location}
                onChange={(e) => update("return_location")(e.target.value)}
                placeholder="Same as pickup, or new address"
              />
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

            <label
              className="flex items-center gap-3 px-4 py-3 rounded-xl border border-[#27272A] bg-[#0E0E0E] cursor-pointer hover:border-[#D4AF37]/30 transition-colors md:col-span-2"
              data-testid="booking-child-seat-toggle"
            >
              <Checkbox
                checked={form.child_seat}
                onCheckedChange={(v) => update("child_seat")(!!v)}
                className="border-white/30 data-[state=checked]:bg-[#D4AF37] data-[state=checked]:border-[#D4AF37] data-[state=checked]:text-black"
              />
              <span className="text-sm">
                <span className="text-white">Add child seat</span>
                <span className="block text-xs text-white/50">Complimentary on request</span>
              </span>
            </label>

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
                <div className="flex flex-wrap items-center gap-3 justify-between">
                  <div className="flex items-center gap-3">
                    <div className="px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-mono tracking-wider">
                      {promoApplied.code}
                    </div>
                    <div className="text-sm">
                      <div className="text-emerald-300">
                        Saved ${promoApplied.discount.toFixed(2)} ·{" "}
                        <span className="text-white/65">
                          New total ${promoApplied.final_amount.toFixed(2)}
                        </span>
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
                  I authorize TuranEliteLimo to charge my card on file for{" "}
                  <strong className="text-white">wait time fees</strong> beyond the grace period and for{" "}
                  <strong className="text-white">trip damages or incidentals</strong> (e.g., spills, vehicle damage, excessive cleaning), per the policy above. All charges are itemized and emailed to me.
                </span>
              </label>

              {/* Optional marketing opt-in. Default OFF — CAN-SPAM compliant. */}
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
                  Send me occasional offers, seasonal promos, and updates from TuranEliteLimo. I can unsubscribe anytime.
                </span>
              </label>
            </div>
          )}

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
                      return `Proceed to Payment · $${finalPrice.toFixed(2)}`;
                    }
                    if (vq && vq.price == null) {
                      return "Request Reservation";
                    }
                    return "Proceed to Payment";
                  })()}
            </Button>
          </div>
        </form>
      </div>
    </section>
  );
}
