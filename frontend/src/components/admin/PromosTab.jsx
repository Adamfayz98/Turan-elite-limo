import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Ticket, Edit2, Copy } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

const inputCls =
  "bg-[#0E0E0E] border-[#27272A] text-white placeholder:text-white/40 focus-visible:ring-[#D4AF37] focus-visible:border-[#D4AF37]";

const blank = () => ({
  id: null,
  code: "",
  description: "",
  discount_type: "percent",
  value: 20,
  min_ride_amount: 0,
  max_uses: "",
  expires_at: "",
  first_ride_only: false,
  active: true,
  show_on_banner: false,
  auto_apply: false,
  allowed_vehicle_types: [],
});

const VEHICLE_TYPES = [
  "Executive Sedan",
  "First Class",
  "Luxury SUV",
  "Stretch Limousine",
  "Sprinter Van",
  "Party Bus",
];

export default function PromosTab() {
  const [promos, setPromos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const { data } = await api.get("/admin/promos");
      setPromos(data || []);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Could not load promos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    const payload = {
      code: editing.code.trim().toUpperCase(),
      description: editing.description?.trim() || null,
      discount_type: editing.discount_type,
      value: Number(editing.value),
      min_ride_amount: Number(editing.min_ride_amount) || 0,
      max_uses: editing.max_uses ? Number(editing.max_uses) : null,
      expires_at: editing.expires_at || null,
      first_ride_only: !!editing.first_ride_only,
      active: !!editing.active,
      show_on_banner: !!editing.show_on_banner,
      auto_apply: !!editing.auto_apply,
      allowed_vehicle_types: Array.isArray(editing.allowed_vehicle_types) ? editing.allowed_vehicle_types : [],
    };
    if (!payload.code || payload.code.length < 2) {
      toast.error("Code must be at least 2 characters");
      return;
    }
    if (payload.discount_type === "percent" && (payload.value <= 0 || payload.value > 100)) {
      toast.error("Percent value must be between 1 and 100");
      return;
    }
    if (payload.discount_type === "fixed" && payload.value <= 0) {
      toast.error("Fixed amount must be greater than 0");
      return;
    }
    setSaving(true);
    try {
      if (editing.id) {
        const updates = { ...payload };
        delete updates.code; // code is immutable once created
        await api.patch(`/admin/promos/${editing.id}`, updates);
        toast.success("Promo updated");
      } else {
        await api.post("/admin/promos", payload);
        toast.success("Promo created");
      }
      setEditing(null);
      load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const del = async (id) => {
    try {
      await api.delete(`/admin/promos/${id}`);
      toast.success("Deleted");
      load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Delete failed");
    }
  };

  const toggleActive = async (p) => {
    try {
      await api.patch(`/admin/promos/${p.id}`, { active: !p.active });
      load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  const copyCode = (code) => {
    navigator.clipboard?.writeText(code);
    toast.success(`Copied ${code}`);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="w-5 h-5 animate-spin text-[#D4AF37]" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="promos-tab">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-2xl">Promo codes</h2>
          <p className="text-sm text-white/55 mt-1">
            Discount codes customers can apply at checkout. Edits take effect instantly — no redeploy needed.
          </p>
        </div>
        <Button
          onClick={() => setEditing(blank())}
          data-testid="promo-create-button"
          className="bg-[#D4AF37] text-black hover:bg-[#B3922E] rounded-full h-10 px-5"
        >
          <Plus className="w-4 h-4 mr-1.5" /> New code
        </Button>
      </div>

      {promos.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center">
          <Ticket className="w-7 h-7 text-white/30 mx-auto mb-2" />
          <p className="text-white/65 text-sm">No promo codes yet.</p>
          <p className="text-white/45 text-xs mt-1">
            Try creating <span className="font-mono">WELCOME20</span> at 20% off, or{" "}
            <span className="font-mono">SLOWTUE10</span> for slow Tuesdays.
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {promos.map((p) => (
            <div
              key={p.id}
              data-testid={`promo-row-${p.code}`}
              className={`flex flex-wrap items-center gap-4 rounded-xl border p-4 ${
                p.active ? "border-[#1F1F1F] bg-[#0A0A0A]" : "border-white/5 bg-[#0A0A0A]/50 opacity-60"
              }`}
            >
              <button
                type="button"
                onClick={() => copyCode(p.code)}
                className="group flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#D4AF37]/10 border border-[#D4AF37]/30 hover:bg-[#D4AF37]/20"
              >
                <span className="font-mono tracking-wider text-[#D4AF37] text-sm">{p.code}</span>
                <Copy className="w-3 h-3 text-[#D4AF37]/60 group-hover:text-[#D4AF37]" />
              </button>
              <div className="flex-1 min-w-0">
                <div className="text-white text-sm font-medium">
                  {p.discount_type === "percent" ? `${p.value}% off` : `$${p.value} off`}
                  {p.first_ride_only && (
                    <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 uppercase tracking-wider">
                      First ride
                    </span>
                  )}
                  {p.show_on_banner && (
                    <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-[#D4AF37]/15 text-[#D4AF37] uppercase tracking-wider">
                      On banner
                    </span>
                  )}
                  {p.auto_apply && (
                    <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-[#D4AF37]/15 text-[#D4AF37] uppercase tracking-wider">
                      Auto-apply
                    </span>
                  )}
                  {Array.isArray(p.allowed_vehicle_types) && p.allowed_vehicle_types.length > 0 && (
                    <span
                      className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300 uppercase tracking-wider"
                      title={p.allowed_vehicle_types.join(" · ")}
                    >
                      {p.allowed_vehicle_types.length === 1 ? p.allowed_vehicle_types[0] : `${p.allowed_vehicle_types.length} vehicles`}
                    </span>
                  )}
                  {p.min_ride_amount > 0 && (
                    <span className="ml-2 text-xs text-white/50">
                      · min ${p.min_ride_amount}
                    </span>
                  )}
                  {p.expires_at && (
                    <span className="ml-2 text-xs text-white/50">· expires {p.expires_at}</span>
                  )}
                </div>
                {p.description && (
                  <div className="text-xs text-white/45 mt-0.5">{p.description}</div>
                )}
                <div className="text-xs text-white/45 mt-1">
                  Used {p.uses}
                  {p.max_uses ? ` / ${p.max_uses}` : ""} times
                  {p.total_discount_given > 0 && (
                    <span> · ${p.total_discount_given.toFixed(2)} given</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={!!p.active}
                  onCheckedChange={() => toggleActive(p)}
                  data-testid={`promo-toggle-${p.code}`}
                  className="data-[state=checked]:bg-[#D4AF37]"
                />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditing({
                    ...p,
                    max_uses: p.max_uses ?? "",
                    expires_at: p.expires_at ?? "",
                  })}
                  data-testid={`promo-edit-${p.code}`}
                  className="text-white/70 hover:text-white hover:bg-white/10 h-8 px-2"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      data-testid={`promo-delete-${p.code}`}
                      className="text-red-400 hover:text-red-300 hover:bg-red-500/10 h-8 px-2"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="bg-[#0A0A0A] border-[#1F1F1F] text-white">
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete promo {p.code}?</AlertDialogTitle>
                      <AlertDialogDescription className="text-white/60">
                        Anyone trying to use this code after deletion will see "Code not found". Past bookings that used it are unaffected.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel className="bg-transparent border-white/20 hover:bg-white/10">Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => del(p.id)}
                        className="bg-red-500 hover:bg-red-600"
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Editor Dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="bg-[#0A0A0A] border-[#1F1F1F] text-white max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">
              {editing?.id ? `Edit ${editing.code}` : "New promo code"}
            </DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div>
                <Label className="text-xs uppercase tracking-[0.2em] text-white/60">Code</Label>
                <Input
                  value={editing.code}
                  onChange={(e) => setEditing({ ...editing, code: e.target.value.toUpperCase() })}
                  placeholder="WELCOME20"
                  disabled={!!editing.id}
                  data-testid="promo-form-code"
                  className={`${inputCls} font-mono tracking-wider uppercase mt-1.5`}
                />
                {editing.id && (
                  <p className="text-[10px] text-white/40 mt-1">Code is permanent — delete + create new if needed</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs uppercase tracking-[0.2em] text-white/60">Type</Label>
                  <Select
                    value={editing.discount_type}
                    onValueChange={(v) => setEditing({ ...editing, discount_type: v })}
                  >
                    <SelectTrigger className={`${inputCls} mt-1.5`} data-testid="promo-form-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#0A0A0A] border-[#1F1F1F] text-white">
                      <SelectItem value="percent">Percent (%)</SelectItem>
                      <SelectItem value="fixed">Fixed ($ off)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs uppercase tracking-[0.2em] text-white/60">
                    Value {editing.discount_type === "percent" ? "(%)" : "($)"}
                  </Label>
                  <Input
                    type="number"
                    value={editing.value}
                    onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                    min="1"
                    max={editing.discount_type === "percent" ? "100" : "10000"}
                    data-testid="promo-form-value"
                    className={`${inputCls} mt-1.5`}
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs uppercase tracking-[0.2em] text-white/60">Description (shown to customer)</Label>
                <Input
                  value={editing.description || ""}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  placeholder="e.g. First-ride welcome offer"
                  data-testid="promo-form-description"
                  className={`${inputCls} mt-1.5`}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs uppercase tracking-[0.2em] text-white/60">Min ride ($)</Label>
                  <Input
                    type="number"
                    value={editing.min_ride_amount}
                    onChange={(e) => setEditing({ ...editing, min_ride_amount: e.target.value })}
                    min="0"
                    data-testid="promo-form-min"
                    className={`${inputCls} mt-1.5`}
                  />
                </div>
                <div>
                  <Label className="text-xs uppercase tracking-[0.2em] text-white/60">Max uses (blank = ∞)</Label>
                  <Input
                    type="number"
                    value={editing.max_uses}
                    onChange={(e) => setEditing({ ...editing, max_uses: e.target.value })}
                    min="1"
                    placeholder="∞"
                    data-testid="promo-form-maxuses"
                    className={`${inputCls} mt-1.5`}
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs uppercase tracking-[0.2em] text-white/60">Expires (optional)</Label>
                <Input
                  type="date"
                  value={editing.expires_at}
                  onChange={(e) => setEditing({ ...editing, expires_at: e.target.value })}
                  data-testid="promo-form-expires"
                  className={`${inputCls} mt-1.5`}
                />
              </div>

              <label className="flex items-center justify-between gap-3 cursor-pointer py-2">
                <div>
                  <div className="text-sm text-white">First-time customers only</div>
                  <div className="text-xs text-white/45">Auto-rejected if customer has a prior paid booking</div>
                </div>
                <Switch
                  checked={!!editing.first_ride_only}
                  onCheckedChange={(v) => setEditing({ ...editing, first_ride_only: v })}
                  data-testid="promo-form-first"
                  className="data-[state=checked]:bg-[#D4AF37]"
                />
              </label>

              <label className="flex items-center justify-between gap-3 cursor-pointer py-2">
                <div>
                  <div className="text-sm text-white">Show on homepage banner</div>
                  <div className="text-xs text-white/45">Sitewide gold banner advertising this code · also adds an Offer to Google search results</div>
                </div>
                <Switch
                  checked={!!editing.show_on_banner}
                  onCheckedChange={(v) => setEditing({ ...editing, show_on_banner: v })}
                  data-testid="promo-form-banner"
                  className="data-[state=checked]:bg-[#D4AF37]"
                />
              </label>

              <label className="flex items-center justify-between gap-3 cursor-pointer py-2">
                <div>
                  <div className="text-sm text-white">Auto-apply to every quote</div>
                  <div className="text-xs text-white/45">
                    Show Uber-style strike-through pricing on every quote (orig $X → new $Y). The code is auto-filled at checkout — no manual entry.
                  </div>
                </div>
                <Switch
                  checked={!!editing.auto_apply}
                  onCheckedChange={(v) => setEditing({ ...editing, auto_apply: v })}
                  data-testid="promo-form-auto-apply"
                  className="data-[state=checked]:bg-[#D4AF37]"
                />
              </label>

              <label className="flex items-center justify-between gap-3 cursor-pointer py-2">
                <div>
                  <div className="text-sm text-white">Active</div>
                  <div className="text-xs text-white/45">Customers can use this code right now</div>
                </div>
                <Switch
                  checked={!!editing.active}
                  onCheckedChange={(v) => setEditing({ ...editing, active: v })}
                  data-testid="promo-form-active"
                  className="data-[state=checked]:bg-emerald-500"
                />
              </label>

              <div className="pt-3 border-t border-[#1F1F1F]">
                <div className="flex items-baseline justify-between mb-2">
                  <div className="text-sm text-white">Limit to vehicles</div>
                  <div className="text-[10px] text-white/45">
                    {Array.isArray(editing.allowed_vehicle_types) && editing.allowed_vehicle_types.length > 0
                      ? `${editing.allowed_vehicle_types.length} selected`
                      : "All vehicles eligible"}
                  </div>
                </div>
                <p className="text-xs text-white/45 mb-3">
                  Leave all unchecked = the code works on every vehicle. Check specific ones to restrict.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {VEHICLE_TYPES.map((vt) => {
                    const sel = (editing.allowed_vehicle_types || []).includes(vt);
                    return (
                      <button
                        key={vt}
                        type="button"
                        data-testid={`promo-vehicle-${vt.replace(/\s+/g, "-").toLowerCase()}`}
                        onClick={() => {
                          const cur = editing.allowed_vehicle_types || [];
                          const next = sel ? cur.filter((x) => x !== vt) : [...cur, vt];
                          setEditing({ ...editing, allowed_vehicle_types: next });
                        }}
                        className={
                          "px-3 py-2 rounded-lg text-xs text-left border transition-colors " +
                          (sel
                            ? "bg-[#D4AF37]/15 border-[#D4AF37] text-[#D4AF37]"
                            : "bg-[#0E0E0E] border-[#27272A] text-white/65 hover:border-[#D4AF37]/40 hover:text-white")
                        }
                      >
                        <span className="inline-flex items-center gap-2">
                          <span
                            className={
                              "w-3.5 h-3.5 rounded-sm border flex items-center justify-center " +
                              (sel ? "bg-[#D4AF37] border-[#D4AF37]" : "border-white/30")
                            }
                          >
                            {sel && <span className="text-black text-[10px]">✓</span>}
                          </span>
                          {vt}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#1F1F1F]">
                <Button
                  variant="outline"
                  onClick={() => setEditing(null)}
                  className="bg-transparent border-white/20 hover:bg-white/10 rounded-full h-9 px-4"
                >
                  Cancel
                </Button>
                <Button
                  onClick={save}
                  disabled={saving}
                  data-testid="promo-form-save"
                  className="bg-[#D4AF37] text-black hover:bg-[#B3922E] rounded-full h-9 px-5"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : editing.id ? "Save changes" : "Create promo"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
