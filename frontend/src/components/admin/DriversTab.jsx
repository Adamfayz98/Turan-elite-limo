import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Edit2, Trash2, Loader2, UserPlus, Phone, Mail, Send } from "lucide-react";

import { api, formatApiErrorDetail } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const EMPTY = { name: "", phone: "", email: "", plate: "", vehicle: "", active: true };

// "2 days ago" style — keeps the UI tight when an invite was sent recently.
function timeAgoShort(iso) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!t) return null;
  const secs = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export default function DriversTab() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [invitingId, setInvitingId] = useState(null);
  const [fallbackUrl, setFallbackUrl] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/drivers");
      setItems(data || []);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Couldn't load drivers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!editing) return;
    if (!editing.name?.trim()) return toast.error("Name is required");
    if (!editing.phone?.trim()) return toast.error("Phone is required");
    setSaving(true);
    const payload = {
      name: editing.name.trim(),
      phone: editing.phone.trim(),
      email: (editing.email || "").trim() || null,
      plate: (editing.plate || "").trim() || null,
      vehicle: (editing.vehicle || "").trim() || null,
      active: !!editing.active,
    };
    try {
      if (editing.id) {
        await api.patch(`/admin/drivers/${editing.id}`, payload);
        toast.success("Driver updated");
      } else {
        await api.post("/admin/drivers", payload);
        toast.success("Driver added");
      }
      setEditing(null);
      await load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (d) => {
    if (!window.confirm(`Remove ${d.name} from roster?`)) return;
    try {
      await api.delete(`/admin/drivers/${d.id}`);
      toast.success("Removed");
      await load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Delete failed");
    }
  };

  const sendInvite = async (d) => {
    if (!d.email) {
      toast.error(`${d.name} has no email — edit them and add one first.`);
      return;
    }
    const isResend = d.invite_count && d.invite_count > 0;
    const msg = isResend
      ? `Resend invite to ${d.name} (${d.email})? They'll get a fresh 7-day setup link.`
      : `Email ${d.name} (${d.email}) the driver invite with app links + a 7-day password-setup link?`;
    if (!window.confirm(msg)) return;
    setInvitingId(d.id);
    try {
      const { data } = await api.post(`/admin/drivers/${d.id}/invite`);
      if (data?.sent) {
        toast.success(`Invite emailed to ${data.email}`);
      } else if (data?.setup_url_if_email_failed) {
        // Email transport failed — surface the link so admin can hand-deliver
        setFallbackUrl({ url: data.setup_url_if_email_failed, driver: d.name, email: data.email });
        toast.error("Email couldn't be delivered — use the manual link instead");
      } else {
        toast.success(data?.message || "Invite processed");
      }
      await load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Couldn't send invite");
    } finally {
      setInvitingId(null);
    }
  };

  return (
    <div className="space-y-6" data-testid="drivers-tab">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-serif text-2xl text-white">Driver roster</h2>
          <p className="text-xs text-white/55 mt-1 max-w-2xl leading-relaxed">
            Save your regular chauffeurs here. When assigning a driver to a booking, pick from this list instead of retyping the details every time.
          </p>
        </div>
        <Button
          onClick={() => setEditing({ ...EMPTY })}
          data-testid="new-driver-btn"
          className="bg-[#D4AF37] text-black hover:bg-[#B3922E] rounded-full h-10 px-5"
        >
          <Plus className="w-4 h-4 mr-2" /> Add driver
        </Button>
      </div>

      {loading ? (
        <div className="py-10 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-[#D4AF37]" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-[#1F1F1F] bg-[#0A0A0A] p-10 text-center">
          <UserPlus className="w-8 h-8 mx-auto text-white/30 mb-3" />
          <div className="text-white/65">No drivers yet.</div>
          <div className="text-xs text-white/40 mt-1">Add your first chauffeur to start picking from a dropdown when dispatching.</div>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((d) => (
            <div
              key={d.id}
              data-testid={`driver-row-${d.id}`}
              className="rounded-xl border border-[#1F1F1F] bg-[#0A0A0A] p-4 flex items-start gap-3"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-white font-medium truncate">{d.name}</span>
                  {!d.active && (
                    <span className="text-[10px] uppercase tracking-wider bg-white/5 text-white/50 px-2 py-0.5 rounded">inactive</span>
                  )}
                  {d.vehicle && (
                    <span className="text-[10px] uppercase tracking-wider bg-[#D4AF37]/15 text-[#D4AF37] px-2 py-0.5 rounded">{d.vehicle}</span>
                  )}
                </div>
                <div className="text-xs text-white/55 mt-1 flex items-center gap-3 flex-wrap">
                  <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" /> {d.phone}</span>
                  {d.email && <span className="inline-flex items-center gap-1"><Mail className="w-3 h-3" /> {d.email}</span>}
                  {d.plate && <span className="uppercase tracking-wider">{d.plate}</span>}
                  {d.last_invited_at && (
                    <span
                      className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-[#D4AF37]/80"
                      data-testid={`driver-invited-${d.id}`}
                      title={`Invited ${d.invite_count || 1} time${(d.invite_count || 1) > 1 ? "s" : ""}`}
                    >
                      <Send className="w-3 h-3" />
                      Invited {timeAgoShort(d.last_invited_at)}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => sendInvite(d)}
                  disabled={invitingId === d.id || !d.email}
                  data-testid={`invite-driver-${d.id}`}
                  className="p-2 rounded-lg text-white/55 hover:text-[#D4AF37] hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed"
                  title={d.email
                    ? (d.last_invited_at ? "Resend invite email" : "Send invite email")
                    : "Add an email first"}
                >
                  {invitingId === d.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing({
                    ...EMPTY,
                    ...d,
                    email: d.email || "",
                    plate: d.plate || "",
                    vehicle: d.vehicle || "",
                  })}
                  data-testid={`edit-driver-${d.id}`}
                  className="p-2 rounded-lg text-white/55 hover:text-[#D4AF37] hover:bg-white/5"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => remove(d)}
                  data-testid={`delete-driver-${d.id}`}
                  className="p-2 rounded-lg text-white/55 hover:text-red-400 hover:bg-white/5"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="bg-[#0A0A0A] border-[#1F1F1F] text-white max-w-md" data-testid="driver-dialog">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">
              {editing?.id ? "Edit driver" : "Add driver"}
            </DialogTitle>
            <DialogDescription className="text-xs text-white/55 mt-1">
              Stored locally so dispatch is one tap.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-3 mt-2">
              <div>
                <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">Name *</Label>
                <Input
                  data-testid="driver-name-field"
                  value={editing.name}
                  onChange={(e) => setEditing((s) => ({ ...s, name: e.target.value }))}
                  placeholder="John Smith"
                  className="bg-[#0E0E0E] border-[#27272A] text-white focus-visible:ring-[#D4AF37] focus-visible:border-[#D4AF37] mt-1 h-10"
                />
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">Phone *</Label>
                <Input
                  data-testid="driver-phone-field"
                  value={editing.phone}
                  onChange={(e) => setEditing((s) => ({ ...s, phone: e.target.value }))}
                  placeholder="+1 555 123 4567"
                  className="bg-[#0E0E0E] border-[#27272A] text-white focus-visible:ring-[#D4AF37] focus-visible:border-[#D4AF37] mt-1 h-10"
                />
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">Email</Label>
                <Input
                  data-testid="driver-email-field"
                  value={editing.email}
                  onChange={(e) => setEditing((s) => ({ ...s, email: e.target.value }))}
                  placeholder="optional"
                  className="bg-[#0E0E0E] border-[#27272A] text-white focus-visible:ring-[#D4AF37] focus-visible:border-[#D4AF37] mt-1 h-10"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">License plate</Label>
                  <Input
                    data-testid="driver-plate-field"
                    value={editing.plate}
                    onChange={(e) => setEditing((s) => ({ ...s, plate: e.target.value }))}
                    placeholder="7ABC123"
                    className="bg-[#0E0E0E] border-[#27272A] text-white focus-visible:ring-[#D4AF37] focus-visible:border-[#D4AF37] mt-1 h-10 uppercase"
                  />
                </div>
                <div>
                  <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">Vehicle</Label>
                  <Input
                    data-testid="driver-vehicle-field"
                    value={editing.vehicle}
                    onChange={(e) => setEditing((s) => ({ ...s, vehicle: e.target.value }))}
                    placeholder="Mercedes S-Class · Black"
                    className="bg-[#0E0E0E] border-[#27272A] text-white focus-visible:ring-[#D4AF37] focus-visible:border-[#D4AF37] mt-1 h-10"
                  />
                </div>
              </div>
              <label className="flex items-center justify-between gap-3 cursor-pointer pt-2 border-t border-[#1F1F1F]">
                <span className="text-sm text-white/80">Active (show in dispatch list)</span>
                <Switch
                  data-testid="toggle-driver-active"
                  checked={!!editing.active}
                  onCheckedChange={(v) => setEditing((s) => ({ ...s, active: v }))}
                />
              </label>
              <Button
                onClick={save}
                disabled={saving}
                data-testid="save-driver"
                className="w-full bg-[#D4AF37] text-black hover:bg-[#B3922E] rounded-full h-11 font-medium"
              >
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editing?.id ? "Save changes" : "Add driver"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Fallback dialog: shown when the email transport failed so the admin
         can copy the setup URL and hand-deliver via SMS / WhatsApp / etc. */}
      <Dialog open={!!fallbackUrl} onOpenChange={(o) => !o && setFallbackUrl(null)}>
        <DialogContent className="bg-[#0A0A0A] border-[#1F1F1F] text-white max-w-md" data-testid="invite-fallback-dialog">
          <DialogHeader>
            <DialogTitle>Email delivery failed</DialogTitle>
            <DialogDescription className="text-white/55">
              We couldn&apos;t reach <span className="text-[#D4AF37]">{fallbackUrl?.email}</span>. Copy this one-time setup link and text or message it to {fallbackUrl?.driver} directly. It expires in 7 days.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-3 space-y-2">
            <Input
              readOnly
              value={fallbackUrl?.url || ""}
              onFocus={(e) => e.target.select()}
              className="bg-[#0E0E0E] border-[#27272A] text-[#D4AF37] text-xs font-mono"
              data-testid="invite-fallback-url"
            />
            <Button
              onClick={() => {
                navigator.clipboard.writeText(fallbackUrl?.url || "");
                toast.success("Copied to clipboard");
              }}
              className="w-full bg-[#D4AF37] text-black hover:bg-[#B3922E] rounded-full h-10"
              data-testid="copy-invite-url-btn"
            >
              Copy link
            </Button>
            <p className="text-[11px] text-white/40 leading-relaxed pt-1">
              Common reasons email fails: domain is on a deny list, mailbox is full, or the address has a typo. Verify the email in the driver&apos;s row, then try again.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
