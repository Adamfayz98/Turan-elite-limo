/**
 * Full-screen modal that lets the rider search & pick a pickup or drop-off address
 * using Google Places Autocomplete (proxied through our backend).
 *
 * Pattern matches Uber/Lyft: tap a field in the main form → this modal slides up
 * with a search bar + suggestion list. Tap a suggestion → modal closes with the value.
 */
import { useEffect, useRef, useState } from "react";
import { Modal, View, Text, StyleSheet, Pressable, TextInput, FlatList, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChevronLeft, MapPin, Search, X } from "lucide-react-native";
import { colors, radius } from "@/theme";
import { placesAutocomplete } from "@/api";

interface Prediction {
  place_id: string;
  description: string;
  main_text: string;
  secondary_text: string;
}

interface Props {
  visible: boolean;
  initialValue?: string;
  label: string;       // "Pickup" or "Drop-off"
  onClose: () => void;
  onSelect: (value: string) => void;
}

export default function AddressPicker({ visible, initialValue = "", label, onClose, onSelect }: Props) {
  const [query, setQuery] = useState(initialValue);
  const [results, setResults] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(false);
  const sessionRef = useRef<string>(Math.random().toString(36).slice(2));
  const inputRef = useRef<TextInput>(null);

  // Reset when opened
  useEffect(() => {
    if (visible) {
      setQuery(initialValue);
      setResults([]);
      sessionRef.current = Math.random().toString(36).slice(2);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [visible, initialValue]);

  // Debounced search
  useEffect(() => {
    if (!visible) return;
    const q = query.trim();
    if (q.length < 2) { setResults([]); return; }
    setLoading(true);
    const handle = setTimeout(async () => {
      try {
        const preds = await placesAutocomplete(q, sessionRef.current);
        setResults(preds);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 280);
    return () => clearTimeout(handle);
  }, [query, visible]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      /* presentationStyle defaults to "fullScreen" on Android and a card
         style on iOS. We intentionally don't force "fullScreen" because on
         iOS that mode breaks SafeAreaView's status-bar inset handling —
         which caused the back chevron to render inside the status bar /
         under the Dynamic Island. The default presentation respects safe
         area on both platforms. */
      statusBarTranslucent
    >
      <SafeAreaView style={s.safe} edges={["top", "left", "right", "bottom"]}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <View style={s.header}>
            <Pressable testID="address-picker-close" onPress={onClose} hitSlop={10} style={s.iconBtn}>
              <ChevronLeft size={20} color="#fff" />
            </Pressable>
            <Text style={s.headerTitle}>{label}</Text>
            <View style={{ width: 36 }} />
          </View>

          <View style={s.searchBox}>
            <Search size={15} color="rgba(255,255,255,0.45)" />
            <TextInput
              ref={inputRef}
              testID="address-picker-input"
              placeholder={`Search ${label.toLowerCase()} address`}
              placeholderTextColor="rgba(255,255,255,0.35)"
              value={query}
              onChangeText={setQuery}
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="search"
              style={s.searchInput}
            />
            {query.length > 0 && (
              <Pressable testID="address-picker-clear" onPress={() => setQuery("")} hitSlop={10}>
                <X size={15} color="rgba(255,255,255,0.45)" />
              </Pressable>
            )}
          </View>

          {loading && query.length >= 2 && results.length === 0 && (
            <View style={s.loadingRow}><ActivityIndicator color={colors.gold} /></View>
          )}

          <FlatList
            data={results}
            keyExtractor={(item) => item.place_id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 40 }}
            ListEmptyComponent={
              !loading && query.length >= 2 ? (
                <Text style={s.emptyTxt}>No matches. Try a different search.</Text>
              ) : query.length < 2 ? (
                <Text style={s.emptyTxt}>Start typing an address, neighborhood, or landmark…</Text>
              ) : null
            }
            renderItem={({ item }) => (
              <Pressable
                testID={`address-pick-${item.place_id}`}
                onPress={() => { onSelect(item.description); onClose(); }}
                style={({ pressed }) => [s.row, pressed && { backgroundColor: "rgba(212,175,55,0.06)" }]}
              >
                <View style={s.rowIcon}><MapPin size={15} color={colors.gold} strokeWidth={1.6} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowMain} numberOfLines={1}>{item.main_text}</Text>
                  {!!item.secondary_text && (
                    <Text style={s.rowSecondary} numberOfLines={1}>{item.secondary_text}</Text>
                  )}
                </View>
              </Pressable>
            )}
          />
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: "#fff", fontSize: 14, fontWeight: "600", letterSpacing: 0.5 },
  searchBox: { flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 16, marginTop: 12, paddingHorizontal: 14, paddingVertical: 12, borderRadius: radius.lg, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border },
  searchInput: { flex: 1, color: "#fff", fontSize: 14, paddingVertical: 0 },
  loadingRow: { paddingVertical: 24, alignItems: "center" },
  emptyTxt: { color: "rgba(255,255,255,0.5)", fontSize: 12, textAlign: "center", paddingTop: 30, paddingHorizontal: 24, lineHeight: 18 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.04)" },
  rowIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: "rgba(212,175,55,0.08)", alignItems: "center", justifyContent: "center" },
  rowMain: { color: "#fff", fontSize: 14 },
  rowSecondary: { color: "rgba(255,255,255,0.5)", fontSize: 11, marginTop: 2 },
});
