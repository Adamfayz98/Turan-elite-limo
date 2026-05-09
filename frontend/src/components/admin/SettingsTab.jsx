import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Save, Percent } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { api, formatApiErrorDetail } from "@/lib/api";
import { cn } from "@/lib/utils";

export default function SettingsTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({ deposit_percent: 100, currency: "usd" });

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
