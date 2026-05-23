import { useEffect, useState, useMemo } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, KeyboardAvoidingView, Platform, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Calendar, Clock, ArrowRight, Settings, User as UserIcon, MapPin, Sparkles, Home, Briefcase } from "lucide-react-native";
import Button from "@/components/Button";
import AddressPicker from "@/components/AddressPicker";
import DateTimeModal from "@/components/DateTimeModal";
import InteractiveMap from "@/components/InteractiveMap";
import { colors, radius } from "@/theme";
import { useAuth } from "@/store/auth";
import { useBooking } from "@/store/booking";
import { SavedAddress, listSavedAddresses } from "@/api";

// Geocodes a free-form address by calling Google's Geocoding API directly.
// We do this from the client (instead of routing through our backend) so the
// map works whether or not the production backend has the /api/places/geocode
// endpoint deployed yet. The mobile API key (Application restrictions: None,
// API restrictions: Geocoding/Places/Maps SDK) is safe to ship in the client.
const GMAPS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_BROWSER_KEY || "";

async function geocode(addr: string): Promise<{ lat: number; lng: number } | null> {
  if (!addr || addr.length < 3 || !GMAPS_KEY) return null;
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(addr)}&region=us&key=${GMAPS_KEY}`;
    const r = await fetch(url);
    const data = await r.json();
    if (data?.status !== "OK" || !data?.results?.length) return null;
    const loc = data.results[0]?.geometry?.location;
    if (loc?.lat == null || loc?.lng == null) return null;
    return { lat: loc.lat, lng: loc.lng };
  } catch {
    return null;
  }
}

export default function RiderHome() {
  const router = useRouter();
  const user = useAuth(s => s.user);
  const trip = useBooking(s => s.trip);
  const setTrip = useBooking(s => s.setTrip);

  const [pickup, setPickup] = useState(trip.pickup);
  const [dropoff, setDropoff] = useState(trip.dropoff);
  const [datetime, setDatetime] = useState<string>(trip.datetime || "");
  const [picker, setPicker] = useState<null | "pickup" | "dropoff">(null);
  const [dtOpen, setDtOpen] = useState(false);

  // Geocoded coords for the live map preview
  const [pickupCoord, setPickupCoord] = useState<{ lat: number; lng: number } | null>(null);
  const [dropoffCoord, setDropoffCoord] = useState<{ lat: number; lng: number } | null>(null);

  // Booking service type. Defaults to point-to-point ("A to B Transfer").
  // Switches to "Airport Transfer" automatically when either pickup or
  // dropoff contains airport keywords — riders can still tap to override.
  const [serviceType, setServiceType] = useState<"A to B Transfer" | "Airport Transfer" | "Hourly Chauffeur">("A to B Transfer");
  const [flightNumber, setFlightNumber] = useState("");
  const [hours, setHours] = useState(3);

  // Logged-in rider's saved addresses (for one-tap Home / Work quick actions)
  const [saved, setSaved] = useState<SavedAddress[]>([]);

  const firstName = user?.name?.split(" ")[0] || "there";

  // Detect airport address heuristic — flips service type automatically.
  // Riders can still tap a different chip to override.
  const isAirport = (addr: string) =>
    /\bairport\b|\bSFO\b|\bOAK\b|\bSJC\b|\bSMF\b|\bterminal\b/i.test(addr);

  useEffect(() => {
    // Don't override an explicit Hourly choice; only auto-toggle between
    // A-to-B and Airport.
    if (serviceType === "Hourly Chauffeur") return;
    const airport = isAirport(pickup) || isAirport(dropoff);
    setServiceType(airport ? "Airport Transfer" : "A to B Transfer");
  }, [pickup, dropoff]);

  // Load saved addresses once (silently fail if not logged in)
  useEffect(() => {
    if (!user) return;
    (async () => {
      try { setSaved(await listSavedAddresses()); }
      catch { /* not logged in or no addresses yet */ }
    })();
  }, [user]);

  // Re-geocode pickup whenever it changes (debounced)
  useEffect(() => {
    let cancelled = false;
    if (!pickup.trim()) { setPickupCoord(null); return; }
    const t = setTimeout(async () => {
      const c = await geocode(pickup);
      if (!cancelled) setPickupCoord(c);
    }, 500);
    return () => { cancelled = true; clearTimeout(t); };
  }, [pickup]);

  // Re-geocode dropoff whenever it changes (debounced)
  useEffect(() => {
    let cancelled = false;
    if (!dropoff.trim()) { setDropoffCoord(null); return; }
    const t = setTimeout(async () => {
      const c = await geocode(dropoff);
      if (!cancelled) setDropoffCoord(c);
    }, 500);
    return () => { cancelled = true; clearTimeout(t); };
  }, [dropoff]);

  const [formError, setFormError] = useState<string | null>(null);

  const onContinue = () => {
    const isHourly = serviceType === "Hourly Chauffeur";
    // Validate with VISIBLE feedback. Silent returns were leaving users
    // staring at a blank screen after pressing Continue, confusing them
    // into thinking the app had crashed.
    if (!pickup.trim()) {
      setFormError("Please enter your pickup address.");
      return;
    }
    if (!isHourly && !dropoff.trim()) {
      setFormError("Please enter your drop-off address.");
      return;
    }
    if (serviceType === "Airport Transfer" && flightNumber.trim().length < 2) {
      setFormError("Please enter your flight number for airport pickups (e.g. UA123).");
      return;
    }
    if (isHourly && (hours < 2 || hours > 24)) {
      setFormError("Hourly bookings must be between 2 and 24 hours.");
      return;
    }
    setFormError(null);
    const when = datetime || new Date(Date.now() + 60 * 60 * 1000).toISOString();
    setTrip({
      pickup: pickup.trim(),
      dropoff: isHourly ? "Hourly Chauffeur Service" : dropoff.trim(),
      datetime: when,
      serviceType,
      flightNumber: serviceType === "Airport Transfer" ? flightNumber.trim().toUpperCase() : undefined,
      hours: isHourly ? hours : undefined,
    });
    router.push("/(rider)/vehicle");
  };

  const dt = datetime ? new Date(datetime) : null;
  const dateLabel = dt ? dt.toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "Pick date";
  const timeLabel = dt ? dt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : "Pick time";

  // Pick out Home + Work quick actions (case-insensitive). Falls back to first
  // two saved addresses if neither is explicitly labeled.
  const quickActions = useMemo(() => {
    const home = saved.find(a => a.label.toLowerCase().includes("home"));
    const work = saved.find(a => /work|office/i.test(a.label));
    const fallback = saved.filter(a => a.id !== home?.id && a.id !== work?.id);
    const out: SavedAddress[] = [];
    if (home) out.push(home);
    if (work) out.push(work);
    while (out.length < 2 && fallback.length) out.push(fallback.shift()!);
    return out.slice(0, 2);
  }, [saved]);

  const iconForLabel = (label: string) => {
    if (/home/i.test(label)) return Home;
    if (/work|office/i.test(label)) return Briefcase;
    return MapPin;
  };

  return (
    <View style={s.root}>
      {/* Live interactive map background — auto-zooms to pickup + dropoff and
          draws the route once both addresses are resolved. Native Google Maps
          SDK (react-native-maps); fills the entire screen behind the form. */}
      <View style={StyleSheet.absoluteFillObject}>
        <InteractiveMap
          pickup={pickupCoord || undefined}
          dropoff={dropoffCoord || undefined}
          showRoute={false}
          height="100%"
        />
      </View>
      {/* Dim layer so the bottom sheet text stays legible over the live map */}
      <View pointerEvents="none" style={s.mapDim} />

      <SafeAreaView style={s.safe} edges={["top", "left", "right"]} pointerEvents="box-none">
        {/* Top bar */}
        <View style={s.topBar} pointerEvents="box-none">
          <Pressable testID="home-settings" onPress={() => router.push("/profile")} style={s.iconBtn}>
            <Settings size={16} color="#fff" strokeWidth={1.6} />
          </Pressable>
          <View style={s.brandPill}>
            <Sparkles size={11} color={colors.gold} />
            <Text style={s.brandTxt}>TURANELITE</Text>
          </View>
          <Pressable testID="home-profile-btn" onPress={() => router.push("/profile")} style={[s.iconBtn, s.goldRing]}>
            <UserIcon size={14} color={colors.gold} />
          </Pressable>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
          pointerEvents="box-none"
        >
          <View style={s.sheet}>
            {/* Quick-actions row (only renders if rider has Home/Work saved). */}
            {quickActions.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, paddingBottom: 12, paddingHorizontal: 2 }}
              >
                {quickActions.map((a) => {
                  const Icon = iconForLabel(a.label);
                  return (
                    <Pressable
                      key={a.id}
                      testID={`quick-action-${a.label.toLowerCase()}`}
                      onPress={() => setDropoff(a.address)}
                      style={({ pressed }) => [s.quickChip, pressed && { opacity: 0.85 }]}
                    >
                      <Icon size={13} color={colors.gold} strokeWidth={1.6} />
                      <Text style={s.quickTxt} numberOfLines={1}>Ride to {a.label}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}

            <Text style={s.h2}>
              Where to, <Text style={s.h2Em}>{firstName}?</Text>
            </Text>

            {/* Service type chips — quick switch between A to B / Airport / Hourly */}
            <View style={s.svcRow}>
              {(["A to B Transfer", "Airport Transfer", "Hourly Chauffeur"] as const).map((st) => {
                const active = serviceType === st;
                const label = st === "A to B Transfer" ? "A → B" : st === "Airport Transfer" ? "Airport" : "Hourly";
                return (
                  <Pressable
                    key={st}
                    testID={`home-svc-${st.split(" ")[0].toLowerCase()}`}
                    onPress={() => setServiceType(st)}
                    style={[s.svcChip, active && s.svcChipActive]}
                  >
                    <Text style={[s.svcTxt, active && s.svcTxtActive]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={s.formCard}>
              <Pressable testID="home-pickup" onPress={() => setPicker("pickup")} style={s.row}>
                <View style={[s.dot, { backgroundColor: colors.gold }]} />
                <Text style={[s.rowText, !pickup && s.rowPlaceholder]} numberOfLines={1}>
                  {pickup || "Pickup address"}
                </Text>
              </Pressable>
              {serviceType !== "Hourly Chauffeur" && (
                <>
                  <View style={s.rowDivider} />
                  <Pressable testID="home-dropoff" onPress={() => setPicker("dropoff")} style={s.row}>
                    <View style={[s.dot, { backgroundColor: "rgba(255,255,255,0.4)" }]} />
                    <Text style={[s.rowText, !dropoff && s.rowPlaceholder]} numberOfLines={1}>
                      {dropoff || "Where to?"}
                    </Text>
                  </Pressable>
                </>
              )}
              {serviceType === "Hourly Chauffeur" && (
                <>
                  <View style={s.rowDivider} />
                  <View style={s.row}>
                    <View style={[s.dot, { backgroundColor: colors.gold, opacity: 0.6 }]} />
                    <Text style={[s.rowText, { flex: 1 }]}>{hours} hour{hours === 1 ? "" : "s"}</Text>
                    <Pressable testID="home-hours-dec" onPress={() => setHours(h => Math.max(2, h - 1))} style={s.stepBtn}>
                      <Text style={s.stepTxt}>−</Text>
                    </Pressable>
                    <Pressable testID="home-hours-inc" onPress={() => setHours(h => Math.min(24, h + 1))} style={s.stepBtn}>
                      <Text style={s.stepTxt}>+</Text>
                    </Pressable>
                  </View>
                  {/* Inline mileage policy — riders see exactly what they're
                      getting before they commit. Matches website's "as-directed"
                      hourly pricing model (20 mi/hour included). */}
                  <View style={s.hourlyInfo}>
                    <Text style={s.hourlyInfoTxt}>
                      <Text style={{ color: colors.gold, fontWeight: "600" }}>{hours * 20} mi included</Text>
                      {" · "}20 mi/hour · overage billed per-mile at vehicle's rate
                    </Text>
                  </View>
                </>
              )}
              {serviceType === "Airport Transfer" && (
                <>
                  <View style={s.rowDivider} />
                  <View style={s.row}>
                    <Text style={s.flightLbl}>Flight #</Text>
                    <TextInput
                      testID="home-flight"
                      value={flightNumber}
                      onChangeText={(t) => setFlightNumber(t.toUpperCase())}
                      placeholder="UA1234"
                      placeholderTextColor="rgba(255,255,255,0.35)"
                      autoCapitalize="characters"
                      maxLength={10}
                      style={s.flightInput}
                    />
                  </View>
                </>
              )}
            </View>

            <View style={s.chipsRow}>
              <Pressable testID="home-chip-date" onPress={() => setDtOpen(true)} style={s.chip}>
                <Calendar size={13} color={colors.gold} strokeWidth={1.6} />
                <Text style={s.chipTxt}>{dateLabel}</Text>
              </Pressable>
              <Pressable testID="home-chip-time" onPress={() => setDtOpen(true)} style={s.chip}>
                <Clock size={13} color={colors.gold} strokeWidth={1.6} />
                <Text style={s.chipTxt}>{timeLabel}</Text>
              </Pressable>
            </View>

            <Button
              testID="home-continue"
              onPress={onContinue}
              icon={<ArrowRight size={14} color="#000" />}
              style={{ marginTop: 14 }}
              disabled={
                !pickup.trim() ||
                (serviceType !== "Hourly Chauffeur" && !dropoff.trim()) ||
                (serviceType === "Airport Transfer" && flightNumber.trim().length < 2)
              }
            >
              Continue
            </Button>
            {formError && (
              <Text
                testID="home-form-error"
                style={{ color: colors.error, fontSize: 12, marginTop: 10, textAlign: "center" }}
              >
                {formError}
              </Text>
            )}
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <AddressPicker
        visible={picker === "pickup"}
        initialValue={pickup}
        label="Pickup"
        onClose={() => setPicker(null)}
        onSelect={(v) => setPickup(v)}
      />
      <AddressPicker
        visible={picker === "dropoff"}
        initialValue={dropoff}
        label="Drop-off"
        onClose={() => setPicker(null)}
        onSelect={(v) => setDropoff(v)}
      />
      <DateTimeModal
        visible={dtOpen}
        initial={datetime}
        onClose={() => setDtOpen(false)}
        onConfirm={(iso) => setDatetime(iso)}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  mapDim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.35)" },
  safe: { flex: 1, justifyContent: "space-between" },
  topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingTop: 4 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.7)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" },
  goldRing: { backgroundColor: "rgba(212,175,55,0.18)", borderColor: "rgba(212,175,55,0.4)" },
  brandPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, backgroundColor: "rgba(0,0,0,0.7)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  brandTxt: { color: colors.gold, fontSize: 10, letterSpacing: 2, fontWeight: "600" },
  sheet: { backgroundColor: "rgba(12,12,12,0.96)", borderTopLeftRadius: 28, borderTopRightRadius: 28, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)", paddingHorizontal: 22, paddingTop: 18, paddingBottom: 24 },
  h2: { color: "#fff", fontSize: 22, lineHeight: 26 },
  h2Em: { color: colors.gold, fontStyle: "italic" },
  formCard: { marginTop: 14, borderRadius: radius.lg, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", backgroundColor: colors.surfaceElevated, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 16 },
  rowDivider: { height: 1, backgroundColor: "rgba(255,255,255,0.05)", marginLeft: 16 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  rowText: { color: "#fff", fontSize: 14, flex: 1 },
  rowPlaceholder: { color: "rgba(255,255,255,0.45)" },
  chipsRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  chip: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 12, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  chipTxt: { color: "rgba(255,255,255,0.85)", fontSize: 12 },
  quickChip: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: "rgba(212,175,55,0.1)", borderWidth: 1, borderColor: "rgba(212,175,55,0.35)" },
  quickTxt: { color: colors.gold, fontSize: 12, fontWeight: "500", maxWidth: 150 },
  svcRow: { flexDirection: "row", gap: 8, marginTop: 12, marginBottom: 2 },
  svcChip: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
  },
  svcChipActive: {
    backgroundColor: "rgba(212,175,55,0.15)",
    borderColor: colors.gold,
  },
  svcTxt: { color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: "500" },
  svcTxtActive: { color: colors.gold, fontWeight: "600" },
  stepBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: "rgba(212,175,55,0.15)",
    alignItems: "center", justifyContent: "center",
    marginLeft: 6,
  },
  stepTxt: { color: colors.gold, fontSize: 18, fontWeight: "500", marginTop: -2 },
  flightLbl: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
    fontWeight: "500",
    minWidth: 70,
    marginRight: 4,
  },
  flightInput: {
    flex: 1,
    color: "#fff",
    fontSize: 15,
    fontWeight: "500",
    letterSpacing: 1,
    paddingVertical: 0,
  },
  hourlyInfo: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: "rgba(212,175,55,0.06)",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  hourlyInfoTxt: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 11,
    lineHeight: 15,
  },
});
