import { useState } from "react";
import { View, Text, StyleSheet, Pressable, Image, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { useRouter } from "expo-router";
import { ChevronLeft, User, Lock, ArrowRight, Briefcase, ShieldCheck } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Button from "@/components/Button";
import Input from "@/components/Input";
import { colors, assets } from "@/theme";

export default function DriverAuth() {
  const router = useRouter();
  const [id, setId] = useState("");
  const [password, setPassword] = useState("");

  return (
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

          <View style={s.badge}>
            <Briefcase size={11} color={colors.gold} />
            <Text style={s.badgeTxt}>CHAUFFEUR PORTAL</Text>
          </View>

          <Text style={s.h1}>
            Behind the <Text style={s.h1Italic}>wheel.</Text>
          </Text>
          <Text style={s.sub}>Sign in to view your assigned trips.</Text>

          <View style={{ gap: 14, marginTop: 24 }}>
            <Input
              testID="driver-auth-id"
              label="Driver ID or Email"
              placeholder="marcus.t@turanlimo.com"
              autoCapitalize="none"
              keyboardType="email-address"
              value={id}
              onChangeText={setId}
              icon={<User size={14} color="rgba(255,255,255,0.4)" />}
            />
            <Input
              testID="driver-auth-password"
              label="Password"
              placeholder="••••••••"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              icon={<Lock size={14} color="rgba(255,255,255,0.4)" />}
            />
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
            onPress={() => {
              /* Wired in Milestone 3 */
            }}
            icon={<ArrowRight size={14} color="#000" />}
            style={{ marginTop: 20 }}
          >
            Sign In to Drive
          </Button>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: 24, paddingBottom: 40 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 8, marginBottom: 22 },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  backTxt: { color: "rgba(255,255,255,0.5)", fontSize: 12 },
  logo: { width: 30, height: 30, opacity: 0.9 },
  badge: { alignSelf: "flex-start", flexDirection: "row", gap: 6, alignItems: "center", paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: "rgba(212,175,55,0.3)", backgroundColor: "rgba(212,175,55,0.08)", marginBottom: 14 },
  badgeTxt: { color: colors.gold, fontSize: 10, letterSpacing: 2, fontWeight: "600" },
  h1: { color: "#fff", fontSize: 28, lineHeight: 32 },
  h1Italic: { color: colors.gold, fontStyle: "italic" },
  sub: { color: "rgba(255,255,255,0.55)", fontSize: 13, marginTop: 6 },
  notice: { flexDirection: "row", gap: 10, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: "rgba(245,158,11,0.2)", backgroundColor: "rgba(245,158,11,0.05)", marginTop: 18 },
  noticeTxt: { flex: 1, color: "rgba(255,255,255,0.65)", fontSize: 11, lineHeight: 17 },
});
