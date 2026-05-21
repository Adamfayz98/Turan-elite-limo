/**
 * Personal Information — edit rider's name + phone (email is read-only).
 */
import { useState } from "react";
import { View, Text, TextInput, StyleSheet, Pressable, Alert, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { Loader2 } from "lucide-react-native";
import SubScreen from "@/components/SubScreen";
import { useAuth } from "@/store/auth";
import { updateMyProfile } from "@/api";
import { colors, radius } from "@/theme";

export default function PersonalInfo() {
  const user = useAuth(s => s.user);
  const setUser = useAuth(s => s.setUser);
  const [name, setName] = useState(user?.name || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) return Alert.alert("Name required");
    setSaving(true);
    try {
      const updated = await updateMyProfile({ name: name.trim(), phone: phone.trim() });
      if (setUser) setUser({ ...(user as any), name: updated.name, phone: updated.phone });
      Alert.alert("Saved", "Your profile has been updated.");
    } catch (e: any) {
      Alert.alert("Could not save", e?.response?.data?.detail || "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SubScreen title="Personal Information" subtitle="Update your contact details">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.body}>
          <Field label="Full name">
            <TextInput
              testID="profile-name-input"
              value={name}
              onChangeText={setName}
              style={s.input}
              placeholder="Your name"
              placeholderTextColor="rgba(255,255,255,0.3)"
              autoCapitalize="words"
            />
          </Field>
          <Field label="Email" hint="To change your email, contact support.">
            <View style={[s.input, { opacity: 0.5 }]}>
              <Text style={{ color: "#fff", fontSize: 14 }}>{user?.email || ""}</Text>
            </View>
          </Field>
          <Field label="Phone number">
            <TextInput
              testID="profile-phone-input"
              value={phone}
              onChangeText={setPhone}
              style={s.input}
              placeholder="(555) 123-4567"
              placeholderTextColor="rgba(255,255,255,0.3)"
              keyboardType="phone-pad"
            />
          </Field>
          <Pressable
            testID="profile-save-btn"
            disabled={saving}
            onPress={save}
            style={({ pressed }) => [s.saveBtn, pressed && { opacity: 0.85 }, saving && { opacity: 0.6 }]}
          >
            {saving ? <Loader2 size={16} color="#000" /> : <Text style={s.saveTxt}>Save changes</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SubScreen>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: any }) {
  return (
    <View style={{ marginTop: 14 }}>
      <Text style={s.label}>{label}</Text>
      {children}
      {hint ? <Text style={s.hint}>{hint}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  body: { padding: 20, paddingBottom: 50 },
  label: { color: "rgba(255,255,255,0.55)", fontSize: 11, marginBottom: 6, letterSpacing: 1.5, textTransform: "uppercase" },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 13, color: "#fff", backgroundColor: "rgba(255,255,255,0.03)", fontSize: 14 },
  hint: { color: "rgba(255,255,255,0.4)", fontSize: 11, marginTop: 4 },
  saveBtn: { marginTop: 28, backgroundColor: colors.gold, paddingVertical: 14, borderRadius: 999, alignItems: "center" },
  saveTxt: { color: "#000", fontSize: 14, fontWeight: "600" },
});
