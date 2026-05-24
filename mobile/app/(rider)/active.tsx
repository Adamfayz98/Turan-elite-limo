/**
 * Rider Live Trip screen — the magical "Driver is on the way" view.
 * Polls /api/customer/bookings/{id}/driver-location every 5s and renders
 * the driver's current position on an interactive Google Map.
 */
import { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, Linking, ScrollView, ActivityIndicator, Platform } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft, Phone, MessageSquare, Star, ShieldCheck, Wifi, WifiOff } from "lucide-react-native";
import { colors, radius } from "@/theme";
import { customerGetDriverLocation } from "@/api";
import InteractiveMap from "@/components/InteractiveMap";

const POLL_MS = 5000;

export default function RiderActiveTrip() {
  const router = useRouter();
  const params = useLocalSearchParams<{ bid: string }>();
  const bid = params.bid as string;
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const d = await customerGetDriverLocation(bid);
        if (!cancelled) { setState(d); setError(null); }
      } catch (e: any) {
        if (!cancelled) setError(e?.response?.data?.detail || "Could not load trip");
      }
    };
    tick();
    timer.current = setInterval(tick, POLL_MS) as unknown as number;
    return () => {
      cancelled = true;
      if (timer.current != null) clearInterval(timer.current);
    };
  }, [bid]);

  const driver = state?.driver;
  const hasLocation = driver && driver.latitude != null && driver.longitude != null;
  const pickup = state?.pickup_coord ? { lat: state.pickup_coord.lat, lng: state.pickup_coord.lon } : null;
  const updatedAt = driver?.updated_at ? new Date(driver.updated_at).getTime() : 0;
  const ageSec = updatedAt ? Math.max(0, Math.round((Date.now() - updatedAt) / 1000)) : null;
  const live = ageSec != null && ageSec < 60;

  return (
    <View style={s.root}>
      {/* Map area */}
      <View style={s.mapWrap}>
        {hasLocation ? (
          <InteractiveMap
            driver={{ lat: driver.latitude, lng: driver.longitude, heading: driver.heading }}
            pickup={pickup}
            showRoute={!!pickup}
            height="100%"
          />
        ) : (
          <View style={[StyleSheet.absoluteFillObject, { justifyContent: "center", alignItems: "center", backgroundColor: colors.surface }]}>
            <ActivityIndicator color={colors.gold} />
            <Text style={s.mapHint}>Waiting for driver to share location…</Text>
          </View>
        )}
        {/* Subtle dim layer — pointerEvents="none" so it doesn't intercept
            pan/zoom touches on the map underneath. */}
        <View pointerEvents="none" style={s.mapDim} />

        {/* Top safe-area container — we apply insets.top manually instead of
            using SafeAreaView's edges prop. On iOS the screen sits underneath
            a transparent status bar so the back chevron was being painted
            BEHIND the time/battery, making it visually invisible (it WAS
            tappable though). Manual padding guarantees a 44pt+ buffer that
            keeps the chevron visible on both notch and Dynamic Island phones. */}
        <View pointerEvents="box-none" style={{ paddingHorizontal: 16, paddingTop: Math.max(insets.top, Platform.OS === "ios" ? 50 : 12) }}>
          <View pointerEvents="box-none" style={s.topRow}>
            <Pressable testID="active-back" onPress={() => router.back()} style={s.iconBtn} hitSlop={10}>
              <ChevronLeft size={18} color="#fff" />
            </Pressable>
            <View style={s.etaPill}>
              <View style={[s.statusDot, { backgroundColor: live ? colors.success : "rgba(255,255,255,0.4)" }]} />
              <Text style={s.etaTxt}>{live ? "Driver is on the way" : "Waiting on driver"}</Text>
            </View>
            <View style={{ width: 38 }} />
          </View>
        </View>
      </View>

      {/* Driver info sheet */}
      <ScrollView style={s.sheet} contentContainerStyle={{ padding: 18, paddingBottom: 40 }}>
        <View style={s.handle} />
        <View style={s.driverRow}>
          <View style={s.avatar}>
            <Text style={s.avatarTxt}>{(driver?.name || "D").trim().charAt(0).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={s.driverName}>{driver?.name || "Driver"}</Text>
              <ShieldCheck size={12} color={colors.gold} />
            </View>
            <View style={s.metaRow}>
              <Star size={10} color={colors.gold} fill={colors.gold} />
              <Text style={s.metaTxt}>4.97</Text>
              <Text style={s.metaSep}>·</Text>
              <Text style={s.metaTxt}>{driver?.vehicle || ""}</Text>
              {driver?.plate && <><Text style={s.metaSep}>·</Text><Text style={s.metaTxt}>{driver.plate}</Text></>}
            </View>
            <View style={s.connectionRow}>
              {live ? <Wifi size={9} color={colors.success} /> : <WifiOff size={9} color="rgba(255,255,255,0.4)" />}
              <Text style={[s.connectionTxt, { color: live ? colors.success : "rgba(255,255,255,0.4)" }]}>
                {live ? `live · updated ${ageSec}s ago` : ageSec != null ? `last seen ${ageSec}s ago` : "not connected"}
              </Text>
            </View>
          </View>
        </View>

        <View style={s.actions}>
          <Pressable
            testID="rider-call-driver"
            onPress={() => driver?.phone && Linking.openURL(`tel:${driver.phone}`)}
            disabled={!driver?.phone}
            style={[s.actionBtn, s.actionPrimary, !driver?.phone && { opacity: 0.5 }]}
          >
            <Phone size={13} color="#000" />
            <Text style={s.actionPrimaryTxt}>Call</Text>
          </Pressable>
          <Pressable
            testID="rider-sms-driver"
            onPress={() => driver?.phone && Linking.openURL(`sms:${driver.phone}`)}
            disabled={!driver?.phone}
            style={[s.actionBtn, s.actionOutline, !driver?.phone && { opacity: 0.5 }]}
          >
            <MessageSquare size={13} color={colors.gold} />
            <Text style={s.actionOutlineTxt}>Message</Text>
          </Pressable>
        </View>

        <View style={s.routeCard}>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={s.timeline}>
              <View style={[s.dot, { backgroundColor: colors.success }]} />
              <View style={s.line} />
              <View style={[s.dot, { backgroundColor: "rgba(255,255,255,0.4)" }]} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>PICKUP</Text>
              <Text style={s.addr}>{state?.pickup_location || "—"}</Text>
              <View style={{ height: 12 }} />
              <Text style={s.label}>DROP-OFF</Text>
              <Text style={s.addr}>{state?.dropoff_location || "—"}</Text>
            </View>
          </View>
        </View>

        {error && <Text style={s.errorTxt}>{error}</Text>}
      </ScrollView>
    </View>
  );
}

