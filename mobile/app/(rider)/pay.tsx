import { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, Linking, Platform, TextInput, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ChevronLeft, CreditCard, Sparkles, Apple, Check, Tag, X, Home } from "lucide-react-native";
import * as WebBrowser from "expo-web-browser";
import Button from "@/components/Button";
import { colors, radius } from "@/theme";
import { useBooking } from "@/store/booking";
import { useAuth } from "@/store/auth";
import { bookAndPay, validatePromo } from "@/api";

export default function PayScreen() {
  const router = useRouter();
  const trip = useBooking(s => s.trip);
  const resetTrip = useBooking(s => s.resetTrip);
  const user = useAuth(s => s.user);
  const [promo, setPromo] = useState("");
  const [promoBusy, setPromoBusy] = useState(false);
  const [promoApplied, setPromoApplied] = useState<{ code: string; discount: number; description: string } | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [waitConsent, setWaitConsent] = useState(false);
  const [damageConsent, setDamageConsent] = useState(false);
  const [cancelConsent, setCancelConsent] = useState(false);
  const allConsentsGiven = waitConsent && damageConsent && cancelConsent;

  // Guests must sign in or create an account before paying.
  if (!user) {
    return (
      <SafeAreaView style={s.gateRoot}>
        <View style={s.gateCard}>
          <Sparkles size={20} color={colors.gold} />
          <Text style={s.gateH1}>One more step</Text>
          <Text style={s.gateSub}>
            Sign in or create an account to confirm your reservation. We need your name and email to send your trip details and chauffeur confirmation.
          </Text>
          <Pressable testID="pay-gate-signin" onPress={() => router.push("/(rider)/auth")} style={s.gateBtn}>
            <Text style={s.gateBtnTxt}>Sign in / Create account</Text>
          </Pressable>
          <Pressable testID="pay-gate-back" onPress={() => router.back()} hitSlop={8} style={{ marginTop: 14 }}>
            <Text style={s.gateLink}>← Back to quote</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const baseFare = trip.quoteAmount || 0;
  const promoDiscount = promoApplied?.discount || 0;
  const fareAfterPromo = Math.max(0, baseFare - promoDiscount);
  const serviceFee = +(fareAfterPromo * 0.02).toFixed(2);
  const total = +(fareAfterPromo + serviceFee).toFixed(2);

  const applyPromo = async () => {
    setPromoError(null);
    if (!promo.trim()) { setPromoError("Enter a code."); return; }
    setPromoBusy(true);
    try {
      const res = await validatePromo({
        code: promo.trim(),
        amount: baseFare,
        email: user?.email,
        vehicle_type: trip.vehicleType,
      });
      if (res.ok) {
        setPromoApplied({ code: res.code, discount: res.discount, description: res.description });
      } else {
        setPromoError(res.reason || "This code isn't valid.");
      }
    } catch {
      setPromoError("Could not check the code. Try again.");
    } finally {
      setPromoBusy(false);
    }
  };

  const clearPromo = () => { setPromoApplied(null); setPromo(""); setPromoError(null); };

  const onPay = async () => {
    if (!allConsentsGiven) {
      Alert.alert("Please review the policies", "You must agree to the wait-time, vehicle care, and cancellation policies before paying.");
      return;
    }
    if (!trip.vehicleType || !trip.quoteAmount) {
      Alert.alert("Missing trip details", "Go back and select a vehicle first.");
      return;
    }
    setSubmitting(true);
    try {
      const { checkout_url, booking_id } = await bookAndPay({
        pickup_location: trip.pickup,
        dropoff_location: trip.dropoff,
        pickup_datetime: trip.datetime,
        vehicle_type: trip.vehicleType,
        quote_amount: trip.quoteAmount,
        passenger_count: trip.passengerCount,
        promo_code: promoApplied?.code || promo || undefined,
        service_type: trip.serviceType,
        flight_number: trip.flightNumber,
        hours: trip.hours,
      });
      // Open Stripe Checkout. On native, this is an in-app browser tab that returns
      // via deep link configured on the backend (turanelitelimo://thank-you?...).
      // On web preview, fall back to a normal redirect.
      if (Platform.OS === "web") {
        window.location.href = checkout_url;
      } else {
        const result = await WebBrowser.openAuthSessionAsync(
          checkout_url,
          "turanelitelimo://thank-you",
          { showInRecents: true }
        );
        if (result.type === "success" && result.url) {
          // Deep link returned — parse & route to confirmation
          const m = result.url.match(/booking_id=([^&]+)/);
          const bid = m ? m[1] : booking_id;
          router.replace(`/(rider)/thank-you?bid=${bid}`);
          return;
        }
        // User dismissed without paying — go back to home
        router.replace("/home");
      }
    } catch (e: any) {
      const raw = e?.response?.data?.detail;
      const msg = typeof raw === "string" ? raw : "Could not start checkout. Please try again.";
      Alert.alert("Payment error", msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Pressable testID="pay-back" onPress={() => router.back()} style={s.back}>
          <ChevronLeft size={16} color="#fff" />
        </Pressable>
        <Text style={s.stepLabel}>CONFIRM & PAY</Text>
        <Pressable
          testID="pay-home"
          onPress={() => router.replace("/(rider)/(tabs)/discover")}
          style={s.back}
          hitSlop={10}
        >
          <Home size={16} color={colors.gold} strokeWidth={1.8} />
        </Pressable>
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
        {promoApplied ? (
          <View style={s.promoApplied}>
            <View style={s.promoIcon}><Check size={13} color={colors.gold} strokeWidth={2.4} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.promoCode}>{promoApplied.code} applied</Text>
              {!!promoApplied.description && <Text style={s.promoDescAlt}>{promoApplied.description}</Text>}
            </View>
            <Text style={s.promoSavings}>-${promoApplied.discount.toFixed(2)}</Text>
            <Pressable testID="pay-promo-clear" onPress={clearPromo} hitSlop={8} style={{ marginLeft: 8 }}>
              <X size={14} color="rgba(255,255,255,0.5)" />
            </Pressable>
          </View>
        ) : (
          <View style={s.promoInputRow}>
            <View style={s.promoInputWrap}>
              <Tag size={13} color="rgba(255,255,255,0.4)" />
              <TextInput
                testID="pay-promo-input"
                value={promo}
                onChangeText={(t) => { setPromo(t.toUpperCase()); setPromoError(null); }}
                placeholder="Promo code"
                placeholderTextColor="rgba(255,255,255,0.35)"
                autoCapitalize="characters"
                autoCorrect={false}
                style={s.promoInput}
              />
            </View>
            <Pressable
              testID="pay-promo-apply"
              onPress={applyPromo}
              disabled={promoBusy || !promo.trim()}
              style={[s.promoApplyBtn, (promoBusy || !promo.trim()) && { opacity: 0.5 }]}
            >
              {promoBusy ? <ActivityIndicator size="small" color="#000" /> : <Text style={s.promoApplyTxt}>Apply</Text>}
            </Pressable>
          </View>
        )}
        {promoError && <Text style={s.promoErr}>{promoError}</Text>}

        {/* Price breakdown */}
        <View style={s.breakdown}>
          <View style={s.brRow}>
            <Text style={s.brLabel}>Base fare</Text>
            <Text style={s.brValue}>${baseFare.toFixed(2)}</Text>
          </View>
          {promoApplied && (
            <View style={s.brRow}>
              <Text style={[s.brLabel, { color: colors.gold }]}>Promo ({promoApplied.code})</Text>
              <Text style={[s.brValue, { color: colors.gold }]}>-${promoDiscount.toFixed(2)}</Text>
            </View>
          )}
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

        {/* Consent — required to proceed */}
        <View style={s.consentBlock}>
          <Text style={s.consentLabel}>BEFORE YOU PAY</Text>
          <ConsentRow
            testID="pay-consent-wait"
            value={waitConsent}
            onChange={setWaitConsent}
            text={
              <>
                I agree the <Text style={s.cBold}>wait-time policy</Text> may apply: airports get a 45-min grace, other rides 15 min. Beyond that, a per-minute wait fee is auto-charged to the card on file.
              </>
            }
          />
          <ConsentRow
            testID="pay-consent-damage"
            value={damageConsent}
            onChange={setDamageConsent}
            text={
              <>
                I agree to the <Text style={s.cBold}>vehicle care policy</Text>: damages, soiling, or extra cleaning may be charged at actual cost. Each charge is itemized and emailed.
              </>
            }
          />
          <ConsentRow
            testID="pay-consent-cancel"
            value={cancelConsent}
            onChange={setCancelConsent}
            text={
              <>
                I agree to the <Text style={s.cBold}>cancellation tier policy</Text>: free up to 24h before pickup, 50% fee inside 24h, non-refundable inside 2h of pickup.
              </>
            }
          />
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
          disabled={!allConsentsGiven}
          icon={<CreditCard size={14} color="#000" />}
          style={{ marginTop: 10 }}
        >
          {submitting ? "Opening Stripe…" : !allConsentsGiven ? "Agree to policies to continue" : `Pay $${total.toFixed(2)} with Card`}
        </Button>
      </View>
    </SafeAreaView>
  );
}

/** Single consent row — small custom checkbox + tappable label. */
function ConsentRow({ value, onChange, text, testID }: { value: boolean; onChange: (v: boolean) => void; text: any; testID?: string; }) {
  return (
    <Pressable testID={testID} onPress={() => onChange(!value)} style={s.consentRow}>
      <View style={[s.checkbox, value && s.checkboxChecked]}>
        {value && <Check size={11} color="#000" strokeWidth={3} />}
      </View>
      <Text style={s.consentTxt}>{text}</Text>
    </Pressable>
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
  promoInputRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  promoInputWrap: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, borderRadius: radius.lg, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", backgroundColor: "rgba(255,255,255,0.03)" },
  promoInput: { flex: 1, color: "#fff", fontSize: 13, paddingVertical: 12, letterSpacing: 1 },
  promoApplyBtn: { paddingHorizontal: 16, justifyContent: "center", borderRadius: radius.lg, backgroundColor: colors.gold },
  promoApplyTxt: { color: "#000", fontSize: 12, fontWeight: "600" },
  promoErr: { color: colors.error, fontSize: 11, marginTop: -8, marginBottom: 12 },
  promoApplied: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: radius.lg, borderWidth: 1, borderColor: "rgba(212,175,55,0.4)", backgroundColor: "rgba(212,175,55,0.08)", marginBottom: 12 },
  promoIcon: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(212,175,55,0.2)" },
  promoCode: { color: "#fff", fontSize: 12, fontWeight: "600", letterSpacing: 0.5 },
  promoDescAlt: { color: "rgba(255,255,255,0.6)", fontSize: 11, marginTop: 2 },
  promoSavings: { color: colors.gold, fontSize: 13, fontWeight: "700" },
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

  // Consent
  consentBlock: { marginTop: 4, padding: 16, borderRadius: radius.xl, borderWidth: 1, borderColor: "rgba(212,175,55,0.25)", backgroundColor: "rgba(212,175,55,0.03)" },
  consentLabel: { color: colors.gold, fontSize: 9, letterSpacing: 2.5, fontWeight: "600", marginBottom: 12 },
  consentRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 8 },
  checkbox: { width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.3)", alignItems: "center", justifyContent: "center", marginTop: 1 },
  checkboxChecked: { backgroundColor: colors.gold, borderColor: colors.gold },
  consentTxt: { flex: 1, color: "rgba(255,255,255,0.8)", fontSize: 11, lineHeight: 17 },
  cBold: { color: colors.gold, fontWeight: "600" },

  // Sign-in gate (for guests who tried to checkout)
  gateRoot: { flex: 1, backgroundColor: colors.bg, justifyContent: "center", alignItems: "center", paddingHorizontal: 28 },
  gateCard: { width: "100%", padding: 26, borderRadius: 20, borderWidth: 1, borderColor: "rgba(212,175,55,0.25)", backgroundColor: colors.surface, alignItems: "center" },
  gateH1: { color: "#fff", fontSize: 22, fontWeight: "500", marginTop: 12, textAlign: "center" },
  gateSub: { color: "rgba(255,255,255,0.6)", fontSize: 13, lineHeight: 19, textAlign: "center", marginTop: 10 },
  gateBtn: { marginTop: 22, paddingVertical: 14, paddingHorizontal: 26, borderRadius: 999, backgroundColor: colors.gold, width: "100%", alignItems: "center" },
  gateBtnTxt: { color: "#000", fontSize: 14, fontWeight: "600" },
  gateLink: { color: "rgba(255,255,255,0.55)", fontSize: 12 },
});
