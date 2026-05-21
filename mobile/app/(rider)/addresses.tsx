/**
 * Saved Addresses — list, add (with autocomplete), delete.
 * Default-pickup and default-dropoff flags can pre-fill the booking form later.
 */
import { useEffect, useState, useCallback } from "react";
import { View, Text, TextInput, StyleSheet, Pressable, Alert, FlatList, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { MapPin, Trash2, Home, Briefcase, Star } from "lucide-react-native";
import SubScreen from "@/components/SubScreen";
import { listSavedAddresses, createSavedAddress, deleteSavedAddress, placesAutocomplete, SavedAddress } from "@/api";
import { colors, radius } from "@/theme";

export default function AddressesScreen() {
  const [items, setItems] = useState<SavedAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [predictions, setPredictions] = useState<Array<{ place_id: string; description: string; main_text: string; secondary_text: string }>>([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await listSavedAddresses());
    } catch (e: any) {
      Alert.alert("Could not load", e?.response?.data?.detail || "Try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Autocomplete with simple debounce
  useEffect(() => {
    if (!query || picked === query) { setPredictions([]); return; }
    const t = setTimeout(async () => {
      try {
        setPredictions(await placesAutocomplete(query));
      } catch { setPredictions([]); }
    }, 350);
    return () => clearTimeout(t);
  }, [query, picked]);

  const save = async () => {
    if (!label.trim()) return Alert.alert("Label required (e.g. Home, Work)");
    if (!query.trim()) return Alert.alert("Please pick an address");
    setAdding(true);
    try {
      await createSavedAddress({ label: label.trim(), address: query.trim() });
      setLabel(""); setQuery(""); setPicked(null); setPredictions([]);
      await refresh();
    } catch (e: any) {
      Alert.alert("Could not save", e?.response?.data?.detail || "Try again.");
    } finally {
      setAdding(false);
    }
  };

  const remove = (id: string) => Alert.alert("Remove address?", "This can't be undone.", [
    { text: "Cancel", style: "cancel" },
    { text: "Remove", style: "destructive", onPress: async () => {
      await deleteSavedAddress(id);
      refresh();
    }},
  ]);

  const iconForLabel = (l: string) => {
    const lower = l.toLowerCase();
    if (lower.includes("home")) return <Home size={16} color={colors.gold} />;
    if (lower.includes("work") || lower.includes("office")) return <Briefcase size={16} color={colors.gold} />;
    return <Star size={16} color={colors.gold} />;
  };

  return (
    <SubScreen title="Saved Addresses" subtitle="Quick-pick places for faster booking">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        {/* Add form */}
        <View style={s.addBox}>
          <TextInput
            testID="address-label-input"
            placeholder="Label (Home, Work, Mom's, …)"
            placeholderTextColor="rgba(255,255,255,0.3)"
            style={s.input}
            value={label}
            onChangeText={setLabel}
            autoCapitalize="words"
          />
          <TextInput
            testID="address-query-input"
            placeholder="Search address…"
            placeholderTextColor="rgba(255,255,255,0.3)"
            style={[s.input, { marginTop: 8 }]}
            value={query}
            onChangeText={(t) => { setQuery(t); setPicked(null); }}
            autoCapitalize="none"
          />
          {predictions.length > 0 && (
            <View style={s.predictionsBox}>
              {predictions.slice(0, 4).map((p) => (
                <Pressable
                  key={p.place_id}
                  onPress={() => { setQuery(p.description); setPicked(p.description); setPredictions([]); }}
                  style={({ pressed }) => [s.predictionRow, pressed && { backgroundColor: "rgba(255,255,255,0.04)" }]}
                >
                  <MapPin size={14} color={colors.gold} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={{ color: "#fff", fontSize: 13 }} numberOfLines={1}>{p.main_text}</Text>
                    <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, marginTop: 1 }} numberOfLines={1}>{p.secondary_text}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          )}
          <Pressable
            testID="address-add-btn"
            disabled={adding}
            onPress={save}
            style={({ pressed }) => [s.addBtn, pressed && { opacity: 0.85 }, adding && { opacity: 0.6 }]}
          >
            <Text style={s.addTxt}>Save address</Text>
          </Pressable>
        </View>

        {/* List */}
        {loading ? (
          <View style={{ paddingVertical: 40, alignItems: "center" }}>
            <ActivityIndicator color={colors.gold} />
          </View>
        ) : items.length === 0 ? (
          <View style={s.empty}>
            <MapPin size={32} color="rgba(255,255,255,0.2)" />
            <Text style={s.emptyTxt}>No saved addresses yet</Text>
            <Text style={s.emptySub}>Add your home and work to book faster</Text>
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(i) => i.id}
            contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
            renderItem={({ item }) => (
              <View style={s.row} testID={`address-row-${item.id}`}>
                <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                  <View style={s.iconBox}>{iconForLabel(item.label)}</View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={s.rowLabel}>{item.label}</Text>
                    <Text style={s.rowAddr} numberOfLines={2}>{item.address}</Text>
                  </View>
                </View>
                <Pressable
                  testID={`address-delete-${item.id}`}
                  onPress={() => remove(item.id)}
                  hitSlop={10}
                  style={{ padding: 6 }}
                >
                  <Trash2 size={16} color="rgba(255,255,255,0.4)" />
                </Pressable>
              </View>
            )}
          />
        )}
      </KeyboardAvoidingView>
    </SubScreen>
  );
}

const s = StyleSheet.create({
  addBox: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, color: "#fff", backgroundColor: "rgba(255,255,255,0.03)", fontSize: 14 },
  predictionsBox: { marginTop: 4, borderRadius: radius.md, backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  predictionRow: { flexDirection: "row", alignItems: "center", padding: 10 },
  addBtn: { marginTop: 12, backgroundColor: colors.gold, paddingVertical: 12, borderRadius: 999, alignItems: "center" },
  addTxt: { color: "#000", fontSize: 13, fontWeight: "600" },
  empty: { alignItems: "center", paddingVertical: 60 },
  emptyTxt: { color: "rgba(255,255,255,0.7)", fontSize: 14, marginTop: 12 },
  emptySub: { color: "rgba(255,255,255,0.4)", fontSize: 12, marginTop: 4 },
  row: { flexDirection: "row", alignItems: "center", padding: 14, marginBottom: 8, borderRadius: radius.md, backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: colors.border },
  iconBox: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(212,175,55,0.1)", borderWidth: 1, borderColor: "rgba(212,175,55,0.25)", alignItems: "center", justifyContent: "center" },
  rowLabel: { color: "#fff", fontSize: 14, fontWeight: "500" },
  rowAddr: { color: "rgba(255,255,255,0.5)", fontSize: 12, marginTop: 2 },
});
