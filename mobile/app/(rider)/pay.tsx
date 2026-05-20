import { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ChevronLeft, CreditCard, Sparkles, Apple, Check } from "lucide-react-native";
import Button from "@/components/Button";
import { colors, radius } from "@/theme";
import { useBooking } from "@/store/booking";

export default function PayScreen() {
  const router = useRouter();
  const trip = useBooking(s => s.trip);
  const resetTrip = useBooking(s => s.resetTrip);
  const [promo, setPromo] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const baseFare = trip.quoteAmount || 0;
  const serviceFee = +(baseFare * 0.02).toFixed(2);
  const total = +(baseFare + serviceFee).toFixed(2);

  const onPay = async () => {
    setSubmitting(true);
    // Milestone 2 placeholder — real Stripe checkout wiring lands in Milestone 3.
    setTimeout(() => {
      setSubmitting(false);
      Alert.alert(
        "Coming soon",
        "Live Stripe checkout from inside the mobile app will be wired up in the next milestone. Your booking has been saved as a draft.",
        [{ text: "OK", onPress: () => { resetTrip(); router.replace("/(rider)/home"); } }]
      );
    }, 800);
  };

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Pressable testID="pay-back" onPress={() => router.back()} style={s.back}>
          <ChevronLeft size={16} color="#fff" />
        </Pressable>
        <Text style={s.stepLabel}>CONFIRM & PAY</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        <Text style={s.h1}>
          Review your <Text style={s.h1Em}>ride</Text>
        </Text>

        {/* Itinerary */}
        <View style={s.card}>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={s.timeline}>
              <View style={[s.dot, { backgroundColor: colors.gold }]} />
              <View style={s.line} />
              <View style={[s.dot, { backgroundColor: "rgba(255,255,255,0.5)" }]} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>PICKUP</Text>
              <Text style={s.addr}>{trip.pickup}</Text>
              <Text style={s.muted}>{trip.datetime ? new Date(trip.datetime).toLocaleString() : "—"}</Text>
              <View style={{ height: 12 }} />
              <Text style={s.label}>DROP-OFF</Text>
              <Text style={s.addr}>{trip.dropoff}</Text>
            </View>
          </View>
        </View>

        {/* Vehicle */}
        <View style={[s.card, s.cardRow]}>
          <View>
            <Text style={s.cardTitle}>{trip.vehicleType}</Text>
            <Text style={s.muted}>Meet & Greet included</Text>
          </View>
        </View>

        {/* Promo */}
        <View style={s.promoCard}>
          <Sparkles size={14} color={colors.gold} />
          <Text style={s.promoTxt}>Have a promo code? (coming soon)</Text>
        </View>

        {/* Price breakdown */}
        <View style={s.breakdown}>
          <View style={s.brRow}>
            <Text style={s.brLabel}>Base fare</Text>
            <Text style={s.brValue}>${baseFare.toFixed(2)}</Text>
          </View>
          <View style={s.brRow}>
            <Text style={s.brLabel}>Service fee</Text>
            <Text style={s.brValue}>${serviceFee.toFixed(2)}</Text>
          </View>
          <View style={s.brDivider} />
          <View style={s.brRow}>
            <Text style={s.totalLabel}>Total</Text>
            <Text style={s.totalValue}>${total.toFixed(2)}</Text>
          </View>
        </View>
      </ScrollView>

      <View style={s.ctaBar}>
        <Pressable testID="pay-apple" style={s.applePay} disabled>
          <Apple size={15} color="#000" />
          <Text style={s.appleTxt}>Pay with Apple Pay  ·  Coming soon</Text>
        </Pressable>
        <Button
          testID="pay-card"
          onPress={onPay}
          loading={submitting}
          variant="outline"
          icon={<CreditCard size={14} color={colors.gold} />}
          style={{ marginTop: 10 }}
        >
          Pay with Card
        </Button>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 8 },
  back: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  stepLabel: { color: "rgba(255,255,255,0.5)", fontSize: 10, letterSpacing: 2.5, fontWeight: "600" },
  scroll: { paddingHorizontal: 20, paddingBottom: 220, paddingTop: 8 },
  h1: { color: "#fff", fontSize: 22, lineHeight: 26, marginTop: 6, marginBottom: 16 },
  h1Em: { color: colors.gold, fontStyle: "italic" },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, padding: 16, marginBottom: 12 },
  cardRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardTitle: { color: "#fff", fontSize: 14, fontWeight: "500" },
  timeline: { alignItems: "center", paddingTop: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  line: { width: 1, flex: 1, backgroundColor: "rgba(255,255,255,0.15)", marginVertical: 6 },
  label: { color: "rgba(255,255,255,0.45)", fontSize: 10, letterSpacing: 2, fontWeight: "600", marginBottom: 4 },
  addr: { color: "#fff", fontSize: 13 },
  muted: { color: "rgba(255,255,255,0.45)", fontSize: 11, marginTop: 2 },
  promoCard: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: radius.lg, borderWidth: 1, borderStyle: "dashed", borderColor: "rgba(212,175,55,0.3)", backgroundColor: "rgba(212,175,55,0.04)", marginBottom: 16 },
  promoTxt: { color: "rgba(255,255,255,0.6)", fontSize: 12 },
  breakdown: { marginTop: 4 },
  brRow: { flexDirection: "row", justifyContent: "space-between", marginVertical: 5 },
  brLabel: { color: "rgba(255,255,255,0.55)", fontSize: 12 },
  brValue: { color: "#fff", fontSize: 12 },
  brDivider: { height: 1, backgroundColor: "rgba(255,255,255,0.1)", marginVertical: 10 },
  totalLabel: { color: "#fff", fontSize: 13, fontWeight: "500" },
  totalValue: { color: colors.gold, fontSize: 22, fontWeight: "700" },
  ctaBar: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 18, paddingTop: 14, paddingBottom: 30, backgroundColor: "rgba(5,5,5,0.95)", borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)" },
  applePay: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, backgroundColor: "#fff", paddingVertical: 14, borderRadius: 999, opacity: 0.6 },
  appleTxt: { color: "#000", fontSize: 12, fontWeight: "500" },
});
