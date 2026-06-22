/**
 * QuoteRequestSheet — full-screen modal that captures a pre-qualified quote
 * request for call-only vehicles (Party Bus, Stretch, Sprinter). Mirrors the
 * web QuoteRequestDialog so leads coming through the mobile app are just as
 * scoped as web leads (trip_type + service_duration + structured itinerary).
 *
 * The Send button stays disabled until every required field is filled — this
 * is what kills the vague "how much for limo?" one-liners that used to clog
 * the inbox and burn affiliate goodwill.
 */
import { useMemo, useState } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Platform,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { X, Send, Phone, ChevronDown, Plus } from "lucide-react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import Button from "@/components/Button";
import { colors, radius } from "@/theme";
import { submitQuoteRequest } from "@/api";

interface Props {
  visible: boolean;
  vehicleType: string;
  onClose: () => void;
  supportPhone?: string;
}

// Pre-qual dropdown values — match the web set so admin dashboards / reports
// can correlate web and mobile leads cleanly.
const TRIP_TYPES = [
  "Wedding",
  "Prom / Homecoming",
  "Airport Transfer",
  "Night Out / Bar Crawl",
  "Corporate / Business",
  "Birthday Party",
  "Wine Tour",
  "Concert / Sports Event",
  "Funeral / Memorial",
  "Other",
];
const SERVICE_DURATIONS = [
  "One-way transfer",
  "1–2 hours",
  "3–4 hours",
  "5–6 hours",
  "7–8 hours",
  "Full day (8+ hrs)",
  "Not sure yet",
];

