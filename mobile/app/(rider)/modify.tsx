import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, ActivityIndicator, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ChevronLeft, MapPin, Calendar, Clock, Users, FileText, Sparkles } from "lucide-react-native";
import Button from "@/components/Button";
import AddressPicker from "@/components/AddressPicker";
import DateTimeModal from "@/components/DateTimeModal";
import { colors, radius } from "@/theme";
import { fetchBookingDetail, customerModifyBooking } from "@/api";

/** Format an ISO datetime for the read-only field. */
function fmtWhen(iso: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch { return iso; }
}

export default function ModifyTrip() {
  const router = useRouter();
  const { bid } = useLocalSearchParams<{ bid: string }>();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [booking, setBooking] = useState<any>(null);

  const [pickup, setPickup] = useState("");
  const [dropoff, setDropoff] = useState("");
  const [datetime, setDatetime] = useState<string>("");
  const [vehicleType, setVehicleType] = useState("");
  const [passengers, setPassengers] = useState("");
  const [notes, setNotes] = useState("");

  const [picker, setPicker] = useState<null | "pickup" | "dropoff">(null);
  const [dtOpen, setDtOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const b = await fetchBookingDetail(bid as string);
        setBooking(b);
        setPickup(b.pickup_location || "");
        setDropoff(b.dropoff_location || "");
        // Try to assemble an ISO datetime from pickup_date+pickup_time so the picker
        // can pre-fill. If the booking has pickup_datetime, prefer it.
        if (b.pickup_datetime) {
          setDatetime(b.pickup_datetime);
        } else if (b.pickup_date && b.pickup_time) {
          setDatetime(`${b.pickup_date}T${b.pickup_time}:00`);
        }
        setVehicleType(b.vehicle_type || "");
        setPassengers(String(b.passengers || 1));
        setNotes(b.notes || "");
      } catch (e: any) {
        Alert.alert("Couldn't load trip", e?.response?.data?.detail || "Please try again.");
        router.back();
      } finally {
        setLoading(false);
      }
    })();
  }, [bid]);

  const isPaid = booking?.payment_status === "paid";

  const save = async () => {
    if (isPaid) {
      Alert.alert(
        "Trip already paid",
        "This reservation is paid. To make changes, please call dispatch at (650) 410-0687 so we can rebalance the fare and process any refund.",
      );
      return;
    }
    setSaving(true);
    try {
      const changes: any = {};
      if (pickup.trim() && pickup !== booking.pickup_location) changes.pickup_location = pickup.trim();
      if (dropoff.trim() && dropoff !== booking.dropoff_location) changes.dropoff_location = dropoff.trim();
      if (datetime && datetime !== (booking.pickup_datetime || `${booking.pickup_date}T${booking.pickup_time}:00`)) {
        changes.pickup_datetime = datetime;
      }
      if (vehicleType && vehicleType !== booking.vehicle_type) changes.vehicle_type = vehicleType;
      if (passengers && parseInt(passengers, 10) !== (booking.passengers || 1)) {
        changes.passengers = parseInt(passengers, 10);
      }
      if (notes !== (booking.notes || "")) changes.notes = notes;

      if (Object.keys(changes).length === 0) {
        Alert.alert("No changes", "You haven't changed anything yet.");
        setSaving(false);
        return;
      }

      const res = await customerModifyBooking(bid as string, changes);
      const priceChanged = res?.pricing_changed && res?.new_quote_amount != null;
      const priceMsg = priceChanged
        ? `\n\nNew fare: $${Number(res.new_quote_amount).toFixed(2)} (was $${Number(res.previous_quote_amount).toFixed(2)}).`
        : "";
      Alert.alert("Trip updated", `${res?.message || "Saved."}${priceMsg}`, [
        { text: "OK", onPress: () => router.replace("/(rider)/(tabs)/trips") },
      ]);
    } catch (e: any) {
      const detail = e?.response?.data?.detail || "Try again.";
      Alert.alert("Couldn't update", detail);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator color={colors.gold} />
      </View>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.topRow}>
        <Pressable testID="modify-back" onPress={() => router.back()} hitSlop={8} style={s.iconBtn}>
          <ChevronLeft size={18} color="#fff" />
        </Pressable>
        <Text style={s.title}>Modify trip</Text>
        <View style={s.iconBtn} />
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        {!!booking?.confirmation_number && (
          <Text style={s.subTitle}>Reservation #{booking.confirmation_number}</Text>
        )}

        {isPaid && (
          <View style={s.paidWarn}>
            <Sparkles size={14} color={colors.gold} />
            <Text style={s.paidWarnTxt}>
              This trip is paid. Call <Text style={s.paidLink}>(650) 410-0687</Text> to make changes.
            </Text>
          </View>
        )}

        {/* Pickup */}
        <Text style={s.label}>Pickup</Text>
        <Pressable testID="modify-pickup" onPress={() => !isPaid && setPicker("pickup")} style={[s.field, isPaid && { opacity: 0.5 }]}>
          <MapPin size={14} color={colors.gold} />
          <Text style={[s.fieldTxt, !pickup && { color: "rgba(255,255,255,0.4)" }]} numberOfLines={2}>
            {pickup || "Tap to enter pickup address"}
          </Text>
        </Pressable>

        {/* Dropoff */}
        <Text style={s.label}>Drop-off</Text>
        <Pressable testID="modify-dropoff" onPress={() => !isPaid && setPicker("dropoff")} style={[s.field, isPaid && { opacity: 0.5 }]}>
          <MapPin size={14} color="rgba(255,255,255,0.55)" />
          <Text style={[s.fieldTxt, !dropoff && { color: "rgba(255,255,255,0.4)" }]} numberOfLines={2}>
            {dropoff || "Tap to enter drop-off address"}
          </Text>
        </Pressable>

        {/* Datetime */}
        <Text style={s.label}>Pickup time</Text>
        <Pressable testID="modify-datetime" onPress={() => !isPaid && setDtOpen(true)} style={[s.field, isPaid && { opacity: 0.5 }]}>
          <Calendar size={14} color={colors.gold} />
          <Text style={[s.fieldTxt, !datetime && { color: "rgba(255,255,255,0.4)" }]}>
            {datetime ? fmtWhen(datetime) : "Tap to choose date & time"}
          </Text>
        </Pressable>

        {/* Passengers */}
        <Text style={s.label}>Passengers</Text>
        <View style={[s.field, isPaid && { opacity: 0.5 }]}>
          <Users size={14} color="rgba(255,255,255,0.55)" />
          <TextInput
            testID="modify-passengers"
            value={passengers}
            onChangeText={setPassengers}
            editable={!isPaid}
            keyboardType="number-pad"
            placeholder="1"
            placeholderTextColor="rgba(255,255,255,0.3)"
            style={s.fieldInput}
          />
        </View>

        {/* Notes */}
        <Text style={s.label}>Notes for your chauffeur</Text>
        <View style={[s.field, { alignItems: "flex-start", minHeight: 80 }, isPaid && { opacity: 0.5 }]}>
          <FileText size={14} color="rgba(255,255,255,0.55)" style={{ marginTop: 3 }} />
          <TextInput
            testID="modify-notes"
            value={notes}
            onChangeText={setNotes}
            editable={!isPaid}
            multiline
            placeholder="Special instructions (e.g. car seat, flight number, gate code)"
            placeholderTextColor="rgba(255,255,255,0.3)"
            style={[s.fieldInput, { minHeight: 60, textAlignVertical: "top", paddingTop: 0 }]}
          />
        </View>

        <View style={s.priceCard}>
          <Text style={s.priceLabel}>Current quote</Text>
          <Text style={s.priceValue}>
            {booking.quote_amount != null ? `$${Number(booking.quote_amount).toFixed(2)}` : "—"}
          </Text>
          <Text style={s.priceSub}>
            If pickup, drop-off, time, or vehicle changes, the fare may be re-quoted automatically.
          </Text>
        </View>

        <Button
          testID="modify-save"
          onPress={save}
          loading={saving}
          disabled={isPaid || saving}
          style={{ marginTop: 18 }}
        >
          {saving ? "Saving…" : isPaid ? "Call dispatch to modify" : "Save changes"}
        </Button>
      </ScrollView>

      <AddressPicker
        visible={picker !== null}
        label={picker === "pickup" ? "Pickup address" : "Drop-off address"}
        initialValue={picker === "pickup" ? pickup : dropoff}
        onClose={() => setPicker(null)}
        onSelect={(val: string) => {
          if (picker === "pickup") setPickup(val);
          else if (picker === "dropoff") setDropoff(val);
          setPicker(null);
        }}
      />
      <DateTimeModal
        visible={dtOpen}
        initial={datetime}
        onClose={() => setDtOpen(false)}
        onConfirm={(iso) => { setDatetime(iso); setDtOpen(false); }}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 8 },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  title: { color: "#fff", fontSize: 16, fontWeight: "500" },
  scroll: { paddingHorizontal: 20, paddingBottom: 60 },
  subTitle: { color: colors.gold, fontSize: 11, letterSpacing: 1.5, fontWeight: "600", marginTop: 6, marginBottom: 14 },
  paidWarn: { flexDirection: "row", gap: 10, alignItems: "center", padding: 14, borderRadius: radius.lg, borderWidth: 1, borderColor: "rgba(212,175,55,0.3)", backgroundColor: "rgba(212,175,55,0.05)", marginBottom: 14 },
  paidWarnTxt: { flex: 1, color: "rgba(255,255,255,0.85)", fontSize: 12, lineHeight: 18 },
  paidLink: { color: colors.gold, fontWeight: "600" },
  label: { color: "rgba(255,255,255,0.5)", fontSize: 10, letterSpacing: 2, fontWeight: "600", marginTop: 14, marginBottom: 6 },
  field: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 13, borderRadius: radius.lg, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", backgroundColor: "rgba(255,255,255,0.03)" },
  fieldTxt: { flex: 1, color: "#fff", fontSize: 13 },
  fieldInput: { flex: 1, color: "#fff", fontSize: 13, padding: 0 },
  priceCard: { marginTop: 22, padding: 14, borderRadius: radius.lg, borderWidth: 1, borderColor: "rgba(212,175,55,0.2)", backgroundColor: "rgba(212,175,55,0.04)" },
  priceLabel: { color: "rgba(255,255,255,0.5)", fontSize: 10, letterSpacing: 1.5, fontWeight: "600", marginBottom: 4 },
  priceValue: { color: colors.gold, fontSize: 26, fontWeight: "500" },
  priceSub: { color: "rgba(255,255,255,0.55)", fontSize: 11, lineHeight: 17, marginTop: 8 },
});
