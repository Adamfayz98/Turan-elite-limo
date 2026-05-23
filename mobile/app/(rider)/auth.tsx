import { useState } from "react";
import { View, Text, StyleSheet, Pressable, Image, ScrollView, KeyboardAvoidingView, Platform, ImageBackground } from "react-native";
import { useRouter } from "expo-router";
import { ChevronLeft, Mail, Lock, Eye, EyeOff, Apple, ArrowRight, User as UserIcon } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Button from "@/components/Button";
import Input from "@/components/Input";
import { colors, assets } from "@/theme";
import { loginRider, signupRider } from "@/api";
import { useAuth } from "@/store/auth";
import { registerForPushAsync } from "@/push";

export default function RiderAuth() {
  const router = useRouter();
  const setUser = useAuth(s => s.setUser);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <View style={s.root}>
      {/* Atmospheric hero backdrop */}
      <ImageBackground source={{ uri: assets.abstractGold }} style={s.heroBg} resizeMode="cover" imageStyle={{ opacity: 0.55 }}>
        <View style={s.heroDim} />
      </ImageBackground>

      <SafeAreaView style={s.safe}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
            <View style={s.headerRow}>
              <Pressable testID="rider-auth-back" onPress={() => router.back()} style={s.backBtn}>
                <ChevronLeft size={16} color="rgba(255,255,255,0.7)" />
                <Text style={s.backTxt}>Back</Text>
              </Pressable>
              <Image source={{ uri: assets.logoMark }} style={s.logo} resizeMode="contain" />
            </View>

            <View style={s.heroSpacer} />

            <Text style={s.h1}>
              Welcome <Text style={s.h1Italic}>back.</Text>
            </Text>
            <Text style={s.sub}>Sign in to manage your reservations.</Text>

            <View style={s.tabs}>
              <Pressable
                testID="rider-auth-tab-signin"
                onPress={() => setMode("signin")}
                style={[s.tab, mode === "signin" && s.tabActive]}>
                <Text style={[s.tabTxt, mode === "signin" && s.tabTxtActive]}>SIGN IN</Text>
              </Pressable>
              <Pressable
                testID="rider-auth-tab-signup"
                onPress={() => setMode("signup")}
                style={[s.tab, mode === "signup" && s.tabActive]}>
                <Text style={[s.tabTxt, mode === "signup" && s.tabTxtActive]}>CREATE ACCOUNT</Text>
              </Pressable>
            </View>

            <View style={{ gap: 14 }}>
              {mode === "signup" && (
                <Input
                  testID="rider-auth-name"
                  label="Full Name"
                  placeholder="Jane Doe"
                  autoCapitalize="words"
                  value={name}
                  onChangeText={setName}
                  icon={<UserIcon size={14} color="rgba(255,255,255,0.4)" />}
                />
              )}
              <Input
                testID="rider-auth-email"
                label="Email"
                placeholder="you@email.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                value={email}
                onChangeText={setEmail}
                icon={<Mail size={14} color="rgba(255,255,255,0.4)" />}
              />
              <Input
                testID="rider-auth-password"
                label="Password"
                placeholder="••••••••"
                secureTextEntry={!showPw}
                value={password}
                onChangeText={setPassword}
                icon={<Lock size={14} color="rgba(255,255,255,0.4)" />}
                rightIcon={
                  <Pressable onPress={() => setShowPw(v => !v)} hitSlop={10}>
                    {showPw ? <EyeOff size={14} color="rgba(255,255,255,0.4)" /> : <Eye size={14} color="rgba(255,255,255,0.4)" />}
                  </Pressable>
                }
              />
              {error && (
                <Text testID="rider-auth-error" style={s.error}>{error}</Text>
              )}
              {mode === "signin" && (
                <Pressable testID="rider-auth-forgot" onPress={() => router.push("/(rider)/forgot")} hitSlop={6}>
                  <Text style={s.forgot}>Forgot password?</Text>
                </Pressable>
              )}
            </View>

            <Button
              testID="rider-auth-submit"
              loading={submitting}
              onPress={async () => {
                if (!email.trim() || !password.trim() || (mode === "signup" && !name.trim())) {
                  setError("Please fill in all fields.");
                  return;
                }
                setError(null);
                setSubmitting(true);
                try {
                  const data = mode === "signin"
                    ? await loginRider({ email: email.trim().toLowerCase(), password })
                    : await signupRider({ name: name.trim(), email: email.trim().toLowerCase(), password });
                  setUser(data.user);
                  // Register for push notifications in the background.
                  // Non-blocking — if the user denies or the backend endpoint
                  // isn't deployed yet, login still succeeds.
                  registerForPushAsync("rider").catch(() => {});
                  router.replace("/home");
                } catch (e: any) {
                  const raw = e?.response?.data?.detail;
                  if (typeof raw === "string") {
                    setError(raw);
                  } else if (Array.isArray(raw)) {
                    setError(raw.map((d: any) => d?.msg).filter(Boolean).join(", ") || "Something went wrong. Try again.");
                  } else if (e?.response?.status) {
                    setError(`Sign-in failed (HTTP ${e.response.status}). Please try again.`);
                  } else {
                    // No HTTP response → network failure / DNS / TLS
                    setError("Couldn't reach the server. Please check your connection and try again.");
                  }
                } finally {
                  setSubmitting(false);
                }
              }}
              icon={<ArrowRight size={14} color="#000" />}
              style={{ marginTop: 20 }}
            >
              {mode === "signin" ? "Continue" : "Create Account"}
            </Button>

            <View style={s.divider}>
              <View style={s.dividerLine} />
              <Text style={s.dividerTxt}>OR</Text>
              <View style={s.dividerLine} />
            </View>

            <Pressable testID="rider-auth-apple" style={s.apple}>
              <Apple size={16} color="#000" />
              <Text style={s.appleTxt}>Continue with Apple</Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  heroBg: { position: "absolute", top: 0, left: 0, right: 0, height: 280 },
  heroDim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(5,5,5,0.55)" },
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
  heroSpacer: { height: 80 },
  h1: { color: "#fff", fontSize: 30, lineHeight: 34 },
  h1Italic: { color: colors.gold, fontStyle: "italic" },
  sub: { color: "rgba(255,255,255,0.6)", fontSize: 13, marginTop: 6 },
  tabs: { flexDirection: "row", gap: 8, marginTop: 22, marginBottom: 18 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 999, alignItems: "center" },
  tabActive: { backgroundColor: colors.gold },
  tabTxt: { color: "rgba(255,255,255,0.55)", fontSize: 11, letterSpacing: 1.5, fontWeight: "600" },
  tabTxtActive: { color: "#000" },
  forgot: { color: colors.gold, fontSize: 11, alignSelf: "flex-end" },
  divider: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 22, marginBottom: 14 },
  dividerLine: { flex: 1, height: 1, backgroundColor: "rgba(255,255,255,0.1)" },
  dividerTxt: { color: "rgba(255,255,255,0.35)", fontSize: 10, letterSpacing: 2 },
  apple: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, backgroundColor: "#fff", paddingVertical: 14, borderRadius: 999 },
  appleTxt: { color: "#000", fontSize: 13, fontWeight: "500" },
  error: { color: colors.error, fontSize: 12, marginTop: 4 },
});
