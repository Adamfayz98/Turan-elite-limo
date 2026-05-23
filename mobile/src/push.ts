/**
 * Expo Push Notifications — client-side registration.
 *
 * Riders see ride status alerts ("Driver assigned", "Driver 5 min away", etc.)
 * Drivers see new-ride-request alerts.
 *
 * Registration flow:
 *   1. On app launch after login, registerForPushAsync() is called.
 *   2. Asks the OS for permission (iOS shows native dialog first time only).
 *   3. Gets the Expo push token (a string like "ExponentPushToken[xxx...]").
 *   4. POSTs it to /api/customer/push-token (or /api/driver/push-token).
 *   5. Sets up Android notification channels for grouping.
 *
 * The backend stores the token on the user document. The dispatch code
 * looks up tokens by user_id and sends pushes via Expo's API.
 */
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";
import { api } from "./api";

// Show notifications even when the app is foregrounded (default behaviour
// hides them; that's confusing on a ride-share app where the user IS in the
// app waiting for "Driver arrived").
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let _registered = false;

/**
 * Register this device for push notifications and persist the token on the
 * backend. Idempotent — safe to call on every login.
 *
 * @param mode  "rider" → POST to /api/customer/push-token
 *              "driver" → POST to /api/driver/push-token
 */
export async function registerForPushAsync(mode: "rider" | "driver" = "rider"): Promise<string | null> {
  if (_registered) return null;
  if (!Device.isDevice) return null;  // Push doesn't work on iOS simulators
  try {
    // Android: set up named notification channels so the OS can group alerts.
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("ride-updates", {
        name: "Ride updates",
        description: "Driver assigned, en route, arrived, trip status",
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#D4AF37",
        sound: "default",
      });
      await Notifications.setNotificationChannelAsync("dispatch-alerts", {
        name: "Dispatch alerts",
        description: "New ride requests, assignments (drivers only)",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 500, 250, 500],
        lightColor: "#D4AF37",
        sound: "default",
      });
    }

    // Ask the user for permission (no-op if already granted/denied).
    const { status: existing } = await Notifications.getPermissionsAsync();
    let final = existing;
    if (existing !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      final = status;
    }
    if (final !== "granted") return null;

    // Get the device-specific Expo push token. projectId is auto-resolved
    // from app.json when running through Expo's runtime.
    const tokenResult = await Notifications.getExpoPushTokenAsync({
      projectId: "f7293fd3-fd4a-4b43-815c-07c410b601e9",
    });
    const token = tokenResult.data;
    if (!token) return null;

    // Persist on backend. Silent fallback — if the endpoint is not yet
    // deployed on production, we just don't register; everything else
    // continues to work.
    const endpoint = mode === "driver" ? "/api/driver/push-token" : "/api/customer/push-token";
    try {
      await api.post(endpoint, {
        token,
        platform: Platform.OS,
        device_model: Device.modelName || null,
      });
      _registered = true;
    } catch { /* non-fatal */ }

    return token;
  } catch {
    return null;
  }
}
