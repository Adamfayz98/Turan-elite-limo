import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Save, Phone as PhoneIcon } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { api, formatApiErrorDetail } from "@/lib/api";
import { cn } from "@/lib/utils";

const inputCls =
  "bg-[#0E0E0E] border-[#27272A] text-white focus-visible:ring-[#D4AF37] focus-visible:border-[#D4AF37] h-10";

export default function PricingTab() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/pricing");
      setRows(data);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Failed to load pricing");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const updateLocal = (vt, k, v) =>
    setRows((rs) => rs.map((r) => (r.vehicle_type === vt ? { ...r, [k]: v } : r)));

  const save = async (row) => {
    setSavingKey(row.vehicle_type);
    try {
      const payload = {
        base: Number(row.base) || 0,
        per_mile: Number(row.per_mile) || 0,
        minimum: Number(row.minimum) || 0,
        call_only: !!row.call_only,
      };
      await api.patch(`/admin/pricing/${encodeURIComponent(row.vehicle_type)}`, payload);
      toast.success(`${row.vehicle_type} pricing updated`);
      load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Failed to update");
    } finally {
      setSavingKey(null);
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
    <div data-testid="pricing-tab" className="space-y-4">
      <div className="rounded-2xl border border-[#1F1F1F] bg-[#0A0A0A] p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-2 mb-6">
          <div>
            <h3 className="font-serif text-2xl">Live pricing</h3>
            <p className="text-sm text-white/55 mt-1">
              Changes apply instantly to the public quote engine on the homepage.
            </p>
          </div>
          <div className="text-xs text-white/40">
            Quote = max(base + per_mile × distance, minimum)
          </div>
        </div>

        <div className="space-y-3">
          {rows.map((r) => {
            const isCall = !!r.call_only;
            return (
              <div
                key={r.vehicle_type}
                data-testid={`pricing-row-${r.vehicle_type}`}
                className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end p-4 rounded-xl border border-[#1F1F1F] bg-[#0E0E0E]"
              >
                <div className="md:col-span-3">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-white/50">Vehicle</div>
                  <div className="font-serif text-lg mt-1">{r.vehicle_type}</div>
                  {r.updated_at && (
                    <div className="text-[10px] text-white/35 mt-1">
                      Updated {new Date(r.updated_at).toLocaleString()}
                    </div>
                  )}
                </div>

                <div className="md:col-span-2">
                  <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">
                    Base ($)
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    disabled={isCall}
                    value={r.base}
                    onChange={(e) => updateLocal(r.vehicle_type, "base", e.target.value)}
                    data-testid={`pricing-base-${r.vehicle_type}`}
                    className={cn(inputCls, "mt-1", isCall && "opacity-40")}
                  />
                </div>
                <div className="md:col-span-2">
                  <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">
                    Per mile ($)
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    disabled={isCall}
                    value={r.per_mile}
                    onChange={(e) => updateLocal(r.vehicle_type, "per_mile", e.target.value)}
                    data-testid={`pricing-permile-${r.vehicle_type}`}
                    className={cn(inputCls, "mt-1", isCall && "opacity-40")}
                  />
                </div>
                <div className="md:col-span-2">
                  <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">
                    Minimum ($)
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    disabled={isCall}
                    value={r.minimum}
                    onChange={(e) => updateLocal(r.vehicle_type, "minimum", e.target.value)}
                    data-testid={`pricing-min-${r.vehicle_type}`}
                    className={cn(inputCls, "mt-1", isCall && "opacity-40")}
                  />
                </div>

                <div className="md:col-span-2">
                  <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">
                    Call for quote
                  </Label>
                  <div className="mt-2 flex items-center gap-2">
                    <Switch
                      checked={isCall}
                      onCheckedChange={(v) => updateLocal(r.vehicle_type, "call_only", !!v)}
                      data-testid={`pricing-callonly-${r.vehicle_type}`}
                      className="data-[state=checked]:bg-[#D4AF37]"
                    />
                    {isCall && (
                      <span className="flex items-center gap-1 text-xs text-[#D4AF37]">
                        <PhoneIcon className="w-3 h-3" /> Active
                      </span>
                    )}
                  </div>
                </div>

                <div className="md:col-span-1 flex justify-end">
                  <Button
                    onClick={() => save(r)}
                    disabled={savingKey === r.vehicle_type}
                    data-testid={`pricing-save-${r.vehicle_type}`}
                    className="bg-[#D4AF37] text-black hover:bg-[#B3922E] rounded-full px-4 h-10 font-medium"
                  >
                    {savingKey === r.vehicle_type ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Save className="w-4 h-4 mr-1.5" /> Save
                      </>
                    )}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
