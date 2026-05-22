/**
 * Native Google Maps wrapper for TuranEliteLimo. Uses `react-native-maps`
 * with PROVIDER_GOOGLE on both iOS and Android.
 *
 * Three iOS-specific gotchas this component handles:
 *   1. Custom <Marker> children render BLANK on iOS unless tracksViewChanges
 *      starts `true` and is switched to `false` only AFTER the marker mounts.
 *   2. fitToCoordinates is far more reliable than animateToRegion when fitting
 *      multiple points — and it accepts edgePadding so pins are not hidden
 *      behind the bottom form sheet.
 *   3. mapPadding must compensate for any UI overlay so the map's logical
 *      center is the visible center of the map (not the screen center).
 */
import { useRef, useEffect, useMemo, useState } from "react";
import { StyleSheet, View, Platform } from "react-native";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, Region } from "react-native-maps";

const GMAPS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_BROWSER_KEY || "";

// Decodes a Google "encoded polyline" string into an array of lat/lng pairs.
// Implements the algorithm from https://developers.google.com/maps/documentation/utilities/polylinealgorithm
function decodePolyline(str: string): { latitude: number; longitude: number }[] {
  const points: { latitude: number; longitude: number }[] = [];
  let index = 0, lat = 0, lng = 0;
  while (index < str.length) {
    let b: number, shift = 0, result = 0;
    do { b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    const dlat = (result & 1) ? ~(result >> 1) : (result >> 1);
    lat += dlat;
    shift = 0; result = 0;
    do { b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    const dlng = (result & 1) ? ~(result >> 1) : (result >> 1);
    lng += dlng;
    points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return points;
}

// Calls Google Directions API for an actual road-following polyline between
// pickup and dropoff. Falls back gracefully to a straight line if the API
// is unreachable.
async function fetchRoutePolyline(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
): Promise<{ latitude: number; longitude: number }[] | null> {
  if (!GMAPS_KEY) return null;
  try {
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin.lat},${origin.lng}&destination=${destination.lat},${destination.lng}&mode=driving&key=${GMAPS_KEY}`;
    const r = await fetch(url);
    const data = await r.json();
    const enc = data?.routes?.[0]?.overview_polyline?.points;
    if (!enc) return null;
    return decodePolyline(enc);
  } catch {
    return null;
  }
}

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
  /** Padding (px) added when fitting markers — so pins aren't hidden behind a
   *  bottom sheet or top bar. Defaults: { top: 120, right: 60, bottom: 320, left: 60 }
   *  which keeps pins centered above the home-screen form sheet. */
  fitPadding?: { top: number; right: number; bottom: number; left: number };
  style?: any;
};

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

const DEFAULT_PADDING = { top: 140, right: 60, bottom: 380, left: 60 };

/**
 * Marker child wrapped so we can flip tracksViewChanges → false after first
 * render — required so iOS actually rasterises the custom view inside the pin.
 */
function StableMarker({ coordinate, anchor, rotation, flat, zIndex, children }: any) {
  const [tracking, setTracking] = useState(true);
  return (
    <Marker
      coordinate={coordinate}
      anchor={anchor}
      rotation={rotation}
      flat={flat}
      zIndex={zIndex}
      tracksViewChanges={tracking}
    >
      {/* Give iOS a chance to render the custom view, then stop tracking
          (tracksViewChanges=true is needed for the initial layout pass; we
          flip it off afterwards so the marker doesn't re-render every frame). */}
      <View onLayout={() => setTimeout(() => setTracking(false), 500)}>
        {children}
      </View>
    </Marker>
  );
}

export default function InteractiveMap({
  driver,
  drivers,
  pickup,
  dropoff,
  showRoute = false,
  height = "100%" as any,
  focusDriverId,
  fitPadding = DEFAULT_PADDING,
  style,
}: Props) {
  const mapRef = useRef<MapView>(null);
  const [mapReady, setMapReady] = useState(false);
  // Road-following polyline between pickup and dropoff (from Directions API).
  const [routeCoords, setRouteCoords] = useState<{ latitude: number; longitude: number }[]>([]);

  const allDrivers: DriverMarker[] = drivers && drivers.length
    ? drivers
    : (driver ? [{ id: "me", ...driver }] : []);

  // Fetch real driving route whenever pickup + dropoff are set.
  useEffect(() => {
    if (!pickup || !dropoff) { setRouteCoords([]); return; }
    let cancelled = false;
    fetchRoutePolyline(
      { lat: pickup.lat, lng: pickup.lng },
      { lat: dropoff.lat, lng: dropoff.lng },
    ).then((pts) => {
      if (!cancelled && pts && pts.length) setRouteCoords(pts);
    });
    return () => { cancelled = true; };
  }, [pickup?.lat, pickup?.lng, dropoff?.lat, dropoff?.lng]);

  const coordinates = useMemo(() => {
    const pts: { latitude: number; longitude: number }[] = [];
    allDrivers.forEach((d) => pts.push({ latitude: d.lat, longitude: d.lng }));
    if (pickup) pts.push({ latitude: pickup.lat, longitude: pickup.lng });
    if (dropoff) pts.push({ latitude: dropoff.lat, longitude: dropoff.lng });
    // Include intermediate route waypoints so fit zooms wide enough to
    // contain the actual driving path (which may bow out from a straight line).
    routeCoords.forEach((p) => pts.push(p));
    return pts;
  }, [JSON.stringify(allDrivers), JSON.stringify(pickup), JSON.stringify(dropoff), routeCoords.length]);

  // Fit to all points whenever they change, OR once the map signals ready.
  // We try both paths so a slow/dropped onMapReady event doesn't leave the
  // pins permanently off-screen.
  useEffect(() => {
    if (focusDriverId) return;
    if (coordinates.length === 0) return;
    const fit = () => {
      if (coordinates.length === 1) {
        mapRef.current?.animateToRegion(
          { latitude: coordinates[0].latitude, longitude: coordinates[0].longitude, latitudeDelta: 0.04, longitudeDelta: 0.04 },
          700
        );
      } else {
        mapRef.current?.fitToCoordinates(coordinates, {
          edgePadding: fitPadding,
          animated: true,
        });
      }
    };
    // Try once immediately and again after a short delay so iOS has time
    // to mount the markers (whose anchors influence the fit calculation).
    const t1 = setTimeout(fit, 300);
    const t2 = setTimeout(fit, 1200);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [JSON.stringify(coordinates), focusDriverId, JSON.stringify(fitPadding), mapReady]);

  useEffect(() => {
    if (!mapReady) return;
    if (!focusDriverId) return;
    const d = allDrivers.find((x) => x.id === focusDriverId);
    if (!d) return;
    mapRef.current?.animateToRegion(
      { latitude: d.lat, longitude: d.lng, latitudeDelta: 0.02, longitudeDelta: 0.02 },
      500
    );
  }, [focusDriverId, JSON.stringify(allDrivers), mapReady]);

  return (
    <View style={[styles.container, { height } as any, style]}>
      <MapView
        ref={mapRef}
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
        onMapReady={() => setMapReady(true)}
        mapPadding={{ top: 80, right: 0, bottom: 280, left: 0 }}
      >
        {/* Driver markers — gold ring + black car */}
        {allDrivers.map((d) => (
          <StableMarker
            key={d.id || "me"}
            coordinate={{ latitude: d.lat, longitude: d.lng }}
            anchor={{ x: 0.5, y: 0.5 }}
            rotation={d.heading || 0}
            flat
            zIndex={50}
          >
            <View style={styles.driverMarker}>
              <View style={styles.driverInner} />
            </View>
          </StableMarker>
        ))}

        {/* Pickup pin — gold circle "A" */}
        {pickup && (
          <StableMarker
            coordinate={{ latitude: pickup.lat, longitude: pickup.lng }}
            anchor={{ x: 0.5, y: 1 }}
            zIndex={100}
          >
            <View style={styles.pinStack}>
              <View style={styles.pickupPin}>
                <View style={styles.pickupGlyph} />
              </View>
              <View style={styles.pinTail} />
            </View>
          </StableMarker>
        )}

        {/* Dropoff pin — dark circle "B" w/ gold ring */}
        {dropoff && (
          <StableMarker
            coordinate={{ latitude: dropoff.lat, longitude: dropoff.lng }}
            anchor={{ x: 0.5, y: 1 }}
            zIndex={100}
          >
            <View style={styles.pinStack}>
              <View style={styles.dropoffPin}>
                <View style={styles.dropoffGlyph} />
              </View>
              <View style={[styles.pinTail, { backgroundColor: "#D4AF37" }]} />
            </View>
          </StableMarker>
        )}

        {/* Dashed route driver→pickup (active trip) */}
        {showRoute && allDrivers.length === 1 && pickup && (
          <Polyline
            key={`drv-route-${allDrivers[0].lat}-${allDrivers[0].lng}-${pickup.lat}-${pickup.lng}`}
            coordinates={[
              { latitude: allDrivers[0].lat, longitude: allDrivers[0].lng },
              { latitude: pickup.lat, longitude: pickup.lng },
            ]}
            strokeColor="#D4AF37"
            strokeWidth={4}
            lineDashPattern={Platform.OS === "ios" ? [8, 8] : undefined}
            geodesic={false}
            zIndex={20}
          />
        )}

        {/* Solid gold route pickup→dropoff. Uses the real road-following
            polyline from Directions API when available, otherwise falls back
            to a straight line so the user still sees a connection.
            iOS quirk: react-native-maps sometimes ignores `strokeColor` and
            falls back to system default blue. The stable `key` prop derived
            from the coordinates forces iOS to fully re-mount the polyline
            (rather than reuse a stale view), which makes strokeColor stick. */}
        {pickup && dropoff && (
          <Polyline
            key={`route-${pickup.lat.toFixed(4)}-${pickup.lng.toFixed(4)}-${dropoff.lat.toFixed(4)}-${dropoff.lng.toFixed(4)}-${routeCoords.length}`}
            coordinates={routeCoords.length > 0 ? routeCoords : [
              { latitude: pickup.lat, longitude: pickup.lng },
              { latitude: dropoff.lat, longitude: dropoff.lng },
            ]}
            strokeColor="#D4AF37"
            strokeWidth={5}
            lineCap="round"
            lineJoin="round"
            geodesic={false}
            zIndex={10}
          />
        )}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: "100%", overflow: "hidden", backgroundColor: "#050505" },
  driverMarker: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(212,175,55,0.2)",
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "#D4AF37",
  },
  driverInner: {
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: "#0a0a0a",
    borderWidth: 1, borderColor: "#D4AF37",
  },
  pinStack: {
    alignItems: "center",
    justifyContent: "flex-end",
  },
  pickupPin: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: "#D4AF37",
    alignItems: "center", justifyContent: "center",
    borderWidth: 3, borderColor: "#0a0a0a",
  },
  pickupGlyph: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#0a0a0a" },
  pinTail: {
    width: 4, height: 8, backgroundColor: "#0a0a0a",
    marginTop: -1,
  },
  dropoffPin: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: "#1a1a1a",
    alignItems: "center", justifyContent: "center",
    borderWidth: 3, borderColor: "#D4AF37",
  },
  dropoffGlyph: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#D4AF37" },
});
