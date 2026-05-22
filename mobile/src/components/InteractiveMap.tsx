/**
 * Native Google Maps wrapper for TuranEliteLimo (rider home, live tracking,
 * admin live drivers). Uses `react-native-maps` (which itself uses the
 * Google Maps SDK for iOS / Android on native, and the Google Maps JS API
 * on web). This is the ride-share-app-standard approach — same library
 * powers Uber's RN preview.
 *
 * Why we left the WebView/iframe approach:
 *   - iOS WKWebView does not reliably send Referer, so HTTP-referrer
 *     restricted keys couldn't be used.
 *   - The WebView showed Google's web-page chrome (Keyboard shortcuts,
 *     Terms, "Map data ©2026 Google") which looks unprofessional on a
 *     luxury app.
 *   - Pan/zoom in a WebView is laggy compared to native.
 *
 * Props (unchanged from old API — drop-in replacement):
 *   - driver:  single driver { lat, lng, heading? }
 *   - drivers: many drivers (admin live view)
 *   - pickup:  rider's pickup pin
 *   - dropoff: rider's destination pin
 *   - showRoute: dashed line driver→pickup
 *   - height: number or "100%" — defaults to "100%" so map fills its parent
 *   - focusDriverId: when set, pan + zoom to that driver (admin row click)
 */
import { useRef, useEffect, useMemo } from "react";
import { StyleSheet, View, Platform } from "react-native";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, Region } from "react-native-maps";

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
  style?: any;
};

