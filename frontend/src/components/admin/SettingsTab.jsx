import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Save, Percent, DollarSign } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { api, formatApiErrorDetail } from "@/lib/api";
import { cn } from "@/lib/utils";

export default function SettingsTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({ deposit_percent: 100, currency: "usd", meet_greet_fee: 25, service_fee_percent: 0, per_stop_fee: 15, cancellation_tiers: [{hours_before_pickup: 24, refund_percent: 100}, {hours_before_pickup: 6, refund_percent: 50}, {hours_before_pickup: 0, refund_percent: 0}] });

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/settings");
      setSettings(data);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        deposit_percent: Number(settings.deposit_percent) || 0,
        currency: settings.currency || "usd",
        meet_greet_fee: Number(settings.meet_greet_fee) || 0,
        service_fee_percent: Number(settings.service_fee_percent) || 0,
        per_stop_fee: Number(settings.per_stop_fee) || 0,
        cancellation_tiers: (settings.cancellation_tiers || []).map((t) => ({
          hours_before_pickup: Number(t.hours_before_pickup) || 0,
          refund_percent: Number(t.refund_percent) || 0,
        })),
      };
      await api.patch("/admin/settings", payload);
      toast.success("Settings saved");
      load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-5 h-5 animate-spin text-[#D4AF37]" />
      </div>
    );
  }

  return (
    <div data-testid="settings-tab" className="rounded-2xl border border-[#1F1F1F] bg-[#0A0A0A] p-6 md:p-8">
      <h3 className="font-serif text-2xl">Payment settings</h3>
      <p className="text-sm text-white/55 mt-1">
        Controls how Stripe charges your customers when they click <em>Pay</em>.
      </p>

      <div className="mt-8 grid md:grid-cols-2 gap-5">
        <div>
          <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">
            Deposit % collected at booking
          </Label>
          <div className="mt-2 flex items-center gap-3">
            <Input
              type="number"
              min={0}
              max={100}
              data-testid="settings-deposit-percent"
              value={settings.deposit_percent}
              onChange={(e) =>
                setSettings((s) => ({ ...s, deposit_percent: e.target.value }))
              }
              className={cn(
                "bg-[#0E0E0E] border-[#27272A] text-white focus-visible:ring-[#D4AF37] focus-visible:border-[#D4AF37] h-11 w-32",
              )}
            />
            <Percent className="w-4 h-4 text-[#D4AF37]" />
            <span className="text-xs text-white/50">100 = full payment up front, 25 = quarter deposit</span>
          </div>
        </div>

        <div>
          <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">Currency</Label>
          <Input
            data-testid="settings-currency"
            value={settings.currency || ""}
            onChange={(e) =>
              setSettings((s) => ({ ...s, currency: e.target.value.toLowerCase() }))
            }
            placeholder="usd"
            className="bg-[#0E0E0E] border-[#27272A] text-white focus-visible:ring-[#D4AF37] focus-visible:border-[#D4AF37] h-11 mt-2"
            maxLength={3}
          />
        </div>

        <div className="md:col-span-2 pt-4 border-t border-[#1F1F1F]">
          <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">
            Service fee % (covers Stripe processing)
          </Label>
          <div className="mt-2 flex items-center gap-3">
            <Input
              type="number"
              min={0}
              max={20}
              step="0.1"
              data-testid="settings-service-fee-percent"
              value={settings.service_fee_percent ?? 0}
              onChange={(e) =>
                setSettings((s) => ({ ...s, service_fee_percent: e.target.value }))
              }
              className={cn(
                "bg-[#0E0E0E] border-[#27272A] text-white focus-visible:ring-[#D4AF37] focus-visible:border-[#D4AF37] h-11 w-32",
              )}
            />
            <Percent className="w-4 h-4 text-[#D4AF37]" />
            <span className="text-xs text-white/55">
              Added transparently to every quote. <strong className="text-white/80">Recommended: 3.5%</strong> to fully cover Stripe's 2.9% + $0.30 cut on refunds. Set to 0 to disable.
            </span>
          </div>
        </div>

        <div className="md:col-span-2 pt-4 border-t border-[#1F1F1F]">
          <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">
            Cancellation refund tiers
          </Label>
          <p className="text-xs text-white/55 mt-1 mb-3 leading-relaxed">
            When a customer cancels, the "Tier refund" option in the refund dialog auto-calculates from these rules. Higher hours = more refund. The system picks the highest tier the booking still qualifies for.
          </p>
          <div className="space-y-2" data-testid="settings-cancellation-tiers">
            {(settings.cancellation_tiers || []).map((tier, idx) => (
              <div
                key={idx}
                className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2 rounded-lg border border-[#27272A] bg-[#0E0E0E] px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs text-white/50 whitespace-nowrap">{">"}=</span>
                  <Input
                    type="number"
                    min={0}
                    step="1"
                    data-testid={`tier-hours-${idx}`}
                    value={tier.hours_before_pickup ?? 0}
                    onChange={(e) =>
                      setSettings((s) => {
                        const next = [...(s.cancellation_tiers || [])];
                        next[idx] = { ...next[idx], hours_before_pickup: e.target.value };
                        return { ...s, cancellation_tiers: next };
                      })
                    }
                    className="bg-[#0A0A0A] border-[#27272A] text-white focus-visible:ring-[#D4AF37] focus-visible:border-[#D4AF37] h-9 w-20"
                  />
                  <span className="text-xs text-white/65 whitespace-nowrap">hours before</span>
                </div>
                <span className="text-xs text-white/40">→</span>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step="1"
                    data-testid={`tier-percent-${idx}`}
                    value={tier.refund_percent ?? 0}
                    onChange={(e) =>
                      setSettings((s) => {
                        const next = [...(s.cancellation_tiers || [])];
                        next[idx] = { ...next[idx], refund_percent: e.target.value };
                        return { ...s, cancellation_tiers: next };
                      })
                    }
                    className="bg-[#0A0A0A] border-[#27272A] text-white focus-visible:ring-[#D4AF37] focus-visible:border-[#D4AF37] h-9 w-20"
                  />
                  <Percent className="w-3.5 h-3.5 text-[#D4AF37]" />
                  <span className="text-xs text-white/55 whitespace-nowrap">refund</span>
                </div>
                <button
                  type="button"
                  data-testid={`tier-remove-${idx}`}
                  onClick={() =>
                    setSettings((s) => ({
                      ...s,
                      cancellation_tiers: (s.cancellation_tiers || []).filter((_, i) => i !== idx),
                    }))
                  }
                  className="text-white/40 hover:text-red-400 text-[10px] uppercase tracking-wider px-2"
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              data-testid="tier-add"
              onClick={() =>
                setSettings((s) => ({
                  ...s,
                  cancellation_tiers: [...(s.cancellation_tiers || []), { hours_before_pickup: 0, refund_percent: 0 }],
                }))
              }
              className="text-[#D4AF37] hover:underline text-xs uppercase tracking-wider"
            >
              + Add tier
            </button>
          </div>
        </div>

        <div className="md:col-span-2 pt-4 border-t border-[#1F1F1F]">
          <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">
            Per-stop flat fee
          </Label>
          <div className="mt-2 flex items-center gap-3">
            <div className="relative w-40">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#D4AF37]" />
              <Input
                type="number"
                min={0}
                step="0.01"
                data-testid="settings-per-stop-fee"
                value={settings.per_stop_fee ?? 0}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, per_stop_fee: e.target.value }))
                }
                className={cn(
                  "bg-[#0E0E0E] border-[#27272A] text-white focus-visible:ring-[#D4AF37] focus-visible:border-[#D4AF37] h-11 pl-9",
                )}
              />
            </div>
            <span className="text-xs text-white/55">
              Flat fee charged for each <em>additional stop</em> the customer adds on a transfer trip.{" "}
              <strong className="text-white/80">Industry standard: $15–25</strong>. Doesn't apply to Hourly Chauffeur bookings (stops are included in the hourly clock). Set to 0 to disable.
            </span>
          </div>
        </div>

        <div className="md:col-span-2 pt-4 border-t border-[#1F1F1F]">
          <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">
            Meet &amp; Greet flat fee (Airport Transfers)
          </Label>
          <div className="mt-2 flex items-center gap-3">
            <div className="relative w-40">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#D4AF37]" />
              <Input
                type="number"
                min={0}
                step="0.01"
                data-testid="settings-meet-greet-fee"
                value={settings.meet_greet_fee ?? 0}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, meet_greet_fee: e.target.value }))
                }
                className={cn(
                  "bg-[#0E0E0E] border-[#27272A] text-white focus-visible:ring-[#D4AF37] focus-visible:border-[#D4AF37] h-11 pl-9",
                )}
              />
            </div>
            <span className="text-xs text-white/55">
              Added when customer toggles <em>Meet &amp; Greet</em> on an Airport Transfer booking. Set to 0 to disable.
            </span>
          </div>
        </div>
      </div>

      <div className="mt-8 flex justify-end">
        <Button
          onClick={save}
          disabled={saving}
          data-testid="settings-save"
          className="bg-[#D4AF37] text-black hover:bg-[#B3922E] rounded-full px-6 h-11"
        >
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Save settings
        </Button>
      </div>
    </div>
  );
}
