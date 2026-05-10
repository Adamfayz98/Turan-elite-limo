import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Save, Plus, Trash2, MapPin } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
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
import { api, formatApiErrorDetail } from "@/lib/api";
import { cn } from "@/lib/utils";

const inputCls =
  "bg-[#0E0E0E] border-[#27272A] text-white placeholder:text-white/40 focus-visible:ring-[#D4AF37] focus-visible:border-[#D4AF37]";

function blankZone() {
  return {
    id: null,
    name: "",
    keywords_text: "",
    surcharge_amount: 50,
    short_distance_threshold_miles: 20,
    reason: "",
    enabled: true,
  };
}

function toClientShape(z) {
  return {
    id: z.id,
    name: z.name,
    keywords_text: (z.keywords || []).join(", "),
    surcharge_amount: z.surcharge_amount ?? 0,
    short_distance_threshold_miles: z.short_distance_threshold_miles ?? 20,
    reason: z.reason || "",
    enabled: z.enabled !== false,
  };
}

function toServerShape(z) {
  return {
    name: z.name.trim(),
    keywords: (z.keywords_text || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    surcharge_amount: Number(z.surcharge_amount) || 0,
    short_distance_threshold_miles: Number(z.short_distance_threshold_miles) || 20,
    reason: (z.reason || "").trim(),
    enabled: !!z.enabled,
  };
}

export default function ZonesTab() {
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [rows, setRows] = useState([]);
  const [newZone, setNewZone] = useState(blankZone());
  const [creating, setCreating] = useState(false);

  const load = async () => {
    try {
      const { data } = await api.get("/admin/zones");
      setRows(data.map(toClientShape));
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Failed to load zones");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const updateLocal = (id, key, value) => {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [key]: value } : r)));
  };

  const save = async (zone) => {
    if (!zone.name.trim()) return toast.error("Zone name is required.");
    setSavingId(zone.id);
    try {
      const payload = toServerShape(zone);
      await api.patch(`/admin/zones/${zone.id}`, payload);
      toast.success(`${zone.name} updated`);
      load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Failed to update zone");
    } finally {
      setSavingId(null);
    }
  };

  const remove = async (zone) => {
    try {
      await api.delete(`/admin/zones/${zone.id}`);
      toast.success(`${zone.name} removed`);
      load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Failed to delete zone");
    }
  };

  const create = async () => {
    if (!newZone.name.trim()) return toast.error("Zone name is required.");
    setCreating(true);
    try {
      await api.post("/admin/zones", toServerShape(newZone));
      toast.success(`${newZone.name} added`);
      setNewZone(blankZone());
      load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Failed to create zone");
    } finally {
      setCreating(false);
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
    <div data-testid="zones-tab" className="space-y-6">
      <div className="rounded-2xl border border-[#1F1F1F] bg-[#0A0A0A] p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-2 mb-6">
          <div>
            <div className="flex items-center gap-2 text-[#D4AF37]">
              <MapPin className="w-4 h-4" />
              <span className="text-[10px] uppercase tracking-[0.3em]">Long-distance area fees</span>
            </div>
            <h3 className="font-serif text-2xl mt-1">Zone Surcharges</h3>
            <p className="text-sm text-white/55 mt-1 max-w-xl leading-relaxed">
              When a customer's pickup or drop-off keyword-matches a zone <em>and</em> the trip is below the
              threshold miles, a flat surcharge is added to every priced vehicle. Customers see your "Why this fee?"
              note on their booking form.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {rows.length === 0 && (
            <div className="text-center py-12 text-white/40">No zones yet — add one below.</div>
          )}

          {rows.map((z) => (
            <div
              key={z.id}
              data-testid={`zone-row-${z.id}`}
              className={cn(
                "rounded-xl border border-[#1F1F1F] bg-[#0E0E0E] p-5",
                !z.enabled && "opacity-60",
              )}
            >
              <div className="grid md:grid-cols-12 gap-4 items-start">
                <div className="md:col-span-3">
                  <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">Zone name</Label>
                  <Input
                    data-testid={`zone-name-${z.id}`}
                    className={cn(inputCls, "mt-1 h-10")}
                    value={z.name}
                    onChange={(e) => updateLocal(z.id, "name", e.target.value)}
                    placeholder="e.g. Healdsburg & North Sonoma"
                  />
                </div>

                <div className="md:col-span-4">
                  <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">
                    Matching keywords (comma-separated)
                  </Label>
                  <Input
                    data-testid={`zone-keywords-${z.id}`}
                    className={cn(inputCls, "mt-1 h-10")}
                    value={z.keywords_text}
                    onChange={(e) => updateLocal(z.id, "keywords_text", e.target.value)}
                    placeholder="healdsburg, geyserville, cloverdale"
                  />
                </div>

                <div className="md:col-span-2">
                  <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">
                    Surcharge ($)
                  </Label>
                  <Input
                    data-testid={`zone-amount-${z.id}`}
                    type="number"
                    step="0.01"
                    min="0"
                    className={cn(inputCls, "mt-1 h-10")}
                    value={z.surcharge_amount}
                    onChange={(e) => updateLocal(z.id, "surcharge_amount", e.target.value)}
                  />
                </div>

                <div className="md:col-span-2">
                  <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">
                    If trip &lt; (miles)
                  </Label>
                  <Input
                    data-testid={`zone-threshold-${z.id}`}
                    type="number"
                    step="1"
                    min="0"
                    max="200"
                    className={cn(inputCls, "mt-1 h-10")}
                    value={z.short_distance_threshold_miles}
                    onChange={(e) => updateLocal(z.id, "short_distance_threshold_miles", e.target.value)}
                  />
                </div>

                <div className="md:col-span-1">
                  <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">On</Label>
                  <div className="mt-2.5">
                    <Switch
                      data-testid={`zone-enabled-${z.id}`}
                      checked={!!z.enabled}
                      onCheckedChange={(v) => updateLocal(z.id, "enabled", !!v)}
                      className="data-[state=checked]:bg-[#D4AF37]"
                    />
                  </div>
                </div>

                <div className="md:col-span-12">
                  <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">
                    Why this fee (shown to the customer)
                  </Label>
                  <Textarea
                    data-testid={`zone-reason-${z.id}`}
                    className={cn(inputCls, "mt-1 min-h-[64px]")}
                    value={z.reason}
                    onChange={(e) => updateLocal(z.id, "reason", e.target.value)}
                    placeholder="e.g. This area is 60+ miles from our Millbrae base — short rides include a positioning fee so we can dispatch a chauffeur in time."
                  />
                </div>

                <div className="md:col-span-12 flex justify-end gap-2 pt-1">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        data-testid={`zone-delete-${z.id}`}
                        className="bg-transparent border-red-500/30 text-red-400 hover:bg-red-500/10 rounded-full h-9 px-4"
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                        Remove
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="bg-[#0A0A0A] border-[#1F1F1F] text-white">
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remove "{z.name}"?</AlertDialogTitle>
                        <AlertDialogDescription className="text-white/60">
                          This zone surcharge will no longer apply to new quotes.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="bg-transparent border-white/20 hover:bg-white/10">
                          Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => remove(z)}
                          className="bg-red-500 hover:bg-red-600"
                          data-testid={`zone-delete-confirm-${z.id}`}
                        >
                          Yes, remove
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>

                  <Button
                    onClick={() => save(z)}
                    disabled={savingId === z.id}
                    data-testid={`zone-save-${z.id}`}
                    className="bg-[#D4AF37] text-black hover:bg-[#B3922E] rounded-full h-9 px-5 font-medium"
                  >
                    {savingId === z.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Save className="w-3.5 h-3.5 mr-1.5" /> Save
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Add new zone */}
      <div className="rounded-2xl border border-[#1F1F1F] bg-[#0A0A0A] p-6 md:p-8" data-testid="zone-new-form">
        <h3 className="font-serif text-xl flex items-center gap-2">
          <Plus className="w-4 h-4 text-[#D4AF37]" /> Add a new zone
        </h3>
        <div className="grid md:grid-cols-12 gap-4 mt-5">
          <div className="md:col-span-3">
            <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">Zone name</Label>
            <Input
              data-testid="zone-new-name"
              className={cn(inputCls, "mt-1 h-10")}
              value={newZone.name}
              onChange={(e) => setNewZone({ ...newZone, name: e.target.value })}
              placeholder="Tahoe & Sierra"
            />
          </div>
          <div className="md:col-span-4">
            <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">
              Keywords (comma-separated)
            </Label>
            <Input
              data-testid="zone-new-keywords"
              className={cn(inputCls, "mt-1 h-10")}
              value={newZone.keywords_text}
              onChange={(e) => setNewZone({ ...newZone, keywords_text: e.target.value })}
              placeholder="tahoe, truckee, kings beach"
            />
          </div>
          <div className="md:col-span-2">
            <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">Surcharge ($)</Label>
            <Input
              data-testid="zone-new-amount"
              type="number"
              step="0.01"
              min="0"
              className={cn(inputCls, "mt-1 h-10")}
              value={newZone.surcharge_amount}
              onChange={(e) => setNewZone({ ...newZone, surcharge_amount: e.target.value })}
            />
          </div>
          <div className="md:col-span-2">
            <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">If trip &lt; (miles)</Label>
            <Input
              data-testid="zone-new-threshold"
              type="number"
              step="1"
              min="0"
              max="200"
              className={cn(inputCls, "mt-1 h-10")}
              value={newZone.short_distance_threshold_miles}
              onChange={(e) =>
                setNewZone({ ...newZone, short_distance_threshold_miles: e.target.value })
              }
            />
          </div>
          <div className="md:col-span-1">
            <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">On</Label>
            <div className="mt-2.5">
              <Switch
                data-testid="zone-new-enabled"
                checked={!!newZone.enabled}
                onCheckedChange={(v) => setNewZone({ ...newZone, enabled: !!v })}
                className="data-[state=checked]:bg-[#D4AF37]"
              />
            </div>
          </div>
          <div className="md:col-span-12">
            <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">
              Why this fee (shown to customer)
            </Label>
            <Textarea
              data-testid="zone-new-reason"
              className={cn(inputCls, "mt-1 min-h-[64px]")}
              value={newZone.reason}
              onChange={(e) => setNewZone({ ...newZone, reason: e.target.value })}
              placeholder="This area requires a chauffeur to be positioned in advance — a flat fee covers the deadhead drive."
            />
          </div>
          <div className="md:col-span-12 flex justify-end">
            <Button
              onClick={create}
              disabled={creating}
              data-testid="zone-new-save"
              className="bg-[#D4AF37] text-black hover:bg-[#B3922E] rounded-full h-10 px-6 font-medium"
            >
              {creating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              Add zone
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
