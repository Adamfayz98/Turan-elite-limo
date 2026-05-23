import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { colors } from "@/theme";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useAuth } from "@/store/auth";
import { registerForPushAsync } from "@/push";

export default function RootLayout() {
  const hydrate = useAuth(s => s.hydrate);
  const user = useAuth(s => s.user);
  useEffect(() => { hydrate(); }, [hydrate]);
  // Once auth has hydrated and we know there's a logged-in rider, register
  // for push notifications. Runs once per app launch — registerForPushAsync
  // is internally idempotent.
  useEffect(() => {
    if (user) registerForPushAsync("rider").catch(() => {});
  }, [user?.id]);
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
