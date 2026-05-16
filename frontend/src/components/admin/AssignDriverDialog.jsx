import { useState, useEffect } from "react";
import { toast } from "sonner";
import { UserPlus, Loader2, Copy, Check, MessageSquare, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { api, formatApiErrorDetail } from "@/lib/api";
import { cn } from "@/lib/utils";

const inputCls =
  "bg-[#0E0E0E] border-[#27272A] text-white placeholder:text-white/40 focus-visible:ring-[#D4AF37] focus-visible:border-[#D4AF37]";

const STATUS_PILL = {
  assigned: { text: "Assigned", color: "bg-white/10 text-white/70 border-white/20" },
  en_route: { text: "On the way", color: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  on_location: { text: "On location", color: "bg-blue-500/15 text-blue-300 border-blue-500/30" },
  passenger_onboard: { text: "Onboard", color: "bg-purple-500/15 text-purple-300 border-purple-500/30" },
  completed: { text: "Completed", color: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
};

export function DriverStatusPill({ status }) {
  const s = STATUS_PILL[status];
  if (!s) return null;
  return (
    <Badge
      data-testid={`driver-status-pill-${status}`}
      variant="outline"
      className={cn("rounded-full text-[10px] px-2 py-0.5 font-medium", s.color)}
    >
      {s.text}
    </Badge>
  );
}

export default function AssignDriverDialog({ booking, onAssigned }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [driverUrl, setDriverUrl] = useState(booking.driver_token ? `${window.location.origin}/driver/${booking.driver_token}` : null);
  const [roster, setRoster] = useState([]);
  const [selectedDriverId, setSelectedDriverId] = useState("");
  const [form, setForm] = useState({
    driver_name: booking.driver_name || "",
    driver_phone: booking.driver_phone || "",
    driver_email: booking.driver_email || "",
    driver_plate: booking.driver_plate || "",
    driver_vehicle: booking.driver_vehicle || "",
    notify_customer: true,
  });

  const isReassign = !!booking.driver_token;

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const { data } = await api.get("/admin/drivers");
        setRoster((data || []).filter((d) => d.active));
      } catch (e) {
        console.warn("[AssignDriverDialog] couldn't load driver roster (manual entry still works):", e);
      }
    })();
  }, [open]);

  const pickFromRoster = (id) => {
    setSelectedDriverId(id);
    if (id === "manual") {
      setForm((f) => ({ ...f, driver_name: "", driver_phone: "", driver_email: "", driver_plate: "", driver_vehicle: "" }));
      return;
    }
    const d = roster.find((r) => r.id === id);
    if (!d) return;
    setForm((f) => ({
      ...f,
      driver_name: d.name || "",
      driver_phone: d.phone || "",
      driver_email: d.email || "",
      driver_plate: d.plate || "",
      driver_vehicle: d.vehicle || "",
    }));
  };

  const submit = async () => {
    if (!form.driver_name.trim()) return toast.error("Driver name required");
    if (!form.driver_phone.trim()) return toast.error("Driver phone required (for SMS dispatch)");
    setSaving(true);
    try {
      const { data } = await api.post(
        `/admin/bookings/${booking.id}/assign-driver`,
        form,
      );
      setDriverUrl(data.driver_url);
      toast.success(`${isReassign ? "Re-assigned to" : "Dispatched"} ${form.driver_name} · SMS sent`);
      onAssigned?.();
    } catch (err) {
      toast.error(
        formatApiErrorDetail(err.response?.data?.detail) || "Failed to assign driver",
      );
    } finally {
      setSaving(false);
    }
  };

  const copyLink = async () => {
    if (!driverUrl) return;
    await navigator.clipboard.writeText(driverUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const unassign = async () => {
    if (!confirm("Remove this driver? The old dispatch link will stop working.")) return;
    try {
      await api.delete(`/admin/bookings/${booking.id}/driver`);
      toast.success("Driver removed");
      setOpen(false);
      onAssigned?.();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Failed");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          data-testid={`assign-driver-${booking.id}`}
          className="bg-[#D4AF37]/10 hover:bg-[#D4AF37]/20 text-[#D4AF37] border-[#D4AF37]/30 rounded-full h-8 px-3 text-xs"
        >
          <UserPlus className="w-3.5 h-3.5 mr-1.5" />
          {isReassign ? booking.driver_name : "Assign driver"}
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-[#0A0A0A] border-[#1F1F1F] text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">
            {isReassign ? "Driver assignment" : "Assign a driver"}
          </DialogTitle>
          <p className="text-xs text-white/55 mt-1">
            Driver gets an SMS with a private dispatch link. They open it to view trip details and update status. Each status update auto-texts the customer.
          </p>
        </DialogHeader>

        <div className="space-y-3">
          {roster.length > 0 && (
            <div>
              <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">
                Pick from roster
              </Label>
              <Select value={selectedDriverId} onValueChange={pickFromRoster}>
                <SelectTrigger
                  data-testid="driver-roster-select"
                  className={cn(inputCls, "mt-1 h-10")}
                >
                  <SelectValue placeholder={`Choose a saved driver (${roster.length} available)`} />
                </SelectTrigger>
                <SelectContent className="bg-[#0E0E0E] border-[#27272A] text-white">
                  {roster.map((d) => (
                    <SelectItem key={d.id} value={d.id} data-testid={`roster-option-${d.id}`}>
                      {d.name} · {d.phone}{d.vehicle ? ` · ${d.vehicle}` : ""}
                    </SelectItem>
                  ))}
                  <SelectItem value="manual" data-testid="roster-option-manual">
                    ✎ Enter manually
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-white/40 mt-1">
                Manage your roster in the Drivers tab.
              </p>
            </div>
          )}
          <div>
            <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">
              Driver name <span className="text-[#D4AF37]">*</span>
            </Label>
            <Input
              data-testid="driver-name-input"
              className={cn(inputCls, "mt-1 h-10")}
              value={form.driver_name}
              onChange={(e) => setForm((f) => ({ ...f, driver_name: e.target.value }))}
              placeholder="John Smith"
            />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">
              Driver phone <span className="text-[#D4AF37]">*</span>
            </Label>
            <Input
              data-testid="driver-phone-input"
              className={cn(inputCls, "mt-1 h-10")}
              value={form.driver_phone}
              onChange={(e) => setForm((f) => ({ ...f, driver_phone: e.target.value }))}
              placeholder="+1 555 123 4567"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">Driver email</Label>
              <Input
                data-testid="driver-email-input"
                className={cn(inputCls, "mt-1 h-10")}
                value={form.driver_email}
                onChange={(e) => setForm((f) => ({ ...f, driver_email: e.target.value }))}
                placeholder="optional"
              />
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">License plate</Label>
              <Input
                data-testid="driver-plate-input"
                className={cn(inputCls, "mt-1 h-10 uppercase")}
                value={form.driver_plate}
                onChange={(e) => setForm((f) => ({ ...f, driver_plate: e.target.value }))}
                placeholder="7ABC123"
              />
            </div>
          </div>

          <div>
            <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">Vehicle (shown to customer)</Label>
            <Input
              data-testid="driver-vehicle-input"
              className={cn(inputCls, "mt-1 h-10")}
              value={form.driver_vehicle}
              onChange={(e) => setForm((f) => ({ ...f, driver_vehicle: e.target.value }))}
              placeholder="e.g., Mercedes S-Class · Black"
            />
            <p className="text-[10px] text-white/40 mt-1">
              Leave blank to default to the booked vehicle class ({booking.vehicle_type}).
            </p>
          </div>

          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              data-testid="notify-customer-checkbox"
              checked={form.notify_customer}
              onChange={(e) => setForm((f) => ({ ...f, notify_customer: e.target.checked }))}
              className="mt-0.5 accent-[#D4AF37]"
            />
            <span className="text-xs text-white/70 leading-relaxed">
              Email the customer with the chauffeur's name, phone, vehicle, and plate. Recommended.
            </span>
          </label>

          {driverUrl && (
            <div className="rounded-xl border border-[#D4AF37]/30 bg-[#D4AF37]/5 p-3 mt-2">
              <div className="text-[10px] uppercase tracking-[0.2em] text-[#D4AF37] mb-1.5">
                Dispatch link
              </div>
              <div className="flex items-center gap-2">
                <code
                  data-testid="driver-url-display"
                  className="flex-1 text-[11px] text-white/75 break-all bg-black/30 rounded p-2"
                >
                  {driverUrl}
                </code>
                <Button
                  size="sm"
                  onClick={copyLink}
                  data-testid="driver-url-copy"
                  className="bg-white/10 hover:bg-white/20 h-9 px-3"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
              <p className="text-[10px] text-white/45 mt-2 flex items-center gap-1.5">
                <MessageSquare className="w-3 h-3" /> Sent via SMS to {form.driver_phone}
              </p>
            </div>
          )}

          <div className="flex justify-between items-center pt-3 border-t border-[#1F1F1F]">
            {isReassign && (
              <Button
                variant="outline"
                onClick={unassign}
                data-testid="driver-unassign-btn"
                className="bg-transparent border-red-500/30 text-red-400 hover:bg-red-500/10 rounded-full h-9 px-4"
              >
                <X className="w-3.5 h-3.5 mr-1.5" />
                Remove driver
              </Button>
            )}
            <Button
              onClick={submit}
              disabled={saving}
              data-testid="driver-assign-submit"
              className="bg-[#D4AF37] text-black hover:bg-[#B3922E] rounded-full h-9 px-5 font-medium ml-auto"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : isReassign ? (
                "Resend SMS"
              ) : (
                "Assign & SMS driver"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
