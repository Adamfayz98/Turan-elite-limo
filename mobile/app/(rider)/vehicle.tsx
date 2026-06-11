import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ImageBackground, ActivityIndicator, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ChevronLeft, Users, ArrowRight, Phone, Home } from "lucide-react-native";
import Button from "@/components/Button";
import { colors, radius } from "@/theme";
import { useBooking } from "@/store/booking";
import { getQuote, fetchVehicleTypes } from "@/api";

const VEHICLE_META: Record<string, { img: string; desc: string; cap: string }> = {
  "Executive Sedan": { img: "https://turanelitelimo.com/fleet/executive-sedan.jpg", desc: "Mercedes E-Class · Cadillac XTS", cap: "1–3" },
  "First Class":     { img: "https://turanelitelimo.com/fleet/first-class.jpg", desc: "Mercedes S-Class · Genesis G90", cap: "1–3" },
  "Luxury SUV":      { img: "https://turanelitelimo.com/fleet/luxury-suv.jpg", desc: "Cadillac Escalade · Lincoln Navigator", cap: "1–6" },
  "Stretch Limousine": { img: "https://turanelitelimo.com/fleet/stretch-limo.jpg", desc: "Lincoln · Chrysler 300", cap: "1–10" },
  "Sprinter Van":    { img: "https://turanelitelimo.com/fleet/sprinter.jpg", desc: "Standard · cloth/leather seats", cap: "10–14" },
  "Executive Sprinter": { img: "https://turanelitelimo.com/fleet/sprinter.jpg", desc: "Captain's chairs · leather · partition", cap: "8–12" },
  "Jet Sprinter":    { img: "https://turanelitelimo.com/fleet/sprinter.jpg", desc: "First-class recliners · bar · mood lighting", cap: "8–10" },
  "Party Bus":       { img: "https://turanelitelimo.com/fleet/party-bus.jpg", desc: "Limo Bus · Party Bus", cap: "10–30" },
};

interface QuoteRow { vehicle_type: string; price: number | null; formatted_price: string | null; message: string | null }

