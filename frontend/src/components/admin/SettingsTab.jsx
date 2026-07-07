import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Save, Percent, DollarSign, Shield, Mail } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { api, formatApiErrorDetail } from "@/lib/api";
import { cn } from "@/lib/utils";

export default function SettingsTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({
    deposit_percent: 100, currency: "usd", meet_greet_fee: 35, service_fee_percent: 0,
    per_stop_fee: 15,
    cancellation_tiers: [{hours_before_pickup: 24, refund_percent: 100}, {hours_before_pickup: 6, refund_percent: 50}, {hours_before_pickup: 0, refund_percent: 0}],
    safety_review_threshold: 1500,
    safety_phone_verify_required: false,
    safety_phone_verify_threshold: 0,
  });

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/settings");
      setSettings(data);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        deposit_percent: Number(settings.deposit_percent) || 0,
        currency: settings.currency || "usd",
        meet_greet_fee: Number(settings.meet_greet_fee) || 0,
        service_fee_percent: Number(settings.service_fee_percent) || 0,
        per_stop_fee: Number(settings.per_stop_fee) || 0,
        cancellation_tiers: (settings.cancellation_tiers || []).map((t) => ({
          hours_before_pickup: Number(t.hours_before_pickup) || 0,
          refund_percent: Number(t.refund_percent) || 0,
        })),
        safety_review_threshold: Number(settings.safety_review_threshold) || 0,
        safety_phone_verify_required: !!settings.safety_phone_verify_required,
        safety_phone_verify_threshold: Number(settings.safety_phone_verify_threshold) || 0,
      };
      await api.patch("/admin/settings", payload);
      toast.success("Settings saved");
      load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Failed to save");
    } finally {
      setSaving(false);
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
    <div data-testid="settings-tab" className="rounded-2xl border border-[#1F1F1F] bg-[#0A0A0A] p-6 md:p-8">
      <h3 className="font-serif text-2xl">Payment settings</h3>
      <p className="text-sm text-white/55 mt-1">
        Controls how Stripe charges your customers when they click <em>Pay</em>.
      </p>

      <div className="mt-8 grid md:grid-cols-2 gap-5">
        <div>
          <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">
            Deposit % collected at booking
          </Label>
          <div className="mt-2 flex items-center gap-3">
            <Input
              type="number"
              min={0}
              max={100}
              data-testid="settings-deposit-percent"
              value={settings.deposit_percent}
              onChange={(e) =>
                setSettings((s) => ({ ...s, deposit_percent: e.target.value }))
              }
              className={cn(
                "bg-[#0E0E0E] border-[#27272A] text-white focus-visible:ring-[#D4AF37] focus-visible:border-[#D4AF37] h-11 w-32",
              )}
            />
            <Percent className="w-4 h-4 text-[#D4AF37]" />
            <span className="text-xs text-white/50">100 = full payment up front, 25 = quarter deposit</span>
          </div>
        </div>

        <div>
          <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">Currency</Label>
          <Input
            data-testid="settings-currency"
            value={settings.currency || ""}
            onChange={(e) =>
              setSettings((s) => ({ ...s, currency: e.target.value.toLowerCase() }))
            }
            placeholder="usd"
            className="bg-[#0E0E0E] border-[#27272A] text-white focus-visible:ring-[#D4AF37] focus-visible:border-[#D4AF37] h-11 mt-2"
            maxLength={3}
          />
        </div>

        <div className="md:col-span-2 pt-4 border-t border-[#1F1F1F]">
          <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">
            Service fee % (covers Stripe processing)
          </Label>
          <div className="mt-2 flex items-center gap-3">
            <Input
              type="number"
              min={0}
              max={20}
              step="0.1"
              data-testid="settings-service-fee-percent"
              value={settings.service_fee_percent ?? 0}
              onChange={(e) =>
                setSettings((s) => ({ ...s, service_fee_percent: e.target.value }))
              }
              className={cn(
                "bg-[#0E0E0E] border-[#27272A] text-white focus-visible:ring-[#D4AF37] focus-visible:border-[#D4AF37] h-11 w-32",
              )}
            />
            <Percent className="w-4 h-4 text-[#D4AF37]" />
            <span className="text-xs text-white/55">
              Added transparently to every quote. <strong className="text-white/80">Recommended: 3.5%</strong> to fully cover Stripe's 2.9% + $0.30 cut on refunds. Set to 0 to disable.
            </span>
          </div>
        </div>

        <div className="md:col-span-2 pt-4 border-t border-[#1F1F1F]">
          <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">
            Cancellation refund tiers
          </Label>
          <p className="text-xs text-white/55 mt-1 mb-3 leading-relaxed">
            When a customer cancels, the "Tier refund" option in the refund dialog auto-calculates from these rules. Higher hours = more refund. The system picks the highest tier the booking still qualifies for.
          </p>
          <div className="space-y-2" data-testid="settings-cancellation-tiers">
            {(settings.cancellation_tiers || []).map((tier, idx) => (
              <div
                key={idx}
                className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2 rounded-lg border border-[#27272A] bg-[#0E0E0E] px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs text-white/50 whitespace-nowrap">{">"}=</span>
                  <Input
                    type="number"
                    min={0}
                    step="1"
                    data-testid={`tier-hours-${idx}`}
                    value={tier.hours_before_pickup ?? 0}
                    onChange={(e) =>
                      setSettings((s) => {
                        const next = [...(s.cancellation_tiers || [])];
                        next[idx] = { ...next[idx], hours_before_pickup: e.target.value };
                        return { ...s, cancellation_tiers: next };
                      })
                    }
                    className="bg-[#0A0A0A] border-[#27272A] text-white focus-visible:ring-[#D4AF37] focus-visible:border-[#D4AF37] h-9 w-20"
                  />
                  <span className="text-xs text-white/65 whitespace-nowrap">hours before</span>
                </div>
                <span className="text-xs text-white/40">→</span>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step="1"
                    data-testid={`tier-percent-${idx}`}
                    value={tier.refund_percent ?? 0}
                    onChange={(e) =>
                      setSettings((s) => {
                        const next = [...(s.cancellation_tiers || [])];
                        next[idx] = { ...next[idx], refund_percent: e.target.value };
                        return { ...s, cancellation_tiers: next };
                      })
                    }
                    className="bg-[#0A0A0A] border-[#27272A] text-white focus-visible:ring-[#D4AF37] focus-visible:border-[#D4AF37] h-9 w-20"
                  />
                  <Percent className="w-3.5 h-3.5 text-[#D4AF37]" />
                  <span className="text-xs text-white/55 whitespace-nowrap">refund</span>
                </div>
                <button
                  type="button"
                  data-testid={`tier-remove-${idx}`}
                  onClick={() =>
                    setSettings((s) => ({
                      ...s,
                      cancellation_tiers: (s.cancellation_tiers || []).filter((_, i) => i !== idx),
                    }))
                  }
                  className="text-white/40 hover:text-red-400 text-[10px] uppercase tracking-wider px-2"
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              data-testid="tier-add"
              onClick={() =>
                setSettings((s) => ({
                  ...s,
                  cancellation_tiers: [...(s.cancellation_tiers || []), { hours_before_pickup: 0, refund_percent: 0 }],
                }))
              }
              className="text-[#D4AF37] hover:underline text-xs uppercase tracking-wider"
            >
              + Add tier
            </button>
          </div>
        </div>

        <div className="md:col-span-2 pt-4 border-t border-[#1F1F1F]">
          <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">
            Per-stop flat fee
          </Label>
          <div className="mt-2 flex items-center gap-3">
            <div className="relative w-40">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#D4AF37]" />
              <Input
                type="number"
                min={0}
                step="0.01"
                data-testid="settings-per-stop-fee"
                value={settings.per_stop_fee ?? 0}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, per_stop_fee: e.target.value }))
                }
                className={cn(
                  "bg-[#0E0E0E] border-[#27272A] text-white focus-visible:ring-[#D4AF37] focus-visible:border-[#D4AF37] h-11 pl-9",
                )}
              />
            </div>
            <span className="text-xs text-white/55">
              Flat fee charged for each <em>additional stop</em> the customer adds on a transfer trip.{" "}
              <strong className="text-white/80">Industry standard: $15–25</strong>. Doesn't apply to Hourly Chauffeur bookings (stops are included in the hourly clock). Set to 0 to disable.
            </span>
          </div>
        </div>

        <div className="md:col-span-2 pt-4 border-t border-[#1F1F1F]">
          <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">
            Meet &amp; Greet flat fee (Airport Transfers)
          </Label>
          <div className="mt-2 flex items-center gap-3">
            <div className="relative w-40">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#D4AF37]" />
              <Input
                type="number"
                min={0}
                step="0.01"
                data-testid="settings-meet-greet-fee"
                value={settings.meet_greet_fee ?? 0}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, meet_greet_fee: e.target.value }))
                }
                className={cn(
                  "bg-[#0E0E0E] border-[#27272A] text-white focus-visible:ring-[#D4AF37] focus-visible:border-[#D4AF37] h-11 pl-9",
                )}
              />
            </div>
            <span className="text-xs text-white/55">
              Added when customer toggles <em>Meet &amp; Greet</em> on an Airport Transfer booking. Set to 0 to disable.
            </span>
          </div>
        </div>

        {/* ---------- Safety / anti-fraud ---------- */}
        <div className="md:col-span-2 pt-6 mt-2 border-t border-[#1F1F1F]">
          <div className="flex items-center gap-2 mb-1">
            <Shield className="w-4 h-4 text-[#D4AF37]" />
            <h4 className="font-serif text-lg text-white">Safety &amp; anti-fraud</h4>
          </div>
          <p className="text-xs text-white/55 mb-5 max-w-2xl leading-relaxed">
            Risk scoring runs automatically on every quote &amp; booking. Use the dedicated <em>Safety</em> tab for the review queue, blacklist, &amp; IP lookup. Below are the global thresholds.
          </p>

          <div className="grid md:grid-cols-2 gap-5">
            <div>
              <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">
                Manual-review threshold ($)
              </Label>
              <div className="mt-2 flex items-center gap-3">
                <div className="relative w-40">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#D4AF37]" />
                  <Input
                    type="number"
                    min={0}
                    step="50"
                    data-testid="settings-safety-review-threshold"
                    value={settings.safety_review_threshold ?? 1500}
                    onChange={(e) => setSettings((s) => ({ ...s, safety_review_threshold: e.target.value }))}
                    className="bg-[#0E0E0E] border-[#27272A] text-white h-11 pl-9"
                  />
                </div>
                <span className="text-xs text-white/55">
                  Any quote/booking above this dollar amount auto-enters the Safety review queue. <strong className="text-white/80">Default $1,500</strong>. Set 0 to disable.
                </span>
              </div>
            </div>

            <div className="md:col-span-2 pt-4 border-t border-[#1F1F1F]">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">
                    Require phone verification on high-value quotes
                  </Label>
                  <p className="text-xs text-white/55 mt-2 max-w-xl leading-relaxed">
                    When enabled, the customer must complete a 6-digit phone OTP before paying the deposit on quotes above the threshold. <strong className="text-amber-300">Currently MOCKED</strong> — Twilio Verify keys aren't set; you can read the active code from the <em>Safety → Pending OTPs</em> tab. Add <code className="text-[#D4AF37] text-[10px]">TWILIO_VERIFY_SID</code> to enable real SMS.
                  </p>
                </div>
                <Switch
                  checked={!!settings.safety_phone_verify_required}
                  onCheckedChange={(v) => setSettings((s) => ({ ...s, safety_phone_verify_required: v }))}
                  data-testid="settings-safety-phone-verify"
                />
              </div>

              {settings.safety_phone_verify_required && (
                <div className="mt-4">
                  <Label className="text-[10px] uppercase tracking-[0.2em] text-white/50">
                    Phone-verify required above ($)
                  </Label>
                  <div className="mt-2 flex items-center gap-3">
                    <div className="relative w-40">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#D4AF37]" />
                      <Input
                        type="number"
                        min={0}
                        step="50"
                        data-testid="settings-safety-phone-verify-threshold"
                        value={settings.safety_phone_verify_threshold ?? 0}
                        onChange={(e) => setSettings((s) => ({ ...s, safety_phone_verify_threshold: e.target.value }))}
                        className="bg-[#0E0E0E] border-[#27272A] text-white h-11 pl-9"
                      />
                    </div>
                    <span className="text-xs text-white/55">
                      Quotes at or above this dollar amount must pass OTP. Set 0 to require for every quote.
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 flex justify-end">
        <Button
          onClick={save}
          disabled={saving}
          data-testid="settings-save"
          className="bg-[#D4AF37] text-black hover:bg-[#B3922E] rounded-full px-6 h-11"
        >
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Save settings
        </Button>
      </div>

      <WeeklyDigestCard />
    </div>
  );
}

