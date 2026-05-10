import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { toast } from "sonner";
import {
  Loader2,
  ShieldCheck,
  CalendarDays,
  MapPin,
  Car,
  User,
  PhoneCall,
  Mail,
  CheckCircle2,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import Logo from "@/components/Logo";
import { api, formatApiErrorDetail } from "@/lib/api";
import { cn } from "@/lib/utils";

function StatusPill({ status, paymentStatus }) {
  const map = {
    pending: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
    confirmed: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    completed: "bg-sky-500/15 text-sky-300 border-sky-500/30",
    cancelled: "bg-red-500/15 text-red-300 border-red-500/30",
  };
  return (
    <div className="flex items-center gap-2">
      <span className={cn("text-[11px] uppercase tracking-wider px-3 py-1 rounded-full border", map[status])}>
        {status}
      </span>
      {paymentStatus === "paid" && (
        <span className="text-[11px] uppercase tracking-wider px-3 py-1 rounded-full border bg-emerald-500/15 text-emerald-300 border-emerald-500/30">
          Paid
        </span>
      )}
    </div>
  );
}

function Row({ icon: Icon, label, value }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-4 py-3 border-b border-white/5 last:border-b-0">
      <Icon className="w-4 h-4 text-[#D4AF37] mt-1 flex-shrink-0" />
      <div className="flex-1">
        <div className="text-[10px] uppercase tracking-[0.25em] text-white/45">{label}</div>
        <div className="text-white text-sm mt-0.5">{value}</div>
      </div>
    </div>
  );
}

