import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  CreditCard,
  LogOut,
  Mail,
  MessageSquare,
  Search,
  Trash2,
  Users,
  X,
  XCircle,
  Loader2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import Logo from "@/components/Logo";
import AssignDriverDialog, { DriverStatusPill } from "@/components/admin/AssignDriverDialog";
import BookingDetailsDialog from "@/components/admin/BookingDetailsDialog";
import RefundDialog from "@/components/admin/RefundDialog";
import { formatTime12h } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import PricingTab from "@/components/admin/PricingTab";
import SettingsTab from "@/components/admin/SettingsTab";
import AccountTab from "@/components/admin/AccountTab";
import ZonesTab from "@/components/admin/ZonesTab";
import SurgeCalendarTab from "@/components/admin/SurgeCalendarTab";
import PromosTab from "@/components/admin/PromosTab";
import AnnouncementsTab from "@/components/admin/AnnouncementsTab";
import DriversTab from "@/components/admin/DriversTab";
import RidersTab from "@/components/admin/RidersTab";
import LiveDriversTab from "@/components/admin/LiveDriversTab";
import AffiliatesTab from "@/components/admin/AffiliatesTab";
import InvoicesTab from "@/components/admin/InvoicesTab";
import QuoteRequestsTab from "@/components/admin/QuoteRequestsTab";
import { api, formatApiErrorDetail } from "@/lib/api";

const STATUS_COLOR = {
  pending: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
  confirmed: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  completed: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  cancelled: "bg-red-500/15 text-red-300 border-red-500/30",
  new: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
  read: "bg-white/10 text-white/60 border-white/15",
  unpaid: "bg-white/10 text-white/60 border-white/15",
  paid: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  refunded: "bg-orange-500/15 text-orange-300 border-orange-500/30",
};

