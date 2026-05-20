/**
 * Driver Active Trip — feature parity with the web DriverPortal.
 * Capabilities:
 *   - Status progression (en_route → arrived → on_trip → completed)
 *   - Record wait time (admin auto-charges)
 *   - Add mid-trip unplanned stop (admin auto-charges detour + waiting)
 *   - One-tap navigation via Apple/Google Maps
 *   - Live GPS streaming every 15s
 */
import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, Linking, Alert, ScrollView, TextInput, ActivityIndicator, Modal } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft, Phone, MessageSquare, Navigation, Check, User as UserIcon, Wifi, WifiOff, Clock, Plus, X, MapPin } from "lucide-react-native";
import Button from "@/components/Button";
import { colors, radius } from "@/theme";
import { useDriverLocationStream } from "@/hooks/useDriverLocationStream";
import {
  driverGetBookingDetail,
  driverUpdateBookingStatus,
  driverRecordWaitTime,
  driverRecordMidTripStop,
} from "@/api";

const STATUSES = ["assigned", "en_route", "arrived", "on_trip", "completed"] as const;
type Status = typeof STATUSES[number];

const STATUS_LABEL: Record<Status, string> = {
  assigned:  "Assigned",
  en_route:  "En route to pickup",
  arrived:   "Arrived at pickup",
  on_trip:   "On trip",
  completed: "Completed",
};

const NEXT_STATUS: Record<Status, { next: Status; label: string } | null> = {
  assigned:  { next: "en_route",  label: "Start trip / Drive to pickup" },
  en_route:  { next: "arrived",   label: "I've arrived at pickup" },
  arrived:   { next: "on_trip",   label: "Passenger picked up · Start ride" },
  on_trip:   { next: "completed", label: "End trip" },
  completed: null,
};

