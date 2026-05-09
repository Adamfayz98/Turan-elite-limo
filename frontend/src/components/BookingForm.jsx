import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon, Loader2, Plus, X, MapPin, Car, User } from "lucide-react";
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
import { api, formatApiErrorDetail } from "@/lib/api";
import { cn } from "@/lib/utils";

const inputCls =
  "bg-[#0E0E0E] border-[#27272A] text-white placeholder:text-white/40 focus-visible:ring-[#D4AF37] focus-visible:border-[#D4AF37] h-11";

const TIME_SLOTS = (() => {
  const out = [];
  for (let h = 0; h < 24; h++) {
    for (let m of [0, 15, 30, 45]) {
      const hh = String(h).padStart(2, "0");
      const mm = String(m).padStart(2, "0");
      out.push(`${hh}:${mm}`);
    }
  }
  return out;
})();

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
  const [stops, setStops] = useState([]);
  const [quote, setQuote] = useState(null);
  const [quoting, setQuoting] = useState(false);
  const quoteTimer = useRef(null);
  const [form, setForm] = useState(initialForm);

  useEffect(() => {
    api.get("/options").then((r) => setOptions(r.data)).catch(() => {});
  }, []);

  const update = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  // Debounced live quote
  useEffect(() => {
    const pickup = form.pickup_location.trim();
    const dropoff = form.dropoff_location.trim();
    if (quoteTimer.current) clearTimeout(quoteTimer.current);
    if (pickup.length < 3 || dropoff.length < 3) {
      setQuote(null);
      return;
    }
    quoteTimer.current = setTimeout(async () => {
      setQuoting(true);
      try {
        const { data } = await api.post("/quote", {
          pickup_location: pickup,
          dropoff_location: dropoff,
        });
        setQuote(data);
      } catch {
        setQuote(null);
      } finally {
        setQuoting(false);
      }
    }, 1100);
    return () => quoteTimer.current && clearTimeout(quoteTimer.current);
  }, [form.pickup_location, form.dropoff_location]);

  const addStop = () => setStops((s) => [...s, ""]);
  const removeStop = (idx) => setStops((s) => s.filter((_, i) => i !== idx));
  const updateStop = (idx, v) =>
    setStops((s) => s.map((x, i) => (i === idx ? v : x)));

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!date) return toast.error("Please pick a date.");
    if (!form.service_type) return toast.error("Please choose a service type.");
    if (!form.vehicle_type) return toast.error("Please select a vehicle.");
    if (!form.pickup_time) return toast.error("Please select a pickup time.");
    if (form.return_trip && !form.return_location.trim())
      return toast.error("Please enter a return drop-off location.");
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        passengers: Number(form.passengers) || 1,
        luggage_count: Number(form.luggage_count) || 0,
        additional_stops: stops.map((s) => s.trim()).filter(Boolean),
        return_location: form.return_trip ? form.return_location : "",
        pickup_date: format(date, "yyyy-MM-dd"),
      };
      const { data: booking } = await api.post("/bookings", payload);

      // Determine if this vehicle has an instant price (i.e., not "Call for quote")
      const vQuote = (quote?.quotes || []).find((q) => q.vehicle_type === form.vehicle_type);
      const hasInstantPrice = vQuote && vQuote.price != null;

      if (hasInstantPrice) {
        // Proceed straight to Stripe checkout
        try {
          const { data: co } = await api.post("/payments/checkout", {
            booking_id: booking.id,
            origin_url: window.location.origin,
          });
          window.location.href = co.url;
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
              <div key={i} className="md:col-span-2">
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <PlacesAutocompleteInput
                      label={`Additional stop #${i + 1}`}
                      testId={`booking-stop-${i}`}
                      value={stop}
                      onChange={(v) => updateStop(i, v)}
                      placeholder="123 Market St, San Francisco"
                    />
                  </div>
                  <Button
                    type="button"
                    onClick={() => removeStop(i)}
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
              <Select value={form.pickup_time} onValueChange={update("pickup_time")}>
                <SelectTrigger
                  data-testid="booking-time"
                  className={cn(inputCls, "mt-2")}
                >
                  <SelectValue placeholder="Select time" />
                </SelectTrigger>
                <SelectContent className="bg-[#111111] border-[#27272A] text-white max-h-64">
                  {TIME_SLOTS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                <SelectContent className="bg-[#111111] border-[#27272A] text-white">
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
                {quoting ? "Calculating route…" : "Live trip estimate"}
              </span>
              {quote?.distance_miles != null && (
                <span className="text-sm text-white/70">
                  ~{quote.distance_miles} mi · ~{quote.duration_minutes} min
                </span>
              )}
              {quote?.fallback && (
                <span className="text-xs text-white/50">
                  Couldn't pin one address — try adding city or state
                </span>
              )}
            </div>
          )}

          {/* Divider */}
          <div className="my-12 gold-divider" />

          {/* STEP 2 — Vehicle picker */}
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
                className={cn(inputCls, "mt-2")}
                value={form.email}
                onChange={(e) => update("email")(e.target.value)}
                placeholder="jane@example.com"
              />
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

          {/* Submit */}
          <div className="mt-10 flex flex-wrap items-center justify-between gap-4">
            <p className="text-xs text-white/50">
              {(() => {
                const vq = (quote?.quotes || []).find((q) => q.vehicle_type === form.vehicle_type);
                const isCallOnly = vq && vq.price == null;
                if (form.vehicle_type && isCallOnly) {
                  return "We'll call you with a custom quote — no payment required now.";
                }
                return "Secure payment via Stripe. You'll receive a confirmation email instantly.";
              })()}
            </p>
            <Button
              type="submit"
              data-testid="booking-submit"
              disabled={submitting}
              className="bg-[#D4AF37] text-black hover:bg-[#B3922E] rounded-full px-8 h-12 font-medium"
            >
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {submitting
                ? "Processing…"
                : (() => {
                    const vq = (quote?.quotes || []).find((q) => q.vehicle_type === form.vehicle_type);
                    if (vq && vq.price != null) {
                      return `Proceed to Payment · ${vq.formatted_price}`;
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
