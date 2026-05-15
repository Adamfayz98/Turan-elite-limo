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
  const [settings, setSettings] = useState({ deposit_percent: 100, currency: "usd", meet_greet_fee: 25, service_fee_percent: 0, per_stop_fee: 15 });

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
