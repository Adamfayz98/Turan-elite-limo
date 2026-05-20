import { useState } from "react";
import { View, Text, StyleSheet, Pressable, ImageBackground, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Calendar, Clock, ArrowRight, Settings, User as UserIcon, MapPin, Sparkles } from "lucide-react-native";
import Button from "@/components/Button";
import AddressPicker from "@/components/AddressPicker";
import DateTimeModal from "@/components/DateTimeModal";
import { colors, radius } from "@/theme";
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
  const [datetime, setDatetime] = useState<string>(trip.datetime || "");
  const [picker, setPicker] = useState<null | "pickup" | "dropoff">(null);
  const [dtOpen, setDtOpen] = useState(false);

  const firstName = user?.name?.split(" ")[0] || "there";

  const onContinue = () => {
    if (!pickup.trim() || !dropoff.trim()) return;
    const when = datetime || new Date(Date.now() + 60 * 60 * 1000).toISOString();
    setTrip({ pickup: pickup.trim(), dropoff: dropoff.trim(), datetime: when });
    router.push("/(rider)/vehicle");
  };

  const dt = datetime ? new Date(datetime) : null;
  const dateLabel = dt ? dt.toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "Pick date";
  const timeLabel = dt ? dt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : "Pick time";

  return (
    <View style={s.root}>
      <ImageBackground source={{ uri: MAP_BG }} style={StyleSheet.absoluteFillObject} resizeMode="cover" imageStyle={{ opacity: 0.9 }} />
      <View style={s.mapDim} />

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
            <View style={s.handle} />
            <Text style={s.h2}>
              Where to, <Text style={s.h2Em}>{firstName}?</Text>
            </Text>

            <View style={s.formCard}>
              <Pressable testID="home-pickup" onPress={() => setPicker("pickup")} style={s.row}>
                <View style={[s.dot, { backgroundColor: colors.gold }]} />
                <Text style={[s.rowText, !pickup && s.rowPlaceholder]} numberOfLines={1}>
                  {pickup || "Pickup location"}
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
  mapDim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.45)" },
  safe: { flex: 1, justifyContent: "space-between" },
  topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingTop: 4 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.7)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" },
  goldRing: { backgroundColor: "rgba(212,175,55,0.18)", borderColor: "rgba(212,175,55,0.4)" },
  brandPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, backgroundColor: "rgba(0,0,0,0.7)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  brandTxt: { color: colors.gold, fontSize: 10, letterSpacing: 2, fontWeight: "600" },
  sheet: { backgroundColor: "rgba(12,12,12,0.96)", borderTopLeftRadius: 28, borderTopRightRadius: 28, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)", paddingHorizontal: 22, paddingTop: 14, paddingBottom: 24 },
  handle: { alignSelf: "center", width: 38, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.2)", marginBottom: 14 },
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
});