export default function ManageBooking() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [b, setB] = useState(null);
  const [reason, setReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  const load = async () => {
    try {
      const { data } = await api.get(`/bookings/manage/${token}`);
      setB(data);
    } catch (err) {
      toast.error(
        formatApiErrorDetail(err.response?.data?.detail) || "We couldn't find that reservation.",
      );
      setB(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const onCancel = async () => {
    setCancelling(true);
    try {
      const { data } = await api.post(`/bookings/manage/${token}/cancel`, { reason });
      toast.success(data.message || "Your reservation has been cancelled.");
      load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Cancel failed.");
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-[#050505] text-white flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-[#D4AF37]" />
      </main>
    );
  }

  if (!b) {
    return (
      <main className="min-h-screen bg-[#050505] text-white flex items-center justify-center px-6">
        <div data-testid="manage-not-found" className="max-w-md w-full bg-[#0A0A0A] border border-[#1F1F1F] rounded-2xl p-8 text-center">
          <h1 className="font-serif text-3xl">Reservation not found</h1>
          <p className="text-white/60 mt-3 text-sm">
            This link may have expired or been mistyped. If you need help, please contact us at{" "}
            <a href="tel:+16504100687" className="text-[#D4AF37]">(650) 410‑0687</a>.
          </p>
          <Link
            to="/"
            className="inline-block mt-6 text-xs tracking-[0.3em] uppercase text-white/50 hover:text-[#D4AF37]"
          >
            ← Back to TuranEliteLimo
          </Link>
        </div>
      </main>
    );
  }

  const isCancelled = b.status === "cancelled";
  const isCompleted = b.status === "completed";
  const isPaid = b.payment_status === "paid";
  const cancelDisabled = isCancelled || isCompleted || b.cancellation_requested;

  return (
    <main data-testid="manage-page" className="min-h-screen bg-[#050505] text-white">
      <header className="border-b border-white/10 px-6 md:px-10 h-20 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5">
          <Logo size={32} className="text-[#D4AF37]" />
          <span className="font-serif text-2xl">
            Turan<span className="gold-text">EliteLimo</span>
          </span>
        </Link>
        <a
          href="tel:+16504100687"
          className="hidden sm:inline-flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-white/60 hover:text-[#D4AF37]"
          data-testid="manage-call-link"
        >
          <PhoneCall className="w-3.5 h-3.5" />
          (650) 410‑0687
        </a>
      </header>

      <div className="max-w-3xl mx-auto px-6 md:px-10 py-12">
        <span className="text-xs tracking-[0.3em] uppercase text-[#D4AF37] inline-flex items-center gap-2">
          <ShieldCheck className="w-3.5 h-3.5" /> Manage Reservation
        </span>
        <h1 className="font-serif text-4xl md:text-5xl mt-4 leading-tight">
          Hi {b.full_name?.split(" ")[0] || "there"} — here are your ride details.
        </h1>

        <div className="mt-8 bg-[#0A0A0A] border border-[#1F1F1F] rounded-2xl p-6 md:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-white/5">
            <div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-white/45">Confirmation</div>
              <div
                data-testid="manage-confirmation-number"
                className="font-mono text-2xl text-[#D4AF37] tracking-[0.35em] mt-1"
              >
                {b.confirmation_number || "—"}
              </div>
            </div>
            <StatusPill status={b.status} paymentStatus={b.payment_status} />
          </div>

          <div className="mt-2">
            <Row icon={CalendarDays} label="When" value={`${b.pickup_date} at ${b.pickup_time}`} />
            <Row icon={MapPin} label="Pickup" value={b.pickup_location} />
            <Row icon={MapPin} label="Drop-off" value={b.dropoff_location} />
            {b.return_trip && (
              <Row icon={MapPin} label="Return" value={b.return_location || "Same as pickup"} />
            )}
            {b.additional_stops?.length > 0 && (
              <Row icon={MapPin} label="Stops" value={b.additional_stops.join(", ")} />
            )}
            <Row icon={Car} label="Vehicle" value={b.vehicle_type} />
            <Row
              icon={User}
              label="Service"
              value={`${b.service_type}${b.hours ? ` · ${b.hours} hour${b.hours > 1 ? "s" : ""}` : ""}`}
            />
            <Row
              icon={User}
              label="Party size"
              value={`${b.passengers} passenger${b.passengers > 1 ? "s" : ""}${b.luggage_count ? ` · ${b.luggage_count} bag${b.luggage_count > 1 ? "s" : ""}` : ""}${b.child_seat ? " · child seat" : ""}`}
            />
            {(b.quote_amount || b.paid_amount) && (
              <Row
                icon={CheckCircle2}
                label={isPaid ? "Paid" : "Total"}
                value={`$${(b.paid_amount || b.quote_amount || 0).toFixed(2)} USD`}
              />
            )}
          </div>
        </div>

        {b.cancellation_requested && !isCancelled && (
          <div
            data-testid="manage-cancellation-notice"
            className="mt-6 rounded-xl border border-orange-500/30 bg-orange-500/5 px-5 py-4 text-orange-200 text-sm"
          >
            <strong>Cancellation requested.</strong> Our team is reviewing it and will contact you about a refund within 24 hours.
          </div>
        )}

        {!cancelDisabled && (
          <div className="mt-8 bg-[#0A0A0A] border border-[#1F1F1F] rounded-2xl p-6 md:p-8">
            <h3 className="font-serif text-2xl">Need to cancel?</h3>
            <p className="text-white/55 text-sm mt-2 leading-relaxed">
              {isPaid
                ? "Since this booking is already paid, our team will review your request and contact you about a refund within 24 hours."
                : "Cancelling now releases your slot. We'll send a confirmation email."}
            </p>
            <Textarea
              data-testid="manage-cancel-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Optional: tell us why (helps us improve)…"
              className="mt-4 bg-[#0E0E0E] border-[#27272A] text-white placeholder:text-white/40 focus-visible:ring-[#D4AF37] focus-visible:border-[#D4AF37] min-h-[80px]"
            />
            <div className="mt-5 flex items-center justify-end gap-3">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    data-testid="manage-cancel-btn"
                    variant="outline"
                    className="bg-transparent border-red-500/40 text-red-400 hover:bg-red-500/10 rounded-full"
                  >
                    <XCircle className="w-4 h-4 mr-2" />
                    {isPaid ? "Request Cancellation" : "Cancel Reservation"}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="bg-[#0A0A0A] border-[#1F1F1F] text-white">
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      {isPaid ? "Request cancellation?" : "Cancel reservation?"}
                    </AlertDialogTitle>
                    <AlertDialogDescription className="text-white/60">
                      {isPaid
                        ? "We'll review your request and contact you about a refund within 24 hours. Confirmation #" +
                          (b.confirmation_number || "") +
                          " will remain visible until processed."
                        : "Confirmation #" +
                          (b.confirmation_number || "") +
                          " will be cancelled. This cannot be undone — you'll need to make a new booking if plans change."}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="bg-transparent border-white/20 hover:bg-white/10">
                      Keep reservation
                    </AlertDialogCancel>
                    <AlertDialogAction
                      data-testid="manage-cancel-confirm"
                      disabled={cancelling}
                      onClick={onCancel}
                      className="bg-red-500 hover:bg-red-600"
                    >
                      {cancelling && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      Yes, {isPaid ? "request" : "cancel"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        )}

        <div className="mt-10 text-center text-white/45 text-xs">
          Need to make a different change?
          <a href="tel:+16504100687" className="ml-2 text-[#D4AF37] hover:underline">
            <PhoneCall className="w-3 h-3 inline mr-1" /> Call us
          </a>
          <span className="mx-2 text-white/20">·</span>
          <a href={`mailto:${b.support_email || "turonlimosupport@gmail.com"}`} className="text-[#D4AF37] hover:underline">
            <Mail className="w-3 h-3 inline mr-1" /> Email us
          </a>
        </div>
      </div>
    </main>
  );
}
