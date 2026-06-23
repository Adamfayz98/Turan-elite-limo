import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ImageBackground, ActivityIndicator, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ChevronLeft, Users, ArrowRight, Phone, Home, Send } from "lucide-react-native";
// NOTE: Removed `expo-linear-gradient` — its native module wasn't bundled in
// v1.1.1 TestFlight binary which caused "Unimplemented component:
// <ViewManagerAdapter_ExpoLinearGradient_…>" crash on every vehicle card.
// Replaced with a layered View overlay (OTA-safe, visually identical).
import Button from "@/components/Button";
import QuoteRequestSheet from "@/components/QuoteRequestSheet";
import { colors, radius } from "@/theme";
import { useBooking } from "@/store/booking";
import { getQuote, fetchVehicleTypes } from "@/api";

// Bundled fleet images — shipped with the JS bundle so they work offline and
// don't depend on turanelitelimo.com being reachable. Updated Feb 2026 to the
// new studio-shot set (matches web /fleet/* and the 5 vehicle images user sent).
const FLEET_IMG = {
  "Executive Sedan":     require("@/assets/fleet/executive-sedan.jpg"),
  "First Class":         require("@/assets/fleet/first-class.jpg"),
  "Luxury SUV":          require("@/assets/fleet/luxury-suv.jpg"),
  "Stretch Limousine":   require("@/assets/fleet/stretch-limo.jpg"),
  "Sprinter Van":        require("@/assets/fleet/sprinter.jpg"),
  "Executive Sprinter":  require("@/assets/fleet/sprinter.jpg"),
  "Jet Sprinter":        require("@/assets/fleet/sprinter.jpg"),
  "Party Bus":           require("@/assets/fleet/party-bus.jpg"),
} as const;

const VEHICLE_META: Record<string, { img: any; desc: string; cap: string }> = {
  "Executive Sedan": { img: FLEET_IMG["Executive Sedan"], desc: "Mercedes E-Class · Cadillac XTS", cap: "1–3" },
  "First Class":     { img: FLEET_IMG["First Class"], desc: "Mercedes S-Class · Genesis G90", cap: "1–3" },
  "Luxury SUV":      { img: FLEET_IMG["Luxury SUV"], desc: "Cadillac Escalade · Lincoln Navigator", cap: "1–6" },
  "Stretch Limousine": { img: FLEET_IMG["Stretch Limousine"], desc: "Hummer Stretch · Chrysler 300", cap: "1–10" },
  "Sprinter Van":    { img: FLEET_IMG["Sprinter Van"], desc: "Standard · cloth/leather seats", cap: "10–14" },
  "Executive Sprinter": { img: FLEET_IMG["Executive Sprinter"], desc: "Captain's chairs · leather · partition", cap: "8–12" },
  "Jet Sprinter":    { img: FLEET_IMG["Jet Sprinter"], desc: "First-class recliners · bar · mood lighting", cap: "8–10" },
  "Party Bus":       { img: FLEET_IMG["Party Bus"], desc: "Limo Bus · Mini Coach", cap: "10–30" },
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

  // Quote-request modal: opened from the per-card "Request Quote" button on
  // call-only vehicles (Party Bus, Stretch Limo, Sprinter). Mirrors the web
  // QuoteRequestDialog so we get the same pre-qualified leads from mobile.
  const [quoteFor, setQuoteFor] = useState<string | null>(null);

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
              <ImageBackground source={meta.img} style={s.cardImg} imageStyle={s.cardImgInner}>
                {/* Very subtle bottom fade so the image meets the card body
                    cleanly. Original 3-band stack + 15% dim were way too dark
                    on the new studio images — vehicles were nearly invisible.
                    The body text sits BELOW the image (separate View), so we
                    don't need a heavy text-readability gradient here. */}
                <View pointerEvents="none" style={s.cardImgFadeStack}>
                  <View style={{ flex: 5, backgroundColor: "transparent" }} />
                  <View style={{ flex: 1, backgroundColor: "rgba(15,15,15,0.35)" }} />
                </View>
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
                  <View style={s.dualBtnRow}>
                    <Pressable
                      testID={`request-quote-${q.vehicle_type.replace(/\s+/g, "-").toLowerCase()}`}
                      onPress={(e) => {
                        // Prevent the parent Pressable (card selection) from firing
                        e.stopPropagation?.();
                        setQuoteFor(q.vehicle_type);
                      }}
                      style={[s.callBtn, { flex: 1 }]}
                    >
                      <Send size={12} color="#000" />
                      <Text style={s.callBtnTxt}>Request Quote</Text>
                    </Pressable>
                    <Pressable
                      testID={`call-quote-${q.vehicle_type.replace(/\s+/g, "-").toLowerCase()}`}
                      onPress={(e) => {
                        e.stopPropagation?.();
                        callDispatch();
                      }}
                      style={[s.callBtnOutline]}
                    >
                      <Phone size={12} color="#fff" />
                      <Text style={s.callBtnOutlineTxt}>Call</Text>
                    </Pressable>
                  </View>
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

      {/* Pre-qualified quote-request modal for call-only vehicles. Posts to
          POST /api/quote-requests with trip_type + service_duration so the
          admin gets a ready-to-quote lead instead of a phone tag chain. */}
      <QuoteRequestSheet
        visible={!!quoteFor}
        vehicleType={quoteFor || ""}
        onClose={() => setQuoteFor(null)}
      />
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
  cardImg: { height: 130, justifyContent: "flex-end", backgroundColor: colors.surface },
  cardImgInner: { borderTopLeftRadius: 18, borderTopRightRadius: 18, resizeMode: "cover" },
  cardImgDim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.15)" },
  // Vertical fade from transparent at the top of the image to the card surface
  // colour at the bottom. This masks the white studio-shadow that the fleet
  // PNGs ship with so the car blends cleanly into the card body — no need to
  // re-shoot or re-mask every vehicle asset.
  cardImgFade: { ...StyleSheet.absoluteFillObject, borderTopLeftRadius: 18, borderTopRightRadius: 18 },
  // OTA-safe gradient replacement: 3 stacked bands that simulate a vertical
  // fade from transparent → dim → surface. No native module required.
  cardImgFadeStack: { ...StyleSheet.absoluteFillObject, borderTopLeftRadius: 18, borderTopRightRadius: 18, overflow: "hidden", flexDirection: "column" },
  cardImgFadeBand: {},
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
  // Dual Quote+Call row styles. The outline Call button is a tertiary action
  // for users who'd rather talk to a human than fill the form.
  dualBtnRow: { marginTop: 10, flexDirection: "row", gap: 8 },
  callBtnOutline: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: "transparent",
  },
  callBtnOutlineTxt: { color: "#fff", fontSize: 12, fontWeight: "500" },
  ctaBar: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 18, paddingTop: 12, paddingBottom: 28, backgroundColor: "rgba(5,5,5,0.92)", borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)" },
});
