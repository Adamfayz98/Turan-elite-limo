import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Send, Smartphone, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api, formatApiErrorDetail } from "@/lib/api";

/**
 * Admin tab: send a marketing push notification to all customers who have an
 * Expo push token saved on their account (the "uber/doordash promo style"
 * notification). Reuses the existing _send_expo_push helper in the backend.
 *
 * Title and body have Apple/Google length limits — we cap & show counts.
 */
export default function PushBroadcastTab() {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [deepLink, setDeepLink] = useState("");
  const [eligible, setEligible] = useState(null); // {count}
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    refresh();
  }, []);

  const refresh = async () => {
    try {
      const [{ data: stats }, { data: hist }] = await Promise.all([
        api.get("/admin/push/eligible-count"),
        api.get("/admin/push/history"),
      ]);
      setEligible(stats);
      setHistory(hist?.items || []);
    } catch (e) {
      console.warn("PushBroadcastTab refresh failed", e);
    }
  };

  const send = async (testOnly) => {
    const trimmedTitle = title.trim();
    const trimmedBody = message.trim();
    if (trimmedTitle.length < 3) {
      toast.error("Title too short");
      return;
    }
    if (trimmedBody.length < 5) {
      toast.error("Message too short");
      return;
    }
    setSending(true);
    try {
      const { data } = await api.post("/admin/push/broadcast", {
        title: trimmedTitle,
        body: trimmedBody,
        deep_link: deepLink.trim() || null,
        test_only: !!testOnly,
      });
      if (testOnly) {
        toast.success(`Test push sent to ${data.recipients} device(s)`);
      } else {
        toast.success(`Sent to ${data.sent} of ${data.total} devices${data.failed ? ` · ${data.failed} failed` : ""}`);
        setTitle("");
        setMessage("");
        setDeepLink("");
      }
      refresh();
    } catch (e) {
      toast.error(formatApiErrorDetail(e) || "Push send failed");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="push-broadcast-tab">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl text-white flex items-center gap-2">
            <BellRing className="w-5 h-5 text-[#D4AF37]" /> Push Broadcast
          </h2>
          <p className="text-white/50 text-sm mt-1">
            Send a marketing push to all customers who installed the iOS or Android app.
          </p>
        </div>
        <div className="text-right">
          <p className="text-white/40 text-[10px] tracking-[0.25em] uppercase">Reachable devices</p>
          <p className="text-2xl text-[#D4AF37] mt-1" data-testid="push-broadcast-eligible">
            {eligible?.count ?? "…"}
          </p>
        </div>
      </div>

      {/* Compose */}
      <div className="p-6 rounded-xl border border-white/10 bg-white/[0.02] space-y-4">
        <div>
          <label className="block text-white/60 text-xs mb-2">
            Title <span className="text-white/30">({title.length}/40 — appears bold on screen)</span>
          </label>
          <Input
            data-testid="push-title"
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, 40))}
            placeholder="$20 off this weekend · Ride from $59"
            className="bg-black/40 border-white/10 text-white"
          />
        </div>

        <div>
          <label className="block text-white/60 text-xs mb-2">
            Message <span className="text-white/30">({message.length}/160)</span>
          </label>
          <Textarea
            data-testid="push-body"
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, 160))}
            rows={3}
            placeholder="Use code WEEKEND20 at checkout. Valid on any chauffeur ride this Sat & Sun."
            className="bg-black/40 border-white/10 text-white"
          />
        </div>

        <div>
          <label className="block text-white/60 text-xs mb-2">
            Deep link <span className="text-white/30">(optional — where the notification opens)</span>
          </label>
          <Input
            data-testid="push-deep-link"
            value={deepLink}
            onChange={(e) => setDeepLink(e.target.value)}
            placeholder="https://www.turanelitelimo.com/wedding"
            className="bg-black/40 border-white/10 text-white"
          />
        </div>

        {/* Preview */}
        <div className="px-5 py-4 rounded-xl bg-black/60 border border-white/5" data-testid="push-preview">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-md bg-[#D4AF37] flex items-center justify-center shrink-0">
              <Smartphone className="w-5 h-5 text-black" />
            </div>
            <div className="min-w-0">
              <p className="text-white/40 text-[11px]">TuranEliteLimo · now</p>
              <p className="text-white text-sm font-medium mt-0.5 truncate">{title || "Title appears here"}</p>
              <p className="text-white/60 text-xs mt-0.5 line-clamp-2">{message || "Message appears here…"}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 pt-2">
          <Button
            data-testid="push-send-test"
            disabled={sending}
            onClick={() => send(true)}
            variant="outline"
            className="border-white/20 text-white hover:bg-white/5 gap-2"
          >
            Send Test (own device only)
          </Button>
          <Button
            data-testid="push-send-live"
            disabled={sending || !eligible?.count}
            onClick={() => send(false)}
            className="bg-[#D4AF37] hover:bg-[#D4AF37]/90 text-black gap-2"
          >
            <Send className="w-4 h-4" />
            {sending ? "Sending…" : `Send to ${eligible?.count ?? 0} devices`}
          </Button>
        </div>
      </div>

      {/* History */}
      {history.length > 0 && (
        <div className="p-6 rounded-xl border border-white/10 bg-white/[0.02]">
          <h3 className="text-white text-sm font-medium mb-4">Recent broadcasts</h3>
          <div className="space-y-3">
            {history.map((h) => (
              <div key={h.id} className="flex items-center justify-between gap-4 py-2 border-b border-white/5 last:border-0">
                <div className="min-w-0">
                  <p className="text-white text-sm truncate">{h.title}</p>
                  <p className="text-white/40 text-xs mt-0.5 truncate">{h.body}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[#D4AF37] text-xs">{h.sent}/{h.total}</p>
                  <p className="text-white/30 text-[10px] mt-0.5">
                    {h.sent_at ? new Date(h.sent_at).toLocaleString() : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
