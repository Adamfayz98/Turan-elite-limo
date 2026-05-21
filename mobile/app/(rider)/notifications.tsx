/**
 * Notification preferences — toggle push and email categories.
 */
import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Switch, ScrollView, ActivityIndicator, Alert } from "react-native";
import SubScreen from "@/components/SubScreen";
import { getNotificationPrefs, updateNotificationPrefs, NotificationPrefs } from "@/api";
import { colors, radius } from "@/theme";

export default function NotificationsScreen() {
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try { setPrefs(await getNotificationPrefs()); }
      catch (e: any) { Alert.alert("Could not load", e?.response?.data?.detail || "Try again."); }
    })();
  }, []);

  const toggle = async (key: keyof NotificationPrefs, val: boolean) => {
    if (!prefs) return;
    const next = { ...prefs, [key]: val };
    setPrefs(next);
    setSaving(true);
    try { await updateNotificationPrefs(next); }
    catch (e: any) {
      Alert.alert("Could not save", e?.response?.data?.detail || "Try again.");
      setPrefs(prefs); // revert
    } finally { setSaving(false); }
  };

  if (!prefs) return (
    <SubScreen title="Notifications" subtitle="What you hear from us"><View style={{ paddingVertical: 40, alignItems: "center" }}><ActivityIndicator color={colors.gold} /></View></SubScreen>
  );

  return (
    <SubScreen title="Notifications" subtitle="What you hear from us">
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 50 }}>
        <Section title="Ride updates">
          <Row label="Push notifications" hint="Driver assigned, en route, arrived." value={prefs.ride_updates_push} onChange={(v) => toggle("ride_updates_push", v)} testID="ride-push-toggle" />
          <Row label="Email" hint="Confirmation, status changes, receipts." value={prefs.ride_updates_email} onChange={(v) => toggle("ride_updates_email", v)} testID="ride-email-toggle" />
          <Row label="Email receipts only" hint="Always get a receipt after each paid trip." value={prefs.receipts_email} onChange={(v) => toggle("receipts_email", v)} testID="receipts-email-toggle" />
        </Section>
        <Section title="Promotions">
          <Row label="Push notifications" hint="New promo codes and limited offers." value={prefs.promotions_push} onChange={(v) => toggle("promotions_push", v)} testID="promo-push-toggle" />
          <Row label="Email" hint="Monthly newsletter and special deals." value={prefs.promotions_email} onChange={(v) => toggle("promotions_email", v)} testID="promo-email-toggle" />
        </Section>
        {saving ? (
          <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, textAlign: "center", marginTop: 14 }}>Saving…</Text>
        ) : null}
      </ScrollView>
    </SubScreen>
  );
}

function Section({ title, children }: any) {
  return (
    <View style={{ marginTop: 18 }}>
      <Text style={s.section}>{title}</Text>
      <View style={s.group}>{children}</View>
    </View>
  );
}

function Row({ label, hint, value, onChange, testID }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void; testID?: string }) {
  return (
    <View style={s.row}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={s.rowLabel}>{label}</Text>
        {hint ? <Text style={s.rowHint}>{hint}</Text> : null}
      </View>
      <Switch
        testID={testID}
        value={value}
        onValueChange={onChange}
        trackColor={{ false: "#2a2a2a", true: colors.gold }}
        thumbColor={value ? "#000" : "#888"}
      />
    </View>
  );
}

const s = StyleSheet.create({
  section: { color: colors.gold, fontSize: 11, letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 },
  group: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: "rgba(255,255,255,0.025)", overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 14, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" },
  rowLabel: { color: "#fff", fontSize: 14 },
  rowHint: { color: "rgba(255,255,255,0.45)", fontSize: 11, marginTop: 2, lineHeight: 15 },
});
