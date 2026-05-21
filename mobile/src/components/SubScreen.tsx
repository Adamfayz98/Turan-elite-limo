/**
 * Shared header + body wrapper for all rider sub-screens (Personal Info,
 * Saved Addresses, Promo Codes, etc). Keeps a consistent navigation feel.
 */
import { ReactNode } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChevronLeft } from "lucide-react-native";
import { useRouter } from "expo-router";
import { colors } from "@/theme";

interface Props {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export default function SubScreen({ title, subtitle, children }: Props) {
  const router = useRouter();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView edges={["top"]} style={{ backgroundColor: colors.bg }}>
        <View style={s.header}>
          <Pressable
            testID="subscreen-back"
            onPress={() => router.back()}
            hitSlop={12}
            style={s.back}
          >
            <ChevronLeft size={22} color="#fff" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>{title}</Text>
            {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
          </View>
        </View>
      </SafeAreaView>
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, gap: 6 },
  back: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  title: { color: "#fff", fontSize: 17, fontWeight: "500" },
  subtitle: { color: "rgba(255,255,255,0.5)", fontSize: 11, marginTop: 2 },
});