export default function DriverActiveTrip() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const id = params.id as string;

  const [booking, setBooking] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  // Wait time modal
  const [waitOpen, setWaitOpen] = useState(false);
  const [waitMinutes, setWaitMinutes] = useState("");

  // Mid-trip stop modal
  const [stopOpen, setStopOpen] = useState(false);
  const [stopAddr, setStopAddr] = useState("");
  const [stopMinutes, setStopMinutes] = useState("");

  const { permission, last, error } = useDriverLocationStream({ bookingId: id });

  // Load trip details
  const load = async () => {
    try {
      const b = await driverGetBookingDetail(id);
      setBooking(b);
    } catch (e: any) {
      Alert.alert("Could not load trip", e?.response?.data?.detail || "Please go back and try again.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [id]);

  const phase: Status = (booking?.trip_status as Status) || "assigned";
  const nextAction = NEXT_STATUS[phase];

  const callCustomer = () => booking?.customer_phone && Linking.openURL(`tel:${booking.customer_phone}`);
  const smsCustomer  = () => booking?.customer_phone && Linking.openURL(`sms:${booking.customer_phone}`);
  const navigate = () => {
    const target = (phase === "assigned" || phase === "en_route") ? booking?.pickup_location : booking?.dropoff_location;
    if (!target) return;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(target)}&travelmode=driving`;
    Linking.openURL(url);
  };

  const advanceStatus = async () => {
    if (!nextAction) return;
    if (nextAction.next === "completed") {
      Alert.alert("End trip?", "Mark this trip as completed?", [
        { text: "Cancel", style: "cancel" },
        { text: "End trip", style: "destructive", onPress: doAdvance },
      ]);
      return;
    }
    doAdvance();
  };
  const doAdvance = async () => {
    if (!nextAction) return;
    setWorking(true);
    try {
      await driverUpdateBookingStatus(id, nextAction.next);
      await load();
      if (nextAction.next === "completed") {
        Alert.alert("Trip ended", "Great work. The customer has been notified.", [
          { text: "Done", onPress: () => router.replace("/(driver)/driver-trips") },
        ]);
      }
    } catch (e: any) {
      Alert.alert("Could not update", e?.response?.data?.detail || "Try again.");
    } finally {
      setWorking(false);
    }
  };

  const submitWaitTime = async () => {
    const mins = parseInt(waitMinutes, 10);
    if (!mins || mins < 1) { Alert.alert("Enter the total wait minutes."); return; }
    setWorking(true);
    try {
      const res = await driverRecordWaitTime(id, mins);
      setWaitOpen(false);
      setWaitMinutes("");
      await load();
      if (res.already_charged) {
        Alert.alert("Already recorded", `Wait time was previously charged ($${res.amount}).`);
      } else if (res.chargeable_minutes != null) {
        const fee = (res.amount ?? 0).toFixed(2);
        Alert.alert("Wait time recorded", `${mins} minutes logged · grace ${res.grace_minutes ?? 0} min · chargeable ${res.chargeable_minutes} min · ~$${fee}. Admin reviews before charging.`);
      } else {
        Alert.alert("Wait time recorded", `${mins} minutes logged. Admin reviews before charging.`);
      }
    } catch (e: any) {
      Alert.alert("Could not record", e?.response?.data?.detail || "Try again.");
    } finally {
      setWorking(false);
    }
  };

  const submitMidTripStop = async () => {
    if (!stopAddr.trim() || stopAddr.trim().length < 4) { Alert.alert("Enter the stop address."); return; }
    const mins = parseInt(stopMinutes, 10) || 0;
    setWorking(true);
    try {
      const res = await driverRecordMidTripStop(id, { stop_address: stopAddr.trim(), minutes_at_stop: mins });
      setStopOpen(false);
      setStopAddr("");
      setStopMinutes("");
      await load();
      const fee = res?.stop?.amount?.toFixed(2) ?? "0.00";
      Alert.alert("Stop recorded", `Detour ~${res?.stop?.detour_miles ?? 0} mi · waited ${mins} min · ~$${fee}. Admin reviews before charging.`);
    } catch (e: any) {
      Alert.alert("Could not record", e?.response?.data?.detail || "Try again.");
    } finally {
      setWorking(false);
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator color={colors.gold} />
      </View>
    );
  }
  if (!booking) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg, justifyContent: "center", alignItems: "center", padding: 24 }}>
        <Text style={{ color: "#fff" }}>Trip not found.</Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 16 }}><Text style={{ color: colors.gold }}>Back</Text></Pressable>
      </SafeAreaView>
    );
  }

  const stopsCount = (booking.mid_trip_stops || []).length;

  return (
    <View style={s.root}>
      <SafeAreaView style={{ paddingHorizontal: 16 }} edges={["top"]}>
        <View style={s.topRow}>
          <Pressable testID="driver-trip-back" onPress={() => router.back()} style={s.iconBtn}>
            <ChevronLeft size={18} color="#fff" />
          </Pressable>
          <View style={s.phasePill}>
            <Text style={s.phaseTxt}>{STATUS_LABEL[phase]}</Text>
          </View>
          <Pressable testID="driver-trip-navigate" onPress={navigate} style={[s.iconBtn, s.iconBtnGold]}>
            <Navigation size={15} color="#000" />
          </Pressable>
        </View>

        <View style={s.streamStatus}>
          {permission === "granted" && !error ? (
            <><Wifi size={11} color={colors.success} /><Text style={[s.streamTxt, { color: colors.success }]}>Sharing GPS · {last ? "live" : "syncing"}</Text></>
          ) : (
            <><WifiOff size={11} color={colors.error} /><Text style={[s.streamTxt, { color: colors.error }]}>{error || "Waiting for location permission"}</Text></>
          )}
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 100 }}>
        {/* Customer */}
        <View style={s.customerCard}>
          <View style={s.customerRow}>
            <View style={s.avatar}><UserIcon size={20} color={colors.gold} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.customerName}>{booking.customer_name || "Passenger"}</Text>
              <Text style={s.customerSub}>{booking.passengers || 1} passenger{booking.passengers === 1 ? "" : "s"} · {booking.vehicle_type}</Text>
              {!!booking.confirmation_number && <Text style={s.confNum}>#{booking.confirmation_number}</Text>}
            </View>
          </View>
          <View style={s.actionsRow}>
            <Pressable testID="driver-call-customer" onPress={callCustomer} style={[s.actionBtn, s.actionPrimary]}>
              <Phone size={14} color="#000" />
              <Text style={s.actionPrimaryTxt}>Call</Text>
            </Pressable>
            <Pressable testID="driver-sms-customer" onPress={smsCustomer} style={[s.actionBtn, s.actionOutline]}>
              <MessageSquare size={14} color={colors.gold} />
              <Text style={s.actionOutlineTxt}>Message</Text>
            </Pressable>
          </View>
        </View>

        {/* Route */}
        <View style={s.routeCard}>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={s.timeline}>
              <View style={[s.dot, { backgroundColor: colors.gold }]} />
              <View style={s.line} />
              <View style={[s.dot, { backgroundColor: "rgba(255,255,255,0.4)" }]} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>PICKUP</Text>
              <Text style={s.addr}>{booking.pickup_location}</Text>
              <Text style={s.muted}>{booking.pickup_date} · {booking.pickup_time}</Text>
              <View style={{ height: 14 }} />
              <Text style={s.label}>DROP-OFF</Text>
              <Text style={s.addr}>{booking.dropoff_location}</Text>
            </View>
          </View>
          {!!booking.notes && (
            <View style={s.notes}>
              <Text style={s.notesLabel}>NOTES</Text>
              <Text style={s.notesTxt}>{booking.notes}</Text>
            </View>
          )}
        </View>

        {/* Wait time + mid-trip actions */}
        <View style={s.extrasRow}>
          <Pressable testID="driver-add-wait" onPress={() => setWaitOpen(true)} style={s.extraBtn}>
            <Clock size={14} color={colors.gold} />
            <Text style={s.extraTxt}>Record wait time</Text>
            {booking.wait_time_minutes_pending != null && (
              <View style={s.extraBadge}><Text style={s.extraBadgeTxt}>{booking.wait_time_minutes_pending}m</Text></View>
            )}
          </Pressable>
          <Pressable testID="driver-add-stop" onPress={() => setStopOpen(true)} style={s.extraBtn}>
            <Plus size={14} color={colors.gold} />
            <Text style={s.extraTxt}>Add stop</Text>
            {stopsCount > 0 && (
              <View style={s.extraBadge}><Text style={s.extraBadgeTxt}>{stopsCount}</Text></View>
            )}
          </Pressable>
        </View>

        {stopsCount > 0 && (
          <View style={s.stopsCard}>
            <Text style={s.stopsLabel}>Mid-trip stops</Text>
            {booking.mid_trip_stops.map((st: any, i: number) => (
              <View key={st.id || i} style={s.stopRow}>
                <MapPin size={12} color={colors.gold} />
                <View style={{ flex: 1 }}>
                  <Text style={s.stopAddr} numberOfLines={1}>{st.address}</Text>
                  <Text style={s.stopMeta}>{st.minutes_at_stop} min · ~{st.detour_miles?.toFixed?.(1) ?? 0} mi · ${st.amount?.toFixed?.(2) ?? "0.00"}</Text>
                </View>
                <Text style={[s.stopBadge, st.status === "charged" ? s.stopBadgeOk : s.stopBadgePending]}>
                  {st.status === "charged" ? "charged" : "pending"}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Status CTA */}
        {nextAction && (
          <Button
            testID="driver-advance-status"
            onPress={advanceStatus}
            disabled={working}
            icon={<Check size={14} color="#000" />}
            style={{ marginTop: 20 }}
          >
            {nextAction.label}
          </Button>
        )}
        {!nextAction && (
          <View style={s.completedCard}>
            <Check size={20} color={colors.success} />
            <Text style={s.completedTxt}>Trip completed.</Text>
          </View>
        )}
      </ScrollView>

      {/* Wait time modal */}
      <Modal visible={waitOpen} animationType="slide" transparent>
        <Pressable onPress={() => setWaitOpen(false)} style={s.modalBackdrop}>
          <Pressable onPress={(e) => e.stopPropagation()} style={s.modalSheet}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>Record wait time</Text>
            <Text style={s.modalSub}>
              Enter the total minutes you waited. Airport pickups get a 45-min grace; other rides get 15 min. Admin reviews and charges before billing the card on file.
            </Text>
            <TextInput
              testID="driver-wait-input"
              value={waitMinutes}
              onChangeText={setWaitMinutes}
              keyboardType="number-pad"
              placeholder="e.g. 25"
              placeholderTextColor="rgba(255,255,255,0.3)"
              style={s.modalInput}
              autoFocus
            />
            <Pressable testID="driver-wait-submit" onPress={submitWaitTime} disabled={working} style={[s.modalBtn, working && { opacity: 0.6 }]}>
              {working ? <ActivityIndicator color="#000" size="small" /> : <Text style={s.modalBtnTxt}>Submit</Text>}
            </Pressable>
            <Pressable onPress={() => setWaitOpen(false)} style={{ marginTop: 12 }}>
              <Text style={{ color: "rgba(255,255,255,0.55)", textAlign: "center", fontSize: 12 }}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Mid-trip stop modal */}
      <Modal visible={stopOpen} animationType="slide" transparent>
        <Pressable onPress={() => setStopOpen(false)} style={s.modalBackdrop}>
          <Pressable onPress={(e) => e.stopPropagation()} style={s.modalSheet}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>Add unplanned stop</Text>
            <Text style={s.modalSub}>
              Logs the detour + extra wait time. Detour billed at the vehicle's per-mile rate; wait time over 10 min billed at the per-minute rate.
            </Text>
            <TextInput
              testID="driver-stop-addr"
              value={stopAddr}
              onChangeText={setStopAddr}
              placeholder="Stop address (e.g. Starbucks · 350 California St)"
              placeholderTextColor="rgba(255,255,255,0.3)"
              style={s.modalInput}
              autoFocus
            />
            <TextInput
              testID="driver-stop-mins"
              value={stopMinutes}
              onChangeText={setStopMinutes}
              keyboardType="number-pad"
              placeholder="Minutes at this stop (e.g. 15)"
              placeholderTextColor="rgba(255,255,255,0.3)"
              style={s.modalInput}
            />
            <Pressable testID="driver-stop-submit" onPress={submitMidTripStop} disabled={working} style={[s.modalBtn, working && { opacity: 0.6 }]}>
              {working ? <ActivityIndicator color="#000" size="small" /> : <Text style={s.modalBtnTxt}>Add stop</Text>}
            </Pressable>
            <Pressable onPress={() => setStopOpen(false)} style={{ marginTop: 12 }}>
              <Text style={{ color: "rgba(255,255,255,0.55)", textAlign: "center", fontSize: 12 }}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 },
  iconBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" },
  iconBtnGold: { backgroundColor: colors.gold, borderColor: colors.gold },
  phasePill: { backgroundColor: "rgba(212,175,55,0.1)", paddingHorizontal: 16, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: "rgba(212,175,55,0.4)" },
  phaseTxt: { color: colors.gold, fontSize: 11, fontWeight: "600", letterSpacing: 0.5 },
  streamStatus: { alignSelf: "center", flexDirection: "row", gap: 5, alignItems: "center", paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", marginTop: 12 },
  streamTxt: { fontSize: 10, fontWeight: "600" },

  customerCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, padding: 14, marginTop: 6 },
  customerRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: "rgba(212,175,55,0.15)", alignItems: "center", justifyContent: "center" },
  customerName: { color: "#fff", fontSize: 15, fontWeight: "500" },
  customerSub: { color: "rgba(255,255,255,0.5)", fontSize: 11, marginTop: 2 },
  confNum: { color: colors.gold, fontSize: 10, marginTop: 3, fontWeight: "600", letterSpacing: 1 },
  actionsRow: { flexDirection: "row", gap: 8 },
  actionBtn: { flex: 1, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6, paddingVertical: 10, borderRadius: 999 },
  actionPrimary: { backgroundColor: colors.gold },
  actionPrimaryTxt: { color: "#000", fontSize: 12, fontWeight: "600" },
  actionOutline: { borderWidth: 1, borderColor: "rgba(212,175,55,0.5)" },
  actionOutlineTxt: { color: colors.gold, fontSize: 12, fontWeight: "500" },

  routeCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, padding: 14, marginTop: 12 },
  timeline: { alignItems: "center", paddingTop: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  line: { width: 1, flex: 1, backgroundColor: "rgba(255,255,255,0.15)", marginVertical: 6 },
  label: { color: "rgba(255,255,255,0.45)", fontSize: 9, letterSpacing: 1.5, fontWeight: "600", marginBottom: 4 },
  addr: { color: "#fff", fontSize: 13 },
  muted: { color: "rgba(255,255,255,0.45)", fontSize: 11, marginTop: 2 },
  notes: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)" },
  notesLabel: { color: "rgba(255,255,255,0.45)", fontSize: 9, letterSpacing: 1.5, fontWeight: "600", marginBottom: 4 },
  notesTxt: { color: "rgba(255,255,255,0.7)", fontSize: 12, lineHeight: 18 },

  extrasRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  extraBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderRadius: radius.lg, borderWidth: 1, borderColor: "rgba(212,175,55,0.3)", backgroundColor: "rgba(212,175,55,0.04)" },
  extraTxt: { color: colors.gold, fontSize: 12, fontWeight: "500" },
  extraBadge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999, backgroundColor: colors.gold },
  extraBadgeTxt: { color: "#000", fontSize: 10, fontWeight: "700" },

  stopsCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, padding: 12, marginTop: 12 },
  stopsLabel: { color: "rgba(255,255,255,0.45)", fontSize: 9, letterSpacing: 1.5, fontWeight: "600", marginBottom: 8 },
  stopRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.04)" },
  stopAddr: { color: "#fff", fontSize: 12 },
  stopMeta: { color: "rgba(255,255,255,0.5)", fontSize: 11, marginTop: 2 },
  stopBadge: { fontSize: 9, fontWeight: "700", letterSpacing: 1, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 },
  stopBadgeOk: { color: colors.success, backgroundColor: "rgba(16,185,129,0.12)" },
  stopBadgePending: { color: colors.gold, backgroundColor: "rgba(212,175,55,0.12)" },

  completedCard: { flexDirection: "row", alignItems: "center", gap: 10, padding: 16, borderRadius: radius.xl, backgroundColor: "rgba(16,185,129,0.08)", borderWidth: 1, borderColor: "rgba(16,185,129,0.3)", marginTop: 20 },
  completedTxt: { color: colors.success, fontSize: 13, fontWeight: "500" },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: "#0e0e0e", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22, paddingBottom: 30, borderTopWidth: 1, borderColor: "rgba(212,175,55,0.2)" },
  modalHandle: { alignSelf: "center", width: 38, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.2)", marginBottom: 16 },
  modalTitle: { color: "#fff", fontSize: 18, fontWeight: "500", marginBottom: 6 },
  modalSub: { color: "rgba(255,255,255,0.55)", fontSize: 12, lineHeight: 18, marginBottom: 16 },
  modalInput: { color: "#fff", fontSize: 14, paddingHorizontal: 14, paddingVertical: 13, borderRadius: radius.lg, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", backgroundColor: "rgba(255,255,255,0.04)", marginBottom: 10 },
  modalBtn: { marginTop: 8, paddingVertical: 14, borderRadius: 999, backgroundColor: colors.gold, alignItems: "center" },
  modalBtnTxt: { color: "#000", fontSize: 13, fontWeight: "600" },
});
