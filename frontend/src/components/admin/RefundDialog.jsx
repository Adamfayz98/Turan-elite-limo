import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api, formatApiErrorDetail } from "@/lib/api";
import { Loader2, CreditCard, Clock4, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

const OPTIONS = [
  {
    key: "we_cancelled",
    title: "Full refund (we cancelled)",
    subtitle: "Chauffeur unavailable, weather, or anything not the customer's fault.",
    accent: "border-emerald-400/30 bg-emerald-400/[0.04]",
    badge: "text-emerald-300",
  },
  {
    key: "tier",
    title: "Tier refund (customer cancelled)",
    subtitle: "Auto-calculated from the cancellation policy.",
    accent: "border-[#D4AF37]/30 bg-[#D4AF37]/[0.04]",
    badge: "text-[#D4AF37]",
  },
  {
    key: "custom",
    title: "Custom refund",
    subtitle: "Goodwill, partial trip, or any other reason.",
    accent: "border-white/15 bg-white/[0.04]",
    badge: "text-white/65",
  },
];

export default function RefundDialog({ booking, open, onClose, onChanged }) {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [preview, setPreview] = useState(null);
  const [choice, setChoice] = useState("we_cancelled");
  const [customAmount, setCustomAmount] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!open || !booking) return;
    setPreview(null);
    setChoice(booking.cancellation_requested ? "tier" : "we_cancelled");
    setCustomAmount("");
    setNote("");
    setLoading(true);
    api
      .get(`/admin/bookings/${booking.id}/refund-preview`)
      .then((res) => setPreview(res.data))
      .catch((err) =>
        toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Couldn't load refund preview"),
      )
      .finally(() => setLoading(false));
  }, [open, booking]);

  const chosenAmount = (() => {
    if (!preview) return 0;
    if (choice === "we_cancelled") return preview.full_refund_amount;
    if (choice === "tier") return preview.tier_refund_amount;
    if (choice === "custom") return parseFloat(customAmount) || 0;
    return 0;
  })();

  const submit = async () => {
    if (!preview) return;
    const amount = Number(chosenAmount.toFixed(2));
    if (amount < 0) {
      toast.error("Refund amount can't be negative");
      return;
    }
    if (amount > preview.paid_amount + 0.01) {
      toast.error(`Refund cannot exceed paid amount ($${preview.paid_amount.toFixed(2)})`);
      return;
    }
    const customerWillSee = amount.toFixed(2);
    const youKeep = (preview.paid_amount - amount).toFixed(2);
    const stripeKeeps = (preview.stripe_fee_estimate || 0).toFixed(2);
    if (
      !window.confirm(
        `Refund $${customerWillSee} to the customer?\n\n` +
          `Customer receives: $${customerWillSee}\n` +
          `You retain: $${youKeep}\n` +
          `Stripe keeps their original ~$${stripeKeeps} fee\n\n` +
          `This cannot be undone.`,
      )
    ) {
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await api.post(`/admin/payments/${booking.id}/refund`, {
        amount,
        reason: choice,
        note: note.trim(),
      });
      toast.success(`Refunded $${Number(data.amount || 0).toFixed(2)}`);
      onChanged?.();
      onClose?.();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Refund failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (!booking) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose?.()}>
      <DialogContent
        className="bg-[#0A0A0A] border-[#1F1F1F] text-white max-w-lg p-6"
        data-testid="refund-dialog"
      >
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">Refund payment</DialogTitle>
          <DialogDescription className="text-xs text-white/55 mt-1 leading-relaxed">
            #{booking.confirmation_number} · {booking.full_name} · paid $
            {Number(booking.paid_amount || 0).toFixed(2)}
          </DialogDescription>
        </DialogHeader>

        {loading || !preview ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-[#D4AF37]" />
          </div>
        ) : (
          <div className="space-y-4 mt-2">
            <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 text-xs text-white/70">
              <div className="flex items-center gap-2 mb-1">
                <Clock4 className="w-3.5 h-3.5 text-[#D4AF37]" />
                <strong className="text-white/90">
                  {preview.hours_until_pickup == null
                    ? "Pickup time unknown"
                    : preview.pickup_in_past
                      ? `Pickup was ${Math.abs(preview.hours_until_pickup).toFixed(1)}h ago`
                      : `${preview.hours_until_pickup.toFixed(1)}h before pickup`}
                </strong>
              </div>
              <div className="text-white/55">
                Policy: {(preview.tiers || []).map((t) => `${t.refund_percent}% if >${t.hours_before_pickup}h`).join(" · ")}
              </div>
            </div>

            <div className="space-y-2">
              {OPTIONS.map((opt) => {
                let amountLabel = "";
                if (opt.key === "we_cancelled") amountLabel = `$${preview.full_refund_amount.toFixed(2)}`;
                else if (opt.key === "tier")
                  amountLabel = `$${preview.tier_refund_amount.toFixed(2)} (${preview.tier_refund_percent}%)`;
                else amountLabel = customAmount ? `$${(parseFloat(customAmount) || 0).toFixed(2)}` : "—";
                const isActive = choice === opt.key;
                return (
                  <label
                    key={opt.key}
                    data-testid={`refund-option-${opt.key}`}
                    className={cn(
                      "block rounded-xl border cursor-pointer p-3 transition-colors",
                      isActive ? opt.accent : "border-white/10 bg-white/[0.02] hover:border-white/20",
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="radio"
                        name="refund-choice"
                        checked={isActive}
                        onChange={() => setChoice(opt.key)}
                        className="mt-1 accent-[#D4AF37]"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-white/95">{opt.title}</span>
                          <span className={cn("text-sm font-medium", opt.badge)}>{amountLabel}</span>
                        </div>
                        <div className="text-[11px] text-white/55 mt-0.5">{opt.subtitle}</div>
                        {opt.key === "custom" && isActive && (
                          <div className="mt-2">
                            <Label className="text-[10px] uppercase tracking-[0.2em] text-white/45">Amount</Label>
                            <Input
                              type="number"
                              min={0}
                              max={preview.paid_amount}
                              step="0.01"
                              value={customAmount}
                              onChange={(e) => setCustomAmount(e.target.value)}
                              data-testid="refund-custom-amount"
                              placeholder="0.00"
                              className="bg-[#0E0E0E] border-[#27272A] text-white focus-visible:ring-[#D4AF37] focus-visible:border-[#D4AF37] mt-1 h-9 w-32"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>

            <div>
              <Label className="text-[10px] uppercase tracking-[0.2em] text-white/45">Note (optional)</Label>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                data-testid="refund-note"
                placeholder="Why you're issuing this refund — shows up in your audit log only"
                className="bg-[#0E0E0E] border-[#27272A] text-white focus-visible:ring-[#D4AF37] focus-visible:border-[#D4AF37] mt-1 min-h-[60px] text-sm"
                maxLength={300}
              />
            </div>

            <div className="rounded-lg border border-amber-400/20 bg-amber-400/[0.04] p-3 text-[11px] text-amber-200/85 flex gap-2">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <div>
                Stripe doesn't return their original ~${preview.stripe_fee_estimate.toFixed(2)} processing fee on refunds.
                Your 3.5% service fee covers this when you keep the trip; on a full refund you'll be slightly out of pocket.
              </div>
            </div>

            <Button
              onClick={submit}
              disabled={submitting || chosenAmount <= 0}
              data-testid="refund-submit"
              className="w-full bg-[#D4AF37] text-black hover:bg-[#B3922E] rounded-full h-11 font-medium"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <CreditCard className="w-4 h-4 mr-2" />
              )}
              Refund ${chosenAmount.toFixed(2)}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
