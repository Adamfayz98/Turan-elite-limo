import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { colors } from "@/theme";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useAuth } from "@/store/auth";

export default function RootLayout() {
  const hydrate = useAuth(s => s.hydrate);
  useEffect(() => { hydrate(); }, [hydrate]);
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: "slide_from_right",
        }}
      />
    </GestureHandlerRootView>
  );
}
