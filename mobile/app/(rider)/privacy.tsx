/**
 * Privacy & Security — change password + delete account (soft-delete).
 */
import { useState } from "react";
import { View, Text, TextInput, StyleSheet, Pressable, Alert, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { Lock, AlertTriangle } from "lucide-react-native";
import { useRouter } from "expo-router";
import SubScreen from "@/components/SubScreen";
import { changeMyPassword, deleteMyAccount } from "@/api";
import { useAuth } from "@/store/auth";
import { colors, radius } from "@/theme";

export default function PrivacyScreen() {
  const router = useRouter();
  const signOut = useAuth(s => s.signOut);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const change = async () => {
    if (next.length < 8) return Alert.alert("Password too short", "Use at least 8 characters.");
    if (next !== confirm) return Alert.alert("Passwords don't match");
    setBusy(true);
    try {
      await changeMyPassword({ current_password: current, new_password: next });
      setCurrent(""); setNext(""); setConfirm("");
      Alert.alert("Password updated", "Your new password is now active.");
    } catch (e: any) {
      Alert.alert("Could not update", e?.response?.data?.detail || "Try again.");
    } finally { setBusy(false); }
  };

  const askDelete = () => Alert.alert(
    "Delete account?",
    "This is permanent. Your booking history stays for accounting, but your profile, saved addresses, and login will be removed. You will be signed out.",
    [
      { text: "Cancel", style: "cancel" },
      { text: "Delete forever", style: "destructive", onPress: async () => {
        try {
          await deleteMyAccount();
          await signOut();
          router.replace("/");
        } catch (e: any) {
          Alert.alert("Could not delete", e?.response?.data?.detail || "Contact support.");
        }
      } },
    ],
  );

  return (
    <SubScreen title="Privacy & Security" subtitle="Password and account control">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 50 }}>
          <View style={s.cardHeader}><Lock size={14} color={colors.gold} /><Text style={s.section}>Change password</Text></View>
          <TextInput testID="pw-current" placeholder="Current password" placeholderTextColor="rgba(255,255,255,0.3)" style={s.input} secureTextEntry value={current} onChangeText={setCurrent} />
          <TextInput testID="pw-new" placeholder="New password (min 8 chars)" placeholderTextColor="rgba(255,255,255,0.3)" style={[s.input, { marginTop: 8 }]} secureTextEntry value={next} onChangeText={setNext} />
          <TextInput testID="pw-confirm" placeholder="Confirm new password" placeholderTextColor="rgba(255,255,255,0.3)" style={[s.input, { marginTop: 8 }]} secureTextEntry value={confirm} onChangeText={setConfirm} />
          <Pressable
            testID="pw-save"
            disabled={busy}
            onPress={change}
            style={({ pressed }) => [s.saveBtn, pressed && { opacity: 0.85 }, busy && { opacity: 0.6 }]}
          >
            <Text style={s.saveTxt}>Update password</Text>
          </Pressable>

          <View style={{ marginTop: 40, padding: 16, borderRadius: radius.md, backgroundColor: "rgba(239,68,68,0.06)", borderWidth: 1, borderColor: "rgba(239,68,68,0.2)" }}>
            <View style={s.cardHeader}><AlertTriangle size={14} color="#EF4444" /><Text style={[s.section, { color: "#EF4444" }]}>Danger zone</Text></View>
            <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, lineHeight: 17, marginTop: 6 }}>
              Permanently delete your account. Past bookings stay on our records for accounting, but everything else is removed.
            </Text>
            <Pressable testID="delete-acct" onPress={askDelete} style={s.deleteBtn}>
              <Text style={s.deleteTxt}>Delete my account</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SubScreen>
  );
}

const s = StyleSheet.create({
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  section: { color: colors.gold, fontSize: 11, letterSpacing: 2, textTransform: "uppercase" },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 13, color: "#fff", backgroundColor: "rgba(255,255,255,0.03)", fontSize: 14 },
  saveBtn: { marginTop: 16, backgroundColor: colors.gold, paddingVertical: 13, borderRadius: 999, alignItems: "center" },
  saveTxt: { color: "#000", fontSize: 13, fontWeight: "600" },
  deleteBtn: { marginTop: 14, paddingVertical: 12, borderRadius: 999, borderWidth: 1, borderColor: "rgba(239,68,68,0.4)", alignItems: "center" },
  deleteTxt: { color: "#EF4444", fontSize: 13, fontWeight: "600" },
});
