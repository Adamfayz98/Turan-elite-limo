import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as Updates from "expo-updates";
import { colors } from "@/theme";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useAuth } from "@/store/auth";
import { registerForPushAsync } from "@/push";

export default function RootLayout() {
  const hydrate = useAuth(s => s.hydrate);
  const user = useAuth(s => s.user);
  useEffect(() => { hydrate(); }, [hydrate]);

  // Force-check for OTA updates on every cold start and apply immediately when
  // available. Without this, expo-updates fetches a new bundle in the background
  // but only applies it on the SECOND app launch — which means urgent hotfixes
  // (e.g. payment flow bugs) take two restarts to apply. With this in place,
  // the new bundle activates on the very next launch the user opens after we push.
  useEffect(() => {
    if (__DEV__) return;
    (async () => {
      try {
        const result = await Updates.checkForUpdateAsync();
        if (result.isAvailable) {
          await Updates.fetchUpdateAsync();
          await Updates.reloadAsync();
        }
      } catch { /* offline / dev — ignore */ }
    })();
  }, []);

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
