/**
 * Driver Active Trip screen.
 * - Streams driver GPS every 15s to the backend (via useDriverLocationStream)
 * - Shows pickup/dropoff, customer call/text shortcuts, "I've arrived" CTA.
 */
import { useState } from "react";
import { View, Text, StyleSheet, Pressable, Linking, ImageBackground, Alert, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft, Phone, MessageSquare, Navigation, Check, User as UserIcon, Wifi, WifiOff } from "lucide-react-native";
import Button from "@/components/Button";
import { colors, radius } from "@/theme";
import { useDriverLocationStream } from "@/hooks/useDriverLocationStream";

const MAP_BG = "https://static.prod-images.emergentagent.com/jobs/1689fe63-929d-4e0f-9a68-ee41e3772b20/images/8fadd6148d386fdf9d2dfb3d804989709c16bb90eddcf9adec5ae5aebd807148.png";

export default function DriverActiveTrip() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; name?: string; phone?: string; pickup?: string; dropoff?: string; pax?: string; vehicle?: string }>();
  const id = params.id as string;
  const [phase, setPhase] = useState<"to_pickup" | "on_trip" | "completed">("to_pickup");
  const { permission, last, error } = useDriverLocationStream({ bookingId: id });

  const callCustomer = () => params.phone && Linking.openURL(`tel:${params.phone}`);
  const smsCustomer = () => params.phone && Linking.openURL(`sms:${params.phone}`);
  const navigate = () => {
    const target = phase === "to_pickup" ? params.pickup : params.dropoff;
    if (!target) return;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(target as string)}&travelmode=driving`;
    Linking.openURL(url);
  };

  const phaseLabel = phase === "to_pickup" ? "En route to pickup" : phase === "on_trip" ? "On trip" : "Completed";

  return (
    <View style={s.root}>
      <ImageBackground source={{ uri: MAP_BG }} style={s.mapHero} imageStyle={{ opacity: 0.85 }}>
        <View style={s.mapDim} />
        <SafeAreaView style={{ paddingHorizontal: 16 }} edges={["top"]}>
          <View style={s.topRow}>
            <Pressable testID="driver-trip-back" onPress={() => router.back()} style={s.iconBtn}>
              <ChevronLeft size={18} color="#fff" />
            </Pressable>
            <View style={s.phasePill}>
              <Text style={s.phaseTxt}>{phaseLabel}</Text>
            </View>
            <Pressable testID="driver-trip-navigate" onPress={navigate} style={[s.iconBtn, s.iconBtnGold]}>
              <Navigation size={15} color="#000" />
            </Pressable>
          </View>
        </SafeAreaView>
        <View style={s.streamStatus}>
          {permission === "granted" && !error ? (
            <><Wifi size={11} color={colors.success} /><Text style={[s.streamTxt, { color: colors.success }]}>Sharing location · {last ? "live" : "syncing"}</Text></>
          ) : (
            <><WifiOff size={11} color={colors.error} /><Text style={[s.streamTxt, { color: colors.error }]}>{error || "Waiting for location permission"}</Text></>
          )}
        </View>
      </ImageBackground>

      <ScrollView style={s.body} contentContainerStyle={{ padding: 18, paddingBottom: 40 }}>
        <View style={s.customerCard}>
          <View style={s.customerRow}>
            <View style={s.avatar}><UserIcon size={20} color={colors.gold} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.customerName}>{params.name || "Passenger"}</Text>
              <Text style={s.customerSub}>{params.pax || 1} passenger{(params.pax === "1") ? "" : "s"} · {params.vehicle || "Sedan"}</Text>
            </View>
          </View>
          <View style={s.actionsRow}>
            <Pressable testID="driver-call-customer" onPress={callCustomer} style={[s.actionBtn, s.actionPrimary]}>
              <Phone size={14} color="#000" />
              <Text style={s.actionPrimaryTxt}>Call</Text>
            </Pressable>
            <Pressable testID="driver-sms-customer" onPress={smsCustomer} style={[s.actionBtn, s.actionOutline]}>
              <MessageSquare size={14} color={colors.gold} />
              <Text style={s.actionOutlineTxt}>Message</Text>
            </Pressable>
          </View>
        </View>

        <View style={s.routeCard}>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={s.timeline}>
              <View style={[s.dot, { backgroundColor: colors.gold }]} />
              <View style={s.line} />
              <View style={[s.dot, { backgroundColor: "rgba(255,255,255,0.4)" }]} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>PICKUP</Text>
              <Text style={s.addr}>{params.pickup}</Text>
              <View style={{ height: 14 }} />
              <Text style={s.label}>DROP-OFF</Text>
              <Text style={s.addr}>{params.dropoff}</Text>
            </View>
          </View>
        </View>

        {phase === "to_pickup" && (
          <Button
            testID="driver-arrived"
            onPress={() => { setPhase("on_trip"); Alert.alert("Arrived", "Marked as arrived at pickup."); }}
            icon={<Check size={14} color="#000" />}
            style={{ marginTop: 18 }}
          >
            I've arrived at pickup
          </Button>
        )}
        {phase === "on_trip" && (
          <Button
            testID="driver-end-trip"
            onPress={() => { setPhase("completed"); Alert.alert("Trip Ended", "Great work."); router.back(); }}
            icon={<Check size={14} color="#000" />}
            style={{ marginTop: 18 }}
          >
            End Trip
          </Button>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  mapHero: { height: 280 },
  mapDim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.25)" },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 },
  iconBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(0,0,0,0.75)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" },
  iconBtnGold: { backgroundColor: colors.gold, borderColor: colors.gold },
  phasePill: { backgroundColor: "rgba(0,0,0,0.85)", paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: "rgba(212,175,55,0.4)" },
  phaseTxt: { color: colors.gold, fontSize: 11, fontWeight: "600", letterSpacing: 0.5 },
  streamStatus: { position: "absolute", bottom: 12, alignSelf: "center", flexDirection: "row", gap: 5, alignItems: "center", backgroundColor: "rgba(0,0,0,0.85)", paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  streamTxt: { fontSize: 10, fontWeight: "600" },
  body: { flex: 1, marginTop: -22, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)" },
  customerCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, padding: 14, marginTop: 6 },
  customerRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: "rgba(212,175,55,0.15)", alignItems: "center", justifyContent: "center" },
  customerName: { color: "#fff", fontSize: 15, fontWeight: "500" },
  customerSub: { color: "rgba(255,255,255,0.5)", fontSize: 11, marginTop: 2 },
  actionsRow: { flexDirection: "row", gap: 8 },
  actionBtn: { flex: 1, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6, paddingVertical: 10, borderRadius: 999 },
  actionPrimary: { backgroundColor: colors.gold },
  actionPrimaryTxt: { color: "#000", fontSize: 12, fontWeight: "600" },
  actionOutline: { borderWidth: 1, borderColor: "rgba(212,175,55,0.5)" },
  actionOutlineTxt: { color: colors.gold, fontSize: 12, fontWeight: "500" },
  routeCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, padding: 14, marginTop: 12 },
  timeline: { alignItems: "center", paddingTop: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  line: { width: 1, flex: 1, backgroundColor: "rgba(255,255,255,0.15)", marginVertical: 6 },
  label: { color: "rgba(255,255,255,0.45)", fontSize: 9, letterSpacing: 1.5, fontWeight: "600", marginBottom: 4 },
  addr: { color: "#fff", fontSize: 13 },
});
