import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Save, Plus, Trash2, CalendarDays, AlertCircle } from "lucide-react";

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

function blankEvent() {
  const today = new Date().toISOString().slice(0, 10);
  return {
    id: null,
    name: "",
    start_date: today,
    end_date: today,
    pricing_type: "multiplier",
    multiplier: 1.5,
    flat_surcharge: 0,
    reason: "",
    enabled: true,
  };
}

function isPast(endDate) {
  if (!endDate) return false;
  return new Date(endDate) < new Date(new Date().toISOString().slice(0, 10));
}

export default function SurgeCalendarTab() {
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [rows, setRows] = useState([]);
  const [newEvent, setNewEvent] = useState(blankEvent());
  const [creating, setCreating] = useState(false);

  const load = async () => {
    try {
      const { data } = await api.get("/admin/surge-events");
      setRows(data);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Failed to load events");
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

  const save = async (ev) => {
    if (!ev.name.trim()) return toast.error("Event name is required.");
    if (new Date(ev.end_date) < new Date(ev.start_date))
      return toast.error("End date must be on or after start date.");
    setSavingId(ev.id);
    try {
      await api.patch(`/admin/surge-events/${ev.id}`, {
        name: ev.name,
        start_date: ev.start_date,
        end_date: ev.end_date,
        pricing_type: ev.pricing_type,
        multiplier: Number(ev.multiplier) || 1,
        flat_surcharge: Number(ev.flat_surcharge) || 0,
        reason: ev.reason || "",
        enabled: !!ev.enabled,
      });
      toast.success(`${ev.name} updated`);
      load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Update failed");
    } finally {
      setSavingId(null);
    }
  };

  const remove = async (ev) => {
    try {
      await api.delete(`/admin/surge-events/${ev.id}`);
      toast.success(`${ev.name} removed`);
      load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Delete failed");
    }
  };

  const create = async () => {
    if (!newEvent.name.trim()) return toast.error("Event name is required.");
    if (new Date(newEvent.end_date) < new Date(newEvent.start_date))
      return toast.error("End date must be on or after start date.");
    setCreating(true);
    try {
      await api.post("/admin/surge-events", {
        name: newEvent.name,
        start_date: newEvent.start_date,
        end_date: newEvent.end_date,
        pricing_type: newEvent.pricing_type,
        multiplier: Number(newEvent.multiplier) || 1,
        flat_surcharge: Number(newEvent.flat_surcharge) || 0,
        reason: newEvent.reason || "",
        enabled: !!newEvent.enabled,
      });
      toast.success(`${newEvent.name} added`);
      setNewEvent(blankEvent());
      load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Create failed");
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
    <div data-testid="surge-tab" className="space-y-6">
      <div className="rounded-2xl border border-[#1F1F1F] bg-[#0A0A0A] p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-2 mb-6">
          <div>
            <div className="flex items-center gap-2 text-[#D4AF37]">
              <CalendarDays className="w-4 h-4" />
              <span className="text-[10px] uppercase tracking-[0.3em]">Date-based pricing</span>
            </div>
            <h3 className="font-serif text-2xl mt-1">Surge Calendar</h3>
            <p className="text-sm text-white/55 mt-1 max-w-2xl leading-relaxed">
              Schedule price adjustments for date ranges with predictable high demand (concerts, races, conventions, holidays).
              When a customer's pickup date falls in an enabled event window, every priced vehicle gets the adjustment
              and the customer sees your reason note on the booking form.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {rows.length === 0 && (
            <div className="text-center py-12 text-white/40">
              No events yet — add your first one below.
              <div className="text-xs text-white/30 mt-2">
                Examples: BottleRock, Outside Lands, Burning Man, NYE, Super Bowl
              </div>
            </div>
          )}

          {rows.map((ev) => {
            const past = isPast(ev.end_date);
            return (
              <div
                key={ev.id}
                data-testid={`surge-row-${ev.id}`}
                className={cn(
                  "rounded-xl border bg-[#0E0E0E] p-5",
                  past ? "border-white/5 opacity-50" : "border-[#1F1F1F]",
                  !ev.enabled && !past && "opacity-65",
                )}
              >
                {past && (
                  <div className="flex items-center gap-2 text-[10px] text-white/50 uppercase tracking-wider mb-3">
                    <AlertCircle className="w-3 h-3" /> Past event — kept for history
                  </div>
                )}
                <div className="grid md:grid-cols-12 gap-4 items-start">
                  <div className="md:col-span-4">
                    <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">Event name</Label>
                    <Input
                      data-testid={`surge-name-${ev.id}`}
                      className={cn(inputCls, "mt-1 h-10")}
                      value={ev.name}
                      onChange={(e) => updateLocal(ev.id, "name", e.target.value)}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">Start date</Label>
                    <Input
                      data-testid={`surge-start-${ev.id}`}
                      type="date"
                      className={cn(inputCls, "mt-1 h-10")}
                      value={ev.start_date?.slice(0, 10) || ""}
                      onChange={(e) => updateLocal(ev.id, "start_date", e.target.value)}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">End date</Label>
                    <Input
                      data-testid={`surge-end-${ev.id}`}
                      type="date"
                      className={cn(inputCls, "mt-1 h-10")}
                      value={ev.end_date?.slice(0, 10) || ""}
                      onChange={(e) => updateLocal(ev.id, "end_date", e.target.value)}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">Adjustment type</Label>
                    <Select
                      value={ev.pricing_type}
                      onValueChange={(v) => updateLocal(ev.id, "pricing_type", v)}
                    >
                      <SelectTrigger
                        data-testid={`surge-type-${ev.id}`}
                        className={cn(inputCls, "mt-1 h-10")}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-[#111] border-[#27272A] text-white">
                        <SelectItem value="multiplier">Multiplier (×)</SelectItem>
                        <SelectItem value="flat_surcharge">Flat $ surcharge</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="md:col-span-1">
                    <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">On</Label>
                    <div className="mt-2.5">
                      <Switch
                        data-testid={`surge-enabled-${ev.id}`}
                        checked={!!ev.enabled}
                        onCheckedChange={(v) => updateLocal(ev.id, "enabled", !!v)}
                        className="data-[state=checked]:bg-[#D4AF37]"
                      />
                    </div>
                  </div>

                  {ev.pricing_type === "multiplier" ? (
                    <div className="md:col-span-3">
                      <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">
                        Multiplier (e.g. 1.5 = +50%)
                      </Label>
                      <Input
                        data-testid={`surge-multiplier-${ev.id}`}
                        type="number"
                        step="0.05"
                        min="0.1"
                        max="10"
                        className={cn(inputCls, "mt-1 h-10")}
                        value={ev.multiplier}
                        onChange={(e) => updateLocal(ev.id, "multiplier", e.target.value)}
                      />
                    </div>
                  ) : (
                    <div className="md:col-span-3">
                      <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">
                        Flat $ added to each quote
                      </Label>
                      <Input
                        data-testid={`surge-flat-${ev.id}`}
                        type="number"
                        step="1"
                        min="0"
                        className={cn(inputCls, "mt-1 h-10")}
                        value={ev.flat_surcharge}
                        onChange={(e) => updateLocal(ev.id, "flat_surcharge", e.target.value)}
                      />
                    </div>
                  )}

                  <div className="md:col-span-12">
                    <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">
                      Why this fee (shown to customer)
                    </Label>
                    <Textarea
                      data-testid={`surge-reason-${ev.id}`}
                      className={cn(inputCls, "mt-1 min-h-[60px]")}
                      value={ev.reason}
                      onChange={(e) => updateLocal(ev.id, "reason", e.target.value)}
                      placeholder="BottleRock weekend — chauffeurs are in heavy demand across Napa. A higher rate applies so we can guarantee a driver for your trip."
                    />
                  </div>

                  <div className="md:col-span-12 flex justify-end gap-2 pt-1">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          data-testid={`surge-delete-${ev.id}`}
                          className="bg-transparent border-red-500/30 text-red-400 hover:bg-red-500/10 rounded-full h-9 px-4"
                        >
                          <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Remove
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="bg-[#0A0A0A] border-[#1F1F1F] text-white">
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remove "{ev.name}"?</AlertDialogTitle>
                          <AlertDialogDescription className="text-white/60">
                            New quotes during {ev.start_date}–{ev.end_date} will no longer be adjusted.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="bg-transparent border-white/20 hover:bg-white/10">
                            Cancel
                          </AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => remove(ev)}
                            data-testid={`surge-delete-confirm-${ev.id}`}
                            className="bg-red-500 hover:bg-red-600"
                          >
                            Yes, remove
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>

                    <Button
                      onClick={() => save(ev)}
                      disabled={savingId === ev.id}
                      data-testid={`surge-save-${ev.id}`}
                      className="bg-[#D4AF37] text-black hover:bg-[#B3922E] rounded-full h-9 px-5 font-medium"
                    >
                      {savingId === ev.id ? (
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
            );
          })}
        </div>
      </div>

      {/* New event form */}
      <div className="rounded-2xl border border-[#1F1F1F] bg-[#0A0A0A] p-6 md:p-8" data-testid="surge-new-form">
        <h3 className="font-serif text-xl flex items-center gap-2">
          <Plus className="w-4 h-4 text-[#D4AF37]" /> Add a new event
        </h3>
        <div className="grid md:grid-cols-12 gap-4 mt-5">
          <div className="md:col-span-4">
            <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">Event name</Label>
            <Input
              data-testid="surge-new-name"
              className={cn(inputCls, "mt-1 h-10")}
              value={newEvent.name}
              onChange={(e) => setNewEvent({ ...newEvent, name: e.target.value })}
              placeholder="BottleRock Napa 2026"
            />
          </div>
          <div className="md:col-span-2">
            <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">Start date</Label>
            <Input
              data-testid="surge-new-start"
              type="date"
              className={cn(inputCls, "mt-1 h-10")}
              value={newEvent.start_date}
              onChange={(e) => setNewEvent({ ...newEvent, start_date: e.target.value })}
            />
          </div>
          <div className="md:col-span-2">
            <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">End date</Label>
            <Input
              data-testid="surge-new-end"
              type="date"
              className={cn(inputCls, "mt-1 h-10")}
              value={newEvent.end_date}
              onChange={(e) => setNewEvent({ ...newEvent, end_date: e.target.value })}
            />
          </div>
          <div className="md:col-span-2">
            <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">Adjustment type</Label>
            <Select
              value={newEvent.pricing_type}
              onValueChange={(v) => setNewEvent({ ...newEvent, pricing_type: v })}
            >
              <SelectTrigger
                data-testid="surge-new-type"
                className={cn(inputCls, "mt-1 h-10")}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#111] border-[#27272A] text-white">
                <SelectItem value="multiplier">Multiplier (×)</SelectItem>
                <SelectItem value="flat_surcharge">Flat $ surcharge</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-1">
            <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">On</Label>
            <div className="mt-2.5">
              <Switch
                data-testid="surge-new-enabled"
                checked={!!newEvent.enabled}
                onCheckedChange={(v) => setNewEvent({ ...newEvent, enabled: !!v })}
                className="data-[state=checked]:bg-[#D4AF37]"
              />
            </div>
          </div>

          {newEvent.pricing_type === "multiplier" ? (
            <div className="md:col-span-3">
              <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">
                Multiplier
              </Label>
              <Input
                data-testid="surge-new-multiplier"
                type="number"
                step="0.05"
                min="0.1"
                max="10"
                className={cn(inputCls, "mt-1 h-10")}
                value={newEvent.multiplier}
                onChange={(e) => setNewEvent({ ...newEvent, multiplier: e.target.value })}
                placeholder="1.5 = +50%"
              />
            </div>
          ) : (
            <div className="md:col-span-3">
              <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">
                Flat $ added
              </Label>
              <Input
                data-testid="surge-new-flat"
                type="number"
                step="1"
                min="0"
                className={cn(inputCls, "mt-1 h-10")}
                value={newEvent.flat_surcharge}
                onChange={(e) => setNewEvent({ ...newEvent, flat_surcharge: e.target.value })}
              />
            </div>
          )}

          <div className="md:col-span-12">
            <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">
              Why this fee (shown to customer)
            </Label>
            <Textarea
              data-testid="surge-new-reason"
              className={cn(inputCls, "mt-1 min-h-[60px]")}
              value={newEvent.reason}
              onChange={(e) => setNewEvent({ ...newEvent, reason: e.target.value })}
              placeholder="BottleRock weekend — chauffeurs are in heavy demand across Napa. A higher rate applies so we can guarantee a driver."
            />
          </div>

          <div className="md:col-span-12 flex justify-end">
            <Button
              onClick={create}
              disabled={creating}
              data-testid="surge-new-save"
              className="bg-[#D4AF37] text-black hover:bg-[#B3922E] rounded-full h-10 px-6 font-medium"
            >
              {creating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              Add event
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
