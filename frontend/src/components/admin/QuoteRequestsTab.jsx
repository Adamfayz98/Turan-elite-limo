import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, MessageSquare, Phone, Mail, Trash2, ExternalLink } from "lucide-react";

import { api, formatApiErrorDetail } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const STATUS_BADGE = {
  new: { label: "New", className: "bg-[#D4AF37]/15 text-[#D4AF37] border-[#D4AF37]/30" },
  contacted: { label: "Contacted", className: "bg-blue-500/15 text-blue-300 border-blue-500/30" },
  won: { label: "Won", className: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  lost: { label: "Lost", className: "bg-white/5 text-white/40 border-white/10" },
};

export default function QuoteRequestsTab() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

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

  const setStatus = async (id, status) => {
    try {
      await api.patch(`/admin/quote-requests/${id}`, { status });
      setItems((arr) => arr.map((q) => (q.id === id ? { ...q, status } : q)));
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Update failed");
    }
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

  const newCount = items.filter((q) => (q.status || "new") === "new").length;

  return (
    <div className="space-y-6" data-testid="quote-requests-tab">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-serif text-2xl text-white">Quote requests</h2>
          <p className="text-xs text-white/55 mt-1 max-w-2xl leading-relaxed">
            Customers who tapped <strong className="text-white/80">Request a quote</strong> on Party Bus, Sprinter Van, or Stretch Limo. Call or text them back, then mark Won/Lost.
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
            They'll appear here the moment a customer submits one for a call-only vehicle.
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
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 items-end flex-shrink-0">
                    <a
                      href={`tel:${phoneTel}`}
                      data-testid={`quote-call-${q.id}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#D4AF37] text-black text-xs font-semibold hover:bg-[#B3922E]"
                    >
                      <Phone className="w-3 h-3" /> Call
                    </a>
                    {q.email && (
                      <a
                        href={`mailto:${q.email}?subject=Your%20TuranEliteLimo%20quote`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-transparent border border-white/15 text-white/75 text-xs hover:bg-white/5"
                      >
                        <Mail className="w-3 h-3" /> Email
                      </a>
                    )}
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
    </div>
  );
}
