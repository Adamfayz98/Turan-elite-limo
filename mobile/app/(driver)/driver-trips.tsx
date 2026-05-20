import { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, Redirect } from "expo-router";
import { Briefcase, ArrowRight, User as UserIcon, TrendingUp, LogOut, Sparkles } from "lucide-react-native";
import { colors, radius } from "@/theme";
import { useDriverAuth } from "@/store/driver";
import { driverGetTrips, driverGetStats, driverGetMe } from "@/api";
import Button from "@/components/Button";

interface DTrip {
  id: string;
  confirmation_number?: string;
  trip_status?: string;
  customer_name?: string;
  customer_phone?: string;
  pickup_date: string;
  pickup_time: string;
  pickup_location: string;
  dropoff_location: string;
  passengers?: number;
  vehicle_type?: string;
  quote_amount?: number;
}

export default function DriverTrips() {
  const router = useRouter();
  const { token, driver, hydrated, signOut } = useDriverAuth();
  const [trips, setTrips] = useState<DTrip[] | null>(null);
  const [stats, setStats] = useState<{trips_this_week:number; earnings_this_week:number; rating:number}|null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      if (!driver) {
        const me = await driverGetMe();
        useDriverAuth.setState({ driver: me });
      }
      const [t, sx] = await Promise.all([driverGetTrips(), driverGetStats()]);
      setTrips(t);
      setStats(sx);
    } catch {
      setTrips([]);
    }
  }, [driver]);

  useEffect(() => { if (hydrated && token) load(); else if (hydrated) setTrips([]); }, [hydrated, token, load]);

  if (hydrated && !token) return <Redirect href="/(driver)/auth" />;
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={{ padding: 22, paddingBottom: 60 }}
        refreshControl={<RefreshControl tintColor={colors.gold} refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={s.headerRow}>
          <View>
            <Text style={s.label}>{greeting()}, {driver?.name?.split(" ")[0] || "Driver"}</Text>
            <Text style={s.h1}>
              <Text style={s.h1Em}>{(trips?.length || 0)}</Text> trip{(trips?.length || 0) === 1 ? "" : "s"} today
            </Text>
          </View>
          <Pressable testID="driver-signout" onPress={async () => { await signOut(); router.replace("/"); }} style={s.signoutBtn}>
            <LogOut size={14} color="rgba(255,255,255,0.6)" />
          </Pressable>
        </View>

        {stats && (
          <View style={s.statsRow}>
            <StatCard label="THIS WEEK" value={`${stats.trips_this_week}`} sub="trips" />
            <StatCard label="EARNINGS" value={`$${(stats.earnings_this_week || 0).toFixed(0)}`} sub="this week" gold />
            <StatCard label="RATING" value={stats.rating.toFixed(2)} sub="★ 4.97" />
          </View>
        )}

        {trips === null && (
          <View style={s.loading}><ActivityIndicator color={colors.gold} /></View>
        )}

        {trips && trips.length === 0 && (
          <View style={s.empty}>
            <View style={s.emptyIcon}><Briefcase size={20} color={colors.gold} /></View>
            <Text style={s.emptyTitle}>No trips assigned yet</Text>
            <Text style={s.emptySub}>Dispatch will assign you trips here. Pull down to refresh.</Text>
          </View>
        )}

        {trips && trips.length > 0 && (
          <View style={{ gap: 12, marginTop: 8 }}>
            {trips.map((t, i) => (
              <View key={t.id} style={[s.card, i === 0 && s.cardFirst]}>
                <View style={s.cardHeader}>
                  <Text style={s.time}>{t.pickup_time}</Text>
                  <View style={[s.badge, i === 0 ? s.badgeGold : s.badgeMuted]}>
                    <Text style={[s.badgeTxt, { color: i === 0 ? colors.gold : "rgba(255,255,255,0.6)" }]}>
                      {i === 0 ? "NEXT UP" : (t.trip_status || "ASSIGNED").toUpperCase()}
                    </Text>
                  </View>
                </View>
                <Text style={s.date}>{t.pickup_date}</Text>
                <View style={s.body}>
                  <View style={s.timeline}>
                    <View style={[s.dot, { backgroundColor: colors.gold }]} />
                    <View style={s.line} />
                    <View style={[s.dot, { backgroundColor: "rgba(255,255,255,0.4)" }]} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.addr} numberOfLines={1}>{t.pickup_location}</Text>
                    <View style={{ height: 12 }} />
                    <Text style={s.addr} numberOfLines={1}>{t.dropoff_location}</Text>
                  </View>
                </View>
                <View style={s.footer}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <UserIcon size={11} color="rgba(255,255,255,0.55)" />
                    <Text style={s.footerTxt}>{t.customer_name || "Passenger"} · {t.passengers || 1} pax</Text>
                  </View>
                  <Text style={s.muted}>{t.vehicle_type}</Text>
                </View>
                {i === 0 && (
                  <Button
                    testID={`start-trip-${t.id}`}
                    onPress={() => router.push({
                      pathname: "/(driver)/active-trip",
                      params: {
                        id: t.id,
                        name: t.customer_name || "Passenger",
                        phone: t.customer_phone || "",
                        pickup: t.pickup_location,
                        dropoff: t.dropoff_location,
                        pax: String(t.passengers || 1),
                        vehicle: t.vehicle_type || "Sedan",
                      },
                    })}
                    icon={<ArrowRight size={13} color="#000" />}
                    style={{ marginTop: 12, paddingVertical: 11 }}
                  >
                    Start Trip
                  </Button>
                )}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({ label, value, sub, gold }: any) {
  return (
    <View style={[s.statCard, gold && { borderColor: "rgba(212,175,55,0.3)" }]}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={[s.statValue, gold && { color: colors.gold }]}>{value}</Text>
      <Text style={s.statSub}>{sub}</Text>
    </View>
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  label: { color: "rgba(255,255,255,0.45)", fontSize: 10, letterSpacing: 3, fontWeight: "600" },
  h1: { color: "#fff", fontSize: 24, lineHeight: 28, marginTop: 6 },
  h1Em: { color: colors.gold, fontStyle: "italic" },
  signoutBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  statsRow: { flexDirection: "row", gap: 8, marginTop: 16, marginBottom: 4 },
  statCard: { flex: 1, padding: 12, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  statLabel: { color: "rgba(255,255,255,0.45)", fontSize: 9, letterSpacing: 1.5, fontWeight: "600" },
  statValue: { color: "#fff", fontSize: 20, fontWeight: "700", marginTop: 4 },
  statSub: { color: "rgba(255,255,255,0.45)", fontSize: 10, marginTop: 2 },
  loading: { paddingVertical: 60, alignItems: "center" },
  empty: { marginTop: 26, padding: 28, borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center" },
  emptyIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: "rgba(212,175,55,0.12)", alignItems: "center", justifyContent: "center", marginBottom: 12 },
  emptyTitle: { color: "#fff", fontSize: 14, fontWeight: "500" },
  emptySub: { color: "rgba(255,255,255,0.55)", fontSize: 11, textAlign: "center", marginTop: 4 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, padding: 14 },
  cardFirst: { borderColor: "rgba(212,175,55,0.4)", backgroundColor: "rgba(212,175,55,0.04)" },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  time: { color: colors.gold, fontSize: 16, fontWeight: "700" },
  date: { color: "rgba(255,255,255,0.45)", fontSize: 10, marginTop: 2, marginBottom: 10 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
  badgeGold: { backgroundColor: "rgba(212,175,55,0.1)", borderColor: "rgba(212,175,55,0.4)" },
  badgeMuted: { backgroundColor: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.1)" },
  badgeTxt: { fontSize: 9, letterSpacing: 1.2, fontWeight: "700" },
  body: { flexDirection: "row", gap: 10 },
  timeline: { alignItems: "center", paddingTop: 4 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  line: { width: 1, flex: 1, backgroundColor: "rgba(255,255,255,0.15)", marginVertical: 4 },
  addr: { color: "#fff", fontSize: 12 },
  footer: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)", flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  footerTxt: { color: "rgba(255,255,255,0.65)", fontSize: 11 },
  muted: { color: "rgba(255,255,255,0.4)", fontSize: 10 },
});