// Native picker. Reuses the same modal-list pattern from the web Select.
// Tap the trigger → bottom sheet with options → tap to choose.
function PickerSheet({
  label,
  value,
  options,
  onChange,
  testID,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  testID?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ width: "100%" }}>
      <Pressable
        testID={testID}
        onPress={() => setOpen(true)}
        style={[s.input, s.pickerTrigger]}
      >
        <Text style={[s.pickerValue, !value && { color: "rgba(255,255,255,0.30)" }]}>
          {value || label}
        </Text>
        <ChevronDown size={16} color="rgba(255,255,255,0.45)" />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={s.pickerBackdrop} onPress={() => setOpen(false)}>
          <View style={s.pickerSheet}>
            <Text style={s.pickerHeader}>{label}</Text>
            <ScrollView>
              {options.map((opt) => (
                <Pressable
                  key={opt}
                  testID={`${testID}-opt-${opt.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                  onPress={() => {
                    onChange(opt);
                    setOpen(false);
                  }}
                  style={[s.pickerRow, value === opt && s.pickerRowActive]}
                >
                  <Text style={[s.pickerRowTxt, value === opt && { color: colors.gold }]}>
                    {opt}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

export default function QuoteRequestSheet({ visible, vehicleType, onClose, supportPhone = "(650) 410-0687" }: Props) {
  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    email: "",
    trip_type: "",
    service_duration: "",
    pickup_date: "",   // YYYY-MM-DD
    pickup_time: "",   // HH:mm
    pickup_location: "",
    dropoff_location: "",
    passengers: "",
    notes: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  // Optional intermediate stops between pickup and dropoff. Same UX as web —
  // tap "+ Add a stop" to grow the list, tap the ✕ on any row to remove it.
  // Max 5 stops to keep the modal scrollable on small screens.
  const [stops, setStops] = useState<string[]>([]);
  const addStop = () => setStops((s) => (s.length >= 5 ? s : [...s, ""]));
  const removeStop = (i: number) => setStops((s) => s.filter((_, idx) => idx !== i));
  const updateStopAt = (i: number, v: string) =>
    setStops((s) => s.map((x, idx) => (idx === i ? v : x)));
  // Date/time picker visibility (Android = sequential; iOS = inline). We keep
  // it simple: a single date picker + a single time picker, both Android-style
  // dialogs, since we don't want to bundle another full-screen DateTimeModal
  // for this transient quote flow.
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);

  const update = (k: keyof typeof form) => (v: string) =>
    setForm((s) => ({ ...s, [k]: v }));

  const isValid = useMemo(() => {
    const phoneDigits = (form.phone || "").replace(/\D/g, "");
    return (
      form.full_name.trim().length >= 2 &&
      phoneDigits.length >= 7 &&
      !!form.trip_type &&
      !!form.service_duration &&
      !!form.pickup_date &&
      !!form.pickup_time &&
      form.pickup_location.trim().length >= 2 &&
      form.dropoff_location.trim().length >= 2 &&
      !!form.passengers &&
      Number(form.passengers) > 0
    );
  }, [form]);

  const reset = () => {
    setDone(false);
    setForm({
      full_name: "", phone: "", email: "", trip_type: "", service_duration: "",
      pickup_date: "", pickup_time: "", pickup_location: "", dropoff_location: "",
      passengers: "", notes: "",
    });
    setStops([]);
  };

  const closeAll = () => {
    reset();
    onClose();
  };

  const send = async () => {
    if (!isValid || submitting) return;
    setSubmitting(true);
    try {
      await submitQuoteRequest({
        full_name: form.full_name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        vehicle_type: vehicleType,
        trip_type: form.trip_type,
        service_duration: form.service_duration,
        pickup_date: form.pickup_date,
        pickup_time: form.pickup_time,
        pickup_location: form.pickup_location.trim(),
        dropoff_location: form.dropoff_location.trim(),
        passengers: Number(form.passengers),
        notes: form.notes.trim() || undefined,
        // Filter empty stops before sending.
        stops: stops.map((s) => s.trim()).filter(Boolean),
      });
      setDone(true);
    } catch (e: any) {
      const msg = e?.response?.data?.detail || "Couldn't submit, try again";
      Alert.alert("Hmm", typeof msg === "string" ? msg : "Couldn't submit, try again");
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (d: Date) => {
    // YYYY-MM-DD
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const formatTime = (d: Date) => {
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={closeAll} presentationStyle="pageSheet">
      <SafeAreaView style={s.safe} edges={["top", "bottom"]}>
        <View style={s.header}>
          <Text style={s.title}>{done ? "Got it — we'll text you" : `Request quote · ${vehicleType}`}</Text>
          <Pressable testID="qr-close" onPress={closeAll} hitSlop={10} style={s.closeBtn}>
            <X size={20} color="#fff" />
          </Pressable>
        </View>

        {done ? (
          <View style={s.doneWrap}>
            <Text style={s.doneTitle}>Thanks, {form.full_name.split(" ")[0]}</Text>
            <Text style={s.doneSub}>
              We'll text or call you with a custom quote — usually within 15 minutes during business hours.
            </Text>
            <Pressable
              testID="qr-done-btn"
              onPress={closeAll}
              style={[s.btn, s.btnGold, { marginTop: 24 }]}
            >
              <Text style={s.btnGoldTxt}>Done</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
            <Text style={s.intro}>A few quick details so we can send you an accurate quote on the first reply — no back-and-forth.</Text>

            <View style={s.row2}>
              <View style={s.col}>
                <Text style={s.label}>Name *</Text>
                <TextInput
                  testID="qr-name"
                  value={form.full_name}
                  onChangeText={update("full_name")}
                  placeholder="Jane Doe"
                  placeholderTextColor="rgba(255,255,255,0.30)"
                  style={s.input}
                />
              </View>
              <View style={s.col}>
                <Text style={s.label}>Phone *</Text>
                <TextInput
                  testID="qr-phone"
                  value={form.phone}
                  onChangeText={update("phone")}
                  placeholder="(650) 555-0123"
                  placeholderTextColor="rgba(255,255,255,0.30)"
                  keyboardType="phone-pad"
                  style={s.input}
                />
              </View>
            </View>

            <Text style={s.label}>Email (optional)</Text>
            <TextInput
              testID="qr-email"
              value={form.email}
              onChangeText={update("email")}
              placeholder="you@email.com"
              placeholderTextColor="rgba(255,255,255,0.30)"
              keyboardType="email-address"
              autoCapitalize="none"
              style={s.input}
            />

            <View style={s.row2}>
              <View style={s.col}>
                <Text style={s.label}>Trip type *</Text>
                <PickerSheet
                  testID="qr-trip-type"
                  label="Select trip type"
                  value={form.trip_type}
                  options={TRIP_TYPES}
                  onChange={update("trip_type")}
                />
              </View>
              <View style={s.col}>
                <Text style={s.label}>Service duration *</Text>
                <PickerSheet
                  testID="qr-duration"
                  label="How long?"
                  value={form.service_duration}
                  options={SERVICE_DURATIONS}
                  onChange={update("service_duration")}
                />
              </View>
            </View>

            <View style={s.row2}>
              <View style={s.col}>
                <Text style={s.label}>Date *</Text>
                <Pressable testID="qr-date" onPress={() => setShowDate(true)} style={s.input}>
                  <Text style={[s.pickerValue, !form.pickup_date && { color: "rgba(255,255,255,0.30)" }]}>
                    {form.pickup_date || "Select date"}
                  </Text>
                </Pressable>
              </View>
              <View style={s.col}>
                <Text style={s.label}>Time *</Text>
                <Pressable testID="qr-time" onPress={() => setShowTime(true)} style={s.input}>
                  <Text style={[s.pickerValue, !form.pickup_time && { color: "rgba(255,255,255,0.30)" }]}>
                    {form.pickup_time || "Select time"}
                  </Text>
                </Pressable>
              </View>
            </View>

            <Text style={s.label}>Passengers *</Text>
            <TextInput
              testID="qr-pax"
              value={form.passengers}
              onChangeText={(v) => update("passengers")(v.replace(/[^\d]/g, ""))}
              placeholder="14"
              placeholderTextColor="rgba(255,255,255,0.30)"
              keyboardType="number-pad"
              style={s.input}
            />

            <Text style={s.label}>Pickup location *</Text>
            <TextInput
              testID="qr-pickup"
              value={form.pickup_location}
              onChangeText={update("pickup_location")}
              placeholder="123 Main St, San Jose CA"
              placeholderTextColor="rgba(255,255,255,0.30)"
              style={s.input}
            />

            {/* Optional stops between pickup and dropoff. Tap "+ Add a stop" to
                grow the list, tap ✕ to remove. Mirrors web. */}
            {stops.map((stop, i) => (
              <View key={i} style={{ marginTop: 0 }}>
                <Text style={s.label}>Stop {i + 1}</Text>
                <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                  <TextInput
                    testID={`qr-stop-${i}`}
                    value={stop}
                    onChangeText={(v) => updateStopAt(i, v)}
                    placeholder={`Stop ${i + 1} address`}
                    placeholderTextColor="rgba(255,255,255,0.30)"
                    style={[s.input, { flex: 1 }]}
                  />
                  <Pressable
                    testID={`qr-stop-remove-${i}`}
                    onPress={() => removeStop(i)}
                    style={s.stopRemoveBtn}
                  >
                    <X size={16} color="rgba(255,255,255,0.55)" />
                  </Pressable>
                </View>
              </View>
            ))}
            {stops.length < 5 && (
              <Pressable
                testID="qr-add-stop"
                onPress={addStop}
                style={s.addStopBtn}
              >
                <Plus size={12} color={colors.gold} />
                <Text style={s.addStopBtnTxt}>Add a stop</Text>
              </Pressable>
            )}

            <Text style={s.label}>Drop-off / destination *</Text>
            <TextInput
              testID="qr-dropoff"
              value={form.dropoff_location}
              onChangeText={update("dropoff_location")}
              placeholder="SFO Terminal 1, or destination"
              placeholderTextColor="rgba(255,255,255,0.30)"
              style={s.input}
            />

            <Text style={s.label}>Notes (optional)</Text>
            <TextInput
              testID="qr-notes"
              value={form.notes}
              onChangeText={update("notes")}
              placeholder="Multi-stop itinerary, decorations, special requests..."
              placeholderTextColor="rgba(255,255,255,0.30)"
              multiline
              numberOfLines={3}
              style={[s.input, { height: 80, paddingTop: 12, textAlignVertical: "top" }]}
            />

            <Pressable
              testID="qr-submit"
              onPress={send}
              disabled={!isValid || submitting}
              style={[s.btn, isValid ? s.btnGold : s.btnDisabled, { marginTop: 20 }]}
            >
              {submitting ? (
                <ActivityIndicator color="#000" />
              ) : (
                <>
                  <Send size={14} color={isValid ? "#000" : "rgba(255,255,255,0.30)"} />
                  <Text style={isValid ? s.btnGoldTxt : s.btnDisabledTxt}>
                    {isValid ? "Send request" : "Fill required fields to send"}
                  </Text>
                </>
              )}
            </Pressable>

            <Pressable
              testID="qr-call-instead"
              onPress={() => {
                const tel = (supportPhone || "").replace(/[^\d+]/g, "");
                if (tel) {
                  // eslint-disable-next-line @typescript-eslint/no-var-requires
                  require("react-native").Linking.openURL(`tel:${tel}`);
                }
              }}
              style={[s.btn, s.btnOutline, { marginTop: 10 }]}
            >
              <Phone size={13} color="#fff" />
              <Text style={s.btnOutlineTxt}>Or call us: {supportPhone}</Text>
            </Pressable>

            <Text style={s.foot}>
              We reply within ~15 min during business hours. No payment now.
            </Text>
          </ScrollView>
        )}
      </SafeAreaView>

      {/* Native date/time dialogs. iOS shows them inline; Android shows them
          as modal dialogs. Using community datetimepicker keeps the native
          look on each platform. */}
      {showDate && (
        <DateTimePicker
          testID="qr-date-picker"
          value={form.pickup_date ? new Date(form.pickup_date) : new Date()}
          mode="date"
          minimumDate={new Date()}
          onChange={(_, d) => {
            setShowDate(Platform.OS === "ios" ? false : false);
            if (d) update("pickup_date")(formatDate(d));
          }}
        />
      )}
      {showTime && (
        <DateTimePicker
          testID="qr-time-picker"
          value={new Date()}
          mode="time"
          onChange={(_, d) => {
            setShowTime(false);
            if (d) update("pickup_time")(formatTime(d));
          }}
        />
      )}
    </Modal>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: { color: "#fff", fontSize: 17, fontWeight: "600", flex: 1, paddingRight: 12 },
  closeBtn: { padding: 4 },
  intro: { color: "rgba(255,255,255,0.55)", fontSize: 13, lineHeight: 18, marginBottom: 18 },
  scroll: { padding: 20, paddingBottom: 60 },
  row2: { flexDirection: "row", gap: 10 },
  col: { flex: 1 },
  label: {
    fontSize: 10,
    letterSpacing: 1.8,
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.55)",
    marginBottom: 6,
    marginTop: 14,
    fontWeight: "500",
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    height: 44,
    color: "#fff",
    fontSize: 14,
    justifyContent: "center",
  },
  pickerTrigger: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  pickerValue: { color: "#fff", fontSize: 14, flex: 1 },
  pickerBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  pickerSheet: {
    backgroundColor: colors.surfaceElevated,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "70%",
    paddingHorizontal: 6,
    paddingBottom: 30,
    paddingTop: 8,
  },
  pickerHeader: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 11,
    letterSpacing: 2,
    textTransform: "uppercase",
    paddingHorizontal: 18,
    paddingVertical: 12,
    fontWeight: "600",
  },
  pickerRow: { paddingHorizontal: 18, paddingVertical: 14, borderRadius: radius.sm },
  pickerRowActive: { backgroundColor: "rgba(212,175,55,0.10)" },
  pickerRowTxt: { color: "#fff", fontSize: 15 },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 48,
    borderRadius: radius.pill,
    gap: 8,
  },
  btnGold: { backgroundColor: colors.gold },
  btnGoldTxt: { color: "#000", fontSize: 14, fontWeight: "600" },
  btnDisabled: { backgroundColor: "rgba(255,255,255,0.06)" },
  btnDisabledTxt: { color: "rgba(255,255,255,0.30)", fontSize: 14, fontWeight: "500" },
  btnOutline: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: "transparent",
  },
  btnOutlineTxt: { color: "#fff", fontSize: 13, fontWeight: "500" },
  // Stop add/remove styles
  stopRemoveBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  addStopBtn: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    paddingVertical: 6,
    paddingHorizontal: 2,
  },
  addStopBtnTxt: {
    color: colors.gold,
    fontSize: 11,
    letterSpacing: 1.8,
    textTransform: "uppercase",
    fontWeight: "600",
  },
  foot: {
    textAlign: "center",
    color: "rgba(255,255,255,0.40)",
    fontSize: 11,
    marginTop: 14,
  },
  doneWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 28 },
  doneTitle: { color: colors.gold, fontSize: 32, fontFamily: "PlayfairDisplay", textAlign: "center" },
  doneSub: { color: "rgba(255,255,255,0.65)", textAlign: "center", marginTop: 12, lineHeight: 20, fontSize: 14 },
});
