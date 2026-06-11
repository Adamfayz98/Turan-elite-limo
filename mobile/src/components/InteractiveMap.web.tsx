/**
 * Web fallback for InteractiveMap — react-native-maps is native-only and
 * breaks `expo export --platform web` (used for the /m demo on the website).
 *
 * Renders a Google Static Maps image (dark themed) when pickup/dropoff coords
 * exist, otherwise a branded dark panel. Metro picks this file automatically
 * for web builds via the platform extension (.web.tsx).
 */
import { useMemo } from "react";
import { StyleSheet, View, Image, Text } from "react-native";

const GMAPS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_BROWSER_KEY || "";

export type LatLng = { lat: number; lng: number; heading?: number };
export type DriverMarker = LatLng & { id?: string; name?: string; vehicle?: string };

type Props = {
  driver?: DriverMarker | null;
  drivers?: DriverMarker[];
  pickup?: LatLng | null;
  dropoff?: LatLng | null;
  showRoute?: boolean;
  height?: number | string;
  focusDriverId?: string | null;
  fitPadding?: { top: number; right: number; bottom: number; left: number };
  style?: any;
};

const DARK_STYLE_PARAMS = [
  "style=element:geometry%7Ccolor:0x0a0a0a",
  "style=element:labels.text.fill%7Ccolor:0xb3a472",
  "style=element:labels.text.stroke%7Ccolor:0x050505",
  "style=feature:poi%7Cvisibility:off",
  "style=feature:road%7Celement:geometry%7Ccolor:0x222222",
  "style=feature:water%7Celement:geometry%7Ccolor:0x050a14",
].join("&");

export default function InteractiveMap({ pickup, dropoff, driver, drivers, height = "100%" as any, style }: Props) {
  const url = useMemo(() => {
    if (!GMAPS_KEY) return null;
    const markers: string[] = [];
    if (pickup && Number.isFinite(pickup.lat)) markers.push(`markers=color:0xD4AF37%7C${pickup.lat},${pickup.lng}`);
    if (dropoff && Number.isFinite(dropoff.lat)) markers.push(`markers=color:0x1a1a1a%7C${dropoff.lat},${dropoff.lng}`);
    const d = drivers && drivers.length ? drivers[0] : driver;
    if (d && Number.isFinite(d.lat)) markers.push(`markers=size:small%7Ccolor:0xD4AF37%7C${d.lat},${d.lng}`);
    const center = markers.length ? "" : "center=37.7749,-122.4194&zoom=10&";
    return `https://maps.googleapis.com/maps/api/staticmap?${center}size=640x640&scale=2&${DARK_STYLE_PARAMS}&${markers.join("&")}&key=${GMAPS_KEY}`;
  }, [pickup?.lat, pickup?.lng, dropoff?.lat, dropoff?.lng, driver?.lat, driver?.lng, drivers]);

  return (
    <View style={[s.container, { height } as any, style]}>
      {url ? (
        <Image source={{ uri: url }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
      ) : (
        <View style={s.fallback}>
          <Text style={s.fallbackTxt}>Live map available in the mobile app</Text>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { width: "100%", overflow: "hidden", backgroundColor: "#050505" },
  fallback: { flex: 1, alignItems: "center", justifyContent: "center" },
  fallbackTxt: { color: "rgba(255,255,255,0.35)", fontSize: 12 },
});
