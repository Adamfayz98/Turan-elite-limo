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
  Trash2,
  Users,
  XCircle,
  Loader2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
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
import PricingTab from "@/components/admin/PricingTab";
import SettingsTab from "@/components/admin/SettingsTab";
import AccountTab from "@/components/admin/AccountTab";
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
      const [b, c, s] = await Promise.all([
        api.get("/admin/bookings"),
        api.get("/admin/contacts"),
        api.get("/admin/stats"),
      ]);
      setBookings(b.data);
      setContacts(c.data);
      setStats(s.data);
    } catch (err) {
      if (err.response?.status === 401) {
        toast.error("Session expired. Please sign in again.");
        logout();
      } else {
        toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Failed to load");
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

  const updateStatus = async (id, status) => {
    try {
      await api.patch(`/admin/bookings/${id}`, { status });
      toast.success(`Marked as ${status}`);
      fetchAll();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
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
            <TabsTrigger value="bookings" data-testid="tab-bookings" className="data-[state=active]:bg-[#D4AF37] data-[state=active]:text-black">
              Bookings ({bookings.length})
            </TabsTrigger>
            <TabsTrigger value="contacts" data-testid="tab-contacts" className="data-[state=active]:bg-[#D4AF37] data-[state=active]:text-black">
              Inquiries ({contacts.length})
            </TabsTrigger>
            <TabsTrigger value="pricing" data-testid="tab-pricing" className="data-[state=active]:bg-[#D4AF37] data-[state=active]:text-black">
              Pricing
            </TabsTrigger>
            <TabsTrigger value="settings" data-testid="tab-settings" className="data-[state=active]:bg-[#D4AF37] data-[state=active]:text-black">
              Settings
            </TabsTrigger>
            <TabsTrigger value="account" data-testid="tab-account" className="data-[state=active]:bg-[#D4AF37] data-[state=active]:text-black">
              Account
            </TabsTrigger>
          </TabsList>

          <TabsContent value="bookings" className="mt-6">
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
                  {bookings.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-16 text-white/40">
                        No bookings yet.
                      </TableCell>
                    </TableRow>
                  )}
                  {bookings.map((b) => (
                    <TableRow
                      key={b.id}
                      data-testid={`booking-row-${b.id}`}
                      className="border-white/5 hover:bg-white/5"
                    >
                      <TableCell>
                        <div className="text-white font-medium">{b.full_name}</div>
                        <div className="text-xs text-white/50">{b.email}</div>
                        <div className="text-xs text-white/50">{b.phone}</div>
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
                        <div className="text-xs text-white/50">{b.pickup_time}</div>
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
                      </TableCell>
                      <TableCell className="text-right">
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
                            <DropdownMenuItem onClick={() => updateStatus(b.id, "cancelled")}>
                              <XCircle className="w-4 h-4 mr-2 text-red-400" /> Cancel
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => updateStatus(b.id, "pending")}>
                              <Clock className="w-4 h-4 mr-2 text-yellow-400" /> Mark Pending
                            </DropdownMenuItem>
                            {b.payment_status === "paid" && (
                              <>
                                <DropdownMenuSeparator className="bg-white/10" />
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <DropdownMenuItem
                                      onSelect={(e) => e.preventDefault()}
                                      data-testid={`refund-action-${b.id}`}
                                      className="text-orange-400 focus:text-orange-400 focus:bg-orange-500/10"
                                    >
                                      <CreditCard className="w-4 h-4 mr-2" /> Refund payment
                                    </DropdownMenuItem>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent className="bg-[#0A0A0A] border-[#1F1F1F] text-white">
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Refund this payment?</AlertDialogTitle>
                                      <AlertDialogDescription className="text-white/60">
                                        ${b.paid_amount?.toFixed(2)} will be returned to the customer's card. This cannot be undone.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel className="bg-transparent border-white/20 hover:bg-white/10">
                                        Cancel
                                      </AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() => refundBooking(b.id)}
                                        className="bg-orange-500 hover:bg-orange-600"
                                      >
                                        Refund
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
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
                      </TableCell>
                    </TableRow>
                  ))}
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

          <TabsContent value="settings" className="mt-6">
            <SettingsTab />
          </TabsContent>

          <TabsContent value="account" className="mt-6">
            <AccountTab />
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}
