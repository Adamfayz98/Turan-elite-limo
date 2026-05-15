import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  Calendar,
  MapPin,
  User,
  Phone,
  Car,
  Plane,
  Briefcase,
  Loader2,
  Check,
  ChevronRight,
  Sparkles,
  Clock4,
} from "lucide-react";

import { api, formatApiErrorDetail } from "@/lib/api";
import { Button } from "@/components/ui/button";
import Logo from "@/components/Logo";
import { cn } from "@/lib/utils";

const STATUS_FLOW = [
  { key: "assigned", label: "Assigned", color: "white/60" },
  { key: "en_route", label: "On the way", color: "amber-400", action: "I'm on the way" },
  { key: "on_location", label: "Arrived at pickup", color: "blue-400", action: "I've arrived" },
  { key: "passenger_onboard", label: "Passenger onboard", color: "purple-400", action: "Passenger in car" },
  { key: "completed", label: "Trip completed", color: "emerald-400", action: "Mark trip complete" },
];

function fmt12h(t) {
  if (!t || !t.includes(":")) return t || "";
  const [hRaw, mRaw] = t.split(":");
  const h = parseInt(hRaw, 10);
  const m = parseInt(mRaw, 10);
  if (isNaN(h) || isNaN(m)) return t;
  const meridiem = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${meridiem}`;
}

function statusIndex(status) {
  return STATUS_FLOW.findIndex((s) => s.key === status);
}

export default function DriverPortal() {
  const { token } = useParams();
  const [trip, setTrip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState(null);

  const load = async () => {
    try {
      const { data } = await api.get(`/driver/${token}`);
      setTrip(data);
    } catch (err) {
      setError(formatApiErrorDetail(err.response?.data?.detail) || "Trip not found");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [token]); // eslint-disable-line

  const advance = async (nextStatus) => {
    if (!trip) return;
    setUpdating(true);
    try {
      await api.post(`/driver/${token}/status`, { status: nextStatus });
      toast.success(`Status updated → ${STATUS_FLOW.find((s) => s.key === nextStatus)?.label}`);
      await load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Failed to update status");
    } finally {
      setUpdating(false);
    }
  };

  const markFlightLanded = async () => {
    setUpdating(true);
    try {
      await api.post(`/driver/${token}/flight-landed`, {});
      toast.success("Flight landed — wait clock started");
      await load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Failed");
    } finally {
      setUpdating(false);
    }
  };

  const recordWaitTime = async () => {
    const minutes = window.prompt(
      "Total minutes waited (including grace period):\n\n• Airport: 45 min free, then charged per min\n• Other trips: 15 min free, then charged per min\n\nDispatch will review and charge.",
      "",
    );
    if (!minutes) return;
    const n = parseInt(minutes, 10);
    if (!n || n < 1) {
      toast.error("Enter a valid number");
      return;
    }
    setUpdating(true);
    try {
      const { data } = await api.post(`/driver/${token}/record-wait-time`, { minutes_waited: n });
      if (data.already_charged) {
        toast.info(`Already charged $${data.amount?.toFixed(2)} for ${data.minutes_waited} min`);
      } else {
        toast.success(`${n} min logged · pending dispatch review`);
      }
      await load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Failed to record");
    } finally {
      setUpdating(false);
    }
  };

  const markNoShow = async () => {
    if (!window.confirm("Mark this trip as a no-show? Customer forfeits the fare (no refund). This cannot be undone from the driver portal.")) {
      return;
    }
    const reason = window.prompt("Brief note for the record (optional):", "") || "";
    setUpdating(true);
    try {
      await api.post(`/driver/${token}/no-show`, { reason });
      toast.success("Trip marked as no-show");
      await load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Failed");
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-[#080808] text-white flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-[#D4AF37]" />
      </main>
    );
  }
  if (error) {
    return (
      <main className="min-h-screen bg-[#080808] text-white flex items-center justify-center px-6">
        <div className="text-center">
          <h1 className="font-serif text-3xl">Trip not found</h1>
          <p className="text-white/60 mt-2 text-sm">{error}</p>
        </div>
      </main>
    );
  }

  const currentStatus = trip.trip_status || "assigned";
  const currentIdx = statusIndex(currentStatus);
  const nextStep = STATUS_FLOW[currentIdx + 1];
  const isCompleted = currentStatus === "completed";

  return (
    <main className="min-h-screen bg-[#080808] text-white pb-24" data-testid="driver-portal">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-[#080808]/95 backdrop-blur-md border-b border-[#1F1F1F]">
        <div className="max-w-2xl mx-auto px-5 py-4 flex items-center justify-between">
          <Logo />
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#D4AF37]">
            Driver Dispatch
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-5 pt-6">
        {/* Trip header */}
        <div className="text-xs uppercase tracking-[0.2em] text-white/45">
          Trip #{trip.confirmation_number || trip.id?.slice(0, 8)}
        </div>
        <h1 className="font-serif text-3xl mt-1">
          {trip.customer_name}
        </h1>
        <div className="flex flex-wrap items-center gap-3 mt-2">
          <a
            href={`tel:${trip.customer_phone}`}
            data-testid="driver-customer-phone"
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#D4AF37]/10 border border-[#D4AF37]/40 text-[#D4AF37] hover:bg-[#D4AF37]/20 transition-colors text-sm font-medium"
          >
            <Phone className="w-4 h-4" />
            Call customer · {trip.customer_phone}
          </a>
          <a
            href={`sms:${trip.customer_phone}`}
            data-testid="driver-customer-sms"
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/15 text-white/80 hover:bg-white/[0.08] transition-colors text-sm"
          >
            Text
          </a>
        </div>

        {/* Status pill */}
        <div className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/20 bg-white/[0.03]">
          <span
            className={cn(
              "w-2 h-2 rounded-full animate-pulse",
              currentStatus === "assigned" && "bg-white/40 animate-none",
              currentStatus === "en_route" && "bg-amber-400",
              currentStatus === "on_location" && "bg-blue-400",
              currentStatus === "passenger_onboard" && "bg-purple-400",
              currentStatus === "completed" && "bg-emerald-400 animate-none",
            )}
          />
          <span data-testid="driver-trip-status" className="text-sm font-medium">
            {STATUS_FLOW[currentIdx]?.label || currentStatus}
          </span>
          {trip.trip_status_updated_at && (
            <span className="text-[11px] text-white/45 ml-1">
              · {new Date(trip.trip_status_updated_at).toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})}
            </span>
          )}
        </div>

        {/* Action button (next step) */}
        {nextStep && !isCompleted && (
          <Button
            onClick={() => advance(nextStep.key)}
            disabled={updating}
            data-testid={`driver-advance-${nextStep.key}`}
            className={cn(
              "w-full mt-6 h-14 text-base font-semibold rounded-2xl",
              "bg-[#D4AF37] text-black hover:bg-[#B3922E]",
            )}
          >
            {updating ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <ChevronRight className="w-5 h-5 mr-1" />
                {nextStep.action}
              </>
            )}
          </Button>
        )}

        {isCompleted && (
          <div
            data-testid="driver-trip-complete"
            className="mt-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 p-5 flex items-center gap-3"
          >
            <Check className="w-5 h-5 text-emerald-400 flex-shrink-0" />
            <div className="text-sm">
              <div className="text-white font-medium">Trip completed</div>
              <div className="text-white/60 text-xs mt-0.5">
                Customer notified. Receipt + rating email is on its way.
              </div>
            </div>
          </div>
        )}

        {/* Wait-time + No-show actions */}
        {!isCompleted && trip.trip_status !== "completed" && !trip.no_show && (
          <div data-testid="wait-actions" className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
            {trip.service_type === "Airport Transfer" && !trip.flight_landed_at && (
              <Button
                onClick={markFlightLanded}
                disabled={updating}
                data-testid="driver-flight-landed"
                className="bg-white/5 hover:bg-white/10 border border-amber-400/30 text-amber-300 rounded-xl h-11 text-sm font-medium"
              >
                <Plane className="w-4 h-4 mr-2" /> Mark flight landed
              </Button>
            )}
            {trip.service_type === "Airport Transfer" && trip.flight_landed_at && (
              <div className="rounded-xl border border-amber-400/30 bg-amber-400/5 px-3 py-2 text-xs text-amber-300 flex items-center gap-2">
                <Plane className="w-4 h-4" />
                <span>Landed at {new Date(trip.flight_landed_at).toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})}</span>
              </div>
            )}
            {trip.has_saved_card && !trip.wait_time_charged_at && trip.wait_time_consent && (
              <Button
                onClick={recordWaitTime}
                disabled={updating}
                data-testid="driver-record-wait"
                className="bg-white/5 hover:bg-white/10 border border-[#D4AF37]/40 text-[#D4AF37] rounded-xl h-11 text-sm font-medium"
              >
                ⏱️ {trip.wait_time_minutes_pending ? `Update wait time (${trip.wait_time_minutes_pending} min logged)` : "Record wait time"}
              </Button>
            )}
            {trip.wait_time_minutes_pending && !trip.wait_time_charged_at && (
              <div className="rounded-xl border border-amber-400/30 bg-amber-400/5 px-3 py-2 text-xs text-amber-300 flex items-center gap-2">
                <Clock4 className="w-4 h-4" />
                <span>{trip.wait_time_minutes_pending} min logged · pending dispatch review</span>
              </div>
            )}
            {trip.wait_time_charged_at && (
              <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/5 px-3 py-2 text-xs text-emerald-300 flex items-center gap-2">
                <Check className="w-4 h-4" />
                <span>Charged ${trip.wait_time_fee_amount?.toFixed(2)} for {trip.wait_time_minutes} min</span>
              </div>
            )}
            <Button
              onClick={markNoShow}
              disabled={updating}
              data-testid="driver-no-show"
              className="bg-white/5 hover:bg-red-500/10 border border-red-500/30 text-red-400 hover:text-red-300 rounded-xl h-11 text-sm font-medium sm:col-span-1"
            >
              Mark as no-show
            </Button>
          </div>
        )}

        {/* Progress timeline */}
        <div className="mt-8">
          <div className="text-[10px] uppercase tracking-[0.25em] text-white/45 mb-3">
            Progress
          </div>
          <div className="space-y-2">
            {STATUS_FLOW.map((step, i) => (
              <div
                key={step.key}
                className={cn(
                  "flex items-center gap-3 py-2 px-3 rounded-lg border",
                  i < currentIdx && "border-white/10 bg-white/[0.02] text-white/55",
                  i === currentIdx && "border-[#D4AF37]/40 bg-[#D4AF37]/[0.06] text-white",
                  i > currentIdx && "border-white/5 text-white/30",
                )}
              >
                <span
                  className={cn(
                    "w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0",
                    i < currentIdx && "border-emerald-500/50 bg-emerald-500/20",
                    i === currentIdx && "border-[#D4AF37] bg-[#D4AF37]/30",
                    i > currentIdx && "border-white/15",
                  )}
                >
                  {i < currentIdx && <Check className="w-3 h-3 text-emerald-400" />}
                </span>
                <span className="text-sm">{step.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Trip details */}
        <div className="mt-8 rounded-2xl border border-[#1F1F1F] bg-[#0A0A0A] p-5 space-y-4">
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#D4AF37]">
            Trip details
          </div>

          <Row icon={Calendar} label="When" value={`${trip.pickup_date} · ${fmt12h(trip.pickup_time)}`} />
          <Row icon={MapPin} label="Pickup" value={trip.pickup_location} />
          {trip.additional_stops?.length > 0 && (
            <Row icon={MapPin} label="Stops" value={trip.additional_stops.join(" → ")} />
          )}
          <Row icon={MapPin} label="Drop-off" value={trip.dropoff_location} />
          <Row icon={Car} label="Vehicle" value={`${trip.vehicle_type}${trip.driver_plate ? ` · plate ${trip.driver_plate}` : ""}`} />
          <Row
            icon={User}
            label="Service"
            value={`${trip.service_type}${trip.hours ? ` · ${trip.hours} hour${trip.hours > 1 ? "s" : ""}` : ""}`}
          />
          {trip.flight_number && (
            <Row icon={Plane} label="Flight" value={`${trip.flight_number} — monitor before pickup`} highlight />
          )}
          {trip.meet_and_greet && (
            <Row
              icon={Sparkles}
              label="Meet & Greet"
              value="Park, walk inside, meet customer at baggage claim with name sign. Help with luggage."
              highlight
            />
          )}
          <Row
            icon={Briefcase}
            label="Passengers"
            value={`${trip.passengers}${trip.luggage_count ? ` · ${trip.luggage_count} bag${trip.luggage_count > 1 ? "s" : ""}` : ""}${trip.child_seat ? " · child seat" : ""}`}
          />
          {trip.return_trip && (
            <Row icon={MapPin} label="Return" value={trip.return_location || "TBA"} />
          )}
          {trip.notes && <Row icon={User} label="Notes" value={trip.notes} />}
        </div>

        <p className="text-[11px] text-white/40 mt-6 text-center leading-relaxed">
          Status updates instantly text the customer. Questions? Call dispatch.
        </p>
      </div>
    </main>
  );
}

function Row({ icon: Icon, label, value, highlight }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className={cn("w-4 h-4 mt-1 flex-shrink-0", highlight ? "text-[#D4AF37]" : "text-white/40")} />
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-[0.2em] text-white/45">{label}</div>
        <div className={cn("text-sm mt-0.5 break-words", highlight ? "text-[#D4AF37] font-medium" : "text-white")}>
          {value}
        </div>
      </div>
    </div>
  );
}
