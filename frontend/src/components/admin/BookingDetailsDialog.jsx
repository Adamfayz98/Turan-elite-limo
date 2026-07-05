import { useState } from "react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { api, formatApiErrorDetail } from "@/lib/api";
import {
  Calendar,
  MapPin,
  User,
  Phone,
  Mail,
  Car,
  Plane,
  Briefcase,
  Hash,
  Sparkles,
  Clock,
  Clock4,
  DollarSign,
  StickyNote,
  RotateCw,
  AlertTriangle,
  Loader2,
  CreditCard,
} from "lucide-react";
import { cn } from "@/lib/utils";

function fmt12h(t) {
  if (!t || !t.includes(":")) return t || "";
  const [hRaw, mRaw] = t.split(":");
  const h = parseInt(hRaw, 10);
  const m = parseInt(mRaw, 10);
  if (isNaN(h) || isNaN(m)) return t;
  const meridiem = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${m.toString().padStart(2, "0")} ${meridiem}`;
}

function Row({ icon: Icon, label, value, highlight, mono }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-[#1F1F1F] last:border-b-0">
      <Icon
        className={cn(
          "w-4 h-4 mt-1 flex-shrink-0",
          highlight ? "text-[#D4AF37]" : "text-white/40",
        )}
      />
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-[0.2em] text-white/45">{label}</div>
        <div
          className={cn(
            "text-sm mt-0.5 break-words",
            highlight ? "text-[#D4AF37] font-medium" : "text-white",
            mono && "font-mono text-xs",
          )}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

export default function BookingDetailsDialog({ booking, open, onClose, onChanged }) {
  const [chargingWait, setChargingWait] = useState(false);
  const [chargingDamage, setChargingDamage] = useState(false);
  const [chargingStopId, setChargingStopId] = useState(null);
  const [damageAmount, setDamageAmount] = useState("");
  const [damageReason, setDamageReason] = useState("");
  const [extraChargeAmount, setExtraChargeAmount] = useState("");
  const [extraChargeReason, setExtraChargeReason] = useState("balance");
  const [extraChargeDescription, setExtraChargeDescription] = useState("");
  const [chargingExtra, setChargingExtra] = useState(false);
  const [chargingPayLater, setChargingPayLater] = useState(false);
  if (!booking) return null;
  const b = booking;
  const formattedDate = b.pickup_date
    ? new Date(b.pickup_date + "T12:00:00").toLocaleDateString(undefined, {
        weekday: "short",
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "";
  const receivedAt = b.created_at
    ? new Date(b.created_at).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  const hasSavedCard = !!b.stripe_payment_method_id;
  const canChargeOffSession = hasSavedCard && b.wait_time_consent;

  const chargePayLater = async () => {
    const def = Number(b.pay_later_amount || 0).toFixed(2);
    const input = window.prompt("Amount to charge the saved card (USD):", def);
    if (input == null) return;
    const amt = parseFloat(input);
    if (!amt || amt < 0.5) {
      toast.error("Enter a valid amount (min $0.50)");
      return;
    }
    if (!window.confirm(`Charge $${amt.toFixed(2)} to the card on file for #${b.confirmation_number || b.id.slice(0, 8)}?`)) return;
    setChargingPayLater(true);
    try {
      const { data } = await api.post(`/admin/bookings/${b.id}/charge-pay-later`, { amount: amt });
      if (data.already_paid) {
        toast.info(`Already paid $${Number(data.amount || 0).toFixed(2)}`);
      } else {
        toast.success(`Charged $${Number(data.amount || 0).toFixed(2)} — booking marked paid`);
      }
      onChanged?.();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Charge failed");
      onChanged?.();
    } finally {
      setChargingPayLater(false);
    }
  };

  const pendingMinutes = b.wait_time_minutes_pending;
  const alreadyChargedWait = !!b.wait_time_charged_at;
  const damageCharges = Array.isArray(b.damage_charges) ? b.damage_charges : [];
  const midTripStops = Array.isArray(b.mid_trip_stops) ? b.mid_trip_stops : [];

  const chargeWaitTime = async () => {
    if (!pendingMinutes) {
      const manual = window.prompt(
        "Driver hasn't recorded wait time yet. Enter total minutes waited (including grace):",
        "",
      );
      if (!manual) return;
      const n = parseInt(manual, 10);
      if (!n || n < 1) {
        toast.error("Enter a valid minute count");
        return;
      }
      await doChargeWait(n);
      return;
    }
    if (!window.confirm(`Charge customer for ${pendingMinutes} min of wait time?`)) return;
    await doChargeWait(null);
  };

  const doChargeWait = async (overrideMinutes) => {
    setChargingWait(true);
    try {
      const { data } = await api.post(`/admin/bookings/${b.id}/charge-wait-time`, {
        ...(overrideMinutes ? { minutes_waited: overrideMinutes } : {}),
      });
      if (data.already_charged) {
        toast.info(`Already charged $${data.amount?.toFixed(2)}`);
      } else {
        toast.success(`Charged $${data.amount?.toFixed(2)} for ${data.chargeable_minutes} chargeable min`);
      }
      onChanged?.();
      onClose?.();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Charge failed");
    } finally {
      setChargingWait(false);
    }
  };

  const chargeMidTripStop = async (stop) => {
    if (!window.confirm(
      `Charge customer $${Number(stop.total || 0).toFixed(2)} for stop at "${stop.address}"?\n\nDetour: ${stop.detour_miles} mi · ${stop.minutes_at_stop} min at stop`
    )) return;
    setChargingStopId(stop.id);
    try {
      const { data } = await api.post(`/admin/bookings/${b.id}/charge-mid-trip-stop`, { stop_id: stop.id });
      if (data.already_charged) {
        toast.info(`Already charged $${Number(data.stop?.total || 0).toFixed(2)}`);
      } else {
        toast.success(`Charged $${Number(data.stop?.total || 0).toFixed(2)}`);
      }
      onChanged?.();
      onClose?.();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Charge failed");
    } finally {
      setChargingStopId(null);
    }
  };

  const markWaitTimeExternal = async () => {
    const minStr = window.prompt(
      "Total minutes waited (including grace period). Leave blank to use driver-recorded value:",
      String(pendingMinutes || ""),
    );
    if (minStr === null) return;
    const minutes = parseInt((minStr || "").trim(), 10);
    if (!minutes || minutes < 1) {
      toast.error("Enter valid minutes (1–240).");
      return;
    }
    const amtStr = window.prompt(
      `Total amount you charged (or are about to charge) the customer for these ${minutes} min:`,
      "",
    );
    if (amtStr === null) return;
    const amount = parseFloat((amtStr || "").trim());
    if (isNaN(amount) || amount < 0) {
      toast.error("Enter a valid dollar amount.");
      return;
    }
    const note = window.prompt(
      "Optional reference (Stripe receipt #, 'called customer', etc.):",
      "",
    );
    if (note === null) return;
    setChargingWait(true);
    try {
      await api.post(`/admin/bookings/${b.id}/mark-wait-time-external`, {
        minutes_waited: minutes,
        amount,
        note: note.trim(),
      });
      toast.success(`Recorded $${amount.toFixed(2)} for ${minutes} min`);
      onChanged?.();
      onClose?.();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Couldn't record");
    } finally {
      setChargingWait(false);
    }
  };

  const markDamageExternal = async () => {
    const amt = parseFloat(damageAmount);
    if (!amt || amt <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    if ((damageReason || "").trim().length < 4) {
      toast.error("Add a short reason (min 4 chars)");
      return;
    }
    const note = window.prompt(
      `Mark $${amt.toFixed(2)} damage charge as collected externally. Optional reference (Stripe receipt #, etc.):`,
      "",
    );
    if (note === null) return;
    setChargingDamage(true);
    try {
      await api.post(`/admin/bookings/${b.id}/mark-damage-external`, {
        amount: amt,
        reason: damageReason.trim(),
        note: note.trim(),
      });
      toast.success(`Recorded $${amt.toFixed(2)}`);
      setDamageAmount("");
      setDamageReason("");
      onChanged?.();
      onClose?.();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Couldn't record");
    } finally {
      setChargingDamage(false);
    }
  };

  const markMidTripStopExternal = async (stop) => {
    const note = window.prompt(
      `Mark this stop as charged externally?\n\nThis records $${Number(stop.total || 0).toFixed(2)} as collected (no Stripe call). Add an optional reference (Stripe receipt #, "called customer", etc.):`,
      "",
    );
    if (note === null) return;
    setChargingStopId(stop.id);
    try {
      await api.post(`/admin/bookings/${b.id}/mark-mid-trip-stop-external`, {
        stop_id: stop.id,
        note: note.trim(),
      });
      toast.success("Recorded as charged externally");
      onChanged?.();
      onClose?.();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Couldn't record");
    } finally {
      setChargingStopId(null);
    }
  };

  const backfillSavedCard = async () => {
    if (!window.confirm("Re-fetch this booking's saved card from Stripe? Use this when the customer paid + consented but the auto-charge button isn't showing.")) return;
    try {
      const { data } = await api.post(`/admin/bookings/${b.id}/backfill-saved-card`);
      if (data.stripe_payment_method_id) {
        toast.success("Saved card recovered — refresh the dialog");
        onChanged?.();
        onClose?.();
      } else {
        toast.info("Stripe didn't return a payment method for this session.");
      }
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Backfill failed");
    }
  };

  const chargeDamage = async () => {
    const amt = parseFloat(damageAmount);
    if (!amt || amt <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    if ((damageReason || "").trim().length < 4) {
      toast.error("Add a short reason (min 4 chars) — it shows on the customer's receipt");
      return;
    }
    if (!window.confirm(`Charge customer $${amt.toFixed(2)} for: "${damageReason.trim()}"?`)) return;
    setChargingDamage(true);
    try {
      const { data } = await api.post(`/admin/bookings/${b.id}/charge-damages`, {
        amount: amt,
        reason: damageReason.trim(),
      });
      toast.success(`Charged $${data.amount?.toFixed(2)} for damages`);
      setDamageAmount("");
      setDamageReason("");
      onChanged?.();
      onClose?.();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Charge failed");
    } finally {
      setChargingDamage(false);
    }
  };

  const chargeExtra = async () => {
    const amt = parseFloat(extraChargeAmount);
    if (!amt || amt <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    if ((extraChargeDescription || "").trim().length < 4) {
      toast.error("Add a short description — it shows on the customer's receipt");
      return;
    }
    if (!window.confirm(`Charge customer $${amt.toFixed(2)} for: "${extraChargeDescription.trim()}"?`)) return;
    setChargingExtra(true);
    try {
      const { data } = await api.post(`/admin/bookings/${b.id}/charge-card`, {
        amount: amt,
        reason: extraChargeReason,
        description: extraChargeDescription.trim(),
      });
      toast.success(`Charged $${data.amount?.toFixed(2)} (${data.reason})`);
      setExtraChargeAmount("");
      setExtraChargeDescription("");
      onChanged?.();
      onClose?.();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Charge failed");
    } finally {
      setChargingExtra(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose?.()}>
      <DialogContent className="bg-[#0A0A0A] border-[#1F1F1F] text-white max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <DialogTitle className="font-serif text-2xl">
              {b.full_name}
            </DialogTitle>
            <div className="text-xs text-white/55 font-mono">
              #{b.confirmation_number || b.id?.slice(0, 8)}
            </div>
          </div>
          {receivedAt && (
            <div className="text-[10px] uppercase tracking-[0.2em] text-white/45 mt-1">
              Received {receivedAt}
            </div>
          )}
        </DialogHeader>

        <div className="grid md:grid-cols-2 gap-x-6 mt-2">
          {/* Left column: customer */}
          <div>
            <div className="text-[10px] uppercase tracking-[0.25em] text-[#D4AF37] mt-3 mb-1.5">
              Customer
            </div>
            <Row icon={User} label="Name" value={b.full_name} />
            <Row icon={Mail} label="Email" value={<a href={`mailto:${b.email}`} className="text-[#D4AF37] hover:underline">{b.email}</a>} />
            <Row icon={Phone} label="Phone" value={<a href={`tel:${b.phone}`} className="text-[#D4AF37] hover:underline">{b.phone}</a>} />
            <Row icon={Hash} label="Booking ID" value={b.id} mono />
          </div>

          {/* Right column: trip */}
          <div>
            <div className="text-[10px] uppercase tracking-[0.25em] text-[#D4AF37] mt-3 mb-1.5">
              Trip
            </div>
            <Row
              icon={Calendar}
              label="When"
              value={`${formattedDate} · ${fmt12h(b.pickup_time)}`}
            />
            <Row icon={Car} label="Service" value={b.service_type} />
            <Row icon={Car} label="Vehicle" value={b.vehicle_type} />
            {b.hours ? <Row icon={Clock} label="Duration" value={`${b.hours} hour${b.hours > 1 ? "s" : ""}`} /> : null}
            {b.flight_number ? (
              <Row icon={Plane} label="Flight" value={`${b.flight_number} (we monitor live)`} highlight />
            ) : null}
            {b.meet_and_greet ? (
              <Row
                icon={Sparkles}
                label="Meet & Greet"
                value="Driver meets at baggage claim with name sign"
                highlight
              />
            ) : null}
            <Row
              icon={Briefcase}
              label="Passengers"
              value={`${b.passengers}${b.luggage_count ? ` · ${b.luggage_count} bag${b.luggage_count > 1 ? "s" : ""}` : ""}${b.child_seat ? " · child seat" : ""}`}
            />
          </div>
        </div>

        {/* Addresses — full width, larger */}
        <div className="mt-4">
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#D4AF37] mb-1.5">
            Addresses
          </div>
          <Row icon={MapPin} label="Pickup" value={b.pickup_location} highlight />
          {b.additional_stops?.length > 0 && (
            <Row
              icon={MapPin}
              label="Stops"
              value={
                <ul className="list-disc pl-5 mt-0.5">
                  {b.additional_stops.map((s, i) => (
                    <li key={`${i}-${(s || "").slice(0, 30)}`}>{s}</li>
                  ))}
                </ul>
              }
            />
          )}
          <Row icon={MapPin} label="Drop-off" value={b.dropoff_location} highlight />
          {b.return_trip && (
            <Row icon={RotateCw} label="Return trip" value={b.return_location || "(time/location TBA)"} />
          )}
        </div>

        {b.notes && (
          <div className="mt-4">
            <div className="text-[10px] uppercase tracking-[0.25em] text-[#D4AF37] mb-1.5">
              Customer notes
            </div>
            <div className="rounded-lg border border-[#1F1F1F] bg-[#0E0E0E] p-3 text-sm text-white/85 leading-relaxed whitespace-pre-wrap">
              <StickyNote className="w-4 h-4 inline mr-2 text-white/40 -mt-0.5" />
              {b.notes}
            </div>
          </div>
        )}

        {/* Driver assignment (if any) */}
        {b.driver_name && (
          <div className="mt-4">
            <div className="text-[10px] uppercase tracking-[0.25em] text-[#D4AF37] mb-1.5">
              Driver
            </div>
            <Row icon={User} label="Name" value={b.driver_name} highlight />
            <Row
              icon={Phone}
              label="Phone"
              value={<a href={`tel:${b.driver_phone}`} className="text-[#D4AF37] hover:underline">{b.driver_phone}</a>}
            />
            {b.driver_plate && <Row icon={Car} label="License plate" value={b.driver_plate} mono />}
            {b.trip_status && <Row icon={Sparkles} label="Trip status" value={b.trip_status.replace(/_/g, " ")} highlight />}
          </div>
        )}

        {/* Payment */}
        <div className="mt-4">
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#D4AF37] mb-1.5">
            Payment
          </div>
          <Row icon={DollarSign} label="Status" value={b.payment_status || "unpaid"} highlight={b.payment_status === "paid"} />
          {b.paid_amount != null && (
            <Row icon={DollarSign} label="Amount paid" value={`$${Number(b.paid_amount).toFixed(2)}`} />
          )}
          {b.quote_amount != null && (
            <Row icon={DollarSign} label="Quote" value={`$${Number(b.quote_amount).toFixed(2)}`} />
          )}
          {b.tip_amount != null && (
            <Row icon={DollarSign} label="Chauffeur tip" value={`$${Number(b.tip_amount).toFixed(2)}`} highlight />
          )}
          {b.promo_code && (
            <Row
              icon={DollarSign}
              label="Promo applied"
              value={`${b.promo_code} (-$${Number(b.discount_amount || 0).toFixed(2)})`}
            />
          )}
          {b.payment_mode === "pay_after_ride" && (
            <div
              className="mt-2 rounded-lg border border-[#D4AF37]/25 bg-[#D4AF37]/5 p-3"
              data-testid="pay-after-ride-block"
            >
              <div className="text-[10px] uppercase tracking-[0.2em] text-[#D4AF37]">
                Pay after ride
              </div>
              <div className="text-sm text-white/85 mt-1.5">
                {b.payment_status === "paid" ? (
                  <>Charged <span className="text-[#D4AF37] font-medium">${Number(b.paid_amount || 0).toFixed(2)}</span>{b.pay_later_charged_at ? ` on ${new Date(b.pay_later_charged_at).toLocaleString()}` : ""}.</>
                ) : b.payment_status === "card_on_file" ? (
                  <>Card verified &amp; on file — <span className="text-[#D4AF37] font-medium">${Number(b.pay_later_amount || 0).toFixed(2)}</span> due after ride completion.</>
                ) : (
                  <>Customer chose pay-after-ride but hasn't completed card verification yet.</>
                )}
              </div>
              {b.payment_status === "card_on_file" && hasSavedCard && (
                <Button
                  size="sm"
                  onClick={chargePayLater}
                  disabled={chargingPayLater}
                  data-testid="charge-pay-later-btn"
                  className="mt-3 bg-[#D4AF37] text-black hover:bg-[#B3922E] h-8 text-xs font-medium"
                >
                  {chargingPayLater ? "Charging…" : `Charge $${Number(b.pay_later_amount || 0).toFixed(2)} now`}
                </Button>
              )}
              {b.pay_later_charge_error && (
                <div className="text-xs text-red-400 mt-2 leading-relaxed" data-testid="pay-later-charge-error">
                  Last charge failed: {b.pay_later_charge_error}
                  <div className="text-white/55 mt-1">
                    Fallback: send the customer their payment link —{" "}
                    <button
                      type="button"
                      className="text-[#D4AF37] underline"
                      onClick={() => {
                        navigator.clipboard?.writeText(`${window.location.origin}/pay/${b.id}`);
                        toast.success("Payment link copied");
                      }}
                    >
                      copy /pay link
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Rating (if customer rated) */}
        {b.rating != null && (
          <div className="mt-4">
            <div className="text-[10px] uppercase tracking-[0.25em] text-[#D4AF37] mb-1.5">
              Customer rating
            </div>
            <div className="rounded-lg border border-[#1F1F1F] bg-[#0E0E0E] p-3">
              <div className="text-2xl">
                {"★".repeat(b.rating)}<span className="text-white/15">{"★".repeat(5 - b.rating)}</span>
              </div>
              {b.rating_feedback && (
                <div className="text-sm text-white/75 mt-2 italic leading-relaxed">
                  "{b.rating_feedback}"
                </div>
              )}
            </div>
          </div>
        )}

        {(b.cancellation_reason || b.cancellation_source || b.cancelled_at || b.auto_cancelled_at || b.cancellation_requested_at) && (
          <div className="mt-4">
            <div className="text-[10px] uppercase tracking-[0.25em] text-red-400 mb-1.5">
              Cancellation
            </div>
            <div
              className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-sm text-white/85 leading-relaxed space-y-1.5"
              data-testid="cancellation-forensics"
            >
              {b.cancellation_source && (
                <div className="text-[11px] uppercase tracking-wider text-white/55">
                  Source:{" "}
                  <span className="text-white/90 font-medium">
                    {b.cancellation_source === "auto_abandoned" && "🤖 System auto-sweep (>72h unpaid)"}
                    {b.cancellation_source === "customer_web" && "👤 Customer (web manage link)"}
                    {b.cancellation_source === "mobile_app" && "👤 Customer (mobile app)"}
                    {b.cancellation_source === "admin" && (
                      <>
                        🧑‍💼 Admin
                        {b.cancelled_by_admin_email ? ` (${b.cancelled_by_admin_email})` : ""}
                      </>
                    )}
                  </span>
                </div>
              )}
              {(b.cancelled_at || b.auto_cancelled_at) && (
                <div className="text-[11px] uppercase tracking-wider text-white/55">
                  Cancelled at:{" "}
                  <span className="text-white/90">
                    {new Date(b.cancelled_at || b.auto_cancelled_at).toLocaleString()}
                  </span>
                </div>
              )}
              {b.cancellation_requested_at && b.cancellation_requested_at !== b.cancelled_at && (
                <div className="text-[11px] uppercase tracking-wider text-white/55">
                  Customer requested at:{" "}
                  <span className="text-white/90">
                    {new Date(b.cancellation_requested_at).toLocaleString()}
                  </span>
                </div>
              )}
              {b.cancellation_reason && (
                <div className="pt-1 whitespace-pre-wrap">{b.cancellation_reason}</div>
              )}
              {!b.cancellation_source && !b.cancellation_reason && (
                <div className="text-white/60 italic">
                  No provenance recorded (legacy cancellation before audit fields were added).
                </div>
              )}
            </div>
          </div>
        )}

        {/* Wait time review + charge (admin-only) — always render the block so admin can record/charge manually for any trip */}
        <div className="mt-5 pt-5 border-t border-[#1F1F1F]" data-testid="wait-time-admin-block">
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#D4AF37] mb-2">
            Wait time
          </div>
          {alreadyChargedWait ? (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/[0.06] p-3 text-sm text-emerald-200 flex items-start gap-2">
              <DollarSign className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div>
                Charged <strong>${Number(b.wait_time_fee_amount || 0).toFixed(2)}</strong> for{" "}
                {b.wait_time_minutes} min · {new Date(b.wait_time_charged_at).toLocaleString()}
                {b.wait_time_payment_intent_id?.startsWith?.("manual:") && (
                  <span className="ml-2 text-[10px] text-emerald-300/70">· recorded externally</span>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-amber-400/30 bg-amber-400/[0.06] p-3" data-testid="pending-wait-block">
              <div className="flex items-start gap-2 text-sm text-amber-200">
                <Clock4 className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <div>
                  {pendingMinutes ? (
                    <>
                      Driver logged <strong>{pendingMinutes} min</strong> waited
                      {b.wait_time_recorded_at && (
                        <span className="text-white/55">
                          {" "}· {new Date(b.wait_time_recorded_at).toLocaleString()}
                        </span>
                      )}
                    </>
                  ) : (
                    <>No wait time logged by the driver yet.</>
                  )}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {canChargeOffSession && (
                  <Button
                    onClick={chargeWaitTime}
                    disabled={chargingWait}
                    data-testid="admin-charge-wait-btn"
                    className="bg-[#D4AF37] text-black hover:bg-[#B3922E] rounded-full h-10 text-sm font-medium px-5"
                  >
                    {chargingWait ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <CreditCard className="w-4 h-4 mr-2" />
                    )}
                    {pendingMinutes ? `Review & charge wait time (${pendingMinutes} min)` : "Charge wait time"}
                  </Button>
                )}
                <Button
                  onClick={markWaitTimeExternal}
                  disabled={chargingWait}
                  data-testid="admin-mark-wait-external-btn"
                  variant="outline"
                  className="bg-transparent border-white/15 text-white/70 hover:bg-white/5 hover:text-white rounded-full h-10 text-xs px-4"
                >
                  Mark as charged externally
                </Button>
              </div>
              {!canChargeOffSession && b.payment_status === "paid" && (
                <div className="mt-2 flex items-start gap-2 text-[10px] text-white/55 leading-relaxed">
                  <span>
                    No saved card on this booking. If the customer paid + consented, click
                  </span>
                  <button
                    type="button"
                    onClick={backfillSavedCard}
                    data-testid="backfill-saved-card-btn"
                    className="text-[#D4AF37] hover:underline underline-offset-2 font-medium"
                  >
                    "Recover saved card"
                  </button>
                  <span>to pull it from Stripe — otherwise charge externally and mark above.</span>
                </div>
              )}
              {!canChargeOffSession && b.payment_status !== "paid" && (
                <div className="text-[10px] text-white/45 mt-2 leading-relaxed">
                  Booking isn't paid yet — once payment lands, auto-charge becomes available.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Mid-trip stops (admin-only) */}
        {(canChargeOffSession || midTripStops.length > 0) && (
          <div className="mt-5 pt-5 border-t border-[#1F1F1F]" data-testid="mid-trip-admin-block">
            <div className="text-[10px] uppercase tracking-[0.25em] text-[#D4AF37] mb-2 flex items-center gap-2">
              <MapPin className="w-3 h-3" /> Mid-trip stops
            </div>
            {midTripStops.length === 0 ? (
              <div className="text-xs text-white/55">
                No unplanned stops logged. Driver can add one from the trip portal.
              </div>
            ) : (
              <div className="space-y-2">
                {midTripStops.map((s) => {
                  const charged = !!s.charged_at;
                  return (
                    <div
                      key={s.id}
                      data-testid={`mid-trip-stop-${s.id}`}
                      className={cn(
                        "rounded-lg border p-3 text-xs",
                        charged
                          ? "border-emerald-500/30 bg-emerald-500/[0.04]"
                          : "border-amber-400/30 bg-amber-400/[0.06]",
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <MapPin className={cn("w-3.5 h-3.5 mt-0.5 flex-shrink-0", charged ? "text-emerald-300" : "text-amber-300")} />
                        <div className="flex-1 min-w-0">
                          <div className="text-white/90 break-words">{s.address}</div>
                          <div className="text-white/55 mt-1">
                            {Number(s.detour_miles || 0).toFixed(1)} mi detour ·{" "}
                            {s.minutes_at_stop} min at stop
                            {s.wait_overage_minutes > 0 && (
                              <> ({s.wait_overage_minutes} chargeable)</>
                            )}
                          </div>
                          <div className="text-white/60 mt-1 leading-relaxed">
                            <span className="text-white/45">Math:</span> ${Number(s.flat_fee || 0).toFixed(2)} flat
                            {" + "}{Number(s.detour_miles || 0).toFixed(1)} mi × ${Number(s.per_mile_rate || 0).toFixed(2)}/mi (${Number(s.distance_charge || 0).toFixed(2)})
                            {s.wait_charge > 0 && (
                              <> {" + "}{s.wait_overage_minutes} min × ${Number(s.wait_minute_rate || 0).toFixed(2)}/min (${Number(s.wait_charge || 0).toFixed(2)})</>
                            )}
                            {s.service_fee > 0 && (
                              <> {" + "}${Number(s.service_fee || 0).toFixed(2)} service fee</>
                            )}
                          </div>
                          <div className="text-white mt-1.5 font-medium">
                            Total: ${Number(s.total || 0).toFixed(2)}
                            {charged && (
                              <span className="ml-2 text-emerald-300 text-[10px]">
                                · charged {new Date(s.charged_at).toLocaleString()}
                              </span>
                            )}
                            {!charged && (
                              <span className="ml-2 text-amber-300 text-[10px]">
                                · pending dispatch
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      {!charged && canChargeOffSession && (
                        <Button
                          onClick={() => chargeMidTripStop(s)}
                          disabled={chargingStopId === s.id}
                          data-testid={`charge-mid-trip-stop-${s.id}`}
                          className="mt-3 bg-[#D4AF37] text-black hover:bg-[#B3922E] rounded-full h-9 text-xs font-medium px-4"
                        >
                          {chargingStopId === s.id ? (
                            <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                          ) : (
                            <CreditCard className="w-3.5 h-3.5 mr-2" />
                          )}
                          Review &amp; charge ${Number(s.total || 0).toFixed(2)}
                        </Button>
                      )}
                      {!charged && (
                        <Button
                          onClick={() => markMidTripStopExternal(s)}
                          disabled={chargingStopId === s.id}
                          data-testid={`mark-mid-trip-stop-external-${s.id}`}
                          variant="outline"
                          className="mt-3 ml-2 bg-transparent border-white/15 text-white/65 hover:bg-white/5 hover:text-white rounded-full h-9 text-[11px] px-3"
                        >
                          Mark as charged externally
                        </Button>
                      )}
                      {!charged && !canChargeOffSession && (
                        <div className="text-[10px] text-white/45 mt-2">
                          No saved card / consent — charge via Stripe dashboard or call the customer, then click "Mark as charged externally" to record it here.
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Damage / incidental charge (admin-only) — always show so admin can record manually */}
        <div className="mt-5 pt-5 border-t border-[#1F1F1F]" data-testid="damage-admin-block">
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#D4AF37] mb-2 flex items-center gap-2">
            <AlertTriangle className="w-3 h-3" /> Damages / incidentals
          </div>
          {damageCharges.length > 0 && (
            <div className="space-y-1.5 mb-3">
              {damageCharges.map((d, i) => (
                <div
                  key={d.payment_intent_id || d.charged_at || `damage-${i}`}
                  className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.04] p-2.5 text-xs text-white/80 flex items-start gap-2"
                >
                  <DollarSign className="w-3.5 h-3.5 mt-0.5 text-emerald-300 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="text-emerald-300 font-medium">${Number(d.amount).toFixed(2)}</div>
                    <div className="text-white/65 break-words">{d.reason}</div>
                    {d.charged_at && (
                      <div className="text-white/40 text-[10px] mt-0.5">
                        {new Date(d.charged_at).toLocaleString()}
                        {d.payment_intent_id?.startsWith?.("manual:") && (
                          <span className="ml-2 text-emerald-300/70">· recorded externally</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-2">
            <div>
              <Label className="text-[10px] uppercase tracking-[0.2em] text-white/45">Amount</Label>
              <div className="relative mt-1">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#D4AF37]" />
                <Input
                  type="number"
                  min={0.5}
                  step="0.01"
                  value={damageAmount}
                  onChange={(e) => setDamageAmount(e.target.value)}
                  data-testid="damage-amount"
                  placeholder="125.00"
                  className="bg-[#0E0E0E] border-[#27272A] text-white focus-visible:ring-[#D4AF37] focus-visible:border-[#D4AF37] h-10 pl-9"
                />
              </div>
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-[0.2em] text-white/45">Reason</Label>
              <Textarea
                value={damageReason}
                onChange={(e) => setDamageReason(e.target.value)}
                data-testid="damage-reason"
                placeholder="e.g., Interior detailing required after spill in rear seat"
                className="bg-[#0E0E0E] border-[#27272A] text-white focus-visible:ring-[#D4AF37] focus-visible:border-[#D4AF37] mt-1 min-h-[60px] text-sm"
                maxLength={500}
              />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 items-center">
            {canChargeOffSession && (
              <Button
                onClick={chargeDamage}
                disabled={chargingDamage || !damageAmount || (damageReason || "").trim().length < 4}
                data-testid="admin-charge-damage-btn"
                className="bg-white/[0.04] hover:bg-red-500/10 border border-red-500/40 text-red-300 hover:text-red-200 rounded-full h-10 text-sm font-medium px-5"
              >
                {chargingDamage ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <CreditCard className="w-4 h-4 mr-2" />
                )}
                Charge damages
              </Button>
            )}
            <Button
              onClick={markDamageExternal}
              disabled={chargingDamage || !damageAmount || (damageReason || "").trim().length < 4}
              data-testid="admin-mark-damage-external-btn"
              variant="outline"
              className="bg-transparent border-white/15 text-white/70 hover:bg-white/5 hover:text-white rounded-full h-10 text-xs px-4"
            >
              Mark as charged externally
            </Button>
          </div>
          <p className="text-[10px] text-white/40 mt-2 leading-relaxed">
            {canChargeOffSession
              ? "Authorized at booking under our wait-time & damages consent. Customer gets an itemized receipt by email."
              : "No saved card / consent on this booking — charge via Stripe dashboard or call the customer, then click \"Mark as charged externally\" above."}
          </p>
        </div>

        {/* ---------- Generic "Charge card on file" — for arbitrary fees ---------- */}
        {canChargeOffSession && (
          <div className="mt-4 rounded-2xl border border-[#1F1F1F] bg-[#0A0A0A] p-5" data-testid="charge-card-on-file-block">
            <div className="flex items-center gap-2 mb-3">
              <CreditCard className="w-4 h-4 text-[#D4AF37]" />
              <div className="text-xs uppercase tracking-[0.22em] text-[#D4AF37] font-semibold">
                Charge card on file
              </div>
              {b.card_brand && b.card_last4 && (
                <span className="text-[11px] text-white/45 font-mono">
                  · {b.card_brand} •••• {b.card_last4}
                </span>
              )}
            </div>
            <p className="text-xs text-white/55 mb-4 leading-relaxed">
              Use for anything not covered above — day-before balance, extra hour added on the night-of, tolls, or any other approved charge. The customer gets an itemized email receipt.
            </p>
            <div className="grid sm:grid-cols-[140px_180px_1fr] gap-3">
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-white/45">Amount</Label>
                <div className="relative mt-1">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#D4AF37]" />
                  <Input
                    type="number"
                    step="0.01"
                    min="0.5"
                    data-testid="extra-charge-amount"
                    value={extraChargeAmount}
                    onChange={(e) => setExtraChargeAmount(e.target.value)}
                    placeholder="0.00"
                    className="bg-[#0E0E0E] border-[#27272A] text-white pl-9 h-10"
                  />
                </div>
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-white/45">Reason</Label>
                <select
                  data-testid="extra-charge-reason"
                  value={extraChargeReason}
                  onChange={(e) => setExtraChargeReason(e.target.value)}
                  className="mt-1 w-full h-10 rounded-md bg-[#0E0E0E] border border-[#27272A] text-white text-sm px-3 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                >
                  <option value="balance">Balance / remaining</option>
                  <option value="extra_hour">Extra hour</option>
                  <option value="extra_stop">Extra stop</option>
                  <option value="tolls">Tolls / bridge fees</option>
                  <option value="gratuity">Gratuity (pre-approved)</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-white/45">Description (shown on receipt)</Label>
                <Textarea
                  data-testid="extra-charge-description"
                  value={extraChargeDescription}
                  onChange={(e) => setExtraChargeDescription(e.target.value)}
                  placeholder="e.g., Extra hour added during trip per customer request"
                  className="bg-[#0E0E0E] border-[#27272A] text-white mt-1 min-h-[60px] text-sm focus-visible:ring-[#D4AF37] focus-visible:border-[#D4AF37]"
                  maxLength={400}
                />
              </div>
            </div>
            <div className="mt-3">
              <Button
                onClick={chargeExtra}
                disabled={chargingExtra || !extraChargeAmount || (extraChargeDescription || "").trim().length < 4}
                data-testid="charge-card-on-file-btn"
                className="bg-[#D4AF37] text-black hover:bg-[#B3922E] disabled:opacity-40 rounded-full h-10 text-sm font-semibold px-5"
              >
                {chargingExtra ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <CreditCard className="w-4 h-4 mr-2" />
                )}
                Charge ${parseFloat(extraChargeAmount || 0).toFixed(2)}
              </Button>
            </div>
            {Array.isArray(b.extra_charges) && b.extra_charges.length > 0 && (
              <div className="mt-4 pt-4 border-t border-[#1F1F1F]">
                <div className="text-[10px] uppercase tracking-wider text-white/40 mb-2">
                  Previous charges on this booking
                </div>
                <div className="space-y-1.5">
                  {b.extra_charges.map((ec) => (
                    <div
                      key={ec.id}
                      data-testid={`extra-charge-${ec.id}`}
                      className="text-xs text-white/65 flex items-center justify-between gap-3"
                    >
                      <span className="truncate">
                        ${Number(ec.amount).toFixed(2)} · {ec.reason} · <span className="text-white/45">{ec.description}</span>
                      </span>
                      <span className="text-white/35 text-[10px] flex-shrink-0">
                        {ec.charged_at ? new Date(ec.charged_at).toLocaleDateString() : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
