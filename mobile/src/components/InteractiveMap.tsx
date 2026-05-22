/**
 * Native Google Maps wrapper for TuranEliteLimo.
 *
 * This file is intentionally DEFENSIVE — every external input (geocode results,
 * Directions API responses, polyline decoding) is validated before passing to
 * react-native-maps, because invalid data (NaN, undefined, out-of-range)
 * triggers native crashes on iOS that show no JS-level stack trace.
 *
 * Crash-prevention rules followed here:
 *   1. Polyline always rendered with a stable key (so iOS does not unmount/remount
 *      mid-animation, which causes UAF on the Google Maps SDK iOS pin layer).
 *   2. Polyline coordinate list is filtered to remove any NaN / out-of-range
 *      points BEFORE handing to <Polyline>.
 *   3. Marker children are wrapped to flip tracksViewChanges off only after a
 *      successful layout pass (otherwise iOS shows blank custom views).
 *   4. fitToCoordinates uses ONLY pickup / dropoff / driver pins — not the
 *      hundreds of Directions route waypoints, which on older devices makes
 *      the native fit calculation OOM.
 *   5. Directions API failures fall back silently to a straight line; the
 *      app never blocks on the network.
 */
import { useRef, useEffect, useMemo, useState, useCallback } from "react";
import { StyleSheet, View, Platform } from "react-native";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, Region } from "react-native-maps";

const GMAPS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_BROWSER_KEY || "";

// Sanity check: lat must be in [-90,90], lng in [-180,180], both finite.
function validCoord(p: { latitude?: number; longitude?: number } | undefined | null): boolean {
  if (!p) return false;
  const { latitude: la, longitude: lo } = p as any;
  return (
    typeof la === "number" && typeof lo === "number" &&
    Number.isFinite(la) && Number.isFinite(lo) &&
    la >= -90 && la <= 90 && lo >= -180 && lo <= 180
  );
}

// Decodes a Google "encoded polyline" string. Returns ONLY validated points.
function decodePolyline(str: string): { latitude: number; longitude: number }[] {
  if (!str || typeof str !== "string") return [];
  const points: { latitude: number; longitude: number }[] = [];
  let index = 0, lat = 0, lng = 0;
  try {
    while (index < str.length) {
      let b: number, shift = 0, result = 0;
      do {
        b = str.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20 && index < str.length);
      const dlat = (result & 1) ? ~(result >> 1) : (result >> 1);
      lat += dlat;
      shift = 0; result = 0;
      do {
        b = str.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20 && index < str.length);
      const dlng = (result & 1) ? ~(result >> 1) : (result >> 1);
      lng += dlng;
      const p = { latitude: lat / 1e5, longitude: lng / 1e5 };
      if (validCoord(p)) points.push(p);
    }
  } catch {
    return [];
  }
  return points;
}

