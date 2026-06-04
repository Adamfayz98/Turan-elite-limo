import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Plus,
  Loader2,
  Copy,
  ExternalLink,
  Send,
  Ban,
  Mail,
  Phone,
  MapPin,
  CheckCircle2,
  Circle,
  XCircle,
} from "lucide-react";

import { api, formatApiErrorDetail } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const VEHICLE_OPTIONS = [
  "Executive Sedan",
  "Luxury SUV",
  "Sprinter Van (Standard)",
  "Executive Sprinter",
  "Jet Sprinter",
  "Stretch Limousine",
  "Party Bus",
  "Custom — see notes",
];

const EMPTY_FORM = {
  client_name: "",
  client_email: "",
  client_phone: "",
  pickup_datetime: "",
  pickup_location: "",
  dropoff_location: "",
  vehicle_type: "",
  passengers: "",
  amount: "",
  affiliate_id: "",
  affiliate_cost: "",
  description: "",
  internal_notes: "",
};

function statusBadge(s) {
  if (s === "paid")
    return { label: "Paid", icon: CheckCircle2, cls: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" };
  if (s === "cancelled")
    return { label: "Cancelled", icon: XCircle, cls: "text-red-400 bg-red-500/10 border-red-500/30" };
  return { label: "Sent · Awaiting Payment", icon: Circle, cls: "text-[#D4AF37] bg-[#D4AF37]/10 border-[#D4AF37]/30" };
}

export default function InvoicesTab() {
  const [items, setItems] = useState([]);
  const [affiliates, setAffiliates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [filter, setFilter] = useState("all");

  const load = async () => {
    setLoading(true);
    try {
      const [invs, affs] = await Promise.all([
        api.get("/admin/invoices"),
        api.get("/admin/affiliates"),
      ]);
      setItems(invs.data || []);
      setAffiliates(affs.data || []);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Couldn't load invoices");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    if (filter === "all") return items;
    return items.filter((i) => i.status === filter);
  }, [items, filter]);

  const totals = useMemo(() => {
    const paid = items.filter((i) => i.status === "paid");
    const revenue = paid.reduce((s, i) => s + (i.amount || 0), 0);
    const profit = paid.reduce((s, i) => s + (i.profit || 0), 0);
    return {
      total: items.length,
      paid: paid.length,
      pending: items.filter((i) => i.status === "sent").length,
      revenue,
      profit,
    };
  }, [items]);

  const create = async () => {
    if (!form.client_name?.trim()) return toast.error("Client name required");
    if (!form.client_email?.trim()) return toast.error("Client email required");
    if (!form.amount || Number(form.amount) <= 0) return toast.error("Amount must be greater than 0");

    setCreating(true);
    const payload = {
      client_name: form.client_name.trim(),
      client_email: form.client_email.trim(),
      client_phone: form.client_phone?.trim() || null,
      pickup_datetime: form.pickup_datetime?.trim() || null,
      pickup_location: form.pickup_location?.trim() || null,
      dropoff_location: form.dropoff_location?.trim() || null,
      vehicle_type: form.vehicle_type || null,
      passengers: form.passengers ? Number(form.passengers) : null,
      amount: Number(form.amount),
      affiliate_id: form.affiliate_id || null,
      affiliate_cost: form.affiliate_cost ? Number(form.affiliate_cost) : null,
      description: form.description?.trim() || null,
      internal_notes: form.internal_notes?.trim() || null,
    };
    try {
      const { data } = await api.post("/admin/invoices", payload);
      toast.success(`Invoice ${data.invoice_number} created. Payment link emailed to ${data.client_email}.`);
      setShowForm(false);
      setForm(EMPTY_FORM);
      await load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Failed to create invoice");
    } finally {
      setCreating(false);
    }
  };

  const copyLink = async (link) => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Payment link copied");
    } catch {
      toast.error("Couldn't copy");
    }
  };

  const resend = async (id) => {
    try {
      await api.post(`/admin/invoices/${id}/resend`);
      toast.success("Invoice email re-sent");
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Failed to resend");
    }
  };

  const cancelInvoice = async (id, num) => {
    if (!confirm(`Cancel invoice ${num}? The payment link will keep working but the invoice will be marked cancelled.`)) return;
    try {
      await api.post(`/admin/invoices/${id}/cancel`);
      toast.success("Invoice cancelled");
      await load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Failed to cancel");
    }
  };

  const profitPreview = useMemo(() => {
    if (!form.amount || !form.affiliate_cost) return null;
    const p = Number(form.amount) - Number(form.affiliate_cost);
    return isNaN(p) ? null : p;
  }, [form.amount, form.affiliate_cost]);

  return (
    <div data-testid="invoices-tab" className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl text-white font-light">Custom Invoices</h2>
          <p className="text-white/55 text-sm mt-1 max-w-2xl">
            Send a Stripe payment link to phone/email customers — quote-only requests, out-of-territory trips, affiliate-brokered rides. Track profit on each.
          </p>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="text-white/40 text-[10px] uppercase tracking-widest">Total invoices</p>
            <p className="text-white text-2xl font-light" data-testid="invoices-total">{totals.total}</p>
          </div>
          <div className="text-right">
            <p className="text-white/40 text-[10px] uppercase tracking-widest">Paid revenue</p>
            <p className="text-white text-2xl font-light" data-testid="invoices-revenue">${totals.revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </div>
          <div className="text-right">
            <p className="text-white/40 text-[10px] uppercase tracking-widest">Net profit</p>
            <p className="text-[#D4AF37] text-2xl font-light" data-testid="invoices-profit">${totals.profit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          data-testid="invoices-create-btn"
          onClick={() => { setForm(EMPTY_FORM); setShowForm(true); }}
          className="bg-[#D4AF37] text-black hover:opacity-90"
        >
          <Plus className="w-4 h-4 mr-2" /> Create Invoice
        </Button>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-[180px] bg-[#0E0E0E] border-[#27272A] text-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-[#0E0E0E] border-[#27272A] text-white">
            <SelectItem value="all">All invoices</SelectItem>
            <SelectItem value="sent">Awaiting payment</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-white/55 py-12 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading invoices…
        </div>
      ) : filtered.length === 0 ? (
        <div className="border border-dashed border-white/15 rounded-2xl p-10 text-center" data-testid="invoices-empty">
          <p className="text-white/55 text-sm">No invoices yet.</p>
          <p className="text-white/35 text-xs mt-2 max-w-md mx-auto">
            Create one for phone-only quote requests like Cristina's Sacramento → Merced trip. Customer gets an email with a Stripe payment link.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((inv) => {
            const badge = statusBadge(inv.status);
            const BadgeIcon = badge.icon;
            return (
              <div
                key={inv.id}
                data-testid={`invoice-row-${inv.id}`}
                className="rounded-2xl border border-[#1F1F1F] bg-[#0A0A0A] p-5 hover:border-[#D4AF37]/30 transition"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  {/* Left: client + trip */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-white/40 text-[10px] tracking-widest uppercase">{inv.invoice_number}</span>
                      <span className={`inline-flex items-center gap-1 text-[10px] tracking-wider uppercase px-2 py-0.5 rounded-full border ${badge.cls}`}>
                        <BadgeIcon className="w-3 h-3" /> {badge.label}
                      </span>
                    </div>
                    <h3 className="text-white text-base mt-1">{inv.client_name}</h3>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-white/55">
                      {inv.client_email && (
                        <a href={`mailto:${inv.client_email}`} className="flex items-center gap-1 hover:text-white"><Mail className="w-3 h-3" />{inv.client_email}</a>
                      )}
                      {inv.client_phone && (
                        <a href={`tel:${inv.client_phone}`} className="flex items-center gap-1 hover:text-white"><Phone className="w-3 h-3" />{inv.client_phone}</a>
                      )}
                    </div>
                    {(inv.pickup_location || inv.dropoff_location) && (
                      <div className="flex items-center gap-2 mt-2 text-xs text-white/55">
                        <MapPin className="w-3 h-3" />
                        <span className="truncate">
                          {inv.pickup_location} {inv.dropoff_location ? `→ ${inv.dropoff_location}` : ""}
                        </span>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-[11px] text-white/45">
                      {inv.pickup_datetime && <span>📅 {inv.pickup_datetime}</span>}
                      {inv.vehicle_type && <span>🚐 {inv.vehicle_type}</span>}
                      {inv.passengers && <span>👥 {inv.passengers} pax</span>}
                      {inv.affiliate_name && <span>🤝 via {inv.affiliate_name}</span>}
                    </div>
                  </div>

                  {/* Right: amount + actions */}
                  <div className="text-right shrink-0">
                    <p className="text-white text-2xl font-light">${(inv.amount || 0).toFixed(2)}</p>
                    {inv.affiliate_cost && (
                      <p className="text-white/45 text-[11px] mt-0.5">cost ${inv.affiliate_cost.toFixed(2)}</p>
                    )}
                    {typeof inv.profit === "number" && (
                      <p className="text-[#D4AF37] text-xs mt-0.5">profit ${inv.profit.toFixed(2)}</p>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-white/5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-[#27272A] text-white/70 hover:text-white"
                    onClick={() => copyLink(inv.payment_link)}
                    data-testid={`invoice-copy-link-${inv.id}`}
                    disabled={!inv.payment_link}
                  >
                    <Copy className="w-3 h-3 mr-1.5" /> Copy link
                  </Button>
                  {inv.payment_link && (
                    <a
                      href={inv.payment_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-[#27272A] text-white/70 hover:text-white"
                    >
                      <ExternalLink className="w-3 h-3" /> Open
                    </a>
                  )}
                  {inv.status === "sent" && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-[#27272A] text-white/70 hover:text-white"
                        onClick={() => resend(inv.id)}
                        data-testid={`invoice-resend-${inv.id}`}
                      >
                        <Send className="w-3 h-3 mr-1.5" /> Resend
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-red-500/30 text-red-400 hover:bg-red-500/10"
                        onClick={() => cancelInvoice(inv.id, inv.invoice_number)}
                        data-testid={`invoice-cancel-${inv.id}`}
                      >
                        <Ban className="w-3 h-3 mr-1.5" /> Cancel
                      </Button>
                    </>
                  )}
                </div>

                {inv.internal_notes && (
                  <div className="mt-3 pt-3 border-t border-white/5 text-xs text-white/50">
                    <span className="text-white/35">Internal note:</span> {inv.internal_notes}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl bg-[#0a0a0a] border-white/10 text-white max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create custom invoice</DialogTitle>
            <DialogDescription className="text-white/55">
              Sends the client an email with a secure Stripe payment link.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
            <div className="sm:col-span-2">
              <Label className="text-white/70 text-xs">Client Name *</Label>
              <Input
                data-testid="invoice-input-name"
                value={form.client_name}
                onChange={(e) => setForm({ ...form, client_name: e.target.value })}
                className="bg-[#0E0E0E] border-[#27272A] mt-1"
              />
            </div>
            <div>
              <Label className="text-white/70 text-xs">Client Email *</Label>
              <Input
                data-testid="invoice-input-email"
                type="email"
                value={form.client_email}
                onChange={(e) => setForm({ ...form, client_email: e.target.value })}
                className="bg-[#0E0E0E] border-[#27272A] mt-1"
              />
            </div>
            <div>
              <Label className="text-white/70 text-xs">Client Phone</Label>
              <Input
                data-testid="invoice-input-phone"
                value={form.client_phone}
                onChange={(e) => setForm({ ...form, client_phone: e.target.value })}
                className="bg-[#0E0E0E] border-[#27272A] mt-1"
              />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-white/70 text-xs">Pickup Date / Time (free text)</Label>
              <Input
                data-testid="invoice-input-datetime"
                value={form.pickup_datetime}
                onChange={(e) => setForm({ ...form, pickup_datetime: e.target.value })}
                placeholder="June 13, 2026 at 1:15 AM"
                className="bg-[#0E0E0E] border-[#27272A] mt-1"
              />
            </div>
            <div>
              <Label className="text-white/70 text-xs">Pickup Location</Label>
              <Input
                data-testid="invoice-input-pickup"
                value={form.pickup_location}
                onChange={(e) => setForm({ ...form, pickup_location: e.target.value })}
                placeholder="Sacramento, CA"
                className="bg-[#0E0E0E] border-[#27272A] mt-1"
              />
            </div>
            <div>
              <Label className="text-white/70 text-xs">Dropoff Location</Label>
              <Input
                data-testid="invoice-input-dropoff"
                value={form.dropoff_location}
                onChange={(e) => setForm({ ...form, dropoff_location: e.target.value })}
                placeholder="Merced, CA"
                className="bg-[#0E0E0E] border-[#27272A] mt-1"
              />
            </div>
            <div>
              <Label className="text-white/70 text-xs">Vehicle Type</Label>
              <Select value={form.vehicle_type} onValueChange={(v) => setForm({ ...form, vehicle_type: v })}>
                <SelectTrigger data-testid="invoice-input-vehicle" className="bg-[#0E0E0E] border-[#27272A] mt-1">
                  <SelectValue placeholder="Choose..." />
                </SelectTrigger>
                <SelectContent className="bg-[#0E0E0E] border-[#27272A] text-white">
                  {VEHICLE_OPTIONS.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-white/70 text-xs">Passengers</Label>
              <Input
                data-testid="invoice-input-pax"
                type="number"
                min="1"
                value={form.passengers}
                onChange={(e) => setForm({ ...form, passengers: e.target.value })}
                className="bg-[#0E0E0E] border-[#27272A] mt-1"
              />
            </div>

            {/* Pricing */}
            <div className="sm:col-span-2 pt-3 mt-2 border-t border-white/5">
              <p className="text-white/40 text-[10px] uppercase tracking-widest mb-3">Pricing & affiliate</p>
            </div>
            <div>
              <Label className="text-white/70 text-xs">Amount client pays ($) *</Label>
              <Input
                data-testid="invoice-input-amount"
                type="number"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="595"
                className="bg-[#0E0E0E] border-[#27272A] mt-1"
              />
            </div>
            <div>
              <Label className="text-white/70 text-xs">Affiliate (if brokered)</Label>
              <Select value={form.affiliate_id} onValueChange={(v) => setForm({ ...form, affiliate_id: v })}>
                <SelectTrigger data-testid="invoice-input-affiliate" className="bg-[#0E0E0E] border-[#27272A] mt-1">
                  <SelectValue placeholder="None (we operate)" />
                </SelectTrigger>
                <SelectContent className="bg-[#0E0E0E] border-[#27272A] text-white">
                  <SelectItem value={null} disabled>— No affiliate —</SelectItem>
                  {affiliates.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}{a.city ? ` · ${a.city}` : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label className="text-white/70 text-xs">What we pay the affiliate ($) — optional</Label>
              <Input
                data-testid="invoice-input-cost"
                type="number"
                step="0.01"
                value={form.affiliate_cost}
                onChange={(e) => setForm({ ...form, affiliate_cost: e.target.value })}
                placeholder="450"
                className="bg-[#0E0E0E] border-[#27272A] mt-1"
              />
              {profitPreview !== null && (
                <p className="text-[#D4AF37] text-xs mt-2" data-testid="invoice-profit-preview">
                  Your profit on this ride: <strong>${profitPreview.toFixed(2)}</strong>
                </p>
              )}
            </div>

            <div className="sm:col-span-2">
              <Label className="text-white/70 text-xs">Customer-facing description</Label>
              <Textarea
                data-testid="invoice-input-description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="One-way overnight Sprinter Van for 3 musicians + instruments..."
                className="bg-[#0E0E0E] border-[#27272A] mt-1 min-h-[60px]"
              />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-white/70 text-xs">Internal notes (only you see this)</Label>
              <Textarea
                data-testid="invoice-input-notes"
                value={form.internal_notes}
                onChange={(e) => setForm({ ...form, internal_notes: e.target.value })}
                placeholder="Confirm pickup with affiliate driver night before. 50% deposit paid."
                className="bg-[#0E0E0E] border-[#27272A] mt-1 min-h-[60px]"
              />
            </div>

            <div className="sm:col-span-2 flex justify-end gap-3 mt-2">
              <Button variant="ghost" onClick={() => setShowForm(false)} className="text-white/70">Cancel</Button>
              <Button
                data-testid="invoice-create-submit"
                onClick={create}
                disabled={creating}
                className="bg-[#D4AF37] text-black hover:opacity-90 min-w-[140px]"
              >
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send invoice →"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
