import { View, Text, StyleSheet, ImageBackground, Pressable, Image } from "react-native";
import { useRouter } from "expo-router";
import { ChevronRight, Crown, Briefcase, Sparkles } from "lucide-react-native";
import { colors, radius, assets } from "@/theme";
import { SafeAreaView } from "react-native-safe-area-context";

export default function RolePickerScreen() {
  const router = useRouter();
  return (
    <View style={s.container}>
      <ImageBackground source={{ uri: assets.abstractGold }} style={s.bgImage} resizeMode="cover" imageStyle={{ opacity: 0.4 }}>
        <View style={s.bgOverlay} />
        <SafeAreaView style={s.safe}>
          <View style={s.topBlock}>
            <Image source={{ uri: assets.logoMark }} style={s.logo} resizeMode="contain" />
            <View style={s.tagRow}>
              <Sparkles size={12} color={colors.gold} />
              <Text style={s.tag}>BAY AREA · NORCAL</Text>
            </View>
            <Text style={s.titleLine}>Welcome to</Text>
            <Text style={s.titleEmphasis}>TuranEliteLimo</Text>
            <Text style={s.sub}>Private chauffeured rides across San Francisco & beyond.</Text>
          </View>

          <View style={s.actions}>
            <Text style={s.actionsLabel}>HOW ARE YOU JOINING US TODAY?</Text>

            <Pressable
              testID="role-picker-rider"
              onPress={() => router.push("/(rider)/auth")}
              style={({ pressed }) => [s.card, s.cardRider, pressed && { opacity: 0.85 }]}
            >
              <View style={[s.iconCircle, { backgroundColor: "rgba(212,175,55,0.15)" }]}>
                <Crown size={20} color={colors.gold} strokeWidth={1.6} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.cardTitle}>I'm a Rider</Text>
                <Text style={s.cardSub}>Book a luxury chauffeur</Text>
              </View>
              <ChevronRight size={18} color={colors.gold} />
            </Pressable>

            <Pressable
              testID="role-picker-driver"
              onPress={() => router.push("/(driver)/auth")}
              style={({ pressed }) => [s.card, s.cardDriver, pressed && { opacity: 0.85 }]}
            >
              <View style={[s.iconCircle, { backgroundColor: "rgba(255,255,255,0.1)" }]}>
                <Briefcase size={20} color="#fff" strokeWidth={1.6} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.cardTitle}>I'm a Driver</Text>
                <Text style={s.cardSub}>Manage your trips</Text>
              </View>
              <ChevronRight size={18} color="#fff" />
            </Pressable>
          </View>
        </SafeAreaView>
      </ImageBackground>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  bgImage: { flex: 1, width: "100%", height: "100%" },
  bgOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)" },
  safe: { flex: 1, paddingHorizontal: 24, justifyContent: "space-between" },
  topBlock: { alignItems: "center", paddingTop: 36 },
  logo: { width: 56, height: 56, marginBottom: 14 },
  tagRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  tag: { color: colors.gold, fontSize: 10, letterSpacing: 3, fontWeight: "600" },
  titleLine: { color: "#fff", fontSize: 26, textAlign: "center", marginTop: 6 },
  titleEmphasis: { color: colors.gold, fontSize: 26, fontStyle: "italic", textAlign: "center", marginTop: 2 },
  sub: { color: "rgba(255,255,255,0.55)", fontSize: 13, textAlign: "center", marginTop: 14, lineHeight: 18, maxWidth: 240 },
  actions: { paddingBottom: 28 },
  actionsLabel: { color: "rgba(255,255,255,0.45)", fontSize: 10, letterSpacing: 3, textAlign: "center", marginBottom: 14, fontWeight: "500" },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: radius.lg,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
  },
  cardRider: { borderColor: "rgba(212,175,55,0.4)", backgroundColor: "rgba(212,175,55,0.06)" },
  cardDriver: { borderColor: "rgba(255,255,255,0.1)", backgroundColor: "rgba(255,255,255,0.05)" },
  iconCircle: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  cardTitle: { color: "#fff", fontSize: 15, fontWeight: "500" },
  cardSub: { color: "rgba(255,255,255,0.55)", fontSize: 12, marginTop: 2 },
});
