import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  DollarSign,
  StickyNote,
  RotateCw,
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

export default function BookingDetailsDialog({ booking, open, onClose }) {
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
                  {b.additional_stops.map((s, i) => <li key={i}>{s}</li>)}
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

        {b.cancellation_reason && (
          <div className="mt-4">
            <div className="text-[10px] uppercase tracking-[0.25em] text-red-400 mb-1.5">
              Cancellation reason
            </div>
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-sm text-white/85 leading-relaxed whitespace-pre-wrap">
              {b.cancellation_reason}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
