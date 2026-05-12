import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Save, Plus, Trash2, MapPin, Radio, Tag } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
    match_type: "keyword_short",
    keywords_text: "",
    surcharge_amount: 50,
    short_distance_threshold_miles: 20,
    radius_miles: 40,
    reason: "",
    enabled: true,
  };
}

function toClientShape(z) {
  return {
    id: z.id,
    name: z.name,
    match_type: z.match_type || "keyword_short",
    keywords_text: (z.keywords || []).join(", "),
    surcharge_amount: z.surcharge_amount ?? 0,
    short_distance_threshold_miles: z.short_distance_threshold_miles ?? 20,
    radius_miles: z.radius_miles ?? 40,
    reason: z.reason || "",
    enabled: z.enabled !== false,
  };
}

function toServerShape(z) {
  return {
    name: z.name.trim(),
    match_type: z.match_type || "keyword_short",
    keywords: (z.keywords_text || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    surcharge_amount: Number(z.surcharge_amount) || 0,
    short_distance_threshold_miles: Number(z.short_distance_threshold_miles) || 20,
    radius_miles: Number(z.radius_miles) || 0,
    reason: (z.reason || "").trim(),
    enabled: !!z.enabled,
  };
}

function ZoneFields({ z, idPrefix, onChange }) {
  const isRadius = z.match_type === "outside_radius";
  return (
    <>
      <div className="md:col-span-12 -mb-2">
        <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">
          How does this zone match?
        </Label>
        <Select
          value={z.match_type}
          onValueChange={(v) => onChange("match_type", v)}
        >
          <SelectTrigger
            data-testid={`${idPrefix}-match-type`}
            className={cn(inputCls, "mt-1 h-10 md:w-[420px]")}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-[#111111] border-[#27272A] text-white">
            <SelectItem value="keyword_short">
              <span className="flex items-center gap-2">
                <Tag className="w-3.5 h-3.5 text-[#D4AF37]" />
                Keyword match · short trips in a far area (positioning fee)
              </span>
            </SelectItem>
            <SelectItem value="outside_radius">
              <span className="flex items-center gap-2">
                <Radio className="w-3.5 h-3.5 text-[#D4AF37]" />
                Outside service radius from HQ (out-of-area fee)
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
        <p className="text-[11px] text-white/45 mt-1.5 leading-relaxed">
          {isRadius
            ? "Surcharge applied when pickup OR drop-off is farther than the radius below from your Millbrae HQ. Best for blanket out-of-area fees."
            : "Surcharge applied when pickup/drop-off contains any keyword AND total trip is below the threshold. Best for positioning fees on short rides in distant areas."}
        </p>
      </div>

      <div className="md:col-span-3">
        <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">Zone name</Label>
        <Input
          data-testid={`${idPrefix}-name`}
          className={cn(inputCls, "mt-1 h-10")}
          value={z.name}
          onChange={(e) => onChange("name", e.target.value)}
          placeholder={isRadius ? "e.g. Out-of-Bay-Area" : "e.g. Healdsburg & North Sonoma"}
        />
      </div>

      {!isRadius && (
        <div className="md:col-span-4">
          <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">
            Matching keywords (comma-separated)
          </Label>
          <Input
            data-testid={`${idPrefix}-keywords`}
            className={cn(inputCls, "mt-1 h-10")}
            value={z.keywords_text}
            onChange={(e) => onChange("keywords_text", e.target.value)}
            placeholder="healdsburg, geyserville, cloverdale"
          />
        </div>
      )}

      <div className={cn("md:col-span-2", isRadius && "md:col-span-3")}>
        <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">
          Surcharge ($)
        </Label>
        <Input
          data-testid={`${idPrefix}-amount`}
          type="number"
          step="0.01"
          min="0"
          className={cn(inputCls, "mt-1 h-10")}
          value={z.surcharge_amount}
          onChange={(e) => onChange("surcharge_amount", e.target.value)}
        />
      </div>

      {isRadius ? (
        <div className="md:col-span-3">
          <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">
            Service radius (miles from HQ)
          </Label>
          <Input
            data-testid={`${idPrefix}-radius`}
            type="number"
            step="1"
            min="0"
            max="500"
            className={cn(inputCls, "mt-1 h-10")}
            value={z.radius_miles}
            onChange={(e) => onChange("radius_miles", e.target.value)}
            placeholder="40"
          />
        </div>
      ) : (
        <div className="md:col-span-2">
          <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">
            If trip &lt; (miles)
          </Label>
          <Input
            data-testid={`${idPrefix}-threshold`}
            type="number"
            step="1"
            min="0"
            max="200"
            className={cn(inputCls, "mt-1 h-10")}
            value={z.short_distance_threshold_miles}
            onChange={(e) => onChange("short_distance_threshold_miles", e.target.value)}
          />
        </div>
      )}

      <div className="md:col-span-1">
        <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">On</Label>
        <div className="mt-2.5">
          <Switch
            data-testid={`${idPrefix}-enabled`}
            checked={!!z.enabled}
            onCheckedChange={(v) => onChange("enabled", !!v)}
            className="data-[state=checked]:bg-[#D4AF37]"
          />
        </div>
      </div>

      <div className="md:col-span-12">
        <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">
          Why this fee (shown to the customer)
        </Label>
        <Textarea
          data-testid={`${idPrefix}-reason`}
          className={cn(inputCls, "mt-1 min-h-[64px]")}
          value={z.reason}
          onChange={(e) => onChange("reason", e.target.value)}
          placeholder={
            isRadius
              ? "This trip is outside our standard service radius. The flat fee helps cover the deadhead drive."
              : "This area is 60+ miles from our Millbrae base — short rides include a positioning fee so we can dispatch a chauffeur in time."
          }
        />
      </div>
    </>
  );
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
    if (zone.match_type === "outside_radius" && Number(zone.radius_miles) <= 0)
      return toast.error("Service radius (miles) is required.");
    if (zone.match_type === "keyword_short" && !zone.keywords_text.trim())
      return toast.error("At least one keyword is required for keyword-match zones.");
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
    if (newZone.match_type === "outside_radius" && Number(newZone.radius_miles) <= 0)
      return toast.error("Service radius (miles) is required.");
    if (newZone.match_type === "keyword_short" && !newZone.keywords_text.trim())
      return toast.error("At least one keyword is required for keyword-match zones.");
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
            <p className="text-sm text-white/55 mt-1 max-w-2xl leading-relaxed">
              Two ways to trigger a surcharge: <strong className="text-white">Keyword-match</strong> (positioning
              fee on short rides in distant cities) or <strong className="text-white">Outside service radius</strong>{" "}
              (blanket out-of-area fee when pickup or drop-off is beyond a radius from your HQ). Customers see your
              "Why this fee?" note on the booking form.
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
                <ZoneFields
                  z={z}
                  idPrefix={`zone-${z.id}`}
                  onChange={(k, v) => updateLocal(z.id, k, v)}
                />

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
          <ZoneFields
            z={newZone}
            idPrefix="zone-new"
            onChange={(k, v) => setNewZone((s) => ({ ...s, [k]: v }))}
          />
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
