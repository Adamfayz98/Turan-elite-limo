import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, Pencil } from "lucide-react";
import { api, formatApiErrorDetail } from "@/lib/api";

const inputCls =
  "bg-[#0E0E0E] border-[#27272A] text-white placeholder:text-white/40 focus-visible:ring-[#D4AF37] focus-visible:border-[#D4AF37]";

/**
 * Admin edit dialog for trip details on an existing booking. Works for paid,
 * card_on_file, and unpaid bookings — unlike the customer-facing /modify
 * endpoint which blocks changes once paid.
 *
 * Only surfaces the fields dispatch actually needs to fix in the field:
 *   flight_number, pickup_date, pickup_time, pickup_location,
 *   dropoff_location, vehicle_type, passengers, luggage_count, notes,
 *   meet_and_greet, hours (hourly only).
 *
 * By default it does NOT recompute the fare (admin keeps the agreed price).
 * Toggle "Recompute quote" if the change is material (address changed a lot).
 */
export default function EditBookingDialog({ booking, open, onClose, onSaved }) {
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [recomputeQuote, setRecomputeQuote] = useState(false);
  const [notifyCustomer, setNotifyCustomer] = useState(false);

  useEffect(() => {
    if (!booking) return;
    setForm({
      flight_number: booking.flight_number || "",
      pickup_date: booking.pickup_date || "",
      pickup_time: booking.pickup_time || "",
      pickup_location: booking.pickup_location || "",
      dropoff_location: booking.dropoff_location || "",
      vehicle_type: booking.vehicle_type || "",
      passengers: booking.passengers || 1,
      luggage_count: booking.luggage_count || 0,
      child_seat_count: booking.child_seat_count || 0,
      hours: booking.hours || "",
      meet_and_greet: !!booking.meet_and_greet,
      notes: booking.notes || "",
    });
    setRecomputeQuote(false);
    setNotifyCustomer(false);
  }, [booking, open]);

  if (!booking) return null;
  const b = booking;
  const isAirportTransfer = b.service_type === "Airport Transfer";
  const isHourly = b.service_type === "Hourly Chauffeur";

  const set = (k) => (val) => setForm((f) => ({ ...f, [k]: val }));

  const save = async () => {
    // Build diff — only send fields that actually changed
    const payload = { recompute_quote: recomputeQuote, notify_customer: notifyCustomer };
    const originals = {
      flight_number: b.flight_number || "",
      pickup_date: b.pickup_date || "",
      pickup_time: b.pickup_time || "",
      pickup_location: b.pickup_location || "",
      dropoff_location: b.dropoff_location || "",
      vehicle_type: b.vehicle_type || "",
      passengers: b.passengers || 1,
      luggage_count: b.luggage_count || 0,
      child_seat_count: b.child_seat_count || 0,
      hours: b.hours || "",
      meet_and_greet: !!b.meet_and_greet,
      notes: b.notes || "",
    };
    let anyChange = false;
    for (const k of Object.keys(originals)) {
      const cur = form[k];
      const orig = originals[k];
      if (typeof cur === "string" ? cur.trim() !== String(orig).trim() : cur !== orig) {
        payload[k] = cur === "" ? null : cur;
        anyChange = true;
      }
    }
    if (!anyChange) {
      toast.info("No changes to save.");
      return;
    }

    // Coerce numerics
    ["passengers", "luggage_count", "child_seat_count"].forEach((k) => {
      if (k in payload && payload[k] !== null) payload[k] = Number(payload[k]) || 0;
    });
    if ("hours" in payload && payload.hours !== null) {
      payload.hours = Number(payload.hours) || null;
    }

    setSaving(true);
    try {
      const { data } = await api.patch(`/admin/bookings/${b.id}/details`, payload);
      if (data.no_changes) {
        toast.info(data.message || "No changes applied.");
      } else {
        toast.success(
          `Updated ${data.changed?.length || 0} field${(data.changed?.length || 0) === 1 ? "" : "s"}` +
          (notifyCustomer ? " · customer notified" : "") +
          (b.driver_phone && ["flight_number", "pickup_date", "pickup_time", "pickup_location", "dropoff_location"].some((f) => data.changed?.includes(f))
            ? " · driver re-notified"
            : ""),
        );
      }
      onSaved?.();
      onClose?.();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Update failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !saving && onClose?.()}>
      <DialogContent
        data-testid="edit-booking-dialog"
        className="bg-[#0A0A0A] border-[#1F1F1F] text-white max-w-2xl max-h-[90vh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl flex items-center gap-2">
            <Pencil className="w-4 h-4 text-[#D4AF37]" />
            Edit trip details
          </DialogTitle>
          <DialogDescription className="text-xs text-white/55">
            #{b.confirmation_number || b.id?.slice(0, 8)} · {b.full_name} ·{" "}
            <span className={b.payment_status === "paid" ? "text-emerald-400" : b.payment_status === "card_on_file" ? "text-[#D4AF37]" : "text-white/50"}>
              {b.payment_status || "unpaid"}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Flight number — most common admin edit */}
          {isAirportTransfer && (
            <div>
              <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">
                Flight number
              </Label>
              <Input
                data-testid="edit-flight-number"
                className={`${inputCls} mt-1 h-10 uppercase`}
                value={form.flight_number || ""}
                onChange={(e) => set("flight_number")(e.target.value.toUpperCase())}
                placeholder="UA1234"
                maxLength={10}
              />
            </div>
          )}

          {/* Date + time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">
                Pickup date
              </Label>
              <Input
                data-testid="edit-pickup-date"
                type="date"
                className={`${inputCls} mt-1 h-10`}
                value={form.pickup_date || ""}
                onChange={(e) => set("pickup_date")(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">
                Pickup time (24h)
              </Label>
              <Input
                data-testid="edit-pickup-time"
                type="time"
                className={`${inputCls} mt-1 h-10`}
                value={form.pickup_time || ""}
                onChange={(e) => set("pickup_time")(e.target.value)}
              />
            </div>
          </div>

          {/* Pickup + drop-off */}
          <div>
            <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">
              Pickup location
            </Label>
            <Input
              data-testid="edit-pickup-location"
              className={`${inputCls} mt-1 h-10`}
              value={form.pickup_location || ""}
              onChange={(e) => set("pickup_location")(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">
              Drop-off location
            </Label>
            <Input
              data-testid="edit-dropoff-location"
              className={`${inputCls} mt-1 h-10`}
              value={form.dropoff_location || ""}
              onChange={(e) => set("dropoff_location")(e.target.value)}
            />
          </div>

          {/* Vehicle + passengers + luggage */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">
                Vehicle
              </Label>
              <Input
                data-testid="edit-vehicle-type"
                className={`${inputCls} mt-1 h-10`}
                value={form.vehicle_type || ""}
                onChange={(e) => set("vehicle_type")(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">
                Passengers
              </Label>
              <Input
                data-testid="edit-passengers"
                type="number"
                min={1}
                max={60}
                className={`${inputCls} mt-1 h-10`}
                value={form.passengers || 1}
                onChange={(e) => set("passengers")(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">
                Luggage
              </Label>
              <Input
                data-testid="edit-luggage"
                type="number"
                min={0}
                max={30}
                className={`${inputCls} mt-1 h-10`}
                value={form.luggage_count || 0}
                onChange={(e) => set("luggage_count")(e.target.value)}
              />
            </div>
          </div>

          {/* Hourly only */}
          {isHourly && (
            <div>
              <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">
                Hours booked
              </Label>
              <Input
                data-testid="edit-hours"
                type="number"
                min={1}
                max={24}
                step={0.5}
                className={`${inputCls} mt-1 h-10`}
                value={form.hours || ""}
                onChange={(e) => set("hours")(e.target.value)}
              />
            </div>
          )}

          {/* Airport add-ons */}
          {isAirportTransfer && (
            <div className="flex items-center gap-3 p-3 rounded-lg border border-[#27272A] bg-[#0E0E0E]">
              <Switch
                data-testid="edit-meet-and-greet"
                checked={!!form.meet_and_greet}
                onCheckedChange={set("meet_and_greet")}
                className="data-[state=checked]:bg-[#D4AF37]"
              />
              <div className="text-sm">
                <div className="text-white">Meet &amp; Greet</div>
                <div className="text-[11px] text-white/50">
                  Toggling this does NOT auto-recompute the fare unless you check &quot;Recompute quote&quot; below.
                </div>
              </div>
            </div>
          )}

          {/* Child seats */}
          <div>
            <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">
              Child seats
            </Label>
            <Input
              data-testid="edit-child-seats"
              type="number"
              min={0}
              max={6}
              className={`${inputCls} mt-1 h-10 max-w-[8rem]`}
              value={form.child_seat_count || 0}
              onChange={(e) => set("child_seat_count")(e.target.value)}
            />
          </div>

          {/* Notes */}
          <div>
            <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">
              Notes / trip instructions
            </Label>
            <Textarea
              data-testid="edit-notes"
              rows={3}
              maxLength={1000}
              className={`${inputCls} mt-1`}
              value={form.notes || ""}
              onChange={(e) => set("notes")(e.target.value)}
            />
          </div>

          {/* Options */}
          <div className="rounded-lg border border-[#27272A] bg-[#0E0E0E] p-3 space-y-2">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                data-testid="edit-recompute-toggle"
                type="checkbox"
                checked={recomputeQuote}
                onChange={(e) => setRecomputeQuote(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[#D4AF37] cursor-pointer"
              />
              <div className="text-xs">
                <div className="text-white">Recompute quote from the new details</div>
                <div className="text-white/50 mt-0.5">
                  Leave OFF to keep the price the customer already agreed to. Turn ON only if the change is material (major route change, vehicle upgrade, etc.).
                </div>
              </div>
            </label>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                data-testid="edit-notify-toggle"
                type="checkbox"
                checked={notifyCustomer}
                onChange={(e) => setNotifyCustomer(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[#D4AF37] cursor-pointer"
              />
              <div className="text-xs">
                <div className="text-white">Email the customer their updated trip sheet</div>
                <div className="text-white/50 mt-0.5">
                  Sends the standard confirmation email with the new details filled in.
                </div>
              </div>
            </label>
            {b.driver_phone && (
              <div className="text-[11px] text-[#D4AF37]/80 pl-7">
                ⓘ A driver is assigned — they&apos;ll get an SMS with &quot;[UPDATED]&quot; prefix automatically if flight, date, time, or addresses change.
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2 pt-3 border-t border-[#1F1F1F]">
          <Button
            variant="outline"
            onClick={() => onClose?.()}
            disabled={saving}
            className="bg-transparent border-white/20 hover:bg-white/10 rounded-full h-9 px-4"
          >
            Cancel
          </Button>
          <Button
            data-testid="edit-save-btn"
            onClick={save}
            disabled={saving}
            className="bg-[#D4AF37] hover:bg-[#c69f2f] text-black font-medium rounded-full h-9 px-5"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