function MapImage_DEPRECATED() { return null; }

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  mapWrap: { height: "62%", backgroundColor: "#0a0a0a" },
  mapDim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.25)" },
  mapHint: { color: "rgba(255,255,255,0.5)", fontSize: 12, marginTop: 12 },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 },
  iconBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(0,0,0,0.75)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" },
  etaPill: { backgroundColor: "rgba(0,0,0,0.85)", paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: "rgba(212,175,55,0.4)", flexDirection: "row", alignItems: "center", gap: 6 },
  etaTxt: { color: "#fff", fontSize: 11, fontWeight: "500" },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  sheet: { flex: 1, marginTop: -22, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)" },
  handle: { alignSelf: "center", width: 38, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.2)", marginTop: -4, marginBottom: 14 },
  driverRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.gold, alignItems: "center", justifyContent: "center" },
  avatarTxt: { color: "#000", fontSize: 22, fontWeight: "700" },
  driverName: { color: "#fff", fontSize: 15, fontWeight: "500" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 },
  metaTxt: { color: "rgba(255,255,255,0.6)", fontSize: 11 },
  metaSep: { color: "rgba(255,255,255,0.3)", fontSize: 11 },
  connectionRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  connectionTxt: { fontSize: 10, fontWeight: "500" },
  actions: { flexDirection: "row", gap: 8, marginTop: 14 },
  actionBtn: { flex: 1, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6, paddingVertical: 11, borderRadius: 999 },
  actionPrimary: { backgroundColor: colors.gold },
  actionPrimaryTxt: { color: "#000", fontSize: 12, fontWeight: "600" },
  actionOutline: { borderWidth: 1, borderColor: "rgba(212,175,55,0.5)" },
  actionOutlineTxt: { color: colors.gold, fontSize: 12, fontWeight: "500" },
  routeCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, padding: 14, marginTop: 14 },
  timeline: { alignItems: "center", paddingTop: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  line: { width: 1, flex: 1, backgroundColor: "rgba(255,255,255,0.15)", marginVertical: 6 },
  label: { color: "rgba(255,255,255,0.45)", fontSize: 9, letterSpacing: 1.5, fontWeight: "600", marginBottom: 4 },
  addr: { color: "#fff", fontSize: 13 },
  errorTxt: { color: colors.error, fontSize: 11, textAlign: "center", marginTop: 12 },
});
