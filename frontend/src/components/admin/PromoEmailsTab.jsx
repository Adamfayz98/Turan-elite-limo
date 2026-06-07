import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Mail,
  Send,
  Eye,
  Loader2,
  Users,
  Clock,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { api, formatApiErrorDetail } from "@/lib/api";

/**
 * Compose Promo — admin tool to broadcast a promotional email to opted-in
 * recipients. Has a test-send mode so you never blast a bad copy.
 */
export default function PromoEmailsTab() {
  const [optInCount, setOptInCount] = useState(null);
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [previewHtml, setPreviewHtml] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    subject: "",
    kicker: "Special offer",
    headline: "",
    body_html: "",
    cta_url: "",
    cta_label: "",
  });

  const update = (k) => (e) => setForm((s) => ({ ...s, [k]: e.target.value }));

  const loadAll = async () => {
    setLoadingHistory(true);
    try {
      const [opts, hist] = await Promise.all([
        api.get("/admin/email-list"),
        api.get("/admin/broadcast/history"),
      ]);
      setOptInCount(opts.data?.length ?? 0);
      setHistory(hist.data || []);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Failed to load");
    } finally {
      setLoadingHistory(false);
    }
  };
  useEffect(() => { loadAll(); }, []);

  const validate = () => {
    if (form.subject.trim().length < 4) return "Subject must be at least 4 characters";
    if (form.headline.trim().length < 4) return "Headline must be at least 4 characters";
    if (form.body_html.trim().length < 10) return "Body is too short";
    if (form.cta_url && !form.cta_url.match(/^https?:\/\//)) return "CTA URL must start with http:// or https://";
    return null;
  };

  const preview = async () => {
    const err = validate();
    if (err) { toast.error(err); return; }
    setBusy(true);
    try {
      const { data } = await api.post("/admin/broadcast/preview", form);
      setPreviewHtml(data.html);
      toast.success("Preview rendered below");
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Preview failed");
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    const err = validate();
    if (err) { toast.error(err); return; }
    setBusy(true);
    try {
      const { data } = await api.post("/admin/broadcast/send", { ...form, test_only: true });
      toast.success(`Test sent to ${data.recipient}`);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Test failed");
    } finally {
      setBusy(false);
    }
  };

  const sendLive = async () => {
    const err = validate();
    if (err) { toast.error(err); return; }
    if (!window.confirm(`Send to ${optInCount} opted-in recipients? This cannot be undone.`)) return;
    setBusy(true);
    try {
      const { data } = await api.post("/admin/broadcast/send", { ...form, test_only: false });
      toast.success(`Sent: ${data.sent} · Failed: ${data.failed} · Skipped: ${data.skipped}`);
      loadAll();
      setForm((s) => ({ ...s, subject: "", headline: "", body_html: "", cta_url: "", cta_label: "" }));
      setPreviewHtml("");
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Send failed");
    } finally {
      setBusy(false);
    }
  };

  const labelCls = "text-[10px] uppercase tracking-[0.2em] text-white/55";
  const inputCls = "bg-[#0E0E0E] border-[#27272A] text-white focus-visible:ring-[#D4AF37] focus-visible:border-[#D4AF37] mt-1 h-11";

  return (
    <div data-testid="promo-emails-tab" className="space-y-6">
      <div className="flex items-start gap-4">
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-[#D4AF37]/10 text-[#D4AF37] flex-shrink-0">
          <Mail className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <h2 className="font-serif text-2xl text-white">Compose Promo</h2>
          <p className="text-sm text-white/55 mt-1">
            Send a one-off broadcast to opted-in subscribers.
            {optInCount !== null && (
              <> Current list: <span className="text-[#D4AF37] font-medium">{optInCount} recipients</span>.</>
            )}
          </p>
        </div>
      </div>

      {/* Compose form */}
      <div className="rounded-2xl border border-[#27272A] bg-[#0A0A0A] p-5 space-y-4">
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <Label className={labelCls}>Subject (inbox preview)</Label>
            <Input
              data-testid="promo-subject"
              placeholder="🍂 Fall savings just for you"
              value={form.subject}
              onChange={update("subject")}
              maxLength={120}
              className={inputCls}
            />
          </div>
          <div>
            <Label className={labelCls}>Kicker (small label above headline)</Label>
            <Input
              data-testid="promo-kicker"
              placeholder="Special offer"
              value={form.kicker}
              onChange={update("kicker")}
              maxLength={40}
              className={inputCls}
            />
          </div>
        </div>
        <div>
          <Label className={labelCls}>Headline (the big bold line)</Label>
          <Input
            data-testid="promo-headline"
            placeholder="Save 15% on every SFO transfer this month."
            value={form.headline}
            onChange={update("headline")}
            maxLength={120}
            className={inputCls}
          />
        </div>
        <div>
          <Label className={labelCls}>Body (HTML allowed — &lt;p&gt;, &lt;br&gt;, &lt;strong&gt;, &lt;a&gt;)</Label>
          <Textarea
            data-testid="promo-body"
            rows={6}
            placeholder="<p>Book by Oct 31 and use code FALL15 at checkout for 15% off any ride to or from SFO. Valid for one trip per customer.</p>"
            value={form.body_html}
            onChange={update("body_html")}
            className="bg-[#0E0E0E] border-[#27272A] text-white focus-visible:ring-[#D4AF37] focus-visible:border-[#D4AF37] mt-1 font-mono text-sm"
          />
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <Label className={labelCls}>CTA URL (optional)</Label>
            <Input
              data-testid="promo-cta-url"
              placeholder="https://turanelitelimo.com/?utm_source=promo"
              value={form.cta_url}
              onChange={update("cta_url")}
              className={inputCls}
            />
          </div>
          <div>
            <Label className={labelCls}>CTA button label (optional)</Label>
            <Input
              data-testid="promo-cta-label"
              placeholder="Book now"
              value={form.cta_label}
              onChange={update("cta_label")}
              maxLength={40}
              className={inputCls}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-3 pt-2">
          <Button
            data-testid="promo-preview-btn"
            onClick={preview}
            disabled={busy}
            variant="outline"
            className="border-[#D4AF37]/40 text-[#D4AF37] hover:bg-[#D4AF37]/10 rounded-full"
          >
            {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Eye className="w-4 h-4 mr-2" />}
            Preview
          </Button>
          <Button
            data-testid="promo-test-btn"
            onClick={sendTest}
            disabled={busy}
            variant="outline"
            className="border-white/20 text-white/80 hover:bg-white/5 rounded-full"
          >
            <Send className="w-4 h-4 mr-2" />
            Send test to me
          </Button>
          <Button
            data-testid="promo-send-btn"
            onClick={sendLive}
            disabled={busy || !optInCount}
            className="bg-[#D4AF37] text-black hover:bg-[#B3922E] rounded-full"
          >
            {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
            Send to {optInCount ?? "—"} subscribers
          </Button>
        </div>
      </div>

      {/* Preview pane */}
      {previewHtml && (
        <div data-testid="promo-preview-pane" className="rounded-2xl border border-[#27272A] bg-[#0A0A0A] p-4">
          <div className="text-[10px] uppercase tracking-[0.2em] text-white/45 mb-3 flex items-center gap-2">
            <Eye className="w-3 h-3" /> Live preview
          </div>
          <div className="bg-[#0a0a0a] rounded-lg overflow-hidden">
            <iframe
              srcDoc={previewHtml}
              title="Promo preview"
              className="w-full"
              style={{ height: 600, border: 0, background: "#0a0a0a" }}
            />
          </div>
        </div>
      )}

      {/* Send history */}
      <div className="rounded-2xl border border-[#27272A] bg-[#0A0A0A] p-5">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <h3 className="font-serif text-lg text-white">Send history</h3>
            <p className="text-xs text-white/55 mt-1">Most recent 50 broadcasts</p>
          </div>
          {loadingHistory && <Loader2 className="w-4 h-4 animate-spin text-[#D4AF37]" />}
        </div>
        {!loadingHistory && history.length === 0 && (
          <div className="text-center py-8 text-white/40 text-sm">No broadcasts sent yet.</div>
        )}
        <div className="space-y-2">
          {history.map((h) => (
            <div
              key={h.id || h.sent_at}
              data-testid={`promo-history-${h.id}`}
              className="rounded-lg border border-[#1f1f1f] bg-[#0E0E0E] p-3 flex items-center justify-between gap-4 text-sm"
            >
              <div className="flex-1 min-w-0">
                <div className="text-white truncate">{h.subject}</div>
                <div className="text-xs text-white/45 mt-0.5 flex items-center gap-3">
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {new Date(h.sent_at).toLocaleString()}</span>
                  <span className="flex items-center gap-1 text-[#43c759]"><CheckCircle2 className="w-3 h-3" /> {h.sent_count} sent</span>
                  {h.failed_count > 0 && (
                    <span className="flex items-center gap-1 text-orange-400"><AlertCircle className="w-3 h-3" /> {h.failed_count} failed</span>
                  )}
                </div>
              </div>
              <Users className="w-4 h-4 text-white/30 flex-shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
