/**
 * Help & Support — quick contact buttons (call/email) + in-app contact form.
 * Submitted help requests land in the admin Contacts tab with source=mobile_app.
 */
import { useState } from "react";
import { View, Text, TextInput, StyleSheet, Pressable, Alert, ScrollView, Linking, KeyboardAvoidingView, Platform } from "react-native";
import { Phone, Mail, MessageSquare } from "lucide-react-native";
import SubScreen from "@/components/SubScreen";
import { submitHelpRequest } from "@/api";
import { colors, radius } from "@/theme";

const SUPPORT_PHONE = "+16506723520";
const SUPPORT_EMAIL = "support@turanelitelimo.com";

export default function HelpScreen() {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (subject.trim().length < 3) return Alert.alert("Subject too short");
    if (message.trim().length < 5) return Alert.alert("Please describe how we can help");
    setBusy(true);
    try {
      await submitHelpRequest({ subject: subject.trim(), message: message.trim() });
      setSubject(""); setMessage("");
      Alert.alert("Sent", "We've got your message and will reply soon. For urgent matters, please call us.");
    } catch (e: any) {
      Alert.alert("Could not send", e?.response?.data?.detail || "Try again or call us directly.");
    } finally { setBusy(false); }
  };

  return (
    <SubScreen title="Help & Support" subtitle="We're here 24/7">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
          <View style={s.quickGrid}>
            <Pressable testID="call-support" onPress={() => Linking.openURL(`tel:${SUPPORT_PHONE}`)} style={({ pressed }) => [s.quickBtn, pressed && { opacity: 0.85 }]}>
              <Phone size={20} color={colors.gold} />
              <Text style={s.quickLabel}>Call us</Text>
              <Text style={s.quickSub}>(650) 672-3520</Text>
            </Pressable>
            <Pressable testID="email-support" onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)} style={({ pressed }) => [s.quickBtn, pressed && { opacity: 0.85 }]}>
              <Mail size={20} color={colors.gold} />
              <Text style={s.quickLabel}>Email</Text>
              <Text style={s.quickSub}>support@…</Text>
            </Pressable>
          </View>

          <View style={s.formCard}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <MessageSquare size={14} color={colors.gold} />
              <Text style={s.section}>Send us a message</Text>
            </View>
            <TextInput
              testID="help-subject"
              placeholder="Subject (e.g. Question about my reservation)"
              placeholderTextColor="rgba(255,255,255,0.3)"
              style={s.input}
              value={subject}
              onChangeText={setSubject}
            />
            <TextInput
              testID="help-message"
              placeholder="How can we help?"
              placeholderTextColor="rgba(255,255,255,0.3)"
              style={[s.input, { marginTop: 8, minHeight: 130, textAlignVertical: "top" }]}
              value={message}
              onChangeText={setMessage}
              multiline
            />
            <Pressable
              testID="help-submit"
              disabled={busy}
              onPress={submit}
              style={({ pressed }) => [s.submitBtn, pressed && { opacity: 0.85 }, busy && { opacity: 0.6 }]}
            >
              <Text style={s.submitTxt}>Send message</Text>
            </Pressable>
          </View>

          <Text style={s.foot}>
            Average reply time: under 1 hour during business hours. For urgent ride changes, please call.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SubScreen>
  );
}

const s = StyleSheet.create({
  quickGrid: { flexDirection: "row", gap: 12 },
  quickBtn: { flex: 1, padding: 16, borderRadius: radius.md, backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: colors.border, alignItems: "flex-start" },
  quickLabel: { color: "#fff", fontSize: 14, fontWeight: "500", marginTop: 8 },
  quickSub: { color: "rgba(255,255,255,0.5)", fontSize: 11, marginTop: 2 },
  formCard: { marginTop: 24, padding: 16, borderRadius: radius.md, backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: colors.border },
  section: { color: colors.gold, fontSize: 11, letterSpacing: 2, textTransform: "uppercase" },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, color: "#fff", backgroundColor: "rgba(0,0,0,0.2)", fontSize: 14 },
  submitBtn: { marginTop: 14, backgroundColor: colors.gold, paddingVertical: 13, borderRadius: 999, alignItems: "center" },
  submitTxt: { color: "#000", fontSize: 13, fontWeight: "600" },
  foot: { color: "rgba(255,255,255,0.4)", fontSize: 11, marginTop: 18, textAlign: "center", lineHeight: 16 },
});
