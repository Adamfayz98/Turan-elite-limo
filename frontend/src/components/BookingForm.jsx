import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon, Loader2, Plus, X } from "lucide-react";
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

export default function BookingForm() {
  const [options, setOptions] = useState({ vehicle_types: [], service_types: [] });
  const [date, setDate] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [stops, setStops] = useState([]);
  const [form, setForm] = useState(initialForm);

  useEffect(() => {
    api
      .get("/options")
      .then((r) => setOptions(r.data))
      .catch(() => {});
  }, []);

  const update = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const addStop = () => setStops((s) => [...s, ""]);
  const removeStop = (idx) => setStops((s) => s.filter((_, i) => i !== idx));
  const updateStop = (idx, v) =>
    setStops((s) => s.map((x, i) => (i === idx ? v : x)));

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!date) {
      toast.error("Please pick a date.");
      return;
    }
    if (!form.service_type || !form.vehicle_type || !form.pickup_time) {
      toast.error("Please fill all required fields.");
      return;
    }
    if (form.return_trip && !form.return_location.trim()) {
      toast.error("Please enter a return drop-off location.");
      return;
    }
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
      await api.post("/bookings", payload);
      toast.success("Reservation request received. We'll confirm shortly.");
      setForm(initialForm);
      setStops([]);
      setDate(null);
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
      <div className="max-w-7xl mx-auto grid lg:grid-cols-12 gap-16">
        {/* Left intro */}
        <div className="lg:col-span-4">
          <span className="text-xs tracking-[0.3em] uppercase text-[#D4AF37]">02 — Reserve</span>
          <h2 className="font-serif text-4xl md:text-5xl mt-6 leading-tight">
            Reserve your <span className="italic">private</span> chauffeur
          </h2>
          <p className="mt-6 text-white/60 leading-relaxed">
            Tell us where you're going. A reservations specialist will confirm your ride within minutes — typically faster.
          </p>
          <div className="mt-10 space-y-4 text-sm">
            <div className="flex items-start gap-3">
              <span className="mt-1 inline-block w-1.5 h-1.5 rounded-full bg-[#D4AF37]" />
              <p className="text-white/70">
                <span className="text-white">Flat-rate quotes.</span> No surge pricing — ever.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <span className="mt-1 inline-block w-1.5 h-1.5 rounded-full bg-[#D4AF37]" />
              <p className="text-white/70">
                <span className="text-white">60-min flight tracking.</span> Complimentary wait time on airport pickups.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <span className="mt-1 inline-block w-1.5 h-1.5 rounded-full bg-[#D4AF37]" />
              <p className="text-white/70">
                <span className="text-white">Multi-stop & round-trip.</span> Build your itinerary, we handle the rest.
              </p>
            </div>
          </div>
        </div>

        {/* Form */}
        <form
          onSubmit={onSubmit}
          data-testid="booking-form"
          className="lg:col-span-8 bg-[#0A0A0A] border border-[#1F1F1F] rounded-2xl p-6 md:p-10"
        >
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
                placeholder="(555) 555-5555"
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

            <div>
              <Label className="text-white/80 text-xs uppercase tracking-wider">Vehicle</Label>
              <Select value={form.vehicle_type} onValueChange={update("vehicle_type")}>
                <SelectTrigger
                  data-testid="booking-vehicle-type"
                  className={cn(inputCls, "mt-2")}
                >
                  <SelectValue placeholder="Select vehicle" />
                </SelectTrigger>
                <SelectContent className="bg-[#111111] border-[#27272A] text-white">
                  {options.vehicle_types?.map((v) => (
                    <SelectItem key={v} value={v} data-testid={`vehicle-option-${v}`}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

            <div className="md:col-span-2">
              <Label className="text-white/80 text-xs uppercase tracking-wider">Pickup location</Label>
              <Input
                data-testid="booking-pickup"
                required
                className={cn(inputCls, "mt-2")}
                value={form.pickup_location}
                onChange={(e) => update("pickup_location")(e.target.value)}
                placeholder="SFO Airport, Terminal 2"
              />
            </div>

            {/* Dynamic stops */}
            {stops.map((stop, i) => (
              <div key={i} className="md:col-span-2">
                <Label className="text-white/80 text-xs uppercase tracking-wider">
                  Additional stop #{i + 1}
                </Label>
                <div className="flex gap-2 mt-2">
                  <Input
                    data-testid={`booking-stop-${i}`}
                    className={cn(inputCls, "flex-1")}
                    value={stop}
                    onChange={(e) => updateStop(i, e.target.value)}
                    placeholder="123 Market St, San Francisco"
                  />
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

            <div className="md:col-span-2 -mt-2">
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

            <div className="md:col-span-2">
              <Label className="text-white/80 text-xs uppercase tracking-wider">Drop-off location</Label>
              <Input
                data-testid="booking-dropoff"
                required
                className={cn(inputCls, "mt-2")}
                value={form.dropoff_location}
                onChange={(e) => update("dropoff_location")(e.target.value)}
                placeholder="Four Seasons San Francisco"
              />
            </div>

            {/* Toggles row */}
            <div className="md:col-span-2 flex flex-col sm:flex-row gap-4 pt-2 pb-2">
              <label
                className="flex items-center gap-3 px-4 py-3 rounded-xl border border-[#27272A] bg-[#0E0E0E] cursor-pointer hover:border-[#D4AF37]/30 transition-colors flex-1"
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

              <label
                className="flex items-center gap-3 px-4 py-3 rounded-xl border border-[#27272A] bg-[#0E0E0E] cursor-pointer hover:border-[#D4AF37]/30 transition-colors flex-1"
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
              <div className="md:col-span-2">
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

          <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
            <p className="text-xs text-white/50">
              By submitting, you agree to receive a confirmation by phone or email.
            </p>
            <Button
              type="submit"
              data-testid="booking-submit"
              disabled={submitting}
              className="bg-[#D4AF37] text-black hover:bg-[#B3922E] rounded-full px-8 h-12 font-medium"
            >
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {submitting ? "Sending…" : "Request Reservation"}
            </Button>
          </div>
        </form>
      </div>
    </section>
  );
}
