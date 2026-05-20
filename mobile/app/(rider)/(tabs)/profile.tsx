import { View, Text, StyleSheet, Pressable, ImageBackground, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { User as UserIcon, MapPin, CreditCard, Sparkles, Settings, ShieldCheck, ChevronRight, LogOut, Crown } from "lucide-react-native";
import { colors, radius, assets } from "@/theme";
import { useAuth } from "@/store/auth";

const ROWS = [
  { icon: UserIcon, label: "Personal Information" },
  { icon: MapPin, label: "Saved Addresses" },
  { icon: CreditCard, label: "Payment Methods" },
  { icon: Sparkles, label: "Promo Codes" },
  { icon: Settings, label: "Preferences" },
  { icon: ShieldCheck, label: "Privacy & Security" },
];

export default function RiderProfile() {
  const router = useRouter();
  const user = useAuth(s => s.user);
  const signOut = useAuth(s => s.signOut);
  const initial = (user?.name || "?").trim().charAt(0).toUpperCase();

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ImageBackground source={{ uri: assets.abstractGold }} style={s.hero} resizeMode="cover" imageStyle={{ opacity: 0.5 }}>
        <View style={s.heroDim} />
        <ImageBackground source={{ uri: assets.logoMark }} style={s.heroLogo} resizeMode="contain" imageStyle={{ opacity: 0.08 }}>
          <View />
        </ImageBackground>
        <SafeAreaView style={s.heroInner}>
          <View style={s.avatar}><Text style={s.avatarTxt}>{initial}</Text></View>
          <Text style={s.name}>{user?.name || "Guest"}</Text>
          <View style={s.metaRow}>
            <Crown size={11} color={colors.gold} />
            <Text style={s.metaTxt}>Elite Member · {user?.email}</Text>
          </View>
        </SafeAreaView>
      </ImageBackground>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 110 }}>
        <View style={s.menu}>
          {ROWS.map((r, i) => {
            const Icon = r.icon;
            return (
              <Pressable
                key={r.label}
                testID={`profile-row-${i}`}
                style={[s.menuRow, i < ROWS.length - 1 && s.menuRowDivider]}
              >
                <Icon size={16} color={colors.gold} strokeWidth={1.6} />
                <Text style={s.menuLabel}>{r.label}</Text>
                <ChevronRight size={14} color="rgba(255,255,255,0.4)" />
              </Pressable>
            );
          })}
        </View>
        <Pressable
          testID="profile-signout"
          onPress={async () => { await signOut(); router.replace("/"); }}
          style={s.signout}
        >
          <LogOut size={13} color={colors.error} />
          <Text style={s.signoutTxt}>Sign Out</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  hero: { height: 200 },
  heroDim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(5,5,5,0.55)" },
  heroLogo: { position: "absolute", top: 30, left: "50%", marginLeft: -75, width: 150, height: 150 },
  heroInner: { flex: 1, alignItems: "center", justifyContent: "flex-end", paddingBottom: 18 },
  avatar: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.gold, alignItems: "center", justifyContent: "center", shadowColor: colors.gold, shadowOpacity: 0.5, shadowRadius: 20, shadowOffset: { width: 0, height: 0 }, elevation: 8 },
  avatarTxt: { color: "#000", fontSize: 28, fontWeight: "600" },
  name: { color: "#fff", fontSize: 15, fontWeight: "500", marginTop: 10 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  metaTxt: { color: "rgba(255,255,255,0.5)", fontSize: 11 },
  menu: { borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  menuRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 15 },
  menuRowDivider: { borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.04)" },
  menuLabel: { flex: 1, color: "#fff", fontSize: 13 },
  signout: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, marginTop: 16, paddingVertical: 14, borderRadius: radius.xl, borderWidth: 1, borderColor: "rgba(239,68,68,0.3)" },
  signoutTxt: { color: colors.error, fontSize: 12, fontWeight: "500" },
});
