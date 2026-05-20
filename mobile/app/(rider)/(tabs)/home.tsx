import { useState } from "react";
import { View, Text, StyleSheet, Pressable, ImageBackground, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Calendar, Clock, ArrowRight, Settings, User as UserIcon, MapPin, Sparkles } from "lucide-react-native";
import Button from "@/components/Button";
import { colors, radius, assets } from "@/theme";
import { useAuth } from "@/store/auth";
import { useBooking } from "@/store/booking";

const MAP_BG = "https://static.prod-images.emergentagent.com/jobs/1689fe63-929d-4e0f-9a68-ee41e3772b20/images/8fadd6148d386fdf9d2dfb3d804989709c16bb90eddcf9adec5ae5aebd807148.png";

export default function RiderHome() {
  const router = useRouter();
  const user = useAuth(s => s.user);
  const trip = useBooking(s => s.trip);
  const setTrip = useBooking(s => s.setTrip);

  const [pickup, setPickup] = useState(trip.pickup);
  const [dropoff, setDropoff] = useState(trip.dropoff);

  const firstName = user?.name?.split(" ")[0] || "there";

  const onContinue = () => {
    if (!pickup.trim() || !dropoff.trim()) return;
    const when = trip.datetime || new Date(Date.now() + 60 * 60 * 1000).toISOString();
    setTrip({ pickup: pickup.trim(), dropoff: dropoff.trim(), datetime: when });
    router.push("/(rider)/vehicle");
  };

  return (
    <View style={s.root}>
      <ImageBackground source={{ uri: MAP_BG }} style={StyleSheet.absoluteFillObject} resizeMode="cover" imageStyle={{ opacity: 0.9 }} />
      <View style={s.mapDim} />

      <SafeAreaView style={s.safe}>
        {/* Top bar */}
        <View style={s.topBar}>
          <Pressable testID="home-settings" style={s.iconBtn}>
            <Settings size={16} color="#fff" strokeWidth={1.6} />
          </Pressable>
          <View style={s.brandPill}>
            <Sparkles size={11} color={colors.gold} />
            <Text style={s.brandTxt}>TURANELITE</Text>
          </View>
          <Pressable testID="home-profile-btn" onPress={() => router.push("/(rider)/profile")} style={[s.iconBtn, s.goldRing]}>
            <UserIcon size={14} color={colors.gold} />
          </Pressable>
        </View>

        {/* Bottom sheet (the booking form) */}
        <View style={s.sheetWrap}>
          <ScrollView contentContainerStyle={s.sheet} keyboardShouldPersistTaps="handled">
            <View style={s.handle} />
            <Text style={s.h2}>
              Where to, <Text style={s.h2Em}>{firstName}?</Text>
            </Text>

            <View style={s.formCard}>
              <View style={s.row}>
                <View style={[s.dot, { backgroundColor: colors.gold }]} />
                <TextLikeInput
                  testID="home-pickup"
                  placeholder="Pickup location"
                  value={pickup}
                  onChangeText={setPickup}
                />
              </View>
              <View style={s.rowDivider} />
              <View style={s.row}>
                <View style={[s.dot, { backgroundColor: "rgba(255,255,255,0.4)" }]} />
                <TextLikeInput
                  testID="home-dropoff"
                  placeholder="Where to?"
                  value={dropoff}
                  onChangeText={setDropoff}
                />
              </View>
            </View>

            <View style={s.chipsRow}>
              <Pressable testID="home-chip-date" style={s.chip}>
                <Calendar size={13} color={colors.gold} strokeWidth={1.6} />
                <Text style={s.chipTxt}>Tomorrow</Text>
              </Pressable>
              <Pressable testID="home-chip-time" style={s.chip}>
                <Clock size={13} color={colors.gold} strokeWidth={1.6} />
                <Text style={s.chipTxt}>9:30 AM</Text>
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
          </ScrollView>
        </View>
      </SafeAreaView>
    </View>
  );
}

import { TextInput } from "react-native";
function TextLikeInput(props: any) {
  return (
    <TextInput
      placeholderTextColor="rgba(255,255,255,0.45)"
      style={{ flex: 1, color: "#fff", fontSize: 14, paddingVertical: 0 }}
      {...props}
    />
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  mapDim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.45)" },
  safe: { flex: 1, justifyContent: "space-between" },
  topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingTop: 4 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.7)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" },
  goldRing: { backgroundColor: "rgba(212,175,55,0.18)", borderColor: "rgba(212,175,55,0.4)" },
  brandPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, backgroundColor: "rgba(0,0,0,0.7)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  brandTxt: { color: colors.gold, fontSize: 10, letterSpacing: 2, fontWeight: "600" },
  sheetWrap: {},
  sheet: { backgroundColor: "rgba(12,12,12,0.96)", borderTopLeftRadius: 28, borderTopRightRadius: 28, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)", paddingHorizontal: 22, paddingTop: 14, paddingBottom: 24 },
  handle: { alignSelf: "center", width: 38, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.2)", marginBottom: 14 },
  h2: { color: "#fff", fontSize: 22, lineHeight: 26 },
  h2Em: { color: colors.gold, fontStyle: "italic" },
  formCard: { marginTop: 14, borderRadius: radius.lg, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", backgroundColor: colors.surfaceElevated, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  rowDivider: { height: 1, backgroundColor: "rgba(255,255,255,0.05)", marginLeft: 16 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  chipsRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  chip: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 12, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  chipTxt: { color: "rgba(255,255,255,0.85)", fontSize: 12 },
});
