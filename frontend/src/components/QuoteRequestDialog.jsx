import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Send, Phone as PhoneIcon } from "lucide-react";

import { api, formatApiErrorDetail } from "@/lib/api";
import { trackQuoteRequest, trackPhoneCall } from "@/lib/googleAdsEvents";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

/**
 * Quote-request modal for call-only vehicles (Party Bus, Sprinter Van, Stretch Limo).
 * Captures basic trip details + contact info and POSTs to /api/quote-requests.
 * Admin gets SMS + email + a row in the dashboard.
 */
export default function QuoteRequestDialog({
  open,
  onOpenChange,
  vehicleType,
  supportPhone = "(650) 410-0687",
}) {
  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    email: "",
    pickup_date: "",
    pickup_time: "",
    pickup_location: "",
    dropoff_location: "",
    passengers: "",
    occasion: "",
    notes: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const update = (k) => (e) => setForm((s) => ({ ...s, [k]: e.target.value }));

  const submit = async () => {
    if (!form.full_name.trim()) return toast.error("Please add your name");
    if (!form.phone.trim()) return toast.error("Please add a phone number we can text");
    setSubmitting(true);
    try {
      const { data } = await api.post("/quote-requests", {
        ...form,
        vehicle_type: vehicleType,
        passengers: form.passengers ? Number(form.passengers) : null,
      });
      // Fire the Google Ads "Lead" conversion (separate from purchase).
      try {
        trackQuoteRequest({ requestId: data?.id, vehicleType });
      } catch {/* never block UX on tracking */}
      setDone(true);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Couldn't submit, try again");
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setDone(false);
    setForm({
      full_name: "", phone: "", email: "", pickup_date: "", pickup_time: "",
      pickup_location: "", dropoff_location: "", passengers: "", occasion: "", notes: "",
    });
  };

  const tel = (supportPhone || "").replace(/[^\d+]/g, "");
  const inputCls = "bg-[#0E0E0E] border-[#27272A] text-white focus-visible:ring-[#D4AF37] focus-visible:border-[#D4AF37] mt-1 h-11";
  const labelCls = "text-[10px] uppercase tracking-[0.2em] text-white/55";

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent
        data-testid="quote-request-dialog"
        className="bg-[#0A0A0A] border-[#1F1F1F] text-white max-w-xl max-h-[90vh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">
            {done ? "Got it — we'll text you shortly" : `Request a quote · ${vehicleType}`}
          </DialogTitle>
          <DialogDescription className="text-xs text-white/55 mt-1">
            {done
              ? "Your request is in. Our team will text or call you with a custom quote — usually within 15 minutes during business hours."
              : `${vehicleType} pricing depends on group size, hours, and route. Tell us what you need and we'll send a custom quote.`}
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="space-y-4 mt-2">
            <div className="rounded-xl border border-[#D4AF37]/30 bg-[#D4AF37]/5 p-5 text-center">
              <div className="font-serif text-3xl text-[#D4AF37]">Thanks, {form.full_name.split(" ")[0]}</div>
              <p className="text-xs text-white/60 mt-2 leading-relaxed">
                Need an answer right now? Call us — we usually pick up.
              </p>
              <a
                href={`tel:${tel}`}
                onClick={() => trackPhoneCall({ source: "quote-success" })}
                data-testid="quote-success-call-btn"
                className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#D4AF37] text-black text-sm font-semibold hover:bg-[#B3922E]"
              >
                <PhoneIcon className="w-4 h-4" /> {supportPhone}
              </a>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => { reset(); onOpenChange(false); }}
              data-testid="quote-success-close-btn"
              className="w-full bg-transparent border-white/15 text-white hover:bg-white/5"
            >
              Done
            </Button>
          </div>
        ) : (
          <div className="space-y-3 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className={labelCls}>Name *</Label>
                <Input data-testid="qr-name" value={form.full_name} onChange={update("full_name")} placeholder="Jane Doe" className={inputCls} />
              </div>
              <div>
                <Label className={labelCls}>Phone *</Label>
                <Input data-testid="qr-phone" value={form.phone} onChange={update("phone")} placeholder="(650) 555-0123" className={inputCls} />
              </div>
            </div>
            <div>
              <Label className={labelCls}>Email (optional)</Label>
              <Input data-testid="qr-email" type="email" value={form.email} onChange={update("email")} placeholder="you@email.com" className={inputCls} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className={labelCls}>Pickup date</Label>
                <Input data-testid="qr-date" type="date" value={form.pickup_date} onChange={update("pickup_date")} className={inputCls} />
              </div>
              <div>
                <Label className={labelCls}>Pickup time</Label>
                <Input data-testid="qr-time" type="time" value={form.pickup_time} onChange={update("pickup_time")} className={inputCls} />
              </div>
            </div>
            <div>
              <Label className={labelCls}>Pickup location</Label>
              <Input data-testid="qr-pickup" value={form.pickup_location} onChange={update("pickup_location")} placeholder="Or general area" className={inputCls} />
            </div>
            <div>
              <Label className={labelCls}>Drop-off / destination</Label>
              <Input data-testid="qr-dropoff" value={form.dropoff_location} onChange={update("dropoff_location")} placeholder="Or general area" className={inputCls} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className={labelCls}>Passengers</Label>
                <Input data-testid="qr-pax" type="number" min="1" max="60" value={form.passengers} onChange={update("passengers")} placeholder="14" className={inputCls} />
              </div>
              <div>
                <Label className={labelCls}>Occasion</Label>
                <Input data-testid="qr-occasion" value={form.occasion} onChange={update("occasion")} placeholder="Wedding, birthday..." className={inputCls} />
              </div>
            </div>
            <div>
              <Label className={labelCls}>Notes</Label>
              <Textarea
                data-testid="qr-notes"
                value={form.notes}
                onChange={update("notes")}
                rows={3}
                placeholder="Special requests, route preferences, decorations..."
                className="bg-[#0E0E0E] border-[#27272A] text-white focus-visible:ring-[#D4AF37] focus-visible:border-[#D4AF37] mt-1 resize-none"
              />
            </div>
            <Button
              onClick={submit}
              disabled={submitting}
              data-testid="qr-submit"
              className="w-full bg-[#D4AF37] text-black hover:bg-[#B3922E] rounded-full h-11 font-medium"
            >
              {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
              Send request
            </Button>
            <p className="text-[10px] text-center text-white/40 pt-1">
              We reply within ~15 min during business hours. No payment now.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
