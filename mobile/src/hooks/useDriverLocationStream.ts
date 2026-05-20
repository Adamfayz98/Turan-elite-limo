/**
 * Streams the driver's GPS every ~15 seconds to the backend.
 *
 *  - Foreground updates use expo-location's watchPositionAsync.
 *  - Designed for v1: foreground-only.  Background streaming (when phone is
 *    locked) requires a custom dev build (Expo Go can't unlock that on iOS).
 *    We can add expo-task-manager + Location.startLocationUpdatesAsync in a
 *    follow-up to keep streaming when the phone is locked.
 */
import { useEffect, useRef, useState } from "react";
import * as Location from "expo-location";
import { Platform } from "react-native";
import { driverPostLocation } from "@/api";

interface UseLocationStreamOptions {
  bookingId: string | null;        // null = paused
  intervalMs?: number;             // default 15s
}

export function useDriverLocationStream({ bookingId, intervalMs = 15000 }: UseLocationStreamOptions) {
  const [permission, setPermission] = useState<"granted" | "denied" | "undetermined">("undetermined");
  const [last, setLast] = useState<{ latitude: number; longitude: number; updatedAt: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  const sendingRef = useRef(false);

  useEffect(() => {
    if (!bookingId) {
      if (timer.current != null) { clearInterval(timer.current); timer.current = null; }
      return;
    }
    let cancelled = false;

    (async () => {
      const { status, canAskAgain } = await Location.getForegroundPermissionsAsync();
      let granted = status === "granted";
      if (!granted) {
        if (Platform.OS === "web") {
          // expo-location on web uses navigator.geolocation; just request it.
          const req = await Location.requestForegroundPermissionsAsync();
          granted = req.status === "granted";
        } else if (canAskAgain) {
          const req = await Location.requestForegroundPermissionsAsync();
          granted = req.status === "granted";
        }
      }
      if (cancelled) return;
      setPermission(granted ? "granted" : "denied");
      if (!granted) {
        setError("Location permission is required to share your position with the rider.");
        return;
      }

      const sendOnce = async () => {
        if (sendingRef.current) return;
        sendingRef.current = true;
        try {
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
          const payload = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            heading: pos.coords.heading ?? null,
            speed: pos.coords.speed ?? null,
            accuracy: pos.coords.accuracy ?? null,
            active_booking_id: bookingId,
          };
          await driverPostLocation(payload);
          if (!cancelled) {
            setLast({ latitude: payload.latitude, longitude: payload.longitude, updatedAt: new Date().toISOString() });
            setError(null);
          }
        } catch (e: any) {
          if (!cancelled) setError(e?.message || "Could not get location");
        } finally {
          sendingRef.current = false;
        }
      };

      // immediate fix, then every intervalMs
      sendOnce();
      timer.current = setInterval(sendOnce, intervalMs) as unknown as number;
    })();

    return () => {
      cancelled = true;
      if (timer.current != null) { clearInterval(timer.current); timer.current = null; }
    };
  }, [bookingId, intervalMs]);

  return { permission, last, error };
}