function WeeklyDigestCard() {
  const [sending, setSending] = useState(false);
  const [preview, setPreview] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const loadPreview = async () => {
    setLoadingPreview(true);
    try {
      const { data } = await api.get("/admin/weekly-digest/preview");
      setPreview(data.data);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Failed to load preview");
    } finally {
      setLoadingPreview(false);
    }
  };

  const sendNow = async () => {
    setSending(true);
    try {
      const { data } = await api.post("/admin/weekly-digest/send", {});
      toast.success(`Digest sent to ${data.sent_to || "admin"}`);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Failed to send digest");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mt-10 border-t border-white/5 pt-8" data-testid="weekly-digest-card">
      <div className="flex items-start gap-3 mb-4">
        <Mail className="w-5 h-5 text-[#D4AF37] mt-0.5" />
        <div>
          <h3 className="text-white text-base font-medium">Weekly performance digest</h3>
          <p className="text-white/50 text-sm mt-1 max-w-xl leading-relaxed">
            An automated Monday-morning email summary of last week&apos;s bookings, revenue, quote-request funnel, and a Google Ads attribution gap check. Scheduled for every Monday 9 AM Pacific. You can also preview or send it on demand below.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button
          onClick={loadPreview}
          disabled={loadingPreview}
          variant="outline"
          data-testid="weekly-digest-preview-btn"
          className="rounded-full border-white/15 hover:bg-white/5"
        >
          {loadingPreview ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
          Preview last 7 days
        </Button>
        <Button
          onClick={sendNow}
          disabled={sending}
          data-testid="weekly-digest-send-btn"
          className="bg-[#D4AF37] text-black hover:bg-[#B3922E] rounded-full"
        >
          {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Mail className="w-4 h-4 mr-2" />}
          Send digest email now
        </Button>
      </div>

      {preview && (
        <div
          className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm"
          data-testid="weekly-digest-preview-grid"
        >
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <p className="text-white/40 text-[10px] tracking-widest uppercase mb-1">Bookings created</p>
            <p className="text-white text-2xl font-light">{preview.bookings_created}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <p className="text-white/40 text-[10px] tracking-widest uppercase mb-1">Paid / confirmed</p>
            <p className="text-[#D4AF37] text-2xl font-light">{preview.bookings_paid}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <p className="text-white/40 text-[10px] tracking-widest uppercase mb-1">Revenue (paid)</p>
            <p className="text-[#D4AF37] text-2xl font-light">${Math.round(preview.total_revenue).toLocaleString()}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <p className="text-white/40 text-[10px] tracking-widest uppercase mb-1">Quote-to-win rate</p>
            <p className="text-white text-2xl font-light">{preview.quote_to_win_rate}%</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 col-span-2 md:col-span-4">
            <p className="text-white/40 text-[10px] tracking-widest uppercase mb-2">Period</p>
            <p className="text-white/80 text-sm">{preview.period_start} → {preview.period_end}</p>
          </div>
        </div>
      )}
    </div>
  );
}
