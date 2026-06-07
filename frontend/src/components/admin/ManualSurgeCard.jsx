import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Zap, Loader2, Save } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { api, formatApiErrorDetail } from "@/lib/api";

/**
 * Manual surge toggle — a one-click "demand is hot right now, charge more"
 * lever. Applies on top of any active event surge (e.g., World Cup) and on
 * top of the Quick Quote last-minute multiplier.
 *
 * Operator workflow:
 *   - Phone keeps ringing → flip toggle ON → website quotes immediately
 *     jump 25% (configurable)
 *   - Demand cools → flip OFF → quotes return to normal
 *
 * No deploy required — settings are persisted in MongoDB and read on every
 * /api/quote call.
 */
export default function ManualSurgeCard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState({
    manual_surge_enabled: false,
    manual_surge_multiplier: 1.25,
    manual_surge_label: "High demand period",
  });

  const load = async () => {
    setLoading(true);
    try {
      const { data: s } = await api.get("/admin/settings");
      setData({
        manual_surge_enabled: !!s.manual_surge_enabled,
        manual_surge_multiplier: s.manual_surge_multiplier ?? 1.25,
        manual_surge_label: s.manual_surge_label || "High demand period",
      });
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Failed to load surge settings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  /** Toggle save — fires immediately on switch flip for instant UX. */
  const persist = async (next) => {
    setSaving(true);
    try {
      await api.patch("/admin/settings", {
        manual_surge_enabled: next.manual_surge_enabled,
        manual_surge_multiplier: Number(next.manual_surge_multiplier) || 1.25,
        manual_surge_label: (next.manual_surge_label || "High demand period").slice(0, 80),
      });
      toast.success(next.manual_surge_enabled ? "Surge pricing is ON" : "Surge pricing is OFF");
      setData(next);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Couldn't save");
    } finally {
      setSaving(false);
    }
  };

  const toggleSurge = (checked) => persist({ ...data, manual_surge_enabled: checked });
  const saveMultiplier = () => persist(data);

  if (loading) {
    return (
      <div className="rounded-2xl border border-[#27272A] bg-[#0A0A0A] p-5 flex items-center gap-3">
        <Loader2 className="w-4 h-4 animate-spin text-[#D4AF37]" />
        <span className="text-sm text-white/55">Loading surge settings…</span>
      </div>
    );
  }

  const pctLift = Math.round((Number(data.manual_surge_multiplier) - 1) * 100);
  const isOn = data.manual_surge_enabled;

  return (
    <div
      data-testid="manual-surge-card"
      className={`rounded-2xl border p-5 transition-colors ${
        isOn ? "border-[#D4AF37] bg-[#D4AF37]/5" : "border-[#27272A] bg-[#0A0A0A]"
      }`}
    >
      <div className="flex items-start gap-4">
        <div
          className={`flex items-center justify-center w-11 h-11 rounded-full flex-shrink-0 ${
            isOn ? "bg-[#D4AF37] text-black" : "bg-[#D4AF37]/10 text-[#D4AF37]"
          }`}
        >
          <Zap className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="font-serif text-xl text-white">Manual surge</h3>
            <span
              className={`text-[10px] uppercase tracking-[0.2em] px-2 py-0.5 rounded-full ${
                isOn ? "bg-[#D4AF37] text-black" : "bg-white/10 text-white/55"
              }`}
            >
              {isOn ? `Active · +${pctLift}%` : "Off"}
            </span>
          </div>
          <p className="text-xs text-white/55 mt-1 leading-relaxed">
            Flip this ON when phones are ringing harder than you can dispatch. Multiplies website + quick-quote prices instantly.
            Stacks on top of event surges (World Cup, etc.) and last-minute fees.
          </p>

          {/* Master toggle */}
          <div className="mt-4 flex items-center gap-3">
            <Switch
              checked={isOn}
              onCheckedChange={toggleSurge}
              disabled={saving}
              data-testid="manual-surge-switch"
              className="data-[state=checked]:bg-[#D4AF37]"
            />
            <span className="text-sm text-white/70">{isOn ? "Surge pricing is live" : "Surge pricing is off"}</span>
          </div>

          {/* Multiplier + label config */}
          <div className="mt-5 grid sm:grid-cols-[140px_1fr_auto] gap-3 items-end">
            <div>
              <Label className="text-[10px] uppercase tracking-[0.2em] text-white/55">Multiplier</Label>
              <Input
                type="number"
                step="0.05"
                min="1.0"
                max="3.0"
                value={data.manual_surge_multiplier}
                onChange={(e) => setData((s) => ({ ...s, manual_surge_multiplier: e.target.value }))}
                data-testid="manual-surge-multiplier"
                className="mt-1 h-10 bg-[#0E0E0E] border-[#27272A] text-white focus-visible:ring-[#D4AF37] focus-visible:border-[#D4AF37]"
              />
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-[0.2em] text-white/55">Customer-facing label</Label>
              <Input
                type="text"
                maxLength={80}
                value={data.manual_surge_label}
                onChange={(e) => setData((s) => ({ ...s, manual_surge_label: e.target.value }))}
                placeholder="High demand period"
                data-testid="manual-surge-label"
                className="mt-1 h-10 bg-[#0E0E0E] border-[#27272A] text-white focus-visible:ring-[#D4AF37] focus-visible:border-[#D4AF37]"
              />
            </div>
            <Button
              onClick={saveMultiplier}
              disabled={saving}
              data-testid="manual-surge-save"
              variant="outline"
              className="border-[#D4AF37]/40 text-[#D4AF37] hover:bg-[#D4AF37]/10 rounded-full h-10"
            >
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Save
            </Button>
          </div>

          <p className="text-[11px] text-white/40 mt-3">
            Tip: industry standard is 1.25× for routine peak hours, 1.5× for major event night, 1.75× for once-a-year demand spikes (e.g., Super Bowl).
          </p>
        </div>
      </div>
    </div>
  );
}
