import { useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, ImageBackground } from "react-native";
import { useRouter } from "expo-router";
import { ChevronLeft, Mail, Check } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Button from "@/components/Button";
import Input from "@/components/Input";
import { colors, assets } from "@/theme";
import { customerForgotPassword } from "@/api";

export default function ForgotPassword() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!email.trim()) { setError("Please enter your email."); return; }
    setBusy(true);
    try {
      await customerForgotPassword(email.trim().toLowerCase());
      setSent(true);
    } catch {
      // Endpoint is intentionally lenient — but if the network actually fails:
      setError("Couldn't reach the server. Please check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.root}>
      <ImageBackground source={{ uri: assets.abstractGold }} style={s.heroBg} resizeMode="cover" imageStyle={{ opacity: 0.4 }}>
        <View style={s.heroDim} />
      </ImageBackground>
      <SafeAreaView style={s.safe}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <Pressable testID="forgot-back" onPress={() => router.back()} style={s.backBtn}>
            <ChevronLeft size={16} color="rgba(255,255,255,0.7)" />
            <Text style={s.backTxt}>Back</Text>
          </Pressable>

          <View style={s.heroSpacer} />

          {sent ? (
            <View style={s.card}>
              <View style={s.successIcon}><Check size={22} color={colors.gold} strokeWidth={2.2} /></View>
              <Text style={s.h1}>Check your <Text style={s.italic}>inbox.</Text></Text>
              <Text style={s.sub}>
                If an account exists for{" "}
                <Text style={{ color: "#fff" }}>{email}</Text>, we just sent a password-reset link.
                Tap the button in the email to choose a new password. The link expires in 2 hours.
              </Text>
              <Pressable testID="forgot-back-to-signin" onPress={() => router.replace("/(rider)/auth")} style={s.primaryBtn}>
                <Text style={s.primaryBtnTxt}>Back to sign in</Text>
              </Pressable>
              <Text style={s.tip}>
                Didn't see it? Check your spam folder, or{" "}
                <Text onPress={() => setSent(false)} style={s.tipLink}>try a different email</Text>.
              </Text>
            </View>
          ) : (
            <View style={s.card}>
              <Text style={s.h1}>Forgot your <Text style={s.italic}>password?</Text></Text>
              <Text style={s.sub}>
                Enter the email you used when you signed up. We'll send you a one-time reset link.
              </Text>

              <Input
                testID="forgot-email"
                label="Email"
                placeholder="you@example.com"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                icon={<Mail size={14} color="rgba(255,255,255,0.4)" />}
                autoFocus
              />
              {error && <Text style={s.error}>{error}</Text>}

              <Button
                testID="forgot-submit"
                label={busy ? "Sending…" : "Send reset link"}
                onPress={submit}
                disabled={busy}
                style={{ marginTop: 18 }}
              />

              <Pressable testID="forgot-back-to-signin-alt" onPress={() => router.back()} hitSlop={6} style={s.linkBtn}>
                <Text style={s.linkTxt}>Remember it? Back to sign in</Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  heroBg: { position: "absolute", top: 0, left: 0, right: 0, height: 340 },
  heroDim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(5,5,5,0.7)" },
  safe: { flex: 1 },
  scroll: { paddingHorizontal: 22, paddingBottom: 60 },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 10, alignSelf: "flex-start" },
  backTxt: { color: "rgba(255,255,255,0.7)", fontSize: 13 },
  heroSpacer: { height: 60 },
  card: { padding: 22, borderRadius: 20, borderWidth: 1, borderColor: "rgba(212,175,55,0.2)", backgroundColor: "rgba(14,14,14,0.85)" },
  successIcon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(212,175,55,0.12)", borderWidth: 1, borderColor: "rgba(212,175,55,0.4)", marginBottom: 16 },
  h1: { color: "#fff", fontSize: 26, lineHeight: 30, fontWeight: "400", marginBottom: 6 },
  italic: { color: colors.gold, fontStyle: "italic" },
  sub: { color: "rgba(255,255,255,0.6)", fontSize: 13, lineHeight: 20, marginBottom: 18 },
  error: { color: colors.error, fontSize: 12, marginTop: 8 },
  primaryBtn: { marginTop: 18, paddingVertical: 14, borderRadius: 999, backgroundColor: colors.gold, alignItems: "center" },
  primaryBtnTxt: { color: "#000", fontSize: 13, fontWeight: "600" },
  tip: { color: "rgba(255,255,255,0.45)", fontSize: 11, marginTop: 18, textAlign: "center", lineHeight: 17 },
  tipLink: { color: colors.gold, textDecorationLine: "underline" },
  linkBtn: { marginTop: 14, alignSelf: "center", paddingVertical: 6 },
  linkTxt: { color: "rgba(255,255,255,0.55)", fontSize: 12 },
});
