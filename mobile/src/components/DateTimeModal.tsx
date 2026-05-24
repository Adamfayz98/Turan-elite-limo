/**
 * Date + time picker modal for the booking flow.
 *
 * Cross-platform UX:
 *  - iOS: a single inline "spinner" wheel showing day + time together (native UX).
 *  - Android: two tap-to-open pickers (date picker first, then time picker)
 *    rendered as buttons. The default `mode="datetime"` on Android is broken —
 *    it spawns two sequential modal dialogs with OK buttons that feel laggy.
 *    Two explicit buttons + dialogs feel snappier and match Material guidelines.
 *  - Web: an `<input type="datetime-local">`.
 *
 * Returns an ISO string via onConfirm.
 */
import { useState, useEffect } from "react";
import { Modal, View, Text, StyleSheet, Pressable, Platform } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft, Calendar as CalendarIcon, Clock as ClockIcon } from "lucide-react-native";
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
  const insets = useSafeAreaInsets();
  const [date, setDate] = useState<Date>(() => initial ? new Date(initial) : new Date(Date.now() + 60 * 60 * 1000));
  // Android-only: which sub-picker is currently visible (date or time).
  // Closed when null. We open them one at a time via tap.
  const [androidPicker, setAndroidPicker] = useState<null | "date" | "time">(null);

  useEffect(() => { if (visible) setDate(initial ? new Date(initial) : new Date(Date.now() + 60 * 60 * 1000)); }, [visible, initial]);

  // Merge a new date-only value into the existing time-of-day.
  const setDateOnly = (d: Date) => {
    const merged = new Date(date);
    merged.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
    setDate(merged);
  };

  // Merge a new time-of-day value into the existing date.
  const setTimeOnly = (d: Date) => {
    const merged = new Date(date);
    merged.setHours(d.getHours(), d.getMinutes(), 0, 0);
    setDate(merged);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      /* See AddressPicker.tsx — `presentationStyle="fullScreen"` on iOS
         broke SafeAreaView's status-bar inset. Default modal presentation
         respects safe-area insets on both platforms. */
      statusBarTranslucent
    >
      <View style={[s.safe, { paddingTop: Math.max(insets.top, Platform.OS === "ios" ? 50 : 24) }]}>
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
          ) : Platform.OS === "ios" ? (
            // iOS: inline spinner wheel — natively shows date + time together.
            <View style={s.pickerWrap}>
              <DateTimePicker
                testID="dt-native-picker"
                value={date}
                mode="datetime"
                display="spinner"
                minimumDate={new Date()}
                onChange={(_, d) => { if (d) setDate(d); }}
                themeVariant="dark"
                textColor="#fff"
              />
            </View>
          ) : (
            // Android: two separate tap-to-open dialogs. This avoids the laggy
            // "datetime" combo mode and matches Material Design expectations.
            <View style={s.androidRow}>
              <Pressable
                testID="dt-android-date"
                onPress={() => setAndroidPicker("date")}
                style={s.androidBtn}
              >
                <CalendarIcon size={16} color={colors.gold} />
                <View style={{ flex: 1 }}>
                  <Text style={s.androidBtnLabel}>DATE</Text>
                  <Text style={s.androidBtnValue}>
                    {date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                  </Text>
                </View>
              </Pressable>
              <Pressable
                testID="dt-android-time"
                onPress={() => setAndroidPicker("time")}
                style={s.androidBtn}
              >
                <ClockIcon size={16} color={colors.gold} />
                <View style={{ flex: 1 }}>
                  <Text style={s.androidBtnLabel}>TIME</Text>
                  <Text style={s.androidBtnValue}>
                    {date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                  </Text>
                </View>
              </Pressable>
              {androidPicker === "date" && (
                <DateTimePicker
                  testID="dt-android-date-picker"
                  value={date}
                  mode="date"
                  display="default"
                  minimumDate={new Date()}
                  onChange={(event, d) => {
                    setAndroidPicker(null);
                    // event.type === "dismissed" → user canceled, don't apply
                    if (event?.type === "set" && d) setDateOnly(d);
                  }}
                />
              )}
              {androidPicker === "time" && (
                <DateTimePicker
                  testID="dt-android-time-picker"
                  value={date}
                  mode="time"
                  display="default"
                  is24Hour={false}
                  onChange={(event, d) => {
                    setAndroidPicker(null);
                    if (event?.type === "set" && d) setTimeOnly(d);
                  }}
                />
              )}
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
      </View>
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
  androidRow: { gap: 10 },
  androidBtn: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: colors.surfaceElevated, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 16, paddingVertical: 14 },
  androidBtnLabel: { color: "rgba(255,255,255,0.45)", fontSize: 9, letterSpacing: 1.5, fontWeight: "600" },
  androidBtnValue: { color: "#fff", fontSize: 14, fontWeight: "500", marginTop: 2 },
  summary: { marginTop: 18, padding: 14, borderRadius: radius.lg, borderWidth: 1, borderColor: "rgba(212,175,55,0.3)", backgroundColor: "rgba(212,175,55,0.04)" },
  summaryLabel: { color: "rgba(255,255,255,0.45)", fontSize: 9, letterSpacing: 1.5, fontWeight: "600" },
  summaryValue: { color: colors.gold, fontSize: 16, fontWeight: "600", marginTop: 4, fontStyle: "italic" },
});
