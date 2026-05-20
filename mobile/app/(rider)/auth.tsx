import { useState } from "react";
import { View, Text, StyleSheet, Pressable, Image, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { useRouter } from "expo-router";
import { ChevronLeft, Mail, Lock, Eye, EyeOff, Apple, ArrowRight } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Button from "@/components/Button";
import Input from "@/components/Input";
import { colors, assets } from "@/theme";

export default function RiderAuth() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);

  return (
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
            {mode === "signin" && (
              <Pressable testID="rider-auth-forgot" hitSlop={6}>
                <Text style={s.forgot}>Forgot password?</Text>
              </Pressable>
            )}
          </View>

          <Button
            testID="rider-auth-submit"
            onPress={() => {
              /* Wired up in Milestone 2 */
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
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: 24, paddingBottom: 40 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 8, marginBottom: 24 },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  backTxt: { color: "rgba(255,255,255,0.5)", fontSize: 12 },
  logo: { width: 30, height: 30, opacity: 0.9 },
  h1: { color: "#fff", fontSize: 28, lineHeight: 32 },
  h1Italic: { color: colors.gold, fontStyle: "italic" },
  sub: { color: "rgba(255,255,255,0.55)", fontSize: 13, marginTop: 6 },
  tabs: { flexDirection: "row", gap: 8, marginTop: 24, marginBottom: 20 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 999, alignItems: "center" },
  tabActive: { backgroundColor: colors.gold },
  tabTxt: { color: "rgba(255,255,255,0.55)", fontSize: 11, letterSpacing: 1.5, fontWeight: "600" },
  tabTxtActive: { color: "#000" },
  forgot: { color: colors.gold, fontSize: 11, alignSelf: "flex-end" },
  divider: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 22, marginBottom: 16 },
  dividerLine: { flex: 1, height: 1, backgroundColor: "rgba(255,255,255,0.1)" },
  dividerTxt: { color: "rgba(255,255,255,0.35)", fontSize: 10, letterSpacing: 2 },
  apple: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, backgroundColor: "#fff", paddingVertical: 14, borderRadius: 999 },
  appleTxt: { color: "#000", fontSize: 13, fontWeight: "500" },
});
