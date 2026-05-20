/**
 * Date + time picker modal for the booking flow.
 * Uses @react-native-community/datetimepicker on native and a smart
 * <input type="datetime-local"> on web. Returns an ISO string.
 */
import { useState, useEffect } from "react";
import { Modal, View, Text, StyleSheet, Pressable, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChevronLeft } from "lucide-react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import Button from "@/components/Button";
import { colors, radius } from "@/theme";

interface Props {
  visible: boolean;
  initial?: string;          // ISO or empty
  onClose: () => void;
  onConfirm: (iso: string) => void;
}

const QUICKS = [
  { label: "In 1 hour", mins: 60 },
  { label: "In 2 hours", mins: 120 },
  { label: "Tomorrow 9 AM", iso: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d.toISOString(); } },
  { label: "Tomorrow 6 PM", iso: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(18, 0, 0, 0); return d.toISOString(); } },
];

export default function DateTimeModal({ visible, initial, onClose, onConfirm }: Props) {
  const [date, setDate] = useState<Date>(() => initial ? new Date(initial) : new Date(Date.now() + 60 * 60 * 1000));

  useEffect(() => { if (visible) setDate(initial ? new Date(initial) : new Date(Date.now() + 60 * 60 * 1000)); }, [visible, initial]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen">
      <SafeAreaView style={s.safe} edges={["top", "left", "right"]}>
        <View style={s.header}>
          <Pressable testID="dt-close" onPress={onClose} hitSlop={10} style={s.iconBtn}>
            <ChevronLeft size={20} color="#fff" />
          </Pressable>
          <Text style={s.title}>When?</Text>
          <View style={{ width: 36 }} />
        </View>

        <View style={{ padding: 18 }}>
          <Text style={s.label}>QUICK PICK</Text>
          <View style={s.chipsRow}>
            {QUICKS.map((q, i) => (
              <Pressable
                key={i}
                testID={`dt-quick-${i}`}
                onPress={() => {
                  const iso = q.iso ? q.iso() : new Date(Date.now() + (q.mins || 0) * 60000).toISOString();
                  setDate(new Date(iso));
                }}
                style={s.chip}
              >
                <Text style={s.chipTxt}>{q.label}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={[s.label, { marginTop: 22 }]}>OR PICK EXACTLY</Text>
          {Platform.OS === "web" ? (
            <input
              type="datetime-local"
              value={toLocalInput(date)}
              onChange={(e) => { const v = (e.target as any).value; if (v) setDate(new Date(v)); }}
              data-testid="dt-input"
              style={{
                background: colors.surfaceElevated, color: "#fff", border: `1px solid ${colors.border}`,
                borderRadius: 12, padding: 14, fontSize: 14, width: "100%", outline: "none", colorScheme: "dark",
              } as any}
            />
          ) : (
            <View style={s.pickerWrap}>
              <DateTimePicker
                testID="dt-native-picker"
                value={date}
                mode="datetime"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                minimumDate={new Date()}
                onChange={(_, d) => { if (d) setDate(d); }}
                themeVariant="dark"
                textColor="#fff"
              />
            </View>
          )}

          <View style={s.summary}>
            <Text style={s.summaryLabel}>SELECTED</Text>
            <Text style={s.summaryValue}>{date.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</Text>
          </View>

          <Button
            testID="dt-confirm"
            onPress={() => { onConfirm(date.toISOString()); onClose(); }}
            style={{ marginTop: 18 }}
          >
            Confirm
          </Button>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function toLocalInput(d: Date) {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  title: { color: "#fff", fontSize: 14, fontWeight: "600", letterSpacing: 0.5 },
  label: { color: "rgba(255,255,255,0.45)", fontSize: 10, letterSpacing: 2, fontWeight: "600", marginBottom: 10 },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, borderWidth: 1, borderColor: "rgba(212,175,55,0.4)", backgroundColor: "rgba(212,175,55,0.05)" },
  chipTxt: { color: colors.gold, fontSize: 12, fontWeight: "500" },
  pickerWrap: { backgroundColor: colors.surfaceElevated, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, alignItems: "center", paddingVertical: 6 },
  summary: { marginTop: 18, padding: 14, borderRadius: radius.lg, borderWidth: 1, borderColor: "rgba(212,175,55,0.3)", backgroundColor: "rgba(212,175,55,0.04)" },
  summaryLabel: { color: "rgba(255,255,255,0.45)", fontSize: 9, letterSpacing: 1.5, fontWeight: "600" },
  summaryValue: { color: colors.gold, fontSize: 16, fontWeight: "600", marginTop: 4, fontStyle: "italic" },
});
