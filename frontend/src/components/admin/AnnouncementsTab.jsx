import { useEffect, useState } from "react";
import { toast } from "sonner";

import { api, formatApiErrorDetail } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Plus, Edit2, Trash2, Loader2, Copy, ExternalLink, Megaphone } from "lucide-react";

const EMPTY = {
  title: "",
  body: "",
  cta_label: "",
  cta_url: "",
  show_in_banner: true,
  show_on_homepage: true,
  active: true,
  starts_at: "",
  ends_at: "",
};

export default function AnnouncementsTab() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null = list view, object = edit form
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/announcements");
      setItems(data || []);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Couldn't load announcements");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    if (!editing) return;
    if (!editing.title || editing.title.trim().length < 2) {
      toast.error("Title is required");
      return;
    }
    setSaving(true);
    const payload = {
      title: editing.title.trim(),
      body: (editing.body || "").trim() || null,
      cta_label: (editing.cta_label || "").trim() || null,
      cta_url: (editing.cta_url || "").trim() || null,
      show_in_banner: !!editing.show_in_banner,
      show_on_homepage: !!editing.show_on_homepage,
      active: !!editing.active,
      starts_at: (editing.starts_at || "").trim() || null,
      ends_at: (editing.ends_at || "").trim() || null,
    };
    try {
      if (editing.id) {
        await api.patch(`/admin/announcements/${editing.id}`, payload);
        toast.success("Announcement updated");
      } else {
        await api.post("/admin/announcements", payload);
        toast.success("Announcement published");
      }
      setEditing(null);
      await load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (a) => {
    if (!window.confirm(`Delete "${a.title}"? This can't be undone.`)) return;
    try {
      await api.delete(`/admin/announcements/${a.id}`);
      toast.success("Deleted");
      await load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Delete failed");
    }
  };

  const copyForGBP = (a) => {
    const text = [a.title, a.body, a.cta_url ? `Learn more: ${a.cta_url}` : ""].filter(Boolean).join("\n\n");
    navigator.clipboard.writeText(text);
    toast.success("Copied — paste into Google Business Profile → Add update");
  };

  return (
    <div className="space-y-6" data-testid="announcements-tab">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-serif text-2xl text-white">Announcements</h2>
          <p className="text-xs text-white/55 mt-1 max-w-2xl leading-relaxed">
            Publish news / promos / service updates. They appear in a slim banner at the top of every page and in the "Latest news" section on the homepage. Each gets its own indexable URL at <code className="text-[#D4AF37]">/news/&lt;slug&gt;</code> so Google can find it.
          </p>
        </div>
        <Button
          onClick={() => setEditing({ ...EMPTY })}
          data-testid="new-announcement-btn"
          className="bg-[#D4AF37] text-black hover:bg-[#B3922E] rounded-full h-10 px-5"
        >
          <Plus className="w-4 h-4 mr-2" /> New
        </Button>
      </div>

      {loading ? (
        <div className="py-10 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-[#D4AF37]" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-[#1F1F1F] bg-[#0A0A0A] p-10 text-center">
          <Megaphone className="w-8 h-8 mx-auto text-white/30 mb-3" />
          <div className="text-white/65">No announcements yet.</div>
          <div className="text-xs text-white/40 mt-1">Publish your first one to show it on the homepage.</div>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((a) => (
            <div
              key={a.id}
              data-testid={`announcement-row-${a.id}`}
              className="rounded-xl border border-[#1F1F1F] bg-[#0A0A0A] p-4 flex items-start gap-3"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-white font-medium truncate">{a.title}</span>
                  {!a.active && (
                    <span className="text-[10px] uppercase tracking-wider bg-white/5 text-white/50 px-2 py-0.5 rounded">paused</span>
                  )}
                  {a.show_in_banner && a.active && (
                    <span className="text-[10px] uppercase tracking-wider bg-[#D4AF37]/15 text-[#D4AF37] px-2 py-0.5 rounded">banner</span>
                  )}
                </div>
                <div className="text-xs text-white/50 mt-1 truncate">
                  /news/{a.slug} · {a.created_at ? new Date(a.created_at).toLocaleDateString() : ""}
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => copyForGBP(a)}
                  title="Copy text for Google Business Profile post"
                  data-testid={`copy-gbp-${a.id}`}
                  className="p-2 rounded-lg text-white/55 hover:text-white hover:bg-white/5"
                >
                  <Copy className="w-4 h-4" />
                </button>
                <a
                  href={`/news/${a.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open public page"
                  className="p-2 rounded-lg text-white/55 hover:text-white hover:bg-white/5"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
                <button
                  type="button"
                  onClick={() => setEditing({ ...EMPTY, ...a })}
                  data-testid={`edit-announcement-${a.id}`}
                  className="p-2 rounded-lg text-white/55 hover:text-[#D4AF37] hover:bg-white/5"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => remove(a)}
                  data-testid={`delete-announcement-${a.id}`}
                  className="p-2 rounded-lg text-white/55 hover:text-red-400 hover:bg-white/5"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="text-[11px] text-white/40 leading-relaxed rounded-lg border border-white/10 bg-white/[0.02] p-3">
        💡 <strong className="text-white/65">Tip:</strong> Each time you publish, use the copy icon to grab the text and paste it as a <a href="https://business.google.com" target="_blank" rel="noopener noreferrer" className="text-[#D4AF37] hover:underline">Google Business Profile</a> update. That makes it show up in Google search/maps for your business name.
      </div>

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="bg-[#0A0A0A] border-[#1F1F1F] text-white max-w-lg" data-testid="announcement-dialog">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">
              {editing?.id ? "Edit announcement" : "New announcement"}
            </DialogTitle>
            <DialogDescription className="text-xs text-white/55 mt-1">
              Goes live the moment you save (unless you set a start date below).
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-4 mt-2">
              <div>
                <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">Headline *</Label>
                <Input
                  data-testid="announcement-title-input"
                  value={editing.title}
                  onChange={(e) => setEditing((s) => ({ ...s, title: e.target.value }))}
                  placeholder="e.g., Memorial Day weekend — $25 off airport runs"
                  maxLength={120}
                  className="bg-[#0E0E0E] border-[#27272A] text-white focus-visible:ring-[#D4AF37] focus-visible:border-[#D4AF37] mt-1 h-10"
                />
                <div className="text-[10px] text-white/40 mt-1">{(editing.title || "").length}/120</div>
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">Body (optional)</Label>
                <Textarea
                  data-testid="announcement-body-input"
                  value={editing.body}
                  onChange={(e) => setEditing((s) => ({ ...s, body: e.target.value }))}
                  placeholder="Longer description shown on the homepage card and detail page."
                  maxLength={2000}
                  className="bg-[#0E0E0E] border-[#27272A] text-white focus-visible:ring-[#D4AF37] focus-visible:border-[#D4AF37] mt-1 min-h-[100px] text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">Button label</Label>
                  <Input
                    data-testid="announcement-cta-label"
                    value={editing.cta_label}
                    onChange={(e) => setEditing((s) => ({ ...s, cta_label: e.target.value }))}
                    placeholder="Book now"
                    className="bg-[#0E0E0E] border-[#27272A] text-white focus-visible:ring-[#D4AF37] focus-visible:border-[#D4AF37] mt-1 h-10"
                    maxLength={40}
                  />
                </div>
                <div>
                  <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">Button URL</Label>
                  <Input
                    data-testid="announcement-cta-url"
                    value={editing.cta_url}
                    onChange={(e) => setEditing((s) => ({ ...s, cta_url: e.target.value }))}
                    placeholder="/#booking or https://..."
                    className="bg-[#0E0E0E] border-[#27272A] text-white focus-visible:ring-[#D4AF37] focus-visible:border-[#D4AF37] mt-1 h-10"
                    maxLength={300}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">Starts on (optional)</Label>
                  <Input
                    type="date"
                    data-testid="announcement-starts"
                    value={editing.starts_at || ""}
                    onChange={(e) => setEditing((s) => ({ ...s, starts_at: e.target.value }))}
                    className="bg-[#0E0E0E] border-[#27272A] text-white focus-visible:ring-[#D4AF37] focus-visible:border-[#D4AF37] mt-1 h-10"
                  />
                </div>
                <div>
                  <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">Ends on (optional)</Label>
                  <Input
                    type="date"
                    data-testid="announcement-ends"
                    value={editing.ends_at || ""}
                    onChange={(e) => setEditing((s) => ({ ...s, ends_at: e.target.value }))}
                    className="bg-[#0E0E0E] border-[#27272A] text-white focus-visible:ring-[#D4AF37] focus-visible:border-[#D4AF37] mt-1 h-10"
                  />
                </div>
              </div>
              <div className="space-y-2 pt-2 border-t border-[#1F1F1F]">
                <label className="flex items-center justify-between gap-3 cursor-pointer">
                  <span className="text-sm text-white/80">Show in top banner</span>
                  <Switch
                    data-testid="toggle-show-in-banner"
                    checked={!!editing.show_in_banner}
                    onCheckedChange={(v) => setEditing((s) => ({ ...s, show_in_banner: v }))}
                  />
                </label>
                <label className="flex items-center justify-between gap-3 cursor-pointer">
                  <span className="text-sm text-white/80">Show in homepage section</span>
                  <Switch
                    data-testid="toggle-show-on-homepage"
                    checked={!!editing.show_on_homepage}
                    onCheckedChange={(v) => setEditing((s) => ({ ...s, show_on_homepage: v }))}
                  />
                </label>
                <label className="flex items-center justify-between gap-3 cursor-pointer">
                  <span className="text-sm text-white/80">Active (publish)</span>
                  <Switch
                    data-testid="toggle-active"
                    checked={!!editing.active}
                    onCheckedChange={(v) => setEditing((s) => ({ ...s, active: v }))}
                  />
                </label>
              </div>
              <Button
                onClick={save}
                disabled={saving}
                data-testid="save-announcement"
                className="w-full bg-[#D4AF37] text-black hover:bg-[#B3922E] rounded-full h-11 font-medium"
              >
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editing?.id ? "Save changes" : "Publish announcement"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
