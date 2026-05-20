import { View, Text, StyleSheet, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { History, ArrowRight, Sparkles } from "lucide-react-native";
import { colors, radius } from "@/theme";

export default function RiderTrips() {
  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={{ padding: 22, paddingBottom: 100 }}>
        <Text style={s.label}>YOUR JOURNEYS</Text>
        <Text style={s.h1}>
          Trip <Text style={s.h1Em}>history</Text>
        </Text>

        <View style={s.emptyCard}>
          <View style={s.emptyIcon}>
            <Sparkles size={20} color={colors.gold} />
          </View>
          <Text style={s.emptyTitle}>No trips yet</Text>
          <Text style={s.emptySub}>Your first chauffeured ride will appear here. Tap "Book" below to start.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  label: { color: "rgba(255,255,255,0.45)", fontSize: 10, letterSpacing: 3, fontWeight: "600" },
  h1: { color: "#fff", fontSize: 26, lineHeight: 30, marginTop: 6 },
  h1Em: { color: colors.gold, fontStyle: "italic" },
  emptyCard: { marginTop: 32, padding: 32, borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center" },
  emptyIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: "rgba(212,175,55,0.12)", alignItems: "center", justifyContent: "center", marginBottom: 14 },
  emptyTitle: { color: "#fff", fontSize: 15, fontWeight: "500" },
  emptySub: { color: "rgba(255,255,255,0.55)", fontSize: 12, textAlign: "center", marginTop: 6, lineHeight: 18 },
});
