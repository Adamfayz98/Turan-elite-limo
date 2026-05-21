/**
 * Admin Riders tab — list all registered riders, search, see lifetime spend,
 * trigger password-reset email if a customer is locked out of their account.
 */
import { useEffect, useState, useMemo } from "react";
import { toast } from "sonner";
import { Loader2, Search, Mail, Phone, Users, KeyRound } from "lucide-react";
import { api, formatApiErrorDetail } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function RidersTab() {
  const [riders, setRiders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [resetting, setResetting] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/riders");
      setRiders(data || []);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Could not load riders");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return riders;
    return riders.filter((r) =>
      [r.name, r.email, r.phone].some((v) => (v || "").toLowerCase().includes(q))
    );
  }, [riders, search]);

  const sendReset = async (r) => {
    if (!window.confirm(`Send password-reset email to ${r.email}?`)) return;
    setResetting(r.id);
    try {
      await api.post(`/admin/riders/${r.id}/send-password-reset`);
      toast.success(`Reset link emailed to ${r.email}`);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Could not send reset email");
    } finally {
      setResetting(null);
    }
  };

  return (
    <div className="space-y-6" data-testid="riders-tab">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-serif text-2xl text-white">Riders</h2>
          <p className="text-xs text-white/55 mt-1 max-w-2xl leading-relaxed">
            Everyone who has created a rider account in the app or on the website.
            Tap "Send reset" if a rider can't sign in — they'll get a fresh password link by email.
          </p>
        </div>
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
          <Input
            data-testid="rider-search-input"
            placeholder="Search name, email, or phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-[#0E0E0E] border-[#27272A] text-white"
          />
        </div>
      </div>

      {loading ? (
        <div className="py-10 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-[#D4AF37]" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center">
          <Users className="w-8 h-8 text-white/15 mx-auto" />
          <p className="text-white/45 text-sm mt-3">
            {search ? `No riders match "${search}"` : "No riders signed up yet"}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-[#1F1F1F] bg-[#0A0A0A] overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-[#1F1F1F] hover:bg-transparent">
                <TableHead className="text-white/55">Rider</TableHead>
                <TableHead className="text-white/55">Contact</TableHead>
                <TableHead className="text-white/55 text-right">Trips</TableHead>
                <TableHead className="text-white/55 text-right">Spent</TableHead>
                <TableHead className="text-white/55">Joined</TableHead>
                <TableHead className="text-white/55"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow
                  key={r.id}
                  data-testid={`rider-row-${r.id}`}
                  className="border-[#1F1F1F] hover:bg-white/[0.02]"
                >
                  <TableCell className="text-white font-medium">
                    {r.name || "—"}
                  </TableCell>
                  <TableCell className="text-white/75 text-sm">
                    <div className="flex items-center gap-2">
                      <Mail className="w-3 h-3 text-white/40" />
                      <span>{r.email || "—"}</span>
                    </div>
                    {r.phone && (
                      <div className="flex items-center gap-2 mt-1 text-white/55">
                        <Phone className="w-3 h-3 text-white/40" />
                        <span>{r.phone}</span>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-white text-right tabular-nums">
                    {r.bookings_count || 0}
                  </TableCell>
                  <TableCell className="text-[#D4AF37] text-right tabular-nums">
                    ${(r.total_spent || 0).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-white/55 text-sm">
                    {r.created_at
                      ? new Date(r.created_at).toLocaleDateString(undefined, {
                          year: "2-digit",
                          month: "short",
                          day: "numeric",
                        })
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <Button
                      data-testid={`rider-reset-${r.id}`}
                      size="sm"
                      variant="ghost"
                      disabled={resetting === r.id}
                      onClick={() => sendReset(r)}
                      className="text-white/70 hover:text-white hover:bg-white/5 h-8 px-2"
                      title="Send password-reset email"
                    >
                      {resetting === r.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <KeyRound className="w-3 h-3 mr-1.5" />
                      )}
                      Send reset
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
