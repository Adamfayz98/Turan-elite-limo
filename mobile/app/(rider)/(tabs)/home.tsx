import { useEffect, useState, useMemo } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
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
import { api, SavedAddress, listSavedAddresses } from "@/api";

// Geocodes a free-form address. Returns null if not resolvable.
async function geocode(addr: string): Promise<{ lat: number; lng: number } | null> {
  if (!addr || addr.length < 3) return null;
  try {
    const { data } = await api.get("/api/places/geocode", { params: { address: addr } });
    if (data?.lat == null || data?.lng == null) return null;
    return { lat: data.lat, lng: data.lng };
  } catch { return null; }
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

  // Logged-in rider's saved addresses (for one-tap Home / Work quick actions)
  const [saved, setSaved] = useState<SavedAddress[]>([]);

  const firstName = user?.name?.split(" ")[0] || "there";

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

  const onContinue = () => {
    if (!pickup.trim() || !dropoff.trim()) return;
    const when = datetime || new Date(Date.now() + 60 * 60 * 1000).toISOString();
    setTrip({ pickup: pickup.trim(), dropoff: dropoff.trim(), datetime: when });
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
          draws the route once both addresses are resolved. */}
      <View style={StyleSheet.absoluteFillObject}>
        <InteractiveMap
          pickup={pickupCoord || undefined}
          dropoff={dropoffCoord || undefined}
          showRoute={!!(pickupCoord && dropoffCoord)}
        />
      </View>
      {/* Dim layer so the bottom sheet text stays legible over the live map */}
      <View pointerEvents="none" style={s.mapDim} />

      <SafeAreaView style={s.safe} edges={["top", "left", "right"]}>
        {/* Top bar */}
        <View style={s.topBar}>
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

            <View style={s.formCard}>
              <Pressable testID="home-pickup" onPress={() => setPicker("pickup")} style={s.row}>
                <View style={[s.dot, { backgroundColor: colors.gold }]} />
                <Text style={[s.rowText, !pickup && s.rowPlaceholder]} numberOfLines={1}>
                  {pickup || "Pickup address"}
                </Text>
              </Pressable>
              <View style={s.rowDivider} />
              <Pressable testID="home-dropoff" onPress={() => setPicker("dropoff")} style={s.row}>
                <View style={[s.dot, { backgroundColor: "rgba(255,255,255,0.4)" }]} />
                <Text style={[s.rowText, !dropoff && s.rowPlaceholder]} numberOfLines={1}>
                  {dropoff || "Where to?"}
                </Text>
              </Pressable>
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
              disabled={!pickup.trim() || !dropoff.trim()}
            >
              Continue
            </Button>
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
});
