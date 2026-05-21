/**
 * Promo Codes — history of promos the rider has actually redeemed.
 */
import { useEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator } from "react-native";
import { Tag } from "lucide-react-native";
import SubScreen from "@/components/SubScreen";
import { listPromoHistory } from "@/api";
import { colors, radius } from "@/theme";

interface Row { promo_code: string; discount_amount: number; used_at: string; confirmation_number: string; }

export default function PromosScreen() {
  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try { setItems(await listPromoHistory()); }
      finally { setLoading(false); }
    })();
  }, []);

  return (
    <SubScreen title="Promo Codes" subtitle="Promo codes you've redeemed">
      {loading ? (
        <View style={{ paddingVertical: 40, alignItems: "center" }}>
          <ActivityIndicator color={colors.gold} />
        </View>
      ) : items.length === 0 ? (
        <View style={s.empty}>
          <Tag size={32} color="rgba(255,255,255,0.2)" />
          <Text style={s.emptyTxt}>No promo codes used yet</Text>
          <Text style={s.emptySub}>When you redeem a code at checkout, it'll show up here.</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i, idx) => `${i.promo_code}-${idx}`}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          renderItem={({ item }) => (
            <View style={s.row} testID={`promo-row-${item.promo_code}`}>
              <View style={s.iconBox}><Tag size={16} color={colors.gold} /></View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={s.code}>{item.promo_code}</Text>
                <Text style={s.meta}>
                  Saved ${item.discount_amount.toFixed(2)}
                  {item.confirmation_number ? ` · #${item.confirmation_number}` : ""}
                </Text>
                <Text style={s.date}>{formatWhen(item.used_at)}</Text>
              </View>
            </View>
          )}
        />
      )}
    </SubScreen>
  );
}

function formatWhen(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch { return ""; }
}

const s = StyleSheet.create({
  empty: { alignItems: "center", paddingVertical: 60, paddingHorizontal: 30 },
  emptyTxt: { color: "rgba(255,255,255,0.7)", fontSize: 14, marginTop: 12 },
  emptySub: { color: "rgba(255,255,255,0.4)", fontSize: 12, marginTop: 4, textAlign: "center", lineHeight: 18 },
  row: { flexDirection: "row", alignItems: "center", padding: 14, marginBottom: 8, borderRadius: radius.md, backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: colors.border },
  iconBox: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(212,175,55,0.1)", borderWidth: 1, borderColor: "rgba(212,175,55,0.25)", alignItems: "center", justifyContent: "center" },
  code: { color: "#fff", fontSize: 14, fontWeight: "600", letterSpacing: 1 },
  meta: { color: colors.gold, fontSize: 12, marginTop: 2 },
  date: { color: "rgba(255,255,255,0.4)", fontSize: 11, marginTop: 2 },
});