export default function VehiclePicker() {
  const router = useRouter();
  const trip = useBooking(s => s.trip);
  const setTrip = useBooking(s => s.setTrip);
  const [loading, setLoading] = useState(true);
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [distance, setDistance] = useState<number | null>(null);
  const [selected, setSelected] = useState<string | null>(trip.vehicleType || null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const isHourly = trip.serviceType === "Hourly Chauffeur";
        const d = await getQuote({
          pickup_address: trip.pickup,
          dropoff_address: trip.dropoff,
          pickup_datetime: trip.datetime,
          passenger_count: trip.passengerCount,
          is_hourly: isHourly,
          hours: isHourly ? trip.hours : undefined,
        });
        if (cancelled) return;
        const incoming = d.quotes || [];
        setQuotes(incoming);
        setDistance(d.distance_miles || null);
        if (!selected) {
          const first = incoming.find((q: QuoteRow) => q.price && q.price > 0);
          if (first) setSelected(first.vehicle_type);
        }
        // If the backend returned zero quotes (e.g. addresses outside the
        // service area or unresolvable), surface a friendly message instead
        // of leaving the screen blank.
        if (incoming.length === 0) {
          setError("We couldn't find any vehicles for this route. Try a more specific pickup or drop-off address (include city + ZIP).");
        }
      } catch (e: any) {
        const raw = e?.response?.data?.detail;
        const msg = typeof raw === "string"
          ? raw
          : Array.isArray(raw)
            ? raw.map((d: any) => d?.msg || JSON.stringify(d)).join(", ")
            : "Could not load quotes. Check the pickup & drop-off addresses.";
        setError(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const onContinue = () => {
    const q = quotes.find(x => x.vehicle_type === selected);
    if (!q || q.price == null) return;
    setTrip({ vehicleType: selected!, quoteAmount: q.price });
    router.push("/(rider)/pay");
  };

  const selectedQ = quotes.find(q => q.vehicle_type === selected);
  const callDispatch = () => Linking.openURL("tel:+16504100687");

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Pressable testID="vehicle-back" onPress={() => router.back()} style={s.back}>
          <ChevronLeft size={16} color="#fff" />
        </Pressable>
        <Text style={s.stepLabel}>STEP 2 OF 3</Text>
        <Pressable
          testID="vehicle-home"
          onPress={() => router.replace("/(rider)/(tabs)/discover")}
          style={s.back}
          hitSlop={10}
        >
          <Home size={16} color={colors.gold} strokeWidth={1.8} />
        </Pressable>
      </View>

      <Text style={s.h1}>
        Choose your <Text style={s.h1Em}>vehicle</Text>
      </Text>
      <Text style={s.sub}>
        {trip.pickup} → {trip.dropoff}{distance ? ` · ${distance.toFixed(1)} mi` : ""}
      </Text>

      <ScrollView contentContainerStyle={s.list}>
        {loading && (
          <View style={s.loadingBox}>
            <ActivityIndicator color={colors.gold} />
            <Text style={s.loadingTxt}>Calculating your live quote…</Text>
          </View>
        )}
        {error && !loading && (
          <View style={s.errorBox}>
            <Text style={s.errorTxt}>{error}</Text>
          </View>
        )}
        {!loading && !error && quotes.map((q) => {
          const meta = VEHICLE_META[q.vehicle_type] || { img: VEHICLE_META["Executive Sedan"].img, desc: "", cap: "" };
          const isSelected = q.vehicle_type === selected;
          const isCallOnly = q.message === "Call for quote";
          const disabled = q.price == null && !isCallOnly;
          return (
            <Pressable
              key={q.vehicle_type}
              testID={`vehicle-${q.vehicle_type.replace(/\s+/g, "-").toLowerCase()}`}
              disabled={disabled || isCallOnly}
              onPress={() => setSelected(q.vehicle_type)}
              style={[s.card, isSelected && s.cardSelected, disabled && { opacity: 0.55 }]}
            >
              <ImageBackground source={{ uri: meta.img }} style={s.cardImg} imageStyle={{ borderTopLeftRadius: 18, borderTopRightRadius: 18 }}>
                <View style={s.cardImgDim} />
              </ImageBackground>
              <View style={s.cardBody}>
                <View style={s.cardRow}>
                  <Text style={s.cardTitle}>{q.vehicle_type}</Text>
                  <Text style={[s.cardPrice, isSelected && { color: colors.gold }]}>
                    {q.formatted_price || (isCallOnly ? "Quote" : "—")}
                  </Text>
                </View>
                <Text style={s.cardDesc}>{meta.desc}</Text>
                <View style={s.cardFoot}>
                  <View style={s.cardMeta}><Users size={11} color="rgba(255,255,255,0.55)" /><Text style={s.cardMetaTxt}>{meta.cap} pax</Text></View>
                  {q.message && !isCallOnly && <Text style={s.muted}>{q.message}</Text>}
                  {isSelected && !disabled && !isCallOnly && <Text style={s.selectedTag}>SELECTED</Text>}
                </View>
                {isCallOnly && (
                  <Pressable
                    testID={`call-quote-${q.vehicle_type.replace(/\s+/g, "-").toLowerCase()}`}
                    onPress={callDispatch}
                    style={s.callBtn}
                  >
                    <Phone size={13} color="#000" />
                    <Text style={s.callBtnTxt}>Call for Quote</Text>
                  </Pressable>
                )}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={s.ctaBar}>
        <Button
          testID="vehicle-continue"
          onPress={onContinue}
          disabled={!selectedQ || selectedQ.price == null}
          icon={<ArrowRight size={14} color="#000" />}
        >
          {selectedQ && selectedQ.price != null
            ? `Continue with ${selected} · ${selectedQ.formatted_price}`
            : "Select a vehicle"}
        </Button>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  back: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  stepLabel: { color: "rgba(255,255,255,0.5)", fontSize: 10, letterSpacing: 2.5, fontWeight: "600" },
  h1: { color: "#fff", fontSize: 22, lineHeight: 26, paddingHorizontal: 20, marginTop: 6 },
  h1Em: { color: colors.gold, fontStyle: "italic" },
  sub: { color: "rgba(255,255,255,0.5)", fontSize: 11, paddingHorizontal: 20, marginTop: 4, marginBottom: 14 },
  list: { paddingHorizontal: 20, paddingBottom: 110 },
  loadingBox: { paddingVertical: 60, alignItems: "center", gap: 12 },
  loadingTxt: { color: "rgba(255,255,255,0.6)", fontSize: 12 },
  errorBox: { padding: 16, borderRadius: radius.md, backgroundColor: "rgba(239,68,68,0.08)", borderColor: "rgba(239,68,68,0.25)", borderWidth: 1 },
  errorTxt: { color: colors.error, fontSize: 12, textAlign: "center" },
  card: { borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", overflow: "hidden", marginBottom: 12 },
  cardSelected: { borderColor: colors.gold, backgroundColor: "rgba(212,175,55,0.05)" },
  cardImg: { height: 100, justifyContent: "flex-end" },
  cardImgDim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.15)" },
  cardBody: { padding: 14 },
  cardRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  cardTitle: { color: "#fff", fontSize: 14, fontWeight: "500" },
  cardPrice: { color: "#fff", fontSize: 15, fontWeight: "600" },
  cardDesc: { color: "rgba(255,255,255,0.45)", fontSize: 11 },
  cardFoot: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 },
  cardMeta: { flexDirection: "row", alignItems: "center", gap: 4 },
  cardMetaTxt: { color: "rgba(255,255,255,0.55)", fontSize: 10 },
  muted: { color: "rgba(255,255,255,0.45)", fontSize: 10 },
  selectedTag: { color: colors.gold, fontSize: 9, letterSpacing: 1.5, fontWeight: "700", borderColor: "rgba(212,175,55,0.4)", borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  callBtn: { marginTop: 10, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6, paddingVertical: 9, borderRadius: 999, backgroundColor: colors.gold },
  callBtnTxt: { color: "#000", fontSize: 12, fontWeight: "600" },
  ctaBar: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 18, paddingTop: 12, paddingBottom: 28, backgroundColor: "rgba(5,5,5,0.92)", borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)" },
});
