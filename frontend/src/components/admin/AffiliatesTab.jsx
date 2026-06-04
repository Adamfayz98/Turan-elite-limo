import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Edit2, Trash2, Loader2, Phone, Mail, MapPin, DollarSign, ShieldCheck, ExternalLink } from "lucide-react";

import { api, formatApiErrorDetail } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const EMPTY = {
  name: "",
  contact_name: "",
  phone: "",
  email: "",
  city: "",
  service_areas: "",
  vehicle_types: "",
  tcp_number: "",
  insurance_expiry: "",
  base_sprinter_rate: "",
  base_sedan_rate: "",
  base_suv_rate: "",
  notes: "",
  active: true,
};

function csvToArray(s) {
  return (s || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function arrayToCsv(a) {
  return Array.isArray(a) ? a.join(", ") : "";
}

export default function AffiliatesTab() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/admin/affiliates${showInactive ? "?include_inactive=true" : ""}`);
      setItems(data || []);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Couldn't load affiliates");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [showInactive]);

  const totals = useMemo(() => {
    const rides = items.reduce((sum, a) => sum + (a.rides_total || 0), 0);
    const profit = items.reduce((sum, a) => sum + (a.profit_total || 0), 0);
    return { rides, profit };
  }, [items]);

  const save = async () => {
    if (!editing) return;
    if (!editing.name?.trim()) return toast.error("Company name is required");
    setSaving(true);
    const payload = {
      name: editing.name.trim(),
      contact_name: editing.contact_name?.trim() || null,
      phone: editing.phone?.trim() || null,
      email: editing.email?.trim() || null,
      city: editing.city?.trim() || null,
      service_areas: csvToArray(editing.service_areas),
      vehicle_types: csvToArray(editing.vehicle_types),
      tcp_number: editing.tcp_number?.trim() || null,
      insurance_expiry: editing.insurance_expiry?.trim() || null,
      base_sprinter_rate: editing.base_sprinter_rate ? Number(editing.base_sprinter_rate) : null,
      base_sedan_rate: editing.base_sedan_rate ? Number(editing.base_sedan_rate) : null,
      base_suv_rate: editing.base_suv_rate ? Number(editing.base_suv_rate) : null,
      notes: editing.notes?.trim() || null,
      active: !!editing.active,
    };
    try {
      if (editing.id) {
        await api.patch(`/admin/affiliates/${editing.id}`, payload);
        toast.success("Affiliate updated");
      } else {
        await api.post("/admin/affiliates", payload);
        toast.success("Affiliate added");
      }
      setEditing(null);
      await load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const removeAffiliate = async (a) => {
    if (!confirm(`Deactivate ${a.name}? Past bookings keep the link, but they won't appear in future assignment lists.`)) return;
    try {
      await api.delete(`/admin/affiliates/${a.id}`);
      toast.success("Affiliate deactivated");
      await load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Failed to delete");
    }
  };

  return (
    <div data-testid="affiliates-tab" className="space-y-6">
      {/* Header + stats */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl text-white font-light">Affiliate Network</h2>
          <p className="text-white/55 text-sm mt-1 max-w-xl">
            Partner operators for out-of-territory rides. Customer pays you the full quote; you pay the affiliate their net rate; you keep the markup.
          </p>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="text-white/40 text-[10px] uppercase tracking-widest">Total brokered rides</p>
            <p className="text-white text-2xl font-light" data-testid="affiliates-total-rides">{totals.rides}</p>
          </div>
          <div className="text-right">
            <p className="text-white/40 text-[10px] uppercase tracking-widest">Total markup profit</p>
            <p className="text-[#D4AF37] text-2xl font-light" data-testid="affiliates-total-profit">
              ${totals.profit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          data-testid="affiliates-add-btn"
          onClick={() => setEditing({ ...EMPTY })}
          className="bg-[#D4AF37] text-black hover:opacity-90"
        >
          <Plus className="w-4 h-4 mr-2" /> Add Affiliate
        </Button>
        <label className="flex items-center gap-2 text-white/55 text-sm cursor-pointer">
          <Switch checked={showInactive} onCheckedChange={setShowInactive} data-testid="affiliates-show-inactive" />
          Show inactive
        </label>
      </div>

      {/* Affiliate list */}
      {loading ? (
        <div className="flex items-center gap-2 text-white/55 py-12 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading affiliates...
        </div>
      ) : items.length === 0 ? (
        <div className="border border-dashed border-white/15 rounded-2xl p-10 text-center" data-testid="affiliates-empty">
          <p className="text-white/55 text-sm">No affiliates added yet.</p>
          <p className="text-white/35 text-xs mt-2 max-w-md mx-auto">
            Add Sacramento, Tahoe, Monterey, Napa or other partner operators here so you can broker out-of-territory rides without owning the vehicles.
          </p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((a) => (
            <div
              key={a.id}
              data-testid={`affiliate-card-${a.id}`}
              className={`relative p-5 rounded-2xl border bg-[#0E0E0E] transition ${
                a.active ? "border-white/10 hover:border-[#D4AF37]/30" : "border-red-500/20 opacity-60"
              }`}
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <h3 className="text-white text-base leading-tight truncate">{a.name}</h3>
                  {a.contact_name && (
                    <p className="text-white/50 text-xs mt-0.5 truncate">{a.contact_name}</p>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => setEditing({
                      ...a,
                      service_areas: arrayToCsv(a.service_areas),
                      vehicle_types: arrayToCsv(a.vehicle_types),
                      base_sprinter_rate: a.base_sprinter_rate ?? "",
                      base_sedan_rate: a.base_sedan_rate ?? "",
                      base_suv_rate: a.base_suv_rate ?? "",
                    })}
                    data-testid={`affiliate-edit-${a.id}`}
                    className="p-1.5 text-white/55 hover:text-white"
                    aria-label="Edit"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeAffiliate(a)}
                    data-testid={`affiliate-delete-${a.id}`}
                    className="p-1.5 text-white/55 hover:text-red-400"
                    aria-label="Deactivate"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {a.city && (
                <div className="flex items-center gap-1.5 text-white/55 text-xs mb-1.5">
                  <MapPin className="w-3 h-3" /> {a.city}
                </div>
              )}
              {a.phone && (
                <a href={`tel:${a.phone}`} className="flex items-center gap-1.5 text-white/70 text-xs mb-1.5 hover:text-[#D4AF37]">
                  <Phone className="w-3 h-3" /> {a.phone}
                </a>
              )}
              {a.email && (
                <a href={`mailto:${a.email}`} className="flex items-center gap-1.5 text-white/70 text-xs mb-1.5 hover:text-[#D4AF37]">
                  <Mail className="w-3 h-3" /> {a.email}
                </a>
              )}

              {a.service_areas?.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {a.service_areas.slice(0, 5).map((s) => (
                    <span key={s} className="px-2 py-0.5 rounded-full bg-white/5 text-white/60 text-[10px]">{s}</span>
                  ))}
                </div>
              )}

              {(a.base_sprinter_rate || a.base_sedan_rate || a.base_suv_rate) && (
                <div className="mt-3 pt-3 border-t border-white/5 grid grid-cols-3 gap-2 text-[10px]">
                  {a.base_sedan_rate && (
                    <div>
                      <p className="text-white/40 uppercase tracking-wider">Sedan</p>
                      <p className="text-white/80">${a.base_sedan_rate}</p>
                    </div>
                  )}
                  {a.base_suv_rate && (
                    <div>
                      <p className="text-white/40 uppercase tracking-wider">SUV</p>
                      <p className="text-white/80">${a.base_suv_rate}</p>
                    </div>
                  )}
                  {a.base_sprinter_rate && (
                    <div>
                      <p className="text-white/40 uppercase tracking-wider">Sprinter</p>
                      <p className="text-white/80">${a.base_sprinter_rate}</p>
                    </div>
                  )}
                </div>
              )}

              {(a.tcp_number || a.insurance_expiry) && (
                <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between text-[10px]">
                  {a.tcp_number && (
                    <div className="flex items-center gap-1 text-white/55">
                      <ShieldCheck className="w-3 h-3 text-emerald-400" /> {a.tcp_number}
                    </div>
                  )}
                  {a.insurance_expiry && (
                    <div className="text-white/45">Ins. expires {a.insurance_expiry}</div>
                  )}
                </div>
              )}

              {/* Rollup stats */}
              <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between text-xs">
                <span className="text-white/55">{a.rides_total || 0} rides brokered</span>
                <span className="text-[#D4AF37] font-medium">
                  ${(a.profit_total || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} profit
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl bg-[#0a0a0a] border-white/10 text-white max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle data-testid="affiliate-dialog-title">{editing?.id ? "Edit affiliate" : "Add affiliate"}</DialogTitle>
            <DialogDescription className="text-white/55">
              Store contact info, base rates, and insurance details for a partner operator you broker rides through.
            </DialogDescription>
          </DialogHeader>

          {editing && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
              <div className="sm:col-span-2">
                <Label className="text-white/70 text-xs">Company Name *</Label>
                <Input
                  data-testid="affiliate-input-name"
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="Capital City Limousine"
                  className="bg-[#0E0E0E] border-[#27272A] mt-1"
                />
              </div>
              <div>
                <Label className="text-white/70 text-xs">Contact Name</Label>
                <Input
                  data-testid="affiliate-input-contact"
                  value={editing.contact_name}
                  onChange={(e) => setEditing({ ...editing, contact_name: e.target.value })}
                  placeholder="Tom Reynolds"
                  className="bg-[#0E0E0E] border-[#27272A] mt-1"
                />
              </div>
              <div>
                <Label className="text-white/70 text-xs">Phone</Label>
                <Input
                  data-testid="affiliate-input-phone"
                  value={editing.phone}
                  onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
                  placeholder="(916) 555-0100"
                  className="bg-[#0E0E0E] border-[#27272A] mt-1"
                />
              </div>
              <div>
                <Label className="text-white/70 text-xs">Email</Label>
                <Input
                  data-testid="affiliate-input-email"
                  type="email"
                  value={editing.email}
                  onChange={(e) => setEditing({ ...editing, email: e.target.value })}
                  placeholder="dispatch@capitallimo.com"
                  className="bg-[#0E0E0E] border-[#27272A] mt-1"
                />
              </div>
              <div>
                <Label className="text-white/70 text-xs">Home City</Label>
                <Input
                  data-testid="affiliate-input-city"
                  value={editing.city}
                  onChange={(e) => setEditing({ ...editing, city: e.target.value })}
                  placeholder="Sacramento, CA"
                  className="bg-[#0E0E0E] border-[#27272A] mt-1"
                />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-white/70 text-xs">Service Areas (comma separated)</Label>
                <Input
                  data-testid="affiliate-input-areas"
                  value={editing.service_areas}
                  onChange={(e) => setEditing({ ...editing, service_areas: e.target.value })}
                  placeholder="Sacramento, Davis, Stockton, Lake Tahoe"
                  className="bg-[#0E0E0E] border-[#27272A] mt-1"
                />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-white/70 text-xs">Vehicle Types (comma separated)</Label>
                <Input
                  data-testid="affiliate-input-vehicles"
                  value={editing.vehicle_types}
                  onChange={(e) => setEditing({ ...editing, vehicle_types: e.target.value })}
                  placeholder="Sedan, SUV, Sprinter, Stretch Limo"
                  className="bg-[#0E0E0E] border-[#27272A] mt-1"
                />
              </div>

              {/* Rates */}
              <div>
                <Label className="text-white/70 text-xs">Sedan rate ($)</Label>
                <Input
                  data-testid="affiliate-input-sedan-rate"
                  type="number"
                  step="1"
                  value={editing.base_sedan_rate}
                  onChange={(e) => setEditing({ ...editing, base_sedan_rate: e.target.value })}
                  placeholder="225"
                  className="bg-[#0E0E0E] border-[#27272A] mt-1"
                />
              </div>
              <div>
                <Label className="text-white/70 text-xs">SUV rate ($)</Label>
                <Input
                  data-testid="affiliate-input-suv-rate"
                  type="number"
                  step="1"
                  value={editing.base_suv_rate}
                  onChange={(e) => setEditing({ ...editing, base_suv_rate: e.target.value })}
                  placeholder="295"
                  className="bg-[#0E0E0E] border-[#27272A] mt-1"
                />
              </div>
              <div>
                <Label className="text-white/70 text-xs">Sprinter rate ($)</Label>
                <Input
                  data-testid="affiliate-input-sprinter-rate"
                  type="number"
                  step="1"
                  value={editing.base_sprinter_rate}
                  onChange={(e) => setEditing({ ...editing, base_sprinter_rate: e.target.value })}
                  placeholder="475"
                  className="bg-[#0E0E0E] border-[#27272A] mt-1"
                />
              </div>

              {/* Compliance */}
              <div>
                <Label className="text-white/70 text-xs">TCP / PUC #</Label>
                <Input
                  data-testid="affiliate-input-tcp"
                  value={editing.tcp_number}
                  onChange={(e) => setEditing({ ...editing, tcp_number: e.target.value })}
                  placeholder="TCP 12345-A"
                  className="bg-[#0E0E0E] border-[#27272A] mt-1"
                />
              </div>
              <div>
                <Label className="text-white/70 text-xs">Insurance Expires</Label>
                <Input
                  data-testid="affiliate-input-insurance"
                  type="date"
                  value={editing.insurance_expiry || ""}
                  onChange={(e) => setEditing({ ...editing, insurance_expiry: e.target.value })}
                  className="bg-[#0E0E0E] border-[#27272A] mt-1"
                />
              </div>

              <div className="sm:col-span-2">
                <Label className="text-white/70 text-xs">Notes</Label>
                <Textarea
                  data-testid="affiliate-input-notes"
                  value={editing.notes}
                  onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
                  placeholder="Always demands 50% deposit. Best Sprinter quality in Sac. Quote turnaround under 30 min."
                  className="bg-[#0E0E0E] border-[#27272A] mt-1 min-h-[80px]"
                />
              </div>

              <div className="sm:col-span-2 flex items-center gap-2">
                <Switch
                  checked={editing.active}
                  onCheckedChange={(v) => setEditing({ ...editing, active: v })}
                  data-testid="affiliate-input-active"
                />
                <span className="text-white/65 text-sm">Active (appears in assignment dropdowns)</span>
              </div>

              <div className="sm:col-span-2 flex justify-end gap-3 mt-2">
                <Button variant="ghost" onClick={() => setEditing(null)} className="text-white/70">
                  Cancel
                </Button>
                <Button
                  data-testid="affiliate-save-btn"
                  onClick={save}
                  disabled={saving}
                  className="bg-[#D4AF37] text-black hover:opacity-90 min-w-[100px]"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