function formatReceivedAt(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  // Older — show date
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function StatBlock({ icon: Icon, label, value, testid }) {
  return (
    <div
      data-testid={testid}
      className="p-6 rounded-2xl border border-[#1F1F1F] bg-[#0A0A0A]"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-[0.2em] text-white/50">{label}</span>
        <Icon className="w-4 h-4 text-[#D4AF37]" />
      </div>
      <div className="font-serif text-4xl mt-4">{value}</div>
    </div>
  );
}

export default function AdminDashboard() {
  const nav = useNavigate();
  const [loading, setLoading] = useState(true);
  const [bookings, setBookings] = useState([]);
  const [bookingsSearch, setBookingsSearch] = useState("");
  const [contacts, setContacts] = useState([]);
  const [stats, setStats] = useState(null);
  const adminEmail = localStorage.getItem("turon_admin_email") || "admin";

  const logout = () => {
    localStorage.removeItem("turon_admin_token");
    localStorage.removeItem("turon_admin_email");
    nav("/admin/login");
  };

  const fetchAll = useCallback(async () => {
    try {
      // Use allSettled so one failing endpoint doesn't blank out the entire
      // dashboard. Each section reports its own error independently.
      const [bRes, cRes, sRes] = await Promise.allSettled([
        api.get("/admin/bookings"),
        api.get("/admin/contacts"),
        api.get("/admin/stats"),
      ]);

      // Auth check — if ALL three returned 401, the session expired
      const all401 =
        [bRes, cRes, sRes].every(
          (r) => r.status === "rejected" && r.reason?.response?.status === 401,
        );
      if (all401) {
        toast.error("Session expired. Please sign in again.");
        logout();
        return;
      }

      const failures = [];
      if (bRes.status === "fulfilled") {
        setBookings(bRes.value.data);
      } else {
        failures.push(`bookings (${bRes.reason?.response?.status || "network"})`);
      }
      if (cRes.status === "fulfilled") {
        setContacts(cRes.value.data);
      } else {
        failures.push(`contacts (${cRes.reason?.response?.status || "network"})`);
      }
      if (sRes.status === "fulfilled") {
        setStats(sRes.value.data);
      } else {
        failures.push(`stats (${sRes.reason?.response?.status || "network"})`);
      }
      if (failures.length) {
        toast.error(
          `Could not load: ${failures.join(", ")}. Other sections still loaded.`,
          { duration: 6000 },
        );
      }
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!localStorage.getItem("turon_admin_token")) {
      nav("/admin/login");
      return;
    }
    fetchAll();
  }, [fetchAll, nav]);

  const updateStatus = async (id, status, reason = null) => {
    try {
      await api.patch(`/admin/bookings/${id}`, { status, reason });
      toast.success(`Marked as ${status} — customer notified`);
      fetchAll();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  const [cancelTarget, setCancelTarget] = useState(null); // booking object
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [autoRefund, setAutoRefund] = useState(true);
  const [detailBooking, setDetailBooking] = useState(null);
  const [refundTarget, setRefundTarget] = useState(null);

  const submitCancel = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    const isPaid = cancelTarget.payment_status === "paid";
    try {
      await api.patch(`/admin/bookings/${cancelTarget.id}`, {
        status: "cancelled",
        reason: cancelReason.trim() || null,
      });
      // If paid + admin opted in, also refund via Stripe immediately
      if (isPaid && autoRefund) {
        try {
          const res = await api.post(`/admin/payments/${cancelTarget.id}/refund`, {});
          toast.success(
            `Cancelled & refunded $${res.data.amount?.toFixed(2)} to customer`,
          );
        } catch (refundErr) {
          toast.error(
            `Cancelled, but refund failed: ${formatApiErrorDetail(refundErr.response?.data?.detail) || "check Stripe dashboard"}`,
          );
        }
      } else {
        toast.success(
          isPaid
            ? "Cancelled — customer emailed (no refund issued)"
            : "Cancelled — customer emailed",
        );
      }
      setCancelTarget(null);
      setCancelReason("");
      setAutoRefund(true);
      fetchAll();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Failed to cancel");
    } finally {
      setCancelling(false);
    }
  };

  const deleteBooking = async (id) => {
    try {
      await api.delete(`/admin/bookings/${id}`);
      toast.success("Booking removed");
      fetchAll();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  const refundBooking = async (id) => {
    try {
      const res = await api.post(`/admin/payments/${id}/refund`, {});
      toast.success(`Refunded $${res.data.amount?.toFixed(2)}`);
      fetchAll();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  const syncPaymentFromStripe = async (b) => {
    if (!b.payment_session_id) {
      toast.error("No Stripe session on this booking — customer hasn't started checkout.");
      return;
    }
    try {
      // First try the regular /payments/status endpoint (has dual-channel + REST fallback)
      const { data } = await api.get(`/payments/status/${b.payment_session_id}`);
      if (data.payment_status === "paid") {
        toast.success("Payment confirmed — booking marked paid");
        fetchAll();
        return;
      }
      // If still not paid, escalate to the force-sync endpoint that bypasses the SDK
      const { data: forced } = await api.post(
        `/admin/bookings/${b.id}/force-sync-payment`,
      );
      if (forced.reconciled) {
        toast.success(`Reconciled — booking marked paid ($${forced.amount?.toFixed(2)})`);
      } else {
        toast.info(`Stripe says: ${forced.stripe_payment_status}. ${forced.message || ""}`);
      }
      fetchAll();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Sync failed");
    }
  };

  // Filter bookings by confirmation number, name, email, or phone
  const filteredBookings = (() => {
    const q = bookingsSearch.trim().toLowerCase();
    if (!q) return bookings;
    return bookings.filter((b) => {
      const haystack = [
        b.confirmation_number,
        b.full_name,
        b.email,
        b.phone,
        b.pickup_location,
        b.dropoff_location,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  })();

  const markContact = async (id, status) => {
    try {
      await api.patch(`/admin/contacts/${id}`, { status });
      fetchAll();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  const deleteContact = async (id) => {
    try {
      await api.delete(`/admin/contacts/${id}`);
      toast.success("Inquiry removed");
      fetchAll();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#050505]">
        <Loader2 className="w-6 h-6 animate-spin text-[#D4AF37]" />
      </div>
    );
  }

  return (
    <main data-testid="admin-dashboard" className="min-h-screen bg-[#050505] text-white">
      {/* Top bar */}
      <header className="border-b border-white/10 px-6 md:px-10 h-20 flex items-center justify-between sticky top-0 z-40 bg-[#050505]/90 backdrop-blur-xl">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2.5">
            <Logo size={32} className="text-[#D4AF37]" />
            <span className="font-serif text-2xl">
              Turan<span className="gold-text">EliteLimo</span>
            </span>
          </div>
          <span className="hidden md:inline text-xs uppercase tracking-[0.3em] text-white/40">
            Admin Console
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-white/60 hidden sm:block">{adminEmail}</span>
          <Button
            variant="outline"
            data-testid="admin-logout"
            className="bg-transparent border-white/20 text-white hover:bg-white/10 rounded-full"
            onClick={logout}
          >
            <LogOut className="w-4 h-4 mr-2" /> Sign out
          </Button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 md:px-10 py-12">
        <div className="mb-10">
          <h1 className="font-serif text-4xl md:text-5xl">Reservations</h1>
          <p className="text-white/55 mt-2">Manage incoming bookings & client inquiries.</p>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-12">
            <StatBlock
              icon={CalendarDays}
              label="Total"
              value={stats.total_bookings}
              testid="stat-total"
            />
            <StatBlock icon={Clock} label="Pending" value={stats.pending} testid="stat-pending" />
            <StatBlock
              icon={CheckCircle2}
              label="Confirmed"
              value={stats.confirmed}
              testid="stat-confirmed"
            />
            <StatBlock
              icon={Users}
              label="Completed"
              value={stats.completed}
              testid="stat-completed"
            />
            <StatBlock
              icon={Mail}
              label="Inquiries"
              value={stats.inquiries}
              testid="stat-inquiries"
            />
          </div>
        )}

        <Tabs defaultValue="bookings" className="w-full">
          <TabsList className="bg-[#0A0A0A] border border-[#1F1F1F]">
            <TabsTrigger value="bookings" data-testid="tab-bookings" className="relative data-[state=active]:bg-[#D4AF37] data-[state=active]:text-black">
              Bookings ({bookings.length})
              {(() => {
                const unread = bookings.filter((b) => b.is_read !== true && b.payment_status === "paid").length;
                return unread > 0 ? (
                  <span
                    data-testid="unread-bookings-badge"
                    className="ml-2 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full bg-[#D4AF37] text-black text-[10px] font-bold tabular-nums leading-none"
                    title={`${unread} unread booking${unread === 1 ? "" : "s"}`}
                  >
                    {unread > 99 ? "99+" : unread}
                  </span>
                ) : null;
              })()}
            </TabsTrigger>
            <TabsTrigger value="contacts" data-testid="tab-contacts" className="data-[state=active]:bg-[#D4AF37] data-[state=active]:text-black">
              Inquiries ({contacts.length})
            </TabsTrigger>
            <TabsTrigger value="pricing" data-testid="tab-pricing" className="data-[state=active]:bg-[#D4AF37] data-[state=active]:text-black">
              Pricing
            </TabsTrigger>
            <TabsTrigger value="zones" data-testid="tab-zones" className="data-[state=active]:bg-[#D4AF37] data-[state=active]:text-black">
              Zones
            </TabsTrigger>
            <TabsTrigger value="surge" data-testid="tab-surge" className="data-[state=active]:bg-[#D4AF37] data-[state=active]:text-black">
              Surge Calendar
            </TabsTrigger>
            <TabsTrigger value="promos" data-testid="tab-promos" className="data-[state=active]:bg-[#D4AF37] data-[state=active]:text-black">
              Promos
            </TabsTrigger>
            <TabsTrigger value="announcements" data-testid="tab-announcements" className="data-[state=active]:bg-[#D4AF37] data-[state=active]:text-black">
              Announcements
            </TabsTrigger>
            <TabsTrigger value="drivers" data-testid="tab-drivers" className="data-[state=active]:bg-[#D4AF37] data-[state=active]:text-black">
              Drivers
            </TabsTrigger>
            <TabsTrigger value="riders" data-testid="tab-riders" className="data-[state=active]:bg-[#D4AF37] data-[state=active]:text-black">
              Riders
            </TabsTrigger>
            <TabsTrigger value="live-map" data-testid="tab-live-map" className="data-[state=active]:bg-[#D4AF37] data-[state=active]:text-black">
              Live Map
            </TabsTrigger>
            <TabsTrigger value="affiliates" data-testid="tab-affiliates" className="data-[state=active]:bg-[#D4AF37] data-[state=active]:text-black">
              Affiliates
            </TabsTrigger>
            <TabsTrigger value="invoices" data-testid="tab-invoices" className="data-[state=active]:bg-[#D4AF37] data-[state=active]:text-black">
              Invoices
            </TabsTrigger>
            <TabsTrigger value="quotes" data-testid="tab-quotes" className="data-[state=active]:bg-[#D4AF37] data-[state=active]:text-black">
              Quote Requests
            </TabsTrigger>
            <TabsTrigger value="settings" data-testid="tab-settings" className="data-[state=active]:bg-[#D4AF37] data-[state=active]:text-black">
              Settings
            </TabsTrigger>
            <TabsTrigger value="account" data-testid="tab-account" className="data-[state=active]:bg-[#D4AF37] data-[state=active]:text-black">
              Account
            </TabsTrigger>
          </TabsList>

          <TabsContent value="bookings" className="mt-6">
            <div className="mb-4 flex items-center gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 pointer-events-none" />
                <Input
                  data-testid="bookings-search"
                  value={bookingsSearch}
                  onChange={(e) => setBookingsSearch(e.target.value)}
                  placeholder="Search by confirmation #, name, email or phone…"
                  className="pl-10 pr-10 bg-[#0E0E0E] border-[#27272A] text-white placeholder:text-white/40 h-11 focus-visible:ring-[#D4AF37] focus-visible:border-[#D4AF37]"
                />
                {bookingsSearch && (
                  <button
                    type="button"
                    data-testid="bookings-search-clear"
                    onClick={() => setBookingsSearch("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors"
                    aria-label="Clear search"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              {bookingsSearch && (
                <span className="text-xs text-white/55" data-testid="bookings-search-count">
                  {filteredBookings.length} of {bookings.length}
                </span>
              )}
              <Button
                data-testid="backfill-cancellation-source-btn"
                variant="outline"
                size="sm"
                className="ml-auto border-[#27272A] text-white/70 hover:text-white hover:bg-[#1A1A1A]"
                title="One-shot: stamp cancellation source (auto/customer/admin) on past cancelled bookings so the badges work retroactively."
                onClick={async () => {
                  if (!window.confirm("Backfill cancellation source on all past cancelled bookings? Safe to run multiple times.")) return;
                  try {
                    const token = localStorage.getItem("turon_admin_token");
                    const res = await fetch(
                      `${process.env.REACT_APP_BACKEND_URL}/api/admin/bookings/backfill-cancellation-source`,
                      { method: "POST", headers: { Authorization: `Bearer ${token}` } },
                    );
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.detail || "Failed");
                    const u = data.updated || {};
                    toast.success(
                      `Backfilled ${u.total || 0} bookings: 🤖 ${u.auto_abandoned || 0} auto · 👤 ${u.customer_web || 0} customer · 🧑‍💼 ${u.admin || 0} admin`,
                      { duration: 8000 },
                    );
                    fetchAll();
                  } catch (e) {
                    toast.error(`Backfill failed: ${e.message}`);
                  }
                }}
              >
                Backfill cancel sources
              </Button>
            </div>

            <div className="rounded-2xl border border-[#1F1F1F] bg-[#0A0A0A] overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/5 hover:bg-transparent">
                    <TableHead className="text-white/60">Client</TableHead>
                    <TableHead className="text-white/60">Service</TableHead>
                    <TableHead className="text-white/60">Date / Time</TableHead>
                    <TableHead className="text-white/60">Route</TableHead>
                    <TableHead className="text-white/60">Vehicle</TableHead>
                    <TableHead className="text-white/60">Pax</TableHead>
                    <TableHead className="text-white/60">Status</TableHead>
                    <TableHead className="text-white/60">Payment</TableHead>
                    <TableHead className="text-white/60 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBookings.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-16 text-white/40">
                        {bookings.length === 0
                          ? "No bookings yet."
                          : `No bookings match "${bookingsSearch}".`}
                      </TableCell>
                    </TableRow>
                  )}
                  {filteredBookings.map((b) => {
                    // Treat ANY un-opened booking as "unread" (email-inbox metaphor),
                    // not just paid ones. Cancelled bookings don't need attention so
                    // they're excluded.
                    const isUnread = b.is_read !== true && b.status !== "cancelled";
                    return (
                    <TableRow
                      key={b.id}
                      data-testid={`booking-row-${b.id}`}
                      onClick={(e) => {
                        // Only open detail when clicking the row body, not nested buttons/menus
                        const tag = e.target.tagName;
                        const interactive = e.target.closest("button, a, [role=menuitem], [role=combobox], input, textarea");
                        if (interactive) return;
                        if (tag === "BUTTON" || tag === "A") return;
                        setDetailBooking(b);
                        // Fire-and-forget mark-as-read so the row stops highlighting
                        if (b.is_read !== true) {
                          api.post(`/admin/bookings/${b.id}/mark-read`).then(() => {
                            // Optimistically update local state
                            setBookings((prev) =>
                              prev.map((x) =>
                                x.id === b.id ? { ...x, is_read: true } : x,
                              ),
                            );
                          }).catch(() => {});
                        }
                      }}
                      className={`border-white/5 cursor-pointer transition-colors ${
                        isUnread
                          ? "bg-[#D4AF37]/[0.04] hover:bg-[#D4AF37]/[0.08]"
                          : "hover:bg-white/5"
                      }`}
                    >
                      <TableCell>
                        <div className={`text-white font-medium flex items-center gap-2 ${isUnread ? "font-semibold" : ""}`}>
                          {isUnread && (
                            <span
                              data-testid={`unread-dot-${b.id}`}
                              className="w-2 h-2 rounded-full bg-[#D4AF37] shadow-[0_0_8px_rgba(212,175,55,0.6)]"
                              title="New booking — unopened"
                            />
                          )}
                          {b.full_name}
                        </div>
                        <div className="text-xs text-white/50">{b.email}</div>
                        <div className="text-xs text-white/50">{b.phone}</div>
                        {b.created_at && (
                          <div className="text-[10px] text-white/35 mt-1 uppercase tracking-wider">
                            Received {formatReceivedAt(b.created_at)}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-white/80">
                        {b.service_type}
                        {b.hours ? (
                          <div className="text-[10px] text-[#D4AF37] uppercase tracking-wider mt-1">
                            {b.hours} hr{b.hours > 1 ? "s" : ""}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-white/80">
                        {b.pickup_date}
                        <div className="text-xs text-white/50">{formatTime12h(b.pickup_time) || b.pickup_time}</div>
                      </TableCell>
                      <TableCell className="text-white/80 max-w-[250px]">
                        <div className="truncate">{b.pickup_location}</div>
                        <div className="text-xs text-white/50 truncate">→ {b.dropoff_location}</div>
                      </TableCell>
                      <TableCell className="text-white/80">
                        {b.vehicle_type}
                        {b.child_seat && (
                          <div className="text-[10px] text-[#D4AF37] uppercase tracking-wider mt-1">
                            + Child seat
                          </div>
                        )}
                        {b.return_trip && (
                          <div className="text-[10px] text-[#D4AF37] uppercase tracking-wider">
                            Round trip
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-white/80">
                        {b.passengers}
                        {b.luggage_count > 0 && (
                          <span className="text-xs text-white/50"> · {b.luggage_count} bags</span>
                        )}
                        {b.additional_stops?.length > 0 && (
                          <div className="text-[10px] text-white/50 mt-1">
                            +{b.additional_stops.length} stop{b.additional_stops.length > 1 ? "s" : ""}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge className={`${STATUS_COLOR[b.status]} border rounded-full`}>
                          {b.status}
                        </Badge>
                        {b.confirmation_number && (
                          <div className="text-[10px] text-[#D4AF37] mt-1 font-mono">
                            {b.confirmation_number}
                          </div>
                        )}
                        {b.cancellation_requested && b.status !== "cancelled" && (
                          <div
                            data-testid={`cancellation-flag-${b.id}`}
                            className="text-[10px] text-orange-300 uppercase tracking-wider mt-1 font-medium"
                            title={b.cancellation_reason || ""}
                          >
                            ⚠ Cancel requested
                          </div>
                        )}
                        {b.status === "cancelled" && (() => {
                          const src = b.cancellation_source;
                          const when = b.cancelled_at || b.auto_cancelled_at || b.cancellation_requested_at;
                          let label = "Manual";
                          let cls = "text-white/50 border-white/15";
                          let tip = "Cancelled (legacy — no source recorded)";
                          if (src === "auto_abandoned") {
                            label = "Auto"; cls = "text-amber-300 border-amber-400/30";
                            tip = `System auto-cancelled (>72h unpaid Stripe checkout)${when ? ` · ${new Date(when).toLocaleString()}` : ""}`;
                          } else if (src === "customer_web" || src === "mobile_app") {
                            label = "Customer"; cls = "text-sky-300 border-sky-400/30";
                            tip = `Customer cancelled via ${src === "mobile_app" ? "mobile app" : "web manage link"}${when ? ` · ${new Date(when).toLocaleString()}` : ""}${b.cancellation_reason ? ` — ${b.cancellation_reason}` : ""}`;
                          } else if (src === "admin") {
                            label = "Admin"; cls = "text-rose-300 border-rose-400/30";
                            const who = b.cancelled_by_admin_email ? ` by ${b.cancelled_by_admin_email}` : "";
                            tip = `Admin cancelled${who}${when ? ` · ${new Date(when).toLocaleString()}` : ""}${b.cancellation_reason ? ` — ${b.cancellation_reason}` : ""}`;
                          }
                          return (
                            <div
                              data-testid={`cancellation-source-${b.id}`}
                              className={`inline-flex items-center text-[10px] uppercase tracking-wider mt-1 font-medium px-1.5 py-0.5 rounded border ${cls}`}
                              title={tip}
                            >
                              {label}
                            </div>
                          );
                        })()}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={`${STATUS_COLOR[b.payment_status || "unpaid"]} border rounded-full`}
                          data-testid={`payment-badge-${b.id}`}
                        >
                          {b.payment_status || "unpaid"}
                        </Badge>
                        {b.paid_amount != null && (
                          <div className="text-[10px] text-white/50 mt-1">
                            ${b.paid_amount?.toFixed(2)}
                          </div>
                        )}
                        {b.refund_amount != null && (
                          <div className="text-[10px] text-orange-300 mt-1">
                            Refunded ${b.refund_amount?.toFixed(2)}
                          </div>
                        )}
                        {b.payment_status !== "paid" && (b.checkout_failures || 0) > 0 && (
                          <div
                            data-testid={`checkout-failure-flag-${b.id}`}
                            className="inline-flex items-center text-[10px] uppercase tracking-wider mt-1 font-medium px-1.5 py-0.5 rounded border text-amber-300 border-amber-400/30"
                            title={`${b.checkout_failures} Stripe checkout failure(s)${b.last_checkout_error ? ` — ${b.last_checkout_error}` : ""}`}
                          >
                            ⚠ {b.checkout_failures} fail{b.checkout_failures > 1 ? "s" : ""}
                          </div>
                        )}
                        {b.payment_status === "pending" && (b.checkout_attempts || 0) > 0 && !(b.checkout_failures || 0) && (
                          <div
                            data-testid={`checkout-attempt-flag-${b.id}`}
                            className="inline-flex items-center text-[10px] uppercase tracking-wider mt-1 font-medium px-1.5 py-0.5 rounded border text-sky-300 border-sky-400/30"
                            title={`Customer reached Stripe ${b.checkout_attempts} time(s) but hasn't completed payment`}
                          >
                            ⏳ {b.checkout_attempts}× attempt
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2 flex-wrap">
                          {b.trip_status && <DriverStatusPill status={b.trip_status} />}
                          {(b.status === "confirmed" || b.status === "pending") && b.payment_status === "paid" && (
                            <AssignDriverDialog booking={b} onAssigned={fetchAll} />
                          )}
                          {b.status === "pending" && (
                            <Button
                              size="sm"
                              data-testid={`quick-confirm-${b.id}`}
                              onClick={() => updateStatus(b.id, "confirmed")}
                              className="bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 rounded-full h-8 px-3 text-xs font-medium"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                              {b.payment_status === "paid"
                                ? "Confirm chauffeur"
                                : "Confirm"}
                            </Button>
                          )}
                          <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              data-testid={`booking-actions-${b.id}`}
                              className="bg-transparent border-white/20 hover:bg-white/10 rounded-full"
                            >
                              Manage
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            className="bg-[#0A0A0A] border-[#1F1F1F] text-white"
                          >
                            <DropdownMenuLabel>Update status</DropdownMenuLabel>
                            <DropdownMenuItem onClick={() => updateStatus(b.id, "confirmed")}>
                              <CheckCircle2 className="w-4 h-4 mr-2 text-emerald-400" /> Confirm
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => updateStatus(b.id, "completed")}>
                              <CheckCircle2 className="w-4 h-4 mr-2 text-sky-400" /> Complete
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setCancelTarget(b)}>
                              <XCircle className="w-4 h-4 mr-2 text-red-400" /> Cancel
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => updateStatus(b.id, "pending")}>
                              <Clock className="w-4 h-4 mr-2 text-yellow-400" /> Mark Pending
                            </DropdownMenuItem>
                            {b.payment_status === "pending" && b.payment_session_id && (
                              <DropdownMenuItem
                                data-testid={`sync-payment-${b.id}`}
                                onClick={() => syncPaymentFromStripe(b)}
                                className="text-emerald-300 focus:text-emerald-300 focus:bg-emerald-500/10"
                              >
                                <CreditCard className="w-4 h-4 mr-2" /> Sync payment from Stripe
                              </DropdownMenuItem>
                            )}
                            {b.payment_status === "paid" && (
                              <>
                                <DropdownMenuSeparator className="bg-white/10" />
                                <DropdownMenuItem
                                  onSelect={(e) => {
                                    e.preventDefault();
                                    setRefundTarget(b);
                                  }}
                                  data-testid={`refund-action-${b.id}`}
                                  className="text-orange-400 focus:text-orange-400 focus:bg-orange-500/10"
                                >
                                  <CreditCard className="w-4 h-4 mr-2" /> Refund payment
                                </DropdownMenuItem>
                              </>
                            )}
                            <DropdownMenuSeparator className="bg-white/10" />
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <DropdownMenuItem
                                  onSelect={(e) => e.preventDefault()}
                                  className="text-red-400 focus:text-red-400 focus:bg-red-500/10"
                                >
                                  <Trash2 className="w-4 h-4 mr-2" /> Delete
                                </DropdownMenuItem>
                              </AlertDialogTrigger>
                              <AlertDialogContent className="bg-[#0A0A0A] border-[#1F1F1F] text-white">
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete booking?</AlertDialogTitle>
                                  <AlertDialogDescription className="text-white/60">
                                    This action cannot be undone. The booking will be permanently removed.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel className="bg-transparent border-white/20 hover:bg-white/10">
                                    Cancel
                                  </AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deleteBooking(b.id)}
                                    className="bg-red-500 hover:bg-red-600"
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="contacts" className="mt-6">
            <div className="rounded-2xl border border-[#1F1F1F] bg-[#0A0A0A] overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/5 hover:bg-transparent">
                    <TableHead className="text-white/60">Name</TableHead>
                    <TableHead className="text-white/60">Subject</TableHead>
                    <TableHead className="text-white/60">Message</TableHead>
                    <TableHead className="text-white/60">Status</TableHead>
                    <TableHead className="text-white/60 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contacts.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-16 text-white/40">
                        No inquiries yet.
                      </TableCell>
                    </TableRow>
                  )}
                  {contacts.map((c) => (
                    <TableRow
                      key={c.id}
                      data-testid={`contact-row-${c.id}`}
                      className="border-white/5 hover:bg-white/5"
                    >
                      <TableCell>
                        <div className="text-white font-medium">{c.name}</div>
                        <div className="text-xs text-white/50">{c.email}</div>
                        {c.phone && <div className="text-xs text-white/50">{c.phone}</div>}
                      </TableCell>
                      <TableCell className="text-white/80">{c.subject || "—"}</TableCell>
                      <TableCell className="text-white/70 max-w-[420px]">
                        <div className="line-clamp-2">{c.message}</div>
                      </TableCell>
                      <TableCell>
                        <Badge className={`${STATUS_COLOR[c.status] || STATUS_COLOR.new} border rounded-full`}>
                          {c.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {c.status !== "read" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => markContact(c.id, "read")}
                              data-testid={`contact-mark-read-${c.id}`}
                              className="bg-transparent border-white/20 hover:bg-white/10 rounded-full"
                            >
                              <MessageSquare className="w-3.5 h-3.5 mr-1" /> Mark read
                            </Button>
                          )}
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                size="sm"
                                variant="outline"
                                data-testid={`contact-delete-${c.id}`}
                                className="bg-transparent border-red-500/30 text-red-400 hover:bg-red-500/10 rounded-full"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="bg-[#0A0A0A] border-[#1F1F1F] text-white">
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete inquiry?</AlertDialogTitle>
                                <AlertDialogDescription className="text-white/60">
                                  This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel className="bg-transparent border-white/20 hover:bg-white/10">
                                  Cancel
                                </AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteContact(c.id)}
                                  className="bg-red-500 hover:bg-red-600"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="pricing" className="mt-6">
            <PricingTab />
          </TabsContent>

          <TabsContent value="zones" className="mt-6">
            <ZonesTab />
          </TabsContent>

          <TabsContent value="surge" className="mt-6">
            <SurgeCalendarTab />
          </TabsContent>

          <TabsContent value="promos" className="mt-6">
            <PromosTab />
          </TabsContent>

          <TabsContent value="announcements" className="mt-6">
            <AnnouncementsTab />
          </TabsContent>

          <TabsContent value="drivers" className="mt-6">
            <DriversTab />
          </TabsContent>
          <TabsContent value="riders" className="mt-6">
            <RidersTab />
          </TabsContent>

          <TabsContent value="live-map" className="mt-6">
            <LiveDriversTab />
          </TabsContent>

          <TabsContent value="affiliates" className="mt-6">
            <AffiliatesTab />
          </TabsContent>

          <TabsContent value="invoices" className="mt-6">
            <InvoicesTab />
          </TabsContent>

          <TabsContent value="quotes" className="mt-6">
            <QuoteRequestsTab />
          </TabsContent>

          <TabsContent value="settings" className="mt-6">
            <SettingsTab />
          </TabsContent>

          <TabsContent value="account" className="mt-6">
            <AccountTab />
          </TabsContent>
        </Tabs>
      </div>

      {/* Booking details modal — opens when admin clicks a row */}
      <BookingDetailsDialog
        booking={detailBooking}
        open={!!detailBooking}
        onClose={() => setDetailBooking(null)}
        onChanged={fetchAll}
      />
      <RefundDialog
        booking={refundTarget}
        open={!!refundTarget}
        onClose={() => setRefundTarget(null)}
        onChanged={fetchAll}
      />

      {/* Admin Cancel-with-reason Dialog */}
      <Dialog open={!!cancelTarget} onOpenChange={(open) => !open && setCancelTarget(null)}>
        <DialogContent className="bg-[#0A0A0A] border-[#1F1F1F] text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">Cancel reservation</DialogTitle>
            <p className="text-xs text-white/55 mt-1">
              Customer <strong className="text-white">{cancelTarget?.full_name}</strong> ({cancelTarget?.confirmation_number}) will receive a cancellation email immediately.
            </p>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-[10px] uppercase tracking-[0.2em] text-white/50 block mb-2">
                Reason (shown to customer)
              </label>
              <Textarea
                data-testid="admin-cancel-reason"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="e.g. We're unable to fulfill this booking due to vehicle availability. Apologies for the inconvenience."
                rows={4}
                maxLength={500}
                className="bg-[#0E0E0E] border-[#27272A] text-white placeholder:text-white/40 focus-visible:ring-[#D4AF37] focus-visible:border-[#D4AF37]"
              />
              <div className="text-[10px] text-white/40 mt-1 text-right">
                {cancelReason.length}/500 — optional but recommended
              </div>
            </div>

            {cancelTarget?.payment_status === "paid" && (
              <>
                <label
                  data-testid="admin-cancel-auto-refund-toggle"
                  className="flex items-start gap-3 p-3 rounded-lg border border-[#D4AF37]/40 bg-[#D4AF37]/[0.06] cursor-pointer hover:bg-[#D4AF37]/[0.1] transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={autoRefund}
                    onChange={(e) => setAutoRefund(e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-[#D4AF37] cursor-pointer"
                  />
                  <div className="flex-1 text-xs">
                    <div className="text-[#D4AF37] font-medium">
                      Also refund ${cancelTarget?.paid_amount?.toFixed(2)} to customer's card via Stripe
                    </div>
                    <div className="text-white/55 mt-1 leading-relaxed">
                      One click — no need to find them in the Stripe dashboard. Uncheck only if you'll handle the refund manually.
                    </div>
                  </div>
                </label>
                {autoRefund && cancelTarget?.paid_amount > 0 && (() => {
                  const fee = Math.round(
                    (cancelTarget.paid_amount * 0.029 + 0.3) * 100,
                  ) / 100;
                  return (
                    <div
                      data-testid="admin-cancel-stripe-fee-warning"
                      className="rounded-lg border border-amber-500/30 bg-amber-500/[0.06] p-3 text-xs"
                    >
                      <div className="text-amber-300 font-medium">
                        Heads-up: ~${fee.toFixed(2)} Stripe fee is not returned
                      </div>
                      <div className="text-white/60 mt-1 leading-relaxed">
                        Stripe refunds the customer in full (${cancelTarget?.paid_amount?.toFixed(2)}), but their original processing fee (2.9% + $0.30) stays with Stripe. To cover this proactively, enable "Service Fee" in Settings → quotes will include a small fee that offsets Stripe costs.
                      </div>
                    </div>
                  );
                })()}
              </>
            )}

            <div className="flex justify-end gap-2 pt-3 border-t border-[#1F1F1F]">
              <Button
                variant="outline"
                onClick={() => { setCancelTarget(null); setCancelReason(""); setAutoRefund(true); }}
                className="bg-transparent border-white/20 hover:bg-white/10 rounded-full h-9 px-4"
              >
                Keep reservation
              </Button>
              <Button
                data-testid="admin-cancel-submit"
                onClick={submitCancel}
                disabled={cancelling}
                className="bg-red-500 hover:bg-red-600 rounded-full h-9 px-5 font-medium"
              >
                {cancelling ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : cancelTarget?.payment_status === "paid" && autoRefund ? (
                  "Cancel & Refund"
                ) : (
                  "Cancel & notify customer"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
