import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, MessageSquare, Phone, Mail, Trash2, DollarSign, Send, Copy, CheckCircle2 } from "lucide-react";

import { api, formatApiErrorDetail } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

const STATUS_BADGE = {
  new: { label: "New", className: "bg-[#D4AF37]/15 text-[#D4AF37] border-[#D4AF37]/30" },
  contacted: { label: "Contacted", className: "bg-blue-500/15 text-blue-300 border-blue-500/30" },
  quoted: { label: "Quoted", className: "bg-purple-500/15 text-purple-300 border-purple-500/30" },
  won: { label: "Won", className: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  lost: { label: "Lost", className: "bg-white/5 text-white/40 border-white/10" },
};

const fmtMoney = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(n || 0));

export default function QuoteRequestsTab() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [quoteModal, setQuoteModal] = useState(null); // { request, ... }

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/quote-requests");
      setItems(data || []);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Couldn't load quote requests");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const setStatus = (id, status) => {
    api
      .patch(`/admin/quote-requests/${id}`, { status })
      .then(() => {
        setItems((arr) => arr.map((q) => (q.id === id ? { ...q, status } : q)));
      })
      .catch((err) => {
        toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Update failed");
      });
  };

  const remove = async (q) => {
    if (!window.confirm(`Delete this quote request from ${q.full_name}?`)) return;
    try {
      await api.delete(`/admin/quote-requests/${q.id}`);
      setItems((arr) => arr.filter((x) => x.id !== q.id));
      toast.success("Removed");
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Delete failed");
    }
  };

  const onQuoteSent = (updatedRequest, confirmUrl, sentTo) => {
    setItems((arr) => arr.map((x) => (x.id === updatedRequest.id ? { ...x, ...updatedRequest } : x)));
    setQuoteModal({ request: updatedRequest, confirm_url: confirmUrl, sent_to: sentTo, phase: "sent" });
  };

  const newCount = items.filter((q) => (q.status || "new") === "new").length;

  return (
    <div className="space-y-6" data-testid="quote-requests-tab">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-serif text-2xl text-white">Quote requests</h2>
          <p className="text-xs text-white/55 mt-1 max-w-2xl leading-relaxed">
            Customers who tapped <strong className="text-white/80">Request a quote</strong> on Party Bus, Sprinter Van, or Stretch Limo. Tap{" "}
            <span className="text-[#D4AF37] font-semibold">Send Quote</span> to email + SMS them a one-tap &ldquo;Confirm &amp; Pay Deposit&rdquo; link.
          </p>
        </div>
        {newCount > 0 && (
          <Badge className="bg-[#D4AF37] text-black border-0 text-xs">
            {newCount} new
          </Badge>
        )}
      </div>

      {loading ? (
        <div className="py-10 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-[#D4AF37]" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-[#1F1F1F] bg-[#0A0A0A] p-10 text-center">
          <MessageSquare className="w-8 h-8 mx-auto text-white/30 mb-3" />
          <div className="text-white/65">No quote requests yet.</div>
          <div className="text-xs text-white/40 mt-1">
            They&apos;ll appear here the moment a customer submits one for a call-only vehicle.
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((q) => {
            const status = q.status || "new";
            const badge = STATUS_BADGE[status] || STATUS_BADGE.new;
            const phoneTel = (q.phone || "").replace(/[^\d+]/g, "");
            return (
              <div
                key={q.id}
                data-testid={`quote-row-${q.id}`}
                className="rounded-xl border border-[#1F1F1F] bg-[#0A0A0A] p-5"
              >
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white font-medium">{q.full_name}</span>
                      <Badge className={`${badge.className} text-[10px] uppercase tracking-wider border`}>{badge.label}</Badge>
                      <span className="text-[10px] uppercase tracking-[0.2em] text-[#D4AF37] bg-[#D4AF37]/10 px-2 py-0.5 rounded">{q.vehicle_type}</span>
                      {q.occasion && (
                        <span className="text-[10px] uppercase tracking-wider text-white/40 bg-white/5 px-2 py-0.5 rounded">{q.occasion}</span>
                      )}
                      {q.quoted_price && (
                        <span className="text-[10px] uppercase tracking-wider text-purple-300 bg-purple-500/10 px-2 py-0.5 rounded">
                          Quoted {fmtMoney(q.quoted_price)}
                        </span>
                      )}
                    </div>
                    <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5 text-xs text-white/65">
                      <div className="flex items-center gap-1.5">
                        <Phone className="w-3 h-3 text-[#D4AF37]" />
                        <a href={`tel:${phoneTel}`} className="hover:text-white">{q.phone}</a>
                      </div>
                      {q.email && (
                        <div className="flex items-center gap-1.5">
                          <Mail className="w-3 h-3 text-[#D4AF37]" />
                          <a href={`mailto:${q.email}`} className="hover:text-white truncate">{q.email}</a>
                        </div>
                      )}
                      {(q.pickup_date || q.pickup_time) && (
                        <div>📅 {q.pickup_date} {q.pickup_time}</div>
                      )}
                      {q.passengers && <div>👥 {q.passengers} pax</div>}
                      {q.pickup_location && <div className="md:col-span-2 truncate">📍 Pick: {q.pickup_location}</div>}
                      {q.dropoff_location && <div className="md:col-span-2 truncate">🎯 Drop: {q.dropoff_location}</div>}
                    </div>
                    {q.notes && (
                      <div className="mt-3 text-xs text-white/55 bg-white/[0.02] rounded-lg p-3 leading-relaxed">
                        <span className="text-[10px] uppercase tracking-wider text-white/35 mr-2">Notes</span>
                        {q.notes}
                      </div>
                    )}
                    <div className="text-[10px] text-white/35 mt-3">
                      Received {q.created_at ? new Date(q.created_at).toLocaleString() : "?"}
                      {q.confirmed_at && q.confirmation_number && (
                        <span className="ml-3 text-emerald-300/80">· Confirmed → #{q.confirmation_number}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 items-end flex-shrink-0">
                    {status !== "won" && (
                      <button
                        type="button"
                        onClick={() => setQuoteModal({ request: q, phase: "edit" })}
                        data-testid={`quote-send-${q.id}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#D4AF37] text-black text-xs font-semibold hover:bg-[#B3922E]"
                      >
                        <DollarSign className="w-3 h-3" /> {q.quoted_price ? "Re-send quote" : "Send quote"}
                      </button>
                    )}
                    <a
                      href={`tel:${phoneTel}`}
                      data-testid={`quote-call-${q.id}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-transparent border border-white/15 text-white/75 text-xs hover:bg-white/5"
                    >
                      <Phone className="w-3 h-3" /> Call
                    </a>
                    <Select value={status} onValueChange={(v) => setStatus(q.id, v)}>
                      <SelectTrigger
                        data-testid={`quote-status-${q.id}`}
                        className="h-8 bg-[#0E0E0E] border-[#27272A] text-white text-xs w-32"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-[#0E0E0E] border-[#27272A] text-white">
                        <SelectItem value="new">New</SelectItem>
                        <SelectItem value="contacted">Contacted</SelectItem>
                        <SelectItem value="quoted">Quoted</SelectItem>
                        <SelectItem value="won">Won</SelectItem>
                        <SelectItem value="lost">Lost</SelectItem>
                      </SelectContent>
                    </Select>
                    <button
                      type="button"
                      onClick={() => remove(q)}
                      data-testid={`quote-delete-${q.id}`}
                      className="p-1.5 rounded text-white/35 hover:text-red-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <SendQuoteDialog
        state={quoteModal}
        onClose={() => setQuoteModal(null)}
        onSent={onQuoteSent}
      />
    </div>
  );
}

// ------- Modal: enter price/deposit/notes, optionally affiliate, then email + SMS -------

function SendQuoteDialog({ state, onClose, onSent }) {
  const q = state?.request;
  const phase = state?.phase || "edit";
  const [price, setPrice] = useState("");
  const [depositPct, setDepositPct] = useState("50");
  const [notes, setNotes] = useState("");
  const [affiliateCost, setAffiliateCost] = useState("");
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (q && phase === "edit") {
      setPrice(q.quoted_price ? String(q.quoted_price) : "");
      setDepositPct(q.deposit_pct ? String(q.deposit_pct) : "50");
      setNotes(q.quoted_notes || "");
      setAffiliateCost(q.affiliate_cost ? String(q.affiliate_cost) : "");
      setCopied(false);
    }
  }, [q, phase]);

  if (!state) return null;

  const numericPrice = Number(price);
  const numericPct = Number(depositPct);
  const deposit = isFinite(numericPrice) && isFinite(numericPct) ? (numericPrice * numericPct) / 100 : 0;
  const profit = isFinite(numericPrice) && affiliateCost ? numericPrice - Number(affiliateCost) : null;

  const send = async () => {
    if (!numericPrice || numericPrice < 1) {
      toast.error("Enter a valid price.");
      return;
    }
    setSending(true);
    try {
      const { data } = await api.patch(`/admin/quote-requests/${q.id}`, {
        quoted_price: numericPrice,
        deposit_pct: numericPct,
        quoted_notes: notes || null,
        affiliate_cost: affiliateCost ? Number(affiliateCost) : null,
        status: "quoted",
        send_to_customer: true,
      });
      toast.success(data.sent_to ? `Quote emailed to ${data.sent_to}` : "Quote saved");
      onSent(data.quote, data.confirm_url, data.sent_to);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Couldn't send quote");
    } finally {
      setSending(false);
    }
  };

  const copyLink = async () => {
    if (!state.confirm_url) return;
    try {
      await navigator.clipboard.writeText(state.confirm_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Copy failed — long-press the link to copy manually.");
    }
  };

  return (
    <Dialog open={!!state} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        data-testid="send-quote-dialog"
        className="bg-[#0c0c0c] border-[#1f1f1f] text-white max-w-lg max-h-[90vh] overflow-y-auto"
      >
        {phase === "sent" ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-white flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" /> Quote sent
              </DialogTitle>
              <DialogDescription className="text-white/55">
                {state.sent_to
                  ? <>Customer was emailed at <span className="text-white">{state.sent_to}</span> and texted at <span className="text-white">{q.phone}</span>.</>
                  : <>SMS was sent to <span className="text-white">{q.phone}</span>. No email on file.</>}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 mt-2">
              <label className="text-[10px] uppercase tracking-[0.18em] text-white/45">Confirm link (share manually if needed)</label>
              <div className="flex items-center gap-2">
                <Input
                  data-testid="quote-confirm-link"
                  readOnly
                  value={state.confirm_url || ""}
                  className="bg-[#0E0E0E] border-[#27272A] text-white text-xs"
                />
                <Button
                  type="button"
                  onClick={copyLink}
                  className="bg-[#D4AF37] text-black hover:bg-[#B3922E] flex-shrink-0"
                  data-testid="quote-copy-link"
                >
                  {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
              <p className="text-xs text-white/45 leading-relaxed">
                The customer can tap that link to view the trip details, then pay the deposit via Stripe in one tap. When they pay, this request flips to <span className="text-emerald-300">Won</span> automatically and a booking is created.
              </p>
            </div>
            <DialogFooter>
              <Button onClick={onClose} className="bg-white/10 hover:bg-white/15 text-white">Close</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="text-white">Send quote to {q?.full_name}</DialogTitle>
              <DialogDescription className="text-white/55">
                Sends a branded email + SMS with a one-tap <strong className="text-[#D4AF37]">Confirm &amp; Pay Deposit</strong> link.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] uppercase tracking-[0.18em] text-white/45 mb-2 block">Flat rate (USD)</label>
                <Input
                  data-testid="quote-price-input"
                  type="number"
                  inputMode="decimal"
                  placeholder="e.g. 649"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="bg-[#0E0E0E] border-[#27272A] text-white text-lg h-12"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-[0.18em] text-white/45 mb-2 block">Deposit %</label>
                <Input
                  data-testid="quote-deposit-pct"
                  type="number"
                  inputMode="decimal"
                  value={depositPct}
                  onChange={(e) => setDepositPct(e.target.value)}
                  className="bg-[#0E0E0E] border-[#27272A] text-white"
                />
                {deposit > 0 && (
                  <div className="text-xs text-white/55 mt-2">
                    Customer pays <span className="text-[#D4AF37] font-semibold">{fmtMoney(deposit)}</span> deposit today, balance day-before.
                  </div>
                )}
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-[0.18em] text-white/45 mb-2 block">
                  Affiliate cost <span className="text-white/35 normal-case tracking-normal">(optional, internal only)</span>
                </label>
                <Input
                  data-testid="quote-affiliate-cost"
                  type="number"
                  inputMode="decimal"
                  placeholder="What you pay your affiliate (e.g. 480)"
                  value={affiliateCost}
                  onChange={(e) => setAffiliateCost(e.target.value)}
                  className="bg-[#0E0E0E] border-[#27272A] text-white"
                />
                {profit !== null && (
                  <div className="text-xs mt-2">
                    Your profit on this trip: <span className={profit >= 0 ? "text-emerald-400 font-semibold" : "text-red-400 font-semibold"}>{fmtMoney(profit)}</span>
                  </div>
                )}
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-[0.18em] text-white/45 mb-2 block">
                  Notes for customer <span className="text-white/35 normal-case tracking-normal">(optional — shown on the confirm page)</span>
                </label>
                <Textarea
                  data-testid="quote-notes"
                  rows={3}
                  placeholder="e.g. Includes 3-hour minimum. Additional time billed at $150/hr in 30-min increments."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="bg-[#0E0E0E] border-[#27272A] text-white text-sm"
                />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button onClick={onClose} disabled={sending} className="bg-white/10 hover:bg-white/15 text-white">Cancel</Button>
              <Button
                onClick={send}
                disabled={sending || !numericPrice}
                data-testid="quote-send-button"
                className="bg-[#D4AF37] text-black hover:bg-[#B3922E] disabled:opacity-60"
              >
                {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                Send quote to customer
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
