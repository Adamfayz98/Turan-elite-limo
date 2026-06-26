import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Plus,
  Edit2,
  Trash2,
  Loader2,
  Download,
  FileText,
  Calendar as CalendarIcon,
  Filter as FilterIcon,
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

const METHODS = ["Zelle", "Venmo", "Check", "Cash", "ACH", "Wire", "PayPal", "Other"];

const today = () => new Date().toISOString().slice(0, 10);
const currentYear = () => new Date().getFullYear();

const EMPTY = {
  affiliate_id: "",
  amount: "",
  payment_date: today(),
  method: "Zelle",
  reference: "",
  booking_id: "",
  booking_label: "",
  notes: "",
};

const TOKEN_KEY = "turon_admin_token";

export default function AffiliatePaymentsView({ affiliates = [] }) {
  const [year, setYear] = useState(currentYear());
  const [methodFilter, setMethodFilter] = useState("All");
  const [affiliateFilter, setAffiliateFilter] = useState("All");
  const [payments, setPayments] = useState([]);
  const [summary, setSummary] = useState({ grand_total: 0, rows: [] });
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  const yearOptions = useMemo(() => {
    const y = currentYear();
    return [y - 2, y - 1, y, y + 1];
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ year: String(year) });
      if (methodFilter !== "All") params.append("method", methodFilter);
      if (affiliateFilter !== "All") params.append("affiliate_id", affiliateFilter);
      const [list, sum] = await Promise.all([
        api.get(`/admin/affiliates/payments?${params.toString()}`),
        api.get(`/admin/affiliates/payments/summary?year=${year}`),
      ]);
      setPayments(list.data || []);
      setSummary(sum.data || { grand_total: 0, rows: [] });
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Couldn't load payments");
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [year, methodFilter, affiliateFilter]);

  const startAdd = () => setEditing({ ...EMPTY });
  const startEdit = (p) =>
    setEditing({
      ...p,
      amount: String(p.amount ?? ""),
      reference: p.reference || "",
      booking_id: p.booking_id || "",
      booking_label: p.booking_label || "",
      notes: p.notes || "",
    });

  const save = async () => {
    if (!editing) return;
    if (!editing.affiliate_id) return toast.error("Pick an affiliate");
    const amt = Number(editing.amount);
    if (!Number.isFinite(amt) || amt <= 0) return toast.error("Amount must be greater than 0");
    if (!editing.payment_date || !/^\d{4}-\d{2}-\d{2}$/.test(editing.payment_date)) {
      return toast.error("Payment date must be YYYY-MM-DD");
    }
    if (!METHODS.includes(editing.method)) return toast.error("Pick a payment method");

    setSaving(true);
    const payload = {
      affiliate_id: editing.affiliate_id,
      amount: amt,
      payment_date: editing.payment_date,
      method: editing.method,
      reference: editing.reference?.trim() || null,
      booking_id: editing.booking_id?.trim() || null,
      booking_label: editing.booking_label?.trim() || null,
      notes: editing.notes?.trim() || null,
    };
    try {
      if (editing.id) {
        // PATCH doesn't accept affiliate_id changes — strip it
        const patch = { ...payload };
        delete patch.affiliate_id;
        await api.patch(`/admin/affiliates/payments/${editing.id}`, patch);
        toast.success("Payment updated");
      } else {
        await api.post(`/admin/affiliates/payments`, payload);
        toast.success("Payment logged");
      }
      setEditing(null);
      await load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Failed to save payment");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (p) => {
    if (!confirm(`Delete this $${p.amount.toFixed(2)} ${p.method} payment to ${p.affiliate_name}?`)) return;
    try {
      await api.delete(`/admin/affiliates/payments/${p.id}`);
      toast.success("Payment deleted");
      await load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Failed to delete");
    }
  };

  const downloadCsv = async (kind /* "ledger" | "1099" */) => {
    const path =
      kind === "1099"
        ? `/admin/affiliates/payments/1099-csv?year=${year}`
        : `/admin/affiliates/payments/export.csv?year=${year}`;
    try {
      const token = localStorage.getItem(TOKEN_KEY);
      const url = `${process.env.REACT_APP_BACKEND_URL}/api${path}`;
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download =
        kind === "1099" ? `1099-prep-${year}.csv` : `affiliate-payments-${year}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(blobUrl);
      toast.success("CSV downloaded");
    } catch (err) {
      toast.error(`Couldn't download CSV: ${err.message}`);
    }
  };

  const filteredCount = payments.length;

  return (
    <div data-testid="affiliate-payments-view" className="space-y-6">
      {/* Top bar: year, filters, exports */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h3 className="text-white text-lg font-light flex items-center gap-2">
            <CalendarIcon className="w-4 h-4 text-[#D4AF37]" />
            Payments paid to affiliates · {year}
          </h3>
          <p className="text-white/55 text-xs mt-1 max-w-xl">
            Log Zelle / Venmo / Check payments here so YTD totals and 1099-NEC prep stay accurate.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-white/40 text-[10px] uppercase tracking-widest">Total paid out</p>
            <p
              className="text-[#D4AF37] text-2xl font-light tabular-nums"
              data-testid="payments-grand-total"
            >
              ${(summary.grand_total || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          data-testid="payments-add-btn"
          onClick={startAdd}
          className="bg-[#D4AF37] text-black hover:opacity-90"
          disabled={affiliates.length === 0}
        >
          <Plus className="w-4 h-4 mr-2" /> Log payment
        </Button>

        <div className="flex items-center gap-2">
          <Label className="text-white/40 text-[10px] uppercase tracking-widest">Year</Label>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-[110px] bg-[#0E0E0E] border-[#27272A] text-white" data-testid="payments-year-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#0a0a0a] border-white/10 text-white">
              {yearOptions.map((y) => (
                <SelectItem key={y} value={String(y)} data-testid={`payments-year-${y}`}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Label className="text-white/40 text-[10px] uppercase tracking-widest">Method</Label>
          <Select value={methodFilter} onValueChange={setMethodFilter}>
            <SelectTrigger className="w-[130px] bg-[#0E0E0E] border-[#27272A] text-white" data-testid="payments-method-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#0a0a0a] border-white/10 text-white">
              <SelectItem value="All">All methods</SelectItem>
              {METHODS.map((m) => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Label className="text-white/40 text-[10px] uppercase tracking-widest">Affiliate</Label>
          <Select value={affiliateFilter} onValueChange={setAffiliateFilter}>
            <SelectTrigger className="w-[180px] bg-[#0E0E0E] border-[#27272A] text-white" data-testid="payments-affiliate-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#0a0a0a] border-white/10 text-white max-h-[300px]">
              <SelectItem value="All">All affiliates</SelectItem>
              {affiliates.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <Button
            variant="outline"
            data-testid="payments-export-ledger"
            onClick={() => downloadCsv("ledger")}
            className="border-white/15 text-white/80 hover:bg-white/5"
          >
            <Download className="w-4 h-4 mr-2" /> Ledger CSV
          </Button>
          <Button
            variant="outline"
            data-testid="payments-export-1099"
            onClick={() => downloadCsv("1099")}
            className="border-[#D4AF37]/40 text-[#D4AF37] hover:bg-[#D4AF37]/10"
          >
            <FileText className="w-4 h-4 mr-2" /> 1099 Prep CSV
          </Button>
        </div>
      </div>

      {/* YTD per-affiliate cards */}
      {summary.rows?.length > 0 && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="payments-summary-cards">
          {summary.rows.map((r) => (
            <div
              key={r.affiliate_id}
              data-testid={`payments-summary-card-${r.affiliate_id}`}
              className="p-4 rounded-2xl border border-white/10 bg-[#0E0E0E]"
            >
              <p className="text-white/55 text-xs truncate">{r.affiliate_name}</p>
              <p className="text-white text-xl font-light tabular-nums mt-1">
                ${r.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-white/40 text-[10px] uppercase tracking-widest mt-1">
                {r.count} payment{r.count === 1 ? "" : "s"}
                {r.total >= 600 && <span className="ml-2 text-[#D4AF37]">1099 threshold met</span>}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Payments table */}
      {loading ? (
        <div className="flex items-center gap-2 text-white/55 py-12 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading payments...
        </div>
      ) : payments.length === 0 ? (
        <div className="border border-dashed border-white/15 rounded-2xl p-10 text-center" data-testid="payments-empty">
          <p className="text-white/55 text-sm">No payments logged for {year} yet.</p>
          <p className="text-white/35 text-xs mt-2 max-w-md mx-auto">
            Click <span className="text-[#D4AF37]">Log payment</span> after each Zelle / Venmo /
            Check you send an affiliate so you can hand your bookkeeper a clean 1099 CSV in January.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-white/10 rounded-2xl" data-testid="payments-table">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.02] text-white/45 text-[10px] uppercase tracking-widest">
              <tr>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Affiliate</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3 text-left">Method</th>
                <th className="px-4 py-3 text-left">Reference</th>
                <th className="px-4 py-3 text-left">Trip</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="text-white/85">
              {payments.map((p) => (
                <tr
                  key={p.id}
                  data-testid={`payment-row-${p.id}`}
                  className="border-t border-white/5 hover:bg-white/[0.02]"
                >
                  <td className="px-4 py-3 tabular-nums">{p.payment_date}</td>
                  <td className="px-4 py-3">{p.affiliate_name}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    ${Number(p.amount).toFixed(2)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded-full bg-white/5 text-white/70 text-[10px]">
                      {p.method}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-white/65 text-xs">{p.reference || "—"}</td>
                  <td className="px-4 py-3 text-white/55 text-xs truncate max-w-[200px]">
                    {p.booking_label || (p.booking_id ? p.booking_id.slice(0, 8) : "—")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-1">
                      <button
                        type="button"
                        onClick={() => startEdit(p)}
                        data-testid={`payment-edit-${p.id}`}
                        className="p-1.5 text-white/55 hover:text-white"
                        aria-label="Edit"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(p)}
                        data-testid={`payment-delete-${p.id}`}
                        className="p-1.5 text-white/55 hover:text-red-400"
                        aria-label="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-white/[0.02] text-white/65 text-xs">
              <tr>
                <td colSpan={2} className="px-4 py-3">
                  <FilterIcon className="w-3 h-3 inline mr-1 opacity-50" />
                  {filteredCount} payment{filteredCount === 1 ? "" : "s"} shown
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-white">
                  ${payments.reduce((s, p) => s + Number(p.amount || 0), 0).toFixed(2)}
                </td>
                <td colSpan={4}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg bg-[#0a0a0a] border-white/10 text-white">
          <DialogHeader>
            <DialogTitle data-testid="payment-dialog-title">
              {editing?.id ? "Edit payment" : "Log payment to affiliate"}
            </DialogTitle>
            <DialogDescription className="text-white/55">
              Record what you actually paid out (Zelle, Venmo, Check…) so 1099 totals roll up correctly.
            </DialogDescription>
          </DialogHeader>

          {editing && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
              <div className="sm:col-span-2">
                <Label className="text-white/70 text-xs">Affiliate *</Label>
                <Select
                  value={editing.affiliate_id}
                  onValueChange={(v) => setEditing({ ...editing, affiliate_id: v })}
                  disabled={!!editing.id}
                >
                  <SelectTrigger
                    className="bg-[#0E0E0E] border-[#27272A] mt-1"
                    data-testid="payment-input-affiliate"
                  >
                    <SelectValue placeholder="Pick an affiliate" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0a0a0a] border-white/10 text-white max-h-[260px]">
                    {affiliates.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-white/70 text-xs">Amount (USD) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={editing.amount}
                  onChange={(e) => setEditing({ ...editing, amount: e.target.value })}
                  placeholder="225.00"
                  className="bg-[#0E0E0E] border-[#27272A] mt-1"
                  data-testid="payment-input-amount"
                />
              </div>
              <div>
                <Label className="text-white/70 text-xs">Payment Date *</Label>
                <Input
                  type="date"
                  value={editing.payment_date}
                  onChange={(e) => setEditing({ ...editing, payment_date: e.target.value })}
                  className="bg-[#0E0E0E] border-[#27272A] mt-1"
                  data-testid="payment-input-date"
                />
              </div>

              <div>
                <Label className="text-white/70 text-xs">Method *</Label>
                <Select
                  value={editing.method}
                  onValueChange={(v) => setEditing({ ...editing, method: v })}
                >
                  <SelectTrigger
                    className="bg-[#0E0E0E] border-[#27272A] mt-1"
                    data-testid="payment-input-method"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0a0a0a] border-white/10 text-white">
                    {METHODS.map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-white/70 text-xs">Reference / Confirmation #</Label>
                <Input
                  value={editing.reference}
                  onChange={(e) => setEditing({ ...editing, reference: e.target.value })}
                  placeholder="ZL-1234 or @venmo-handle"
                  className="bg-[#0E0E0E] border-[#27272A] mt-1"
                  data-testid="payment-input-reference"
                />
              </div>

              <div className="sm:col-span-2">
                <Label className="text-white/70 text-xs">Trip / Booking Label</Label>
                <Input
                  value={editing.booking_label}
                  onChange={(e) => setEditing({ ...editing, booking_label: e.target.value })}
                  placeholder="Smith → SFO 11/14"
                  className="bg-[#0E0E0E] border-[#27272A] mt-1"
                  data-testid="payment-input-booking-label"
                />
              </div>

              <div className="sm:col-span-2">
                <Label className="text-white/70 text-xs">Internal Booking ID (optional)</Label>
                <Input
                  value={editing.booking_id}
                  onChange={(e) => setEditing({ ...editing, booking_id: e.target.value })}
                  placeholder="9fb00287-..."
                  className="bg-[#0E0E0E] border-[#27272A] mt-1"
                  data-testid="payment-input-booking-id"
                />
              </div>

              <div className="sm:col-span-2">
                <Label className="text-white/70 text-xs">Notes</Label>
                <Textarea
                  value={editing.notes}
                  onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
                  placeholder="Anything you want on the audit trail"
                  className="bg-[#0E0E0E] border-[#27272A] mt-1 min-h-[60px]"
                  data-testid="payment-input-notes"
                />
              </div>

              <div className="sm:col-span-2 flex justify-end gap-3 mt-1">
                <Button variant="ghost" onClick={() => setEditing(null)} className="text-white/70">
                  Cancel
                </Button>
                <Button
                  data-testid="payment-save-btn"
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
