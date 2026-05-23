/**
 * Shared header + body wrapper for all rider sub-screens (Personal Info,
 * Saved Addresses, Promo Codes, etc). Keeps a consistent navigation feel.
 */
import { ReactNode } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChevronLeft, Home } from "lucide-react-native";
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
            style={s.iconBtn}
          >
            <ChevronLeft size={22} color="#fff" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>{title}</Text>
            {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
          </View>
          {/* Home shortcut — jumps straight to the booking home regardless
              of how deep the user has navigated. Mirrors the website's
              logo-as-home pattern. */}
          <Pressable
            testID="subscreen-home"
            onPress={() => router.replace("/(rider)/(tabs)/home")}
            hitSlop={12}
            style={s.iconBtn}
          >
            <Home size={19} color={colors.gold} strokeWidth={1.8} />
          </Pressable>
        </View>
      </SafeAreaView>
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, gap: 6 },
  iconBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  title: { color: "#fff", fontSize: 17, fontWeight: "500" },
  subtitle: { color: "rgba(255,255,255,0.5)", fontSize: 11, marginTop: 2 },
});
