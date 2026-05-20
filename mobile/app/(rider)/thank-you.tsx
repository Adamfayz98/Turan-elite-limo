import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Check, MapPin, Calendar, Car, ArrowRight, Sparkles } from "lucide-react-native";
import Button from "@/components/Button";
import { colors, radius, assets } from "@/theme";
import { fetchBookingDetail } from "@/api";
import { useBooking } from "@/store/booking";

export default function ThankYou() {
  const router = useRouter();
  const params = useLocalSearchParams<{ bid?: string; booking_id?: string }>();
  const bid = (params.bid || params.booking_id) as string | undefined;
  const resetTrip = useBooking(s => s.resetTrip);
  const [loading, setLoading] = useState(true);
  const [trip, setTrip] = useState<any>(null);

  useEffect(() => {
    if (!bid) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      // Stripe webhook may lag a few seconds; retry up to 5x
      for (let i = 0; i < 5; i++) {
        try {
          const t = await fetchBookingDetail(bid);
          if (cancelled) return;
          setTrip(t);
          if (t.payment_status === "paid") break;
        } catch { /* ignore */ }
        await new Promise(r => setTimeout(r, 1500));
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [bid]);

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.iconWrap}>
          <View style={s.iconGlow} />
          <View style={s.iconCircle}>
            <Check size={32} color="#000" strokeWidth={2.2} />
          </View>
        </View>

        <Text style={s.h1}>
          Booking <Text style={s.h1Em}>confirmed.</Text>
        </Text>
        <Text style={s.sub}>
          Thank you. Your chauffeur will be in touch shortly with arrival details.
        </Text>

        {loading && (
          <View style={s.loadingRow}>
            <ActivityIndicator color={colors.gold} />
            <Text style={s.loadingTxt}>Confirming payment…</Text>
          </View>
        )}

        {!loading && trip && (
          <View style={s.card}>
            {trip.confirmation_number && (
              <View style={s.confRow}>
                <Sparkles size={13} color={colors.gold} />
                <Text style={s.confTxt}>{trip.confirmation_number}</Text>
              </View>
            )}
            <Row icon={Calendar} label="When" value={`${trip.pickup_date} at ${trip.pickup_time}`} />
            <Row icon={MapPin} label="Pickup" value={trip.pickup_location} />
            <Row icon={MapPin} label="Drop-off" value={trip.dropoff_location} />
            <Row icon={Car} label="Vehicle" value={trip.vehicle_type} />
            <View style={s.divider} />
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>Total paid</Text>
              <Text style={s.totalValue}>${(trip.paid_amount || trip.quote_amount || 0).toFixed(2)}</Text>
            </View>
          </View>
        )}

        <Button
          testID="thankyou-done"
          onPress={() => { resetTrip(); router.replace("/home"); }}
          icon={<ArrowRight size={14} color="#000" />}
          style={{ marginTop: 20 }}
        >
          Back to home
        </Button>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ icon: Icon, label, value }: any) {
  return (
    <View style={s.row}>
      <Icon size={14} color={colors.gold} strokeWidth={1.6} />
      <View style={{ flex: 1 }}>
        <Text style={s.rowLabel}>{label.toUpperCase()}</Text>
        <Text style={s.rowValue}>{value}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 24, paddingTop: 48, paddingBottom: 60 },
  iconWrap: { alignItems: "center", marginBottom: 22 },
  iconGlow: { position: "absolute", width: 120, height: 120, borderRadius: 60, backgroundColor: "rgba(212,175,55,0.18)", top: -6 },
  iconCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.gold, alignItems: "center", justifyContent: "center", shadowColor: colors.gold, shadowOpacity: 0.6, shadowRadius: 20, shadowOffset: { width: 0, height: 0 } },
  h1: { color: "#fff", fontSize: 28, lineHeight: 32, textAlign: "center" },
  h1Em: { color: colors.gold, fontStyle: "italic" },
  sub: { color: "rgba(255,255,255,0.6)", fontSize: 13, lineHeight: 18, textAlign: "center", marginTop: 8, marginBottom: 24 },
  loadingRow: { flexDirection: "row", justifyContent: "center", gap: 10, alignItems: "center", paddingVertical: 32 },
  loadingTxt: { color: "rgba(255,255,255,0.6)", fontSize: 12 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, padding: 18 },
  confRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6, marginBottom: 14, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" },
  confTxt: { color: colors.gold, fontSize: 11, letterSpacing: 2, fontWeight: "600" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 9 },
  rowLabel: { color: "rgba(255,255,255,0.45)", fontSize: 9, letterSpacing: 1.5, fontWeight: "600" },
  rowValue: { color: "#fff", fontSize: 13, marginTop: 2 },
  divider: { height: 1, backgroundColor: "rgba(255,255,255,0.08)", marginVertical: 10 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  totalLabel: { color: "rgba(255,255,255,0.55)", fontSize: 12 },
  totalValue: { color: colors.gold, fontSize: 22, fontWeight: "700" },
});