async function fetchRoutePolyline(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
): Promise<{ latitude: number; longitude: number }[]> {
  if (!GMAPS_KEY) return [];
  try {
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin.lat},${origin.lng}&destination=${destination.lat},${destination.lng}&mode=driving&key=${GMAPS_KEY}`;
    const r = await fetch(url);
    const data = await r.json();
    if (data?.status !== "OK") return [];
    const enc = data?.routes?.[0]?.overview_polyline?.points;
    return enc ? decodePolyline(enc) : [];
  } catch {
    return [];
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

function StableMarker({ coordinate, anchor, rotation, zIndex, children }: any) {
  const [tracking, setTracking] = useState(true);
  const stop = useCallback(() => setTracking(false), []);
  if (!validCoord(coordinate)) return null;
  return (
    <Marker
      coordinate={coordinate}
      anchor={anchor}
      rotation={rotation}
      zIndex={zIndex}
      tracksViewChanges={tracking}
    >
      <View onLayout={() => setTimeout(stop, 400)}>{children}</View>
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
  const [routeCoords, setRouteCoords] = useState<{ latitude: number; longitude: number }[]>([]);

  // Normalize driver list
  const allDrivers: DriverMarker[] = useMemo(() => {
    const list = drivers && drivers.length ? drivers : (driver ? [{ id: "me", ...driver }] : []);
    return list.filter((d) => Number.isFinite(d.lat) && Number.isFinite(d.lng));
  }, [drivers, driver]);

  // Validated pickup / dropoff (defensive — if address resolved to garbage,
  // we treat as absent rather than crash the map).
  const pickupValid = pickup && Number.isFinite(pickup.lat) && Number.isFinite(pickup.lng) ? pickup : null;
  const dropoffValid = dropoff && Number.isFinite(dropoff.lat) && Number.isFinite(dropoff.lng) ? dropoff : null;

  // Fetch the road-following route whenever pickup AND dropoff are set.
  useEffect(() => {
    if (!pickupValid || !dropoffValid) { setRouteCoords([]); return; }
    let cancelled = false;
    fetchRoutePolyline(
      { lat: pickupValid.lat, lng: pickupValid.lng },
      { lat: dropoffValid.lat, lng: dropoffValid.lng },
    ).then((pts) => {
      if (cancelled) return;
      // Belt-and-suspenders: filter once more right before render to be sure
      // no NaN sneaks into the Polyline component (which iOS will SIGSEGV on).
      const clean = pts.filter(validCoord);
      setRouteCoords(clean);
    });
    return () => { cancelled = true; };
  }, [pickupValid?.lat, pickupValid?.lng, dropoffValid?.lat, dropoffValid?.lng]);

  // Compute the SMALL set of points to fit to. We deliberately exclude the
  // detailed route polyline waypoints — fitting hundreds of points crashes
  // native fit code on older iPhones (and the pickup+dropoff bounding box
  // already encloses the route).
  const fitPoints = useMemo(() => {
    const pts: { latitude: number; longitude: number }[] = [];
    allDrivers.forEach((d) => pts.push({ latitude: d.lat, longitude: d.lng }));
    if (pickupValid) pts.push({ latitude: pickupValid.lat, longitude: pickupValid.lng });
    if (dropoffValid) pts.push({ latitude: dropoffValid.lat, longitude: dropoffValid.lng });
    return pts.filter(validCoord);
  }, [allDrivers, pickupValid?.lat, pickupValid?.lng, dropoffValid?.lat, dropoffValid?.lng]);

  // Fit to visible points; retry once after a short delay so iOS has time
  // to mount the markers before we measure.
  useEffect(() => {
    if (focusDriverId) return;
    if (fitPoints.length === 0) return;
    const fit = () => {
      try {
        if (fitPoints.length === 1) {
          mapRef.current?.animateToRegion(
            { latitude: fitPoints[0].latitude, longitude: fitPoints[0].longitude, latitudeDelta: 0.04, longitudeDelta: 0.04 },
            600
          );
        } else {
          mapRef.current?.fitToCoordinates(fitPoints, {
            edgePadding: fitPadding,
            animated: true,
          });
        }
      } catch { /* never throw to the JS bridge */ }
    };
    const t1 = setTimeout(fit, 300);
    const t2 = setTimeout(fit, 1200);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [fitPoints, focusDriverId, fitPadding]);

  useEffect(() => {
    if (!focusDriverId) return;
    const d = allDrivers.find((x) => x.id === focusDriverId);
    if (!d) return;
    try {
      mapRef.current?.animateToRegion(
        { latitude: d.lat, longitude: d.lng, latitudeDelta: 0.02, longitudeDelta: 0.02 },
        500
      );
    } catch { /* ignore */ }
  }, [focusDriverId, allDrivers]);

  // The route polyline we will actually render. If Directions API failed or
  // is still loading, render a straight line so the user always sees a path.
  // Validate one more time and dedupe to be safe.
  const polylineCoords = useMemo(() => {
    if (!pickupValid || !dropoffValid) return [];
    const candidate = routeCoords.length >= 2
      ? routeCoords
      : [
          { latitude: pickupValid.lat, longitude: pickupValid.lng },
          { latitude: dropoffValid.lat, longitude: dropoffValid.lng },
        ];
    return candidate.filter(validCoord);
  }, [routeCoords, pickupValid?.lat, pickupValid?.lng, dropoffValid?.lat, dropoffValid?.lng]);

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
        mapPadding={{ top: 80, right: 0, bottom: 280, left: 0 }}
      >
        {allDrivers.map((d) => (
          <StableMarker
            key={d.id || "me"}
            coordinate={{ latitude: d.lat, longitude: d.lng }}
            anchor={{ x: 0.5, y: 0.5 }}
            rotation={d.heading || 0}
            zIndex={50}
          >
            <View style={styles.driverMarker}><View style={styles.driverInner} /></View>
          </StableMarker>
        ))}

        {pickupValid && (
          <StableMarker
            key="pickup"
            coordinate={{ latitude: pickupValid.lat, longitude: pickupValid.lng }}
            anchor={{ x: 0.5, y: 1 }}
            zIndex={100}
          >
            <View style={styles.pinStack}>
              <View style={styles.pickupPin}><View style={styles.pickupGlyph} /></View>
              <View style={styles.pinTail} />
            </View>
          </StableMarker>
        )}

        {dropoffValid && (
          <StableMarker
            key="dropoff"
            coordinate={{ latitude: dropoffValid.lat, longitude: dropoffValid.lng }}
            anchor={{ x: 0.5, y: 1 }}
            zIndex={100}
          >
            <View style={styles.pinStack}>
              <View style={styles.dropoffPin}><View style={styles.dropoffGlyph} /></View>
              <View style={[styles.pinTail, { backgroundColor: "#D4AF37" }]} />
            </View>
          </StableMarker>
        )}

        {/* Single Polyline element with a STABLE key derived only from pickup +
            dropoff endpoints. routeCoords length is NOT in the key — this
            prevents rapid unmount/remount when routeCoords changes from 0 to N
            (the leading cause of the iOS crash in builds #20 and #21). */}
        {polylineCoords.length >= 2 && pickupValid && dropoffValid && (
          <Polyline
            key={`route-${pickupValid.lat.toFixed(4)}-${pickupValid.lng.toFixed(4)}-${dropoffValid.lat.toFixed(4)}-${dropoffValid.lng.toFixed(4)}`}
            coordinates={polylineCoords}
            strokeColor="#D4AF37"
            strokeWidth={5}
            lineCap="round"
            lineJoin="round"
            geodesic={false}
            zIndex={10}
          />
        )}

        {/* Optional dashed driver→pickup link (live trip view only). Same
            defensive pattern. */}
        {showRoute && allDrivers.length === 1 && pickupValid &&
         validCoord({ latitude: allDrivers[0].lat, longitude: allDrivers[0].lng }) && (
          <Polyline
            key={`drv-${allDrivers[0].id || "me"}-${pickupValid.lat.toFixed(4)}-${pickupValid.lng.toFixed(4)}`}
            coordinates={[
              { latitude: allDrivers[0].lat, longitude: allDrivers[0].lng },
              { latitude: pickupValid.lat, longitude: pickupValid.lng },
            ]}
            strokeColor="#D4AF37"
            strokeWidth={4}
            lineDashPattern={Platform.OS === "ios" ? [8, 8] : undefined}
            geodesic={false}
            zIndex={20}
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
  pinStack: { alignItems: "center", justifyContent: "flex-end" },
  pickupPin: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: "#D4AF37",
    alignItems: "center", justifyContent: "center",
    borderWidth: 3, borderColor: "#0a0a0a",
  },
  pickupGlyph: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#0a0a0a" },
  pinTail: { width: 4, height: 8, backgroundColor: "#0a0a0a", marginTop: -1 },
  dropoffPin: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: "#1a1a1a",
    alignItems: "center", justifyContent: "center",
    borderWidth: 3, borderColor: "#D4AF37",
  },
  dropoffGlyph: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#D4AF37" },
});
