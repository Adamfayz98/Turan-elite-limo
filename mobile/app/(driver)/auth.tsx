import { useState } from "react";
import { View, Text, StyleSheet, Pressable, Image, ScrollView, KeyboardAvoidingView, Platform, ImageBackground } from "react-native";
import { useRouter } from "expo-router";
import { ChevronLeft, User, Lock, ArrowRight, Briefcase, ShieldCheck } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Button from "@/components/Button";
import Input from "@/components/Input";
import { colors, assets } from "@/theme";
import { driverLogin, driverSetPassword } from "@/api";
import { useDriverAuth } from "@/store/driver";

export default function DriverAuth() {
  const router = useRouter();
  const setSession = useDriverAuth(s => s.setSession);
  const [mode, setMode] = useState<"login" | "first-time">("login");
  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    if (!id.trim() || !password.trim()) {
      setError("Please enter both fields.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const data = mode === "login"
        ? await driverLogin({ email: id.trim().toLowerCase(), password })
        : await driverSetPassword({ email: id.trim().toLowerCase(), password });
      await setSession(data.token, data.driver);
      router.replace("/driver-trips");
    } catch (e: any) {
      const raw = e?.response?.data?.detail;
      setError(typeof raw === "string" ? raw : "Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={s.root}>
      <ImageBackground source={{ uri: assets.abstractGold }} style={s.heroBg} resizeMode="cover" imageStyle={{ opacity: 0.4 }}>
        <View style={s.heroDim} />
      </ImageBackground>

      <SafeAreaView style={s.safe}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
            <View style={s.headerRow}>
              <Pressable testID="driver-auth-back" onPress={() => router.back()} style={s.backBtn}>
                <ChevronLeft size={16} color="rgba(255,255,255,0.7)" />
                <Text style={s.backTxt}>Back</Text>
              </Pressable>
              <Image source={{ uri: assets.logoMark }} style={s.logo} resizeMode="contain" />
            </View>

            <View style={s.heroSpacer} />

            <View style={s.badge}>
              <Briefcase size={11} color={colors.gold} />
              <Text style={s.badgeTxt}>CHAUFFEUR PORTAL</Text>
            </View>

            <Text style={s.h1}>
              {mode === "login" ? "Behind the " : "First time? "}<Text style={s.h1Italic}>{mode === "login" ? "wheel." : "Set password."}</Text>
            </Text>
            <Text style={s.sub}>
              {mode === "login" ? "Sign in to view your assigned trips." : "Use the email dispatch gave you."}
            </Text>

            <View style={{ flexDirection: "row", gap: 8, marginTop: 16 }}>
              <Pressable testID="driver-auth-tab-login" onPress={() => setMode("login")} style={[s2.tab, mode === "login" && s2.tabActive]}>
                <Text style={[s2.tabTxt, mode === "login" && s2.tabTxtActive]}>SIGN IN</Text>
              </Pressable>
              <Pressable testID="driver-auth-tab-firsttime" onPress={() => setMode("first-time")} style={[s2.tab, mode === "first-time" && s2.tabActive]}>
                <Text style={[s2.tabTxt, mode === "first-time" && s2.tabTxtActive]}>FIRST TIME</Text>
              </Pressable>
            </View>

            <View style={{ gap: 14, marginTop: 18 }}>
              <Input
                testID="driver-auth-id"
                label="Driver Email"
                placeholder="you@turanelitelimo.com"
                autoCapitalize="none"
                keyboardType="email-address"
                value={id}
                onChangeText={setId}
                icon={<User size={14} color="rgba(255,255,255,0.4)" />}
              />
              <Input
                testID="driver-auth-password"
                label={mode === "first-time" ? "Set a Password" : "Password"}
                placeholder="••••••••"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                icon={<Lock size={14} color="rgba(255,255,255,0.4)" />}
              />
              {error && <Text style={s2.error}>{error}</Text>}
            </View>

            <View style={s.notice}>
              <ShieldCheck size={14} color={colors.gold} style={{ marginTop: 2 }} />
              <Text style={s.noticeTxt}>
                Driver accounts are issued by dispatch. Contact{" "}
                <Text style={{ color: colors.gold }}>dispatch@turanelitelimo.com</Text> if you don't have credentials.
              </Text>
            </View>

            <Button
              testID="driver-auth-submit"
              loading={submitting}
              onPress={onSubmit}
              icon={<ArrowRight size={14} color="#000" />}
              style={{ marginTop: 20 }}
            >
              {mode === "login" ? "Sign In to Drive" : "Set Password & Sign In"}
            </Button>

            {/* Forgot password — only shown in login mode. First-time mode
                doesn't need it (they're setting password for the first time). */}
            {mode === "login" && (
              <Pressable
                testID="driver-auth-forgot"
                onPress={() => router.push("/(driver)/forgot")}
                hitSlop={10}
                style={{ alignSelf: "center", marginTop: 14, padding: 4 }}
              >
                <Text style={{ color: colors.gold, fontSize: 12 }}>Forgot password?</Text>
              </Pressable>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  heroBg: { position: "absolute", top: 0, left: 0, right: 0, height: 280 },
  heroDim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(5,5,5,0.65)" },
  glow: {
    position: "absolute",
    top: -180,
    left: "50%",
    marginLeft: -200,
    width: 400,
    height: 400,
    borderRadius: 200,
    backgroundColor: "rgba(212,175,55,0.10)",
  },
  safe: { flex: 1 },
  scroll: { paddingHorizontal: 24, paddingBottom: 40 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 8, marginBottom: 18 },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  backTxt: { color: "rgba(255,255,255,0.7)", fontSize: 12 },
  logo: { width: 36, height: 36, opacity: 0.95 },
  heroSpacer: { height: 70 },
  badge: { alignSelf: "flex-start", flexDirection: "row", gap: 6, alignItems: "center", paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: "rgba(212,175,55,0.3)", backgroundColor: "rgba(212,175,55,0.08)", marginBottom: 12 },
  badgeTxt: { color: colors.gold, fontSize: 10, letterSpacing: 2, fontWeight: "600" },
  h1: { color: "#fff", fontSize: 30, lineHeight: 34 },
  h1Italic: { color: colors.gold, fontStyle: "italic" },
  sub: { color: "rgba(255,255,255,0.6)", fontSize: 13, marginTop: 6 },
  notice: { flexDirection: "row", gap: 10, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: "rgba(245,158,11,0.2)", backgroundColor: "rgba(245,158,11,0.05)", marginTop: 18 },
  noticeTxt: { flex: 1, color: "rgba(255,255,255,0.65)", fontSize: 11, lineHeight: 17 },
});

const s2 = StyleSheet.create({
  tab: { flex: 1, paddingVertical: 10, borderRadius: 999, alignItems: "center" },
  tabActive: { backgroundColor: colors.gold },
  tabTxt: { color: "rgba(255,255,255,0.55)", fontSize: 11, letterSpacing: 1.5, fontWeight: "600" },
  tabTxtActive: { color: "#000" },
  error: { color: colors.error, fontSize: 12, marginTop: 4 },
});