// Same elegant dark/gold theme we had before, just delivered to the
// native SDK via `customMapStyle` instead of injected into a WebView.
const DARK_GOLD_MAP_STYLE: any[] = [
  { elementType: "geometry", stylers: [{ color: "#0a0a0a" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#b3a472" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#050505" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#d4af37" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#222222" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#8a8a8a" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#8a6f24" }] },
  { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#d4af37" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#050a14" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#3d5a80" }] },
];

const DEFAULT_REGION: Region = {
  latitude: 37.7749,
  longitude: -122.4194,
  latitudeDelta: 0.25,
  longitudeDelta: 0.25,
};

// Compute a region that fits all supplied points with comfortable padding.
function regionForPoints(points: { lat: number; lng: number }[]): Region | null {
  if (points.length === 0) return null;
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const midLat = (minLat + maxLat) / 2;
  const midLng = (minLng + maxLng) / 2;
  // 30% padding on each side, with sane minimum spans so a single point
  // doesn't zoom in to street level.
  const latDelta = Math.max((maxLat - minLat) * 1.6, 0.015);
  const lngDelta = Math.max((maxLng - minLng) * 1.6, 0.015);
  return { latitude: midLat, longitude: midLng, latitudeDelta: latDelta, longitudeDelta: lngDelta };
}

export default function InteractiveMap({
  driver,
  drivers,
  pickup,
  dropoff,
  showRoute = false,
  height = "100%" as any,
  focusDriverId,
  style,
}: Props) {
  const mapRef = useRef<MapView>(null);

  const allDrivers: DriverMarker[] = drivers && drivers.length
    ? drivers
    : (driver ? [{ id: "me", ...driver }] : []);

  // Stable list of points we want to fit on screen.
  const points = useMemo(() => {
    const pts: { lat: number; lng: number }[] = [];
    allDrivers.forEach((d) => pts.push({ lat: d.lat, lng: d.lng }));
    if (pickup) pts.push({ lat: pickup.lat, lng: pickup.lng });
    if (dropoff) pts.push({ lat: dropoff.lat, lng: dropoff.lng });
    return pts;
  }, [JSON.stringify(allDrivers), JSON.stringify(pickup), JSON.stringify(dropoff)]);

  // Auto-fit whenever the visible points change (debounced via deps).
  useEffect(() => {
    if (focusDriverId) return; // explicit focus wins
    if (points.length === 0) return;
    const r = regionForPoints(points);
    if (r) mapRef.current?.animateToRegion(r, 600);
  }, [JSON.stringify(points), focusDriverId]);

  // Pan to the explicitly focused driver (admin row click).
  useEffect(() => {
    if (!focusDriverId) return;
    const d = allDrivers.find((x) => x.id === focusDriverId);
    if (!d) return;
    mapRef.current?.animateToRegion(
      { latitude: d.lat, longitude: d.lng, latitudeDelta: 0.02, longitudeDelta: 0.02 },
      500
    );
  }, [focusDriverId, JSON.stringify(allDrivers)]);

  return (
    <View style={[styles.container, { height } as any, style]}>
      <MapView
        ref={mapRef}
        // iOS supports Apple Maps natively too, but using Google on both
        // platforms keeps the dark/gold theme identical.
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFillObject}
        initialRegion={DEFAULT_REGION}
        customMapStyle={DARK_GOLD_MAP_STYLE}
        showsCompass={false}
        showsMyLocationButton={false}
        showsPointsOfInterest={false}
        showsTraffic={false}
        showsBuildings={false}
        showsIndoors={false}
        rotateEnabled
        pitchEnabled={false}
        toolbarEnabled={false}
        mapPadding={{ top: 0, right: 0, bottom: 0, left: 0 }}
      >
        {/* Driver markers — gold ring + black car */}
        {allDrivers.map((d) => (
          <Marker
            key={d.id || "me"}
            coordinate={{ latitude: d.lat, longitude: d.lng }}
            anchor={{ x: 0.5, y: 0.5 }}
            rotation={d.heading || 0}
            flat
            tracksViewChanges={false}
          >
            <View style={styles.driverMarker}>
              <View style={styles.driverInner} />
            </View>
          </Marker>
        ))}

        {/* Pickup pin (gold "A") */}
        {pickup && (
          <Marker
            coordinate={{ latitude: pickup.lat, longitude: pickup.lng }}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
          >
            <View style={styles.pickupPin}>
              <View style={styles.pickupDot} />
            </View>
          </Marker>
        )}

        {/* Dropoff pin (dark "B" w/ gold ring) */}
        {dropoff && (
          <Marker
            coordinate={{ latitude: dropoff.lat, longitude: dropoff.lng }}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
          >
            <View style={styles.dropoffPin}>
              <View style={styles.dropoffDot} />
            </View>
          </Marker>
        )}

        {/* Dashed gold route driver→pickup (used in live trip view) */}
        {showRoute && allDrivers.length === 1 && pickup && (
          <Polyline
            coordinates={[
              { latitude: allDrivers[0].lat, longitude: allDrivers[0].lng },
              { latitude: pickup.lat, longitude: pickup.lng },
            ]}
            strokeColor="#D4AF37"
            strokeWidth={3}
            lineDashPattern={Platform.OS === "ios" ? [6, 6] : undefined}
          />
        )}

        {/* Solid gold route pickup→dropoff (rider booking flow preview) */}
        {pickup && dropoff && (
          <Polyline
            coordinates={[
              { latitude: pickup.lat, longitude: pickup.lng },
              { latitude: dropoff.lat, longitude: dropoff.lng },
            ]}
            strokeColor="#D4AF37"
            strokeWidth={4}
          />
        )}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: "100%", overflow: "hidden", backgroundColor: "#050505" },
  driverMarker: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "rgba(212,175,55,0.18)",
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "#D4AF37",
  },
  driverInner: {
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: "#0a0a0a",
    borderWidth: 1, borderColor: "#D4AF37",
  },
  pickupPin: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: "#D4AF37",
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "#000",
    shadowColor: "#D4AF37", shadowOpacity: 0.6, shadowRadius: 8,
  },
  pickupDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#000" },
  dropoffPin: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: "#444",
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "#D4AF37",
  },
  dropoffDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#fff" },
});
