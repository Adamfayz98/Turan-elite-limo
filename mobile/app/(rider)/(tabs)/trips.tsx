import { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Sparkles, ArrowRight, LogIn } from "lucide-react-native";
import { colors, radius } from "@/theme";
import { fetchMyTrips } from "@/api";
import { useAuth } from "@/store/auth";

interface Trip {
  id: string;
  confirmation_number?: string;
  pickup_date: string;
  pickup_time: string;
  pickup_location: string;
  dropoff_location: string;
  vehicle_type: string;
  quote_amount?: number;
  status: string;
  payment_status?: string;
  trip_status?: string;
}

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  completed: { bg: "rgba(16,185,129,0.1)", fg: "#10B981" },
  confirmed: { bg: "rgba(212,175,55,0.1)", fg: "#D4AF37" },
  pending:   { bg: "rgba(255,255,255,0.05)", fg: "rgba(255,255,255,0.55)" },
  cancelled: { bg: "rgba(239,68,68,0.08)", fg: "#EF4444" },
};

export default function RiderTrips() {
  const router = useRouter();
  const user = useAuth(s => s.user);
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user) { setTrips([]); return; }
    try {
      const data = await fetchMyTrips();
      setTrips(data);
    } catch {
      setTrips([]);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  // Guest view — prompt sign-in
  if (!user) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.guestRoot}>
          <View style={s.emptyIcon}><LogIn size={20} color={colors.gold} /></View>
          <Text style={s.emptyTitle}>Sign in to see your trips</Text>
          <Text style={s.emptySub}>Once you've booked your first ride, your reservations and receipts will appear here.</Text>
          <Pressable testID="trips-guest-signin" onPress={() => router.push("/(rider)/auth")} style={s.guestBtn}>
            <Text style={s.guestBtnTxt}>Sign in / Create account</Text>
            <ArrowRight size={13} color="#000" />
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView
        contentContainerStyle={{ padding: 22, paddingBottom: 100 }}
        refreshControl={<RefreshControl tintColor={colors.gold} refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Text style={s.label}>YOUR JOURNEYS</Text>
        <Text style={s.h1}>
          Trip <Text style={s.h1Em}>history</Text>
        </Text>

        {trips === null && (
          <View style={s.loading}>
            <ActivityIndicator color={colors.gold} />
          </View>
        )}

        {trips !== null && trips.length === 0 && (
          <View style={s.emptyCard}>
            <View style={s.emptyIcon}><Sparkles size={20} color={colors.gold} /></View>
            <Text style={s.emptyTitle}>No trips yet</Text>
            <Text style={s.emptySub}>Your first chauffeured ride will appear here. Tap "Book" below to start.</Text>
          </View>
        )}

        {trips !== null && trips.length > 0 && (
          <View style={{ gap: 12 }}>
            {trips.map(t => {
              const statusKey = (t.status || "pending").toLowerCase();
              const stColor = STATUS_COLORS[statusKey] || STATUS_COLORS.pending;
              return (
                <View key={t.id} style={s.card}>
                  <View style={s.cardHeader}>
                    <Text style={s.date}>{formatDate(t.pickup_date, t.pickup_time)}</Text>
                    <View style={[s.badge, { backgroundColor: stColor.bg, borderColor: stColor.fg + "55" }]}>
                      <Text style={[s.badgeTxt, { color: stColor.fg }]}>{statusKey.toUpperCase()}</Text>
                    </View>
                  </View>
                  <View style={s.body}>
                    <View style={s.timeline}>
                      <View style={[s.dot, { backgroundColor: colors.gold }]} />
                      <View style={s.line} />
                      <View style={[s.dot, { backgroundColor: "rgba(255,255,255,0.4)" }]} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.addr} numberOfLines={1}>{t.pickup_location}</Text>
                      <View style={{ height: 14 }} />
                      <Text style={s.addr} numberOfLines={1}>{t.dropoff_location}</Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      {t.quote_amount != null && (
                        <Text style={s.price}>${t.quote_amount.toFixed(2)}</Text>
                      )}
                      <Text style={s.vehicle}>{t.vehicle_type}</Text>
                    </View>
                  </View>
                  <Pressable
                    testID={`trip-${t.id}-action`}
                    onPress={() => {
                      if ((t.status || "").toLowerCase() === "completed") {
                        router.push(`/(rider)/rate?bid=${t.id}`);
                      } else {
                        router.push(`/(rider)/active?bid=${t.id}`);
                      }
                    }}
                    style={s.rebook}
                  >
                    <Text style={s.rebookTxt}>
                      {(t.status || "").toLowerCase() === "completed" ? "Rate this trip" : "Track live"}
                    </Text>
                    <ArrowRight size={11} color={colors.gold} />
                  </Pressable>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function formatDate(d: string, t: string) {
  try {
    const dt = new Date(`${d}T${t}:00`);
    return dt.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch { return `${d} · ${t}`; }
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  label: { color: "rgba(255,255,255,0.45)", fontSize: 10, letterSpacing: 3, fontWeight: "600" },
  h1: { color: "#fff", fontSize: 26, lineHeight: 30, marginTop: 6, marginBottom: 14 },
  h1Em: { color: colors.gold, fontStyle: "italic" },
  loading: { paddingVertical: 60, alignItems: "center" },
  emptyCard: { marginTop: 18, padding: 32, borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center" },
  emptyIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: "rgba(212,175,55,0.12)", alignItems: "center", justifyContent: "center", marginBottom: 14 },
  emptyTitle: { color: "#fff", fontSize: 15, fontWeight: "500" },
  emptySub: { color: "rgba(255,255,255,0.55)", fontSize: 12, textAlign: "center", marginTop: 6, lineHeight: 18 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, padding: 14 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  date: { color: "rgba(255,255,255,0.65)", fontSize: 11, fontWeight: "500" },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
  badgeTxt: { fontSize: 9, letterSpacing: 1.5, fontWeight: "700" },
  body: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  timeline: { alignItems: "center", paddingTop: 4 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  line: { width: 1, flex: 1, backgroundColor: "rgba(255,255,255,0.15)", marginVertical: 4 },
  addr: { color: "#fff", fontSize: 12 },
  price: { color: colors.gold, fontSize: 15, fontWeight: "700" },
  vehicle: { color: "rgba(255,255,255,0.4)", fontSize: 10, marginTop: 2 },
  rebook: { borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)", marginTop: 12, paddingTop: 10, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 5 },
  rebookTxt: { color: colors.gold, fontSize: 11 },

  guestRoot: { flex: 1, padding: 32, alignItems: "center", justifyContent: "center" },
  guestBtn: { marginTop: 22, flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 13, paddingHorizontal: 22, borderRadius: 999, backgroundColor: colors.gold },
  guestBtnTxt: { color: "#000", fontSize: 13, fontWeight: "600" },
});
