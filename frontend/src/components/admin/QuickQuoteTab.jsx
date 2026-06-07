import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Loader2,
  Phone,
  Zap,
  MapPin,
  Calendar,
  Users,
  FileText,
  TrendingUp,
} from "lucide-react";

import { api, formatApiErrorDetail } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Quick Quote Admin Tool — for on-demand phone callers.
 *
 * Workflow:
 *  1. Caller asks "How much from X to Y at time Z?"
 *  2. Admin types it in, hits Quote
 *  3. Backend runs the same pricing engine the website uses, then auto-applies
 *     a last-minute surge multiplier based on hours-until-pickup
 *  4. Admin reads the quote to the customer; if they accept, one click
 *     opens the Custom Invoice tab pre-filled to generate a Stripe link.
 */
export default function QuickQuoteTab() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    pickup_location: "",
    dropoff_location: "",
    pickup_datetime: "",
    passengers: "1",
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const update = (k) => (e) => setForm((s) => ({ ...s, [k]: e.target.value }));

  const submit = async () => {
    if (!form.pickup_location.trim() || !form.dropoff_location.trim()) {
      toast.error("Pickup and drop-off are required");
      return;
    }
    if (!form.pickup_datetime) {
      toast.error("Pickup date & time is required for surge pricing");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const { data } = await api.post("/admin/quick-quote", {
        pickup_location: form.pickup_location.trim(),
        dropoff_location: form.dropoff_location.trim(),
        pickup_datetime: new Date(form.pickup_datetime).toISOString(),
        passengers: Number(form.passengers) || 1,
        service_type: "A to B Transfer",
      });
      setResult(data);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Couldn't fetch quote");
    } finally {
      setLoading(false);
    }
  };

  /** Open Invoices tab with this vehicle/price pre-filled via URL hash. */
  const sendInvoice = (vehicle) => {
    const params = new URLSearchParams({
      v: vehicle.vehicle_type,
      amount: String(vehicle.suggested_price),
      pickup_location: form.pickup_location,
      dropoff_location: form.dropoff_location,
      pickup_datetime: form.pickup_datetime,
      passengers: form.passengers,
    });
    navigate(`/admin?tab=invoices&${params.toString()}`);
    toast.success(`Switched to Invoices tab — ${vehicle.vehicle_type} prefilled`);
  };

  const labelCls = "text-[10px] uppercase tracking-[0.2em] text-white/55";
  const inputCls = "bg-[#0E0E0E] border-[#27272A] text-white focus-visible:ring-[#D4AF37] focus-visible:border-[#D4AF37] mt-1 h-11";

  return (
    <div className="space-y-6" data-testid="quick-quote-tab">
      <div className="flex items-start gap-4">
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-[#D4AF37]/10 text-[#D4AF37] flex-shrink-0">
          <Phone className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <h2 className="font-serif text-2xl text-white">Quick Quote</h2>
          <p className="text-sm text-white/55 mt-1">
            For walk-in phone callers. Auto-applies last-minute surge based on lead time, then sends them a Stripe link.
          </p>
        </div>
      </div>

      {/* Input form */}
      <div className="rounded-2xl border border-[#27272A] bg-[#0A0A0A] p-5 space-y-4">
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <Label className={labelCls}>Pickup location</Label>
            <Input
              data-testid="quick-quote-pickup"
              placeholder="SFO Airport · Terminal 2"
              value={form.pickup_location}
              onChange={update("pickup_location")}
              className={inputCls}
            />
          </div>
          <div>
            <Label className={labelCls}>Drop-off location</Label>
            <Input
              data-testid="quick-quote-dropoff"
              placeholder="1 Hacker Way, Menlo Park"
              value={form.dropoff_location}
              onChange={update("dropoff_location")}
              className={inputCls}
            />
          </div>
          <div>
            <Label className={labelCls}>Pickup date & time</Label>
            <Input
              data-testid="quick-quote-datetime"
              type="datetime-local"
              value={form.pickup_datetime}
              onChange={update("pickup_datetime")}
              className={inputCls}
            />
          </div>
          <div>
            <Label className={labelCls}>Passengers</Label>
            <Input
              data-testid="quick-quote-passengers"
              type="number"
              min="1"
              max="60"
              value={form.passengers}
              onChange={update("passengers")}
              className={inputCls}
            />
          </div>
        </div>
        <Button
          data-testid="quick-quote-submit"
          onClick={submit}
          disabled={loading}
          className="bg-[#D4AF37] text-black hover:bg-[#B3922E] rounded-full h-11 px-6 font-medium disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2" />}
          {loading ? "Calculating..." : "Get suggested rate"}
        </Button>
      </div>

      {/* Result */}
      {result && (
        <div className="space-y-4">
          {/* Lead-time / surge summary */}
          <div className="rounded-2xl border border-[#D4AF37]/30 bg-[#D4AF37]/5 p-4 flex items-center gap-3">
            <TrendingUp className="w-5 h-5 text-[#D4AF37] flex-shrink-0" />
            <div className="flex-1">
              <div className="text-sm text-white">
                <span className="font-medium">{result.lead_time_label}</span>
                <span className="text-white/55"> — {Math.round((result.lead_time_multiplier - 1) * 100)}% applied on top of base rate</span>
              </div>
              {result.surge_info && (
                <div className="text-xs text-white/55 mt-1">
                  Event surge active: <span className="text-[#D4AF37]">{result.surge_info.event_name}</span>
                </div>
              )}
            </div>
          </div>

          {/* Per-vehicle quotes */}
          <div className="space-y-3">
            {result.quotes.map((v) => (
              <div
                key={v.vehicle_type}
                data-testid={`quick-quote-row-${v.vehicle_type}`}
                className="rounded-xl border border-[#27272A] bg-[#0A0A0A] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-[#D4AF37]/40 transition-colors"
              >
                <div className="flex-1">
                  <div className="font-serif text-lg text-white">{v.vehicle_type}</div>
                  {v.suggested_price != null ? (
                    <div className="text-xs text-white/55 mt-1">
                      Base ${v.base_price?.toFixed(0)} × {result.lead_time_multiplier}×
                      {result.surge_info ? " + event surge" : ""} ={" "}
                      <span className="text-[#D4AF37] font-medium">{v.formatted_suggested}</span>
                    </div>
                  ) : (
                    <div className="text-xs text-white/55 mt-1">{v.message || "Call to confirm"}</div>
                  )}
                </div>
                {v.suggested_price != null && (
                  <Button
                    data-testid={`quick-quote-invoice-${v.vehicle_type}`}
                    onClick={() => sendInvoice(v)}
                    variant="outline"
                    className="border-[#D4AF37]/40 text-[#D4AF37] hover:bg-[#D4AF37]/10 rounded-full"
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    Send Stripe link
                  </Button>
                )}
              </div>
            ))}
          </div>

          {/* Read-aloud helper */}
          <div className="rounded-2xl border border-[#27272A] bg-[#0A0A0A] p-4 text-sm text-white/70 leading-relaxed">
            <div className="text-[10px] uppercase tracking-[0.2em] text-white/45 mb-2">Read to caller</div>
            &ldquo;For your trip {form.pickup_location || "[pickup]"} → {form.dropoff_location || "[drop-off]"}, the all-inclusive rate is{" "}
            <span className="text-[#D4AF37]">{result.quotes.find((q) => q.suggested_price != null)?.formatted_suggested || "[see above]"}</span>. That includes chauffeur, fuel, tolls, taxes and gratuity. I can text you a secure payment link right now to lock it in — would that work?&rdquo;
          </div>
        </div>
      )}
    </div>
  );
}
