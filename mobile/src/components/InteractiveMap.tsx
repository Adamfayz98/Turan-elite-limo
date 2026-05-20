/**
 * Interactive Google Map for the rider's "Driver is on the way" screen and
 * the admin Live Drivers tab. Cross-platform: native uses WebView, web uses iframe.
 *
 * Props:
 *   - driver: { lat, lng, heading? }       -> renders an animated black car icon
 *   - pickup: { lat, lng }                  -> renders a gold pickup pin
 *   - dropoff?: { lat, lng }                -> renders a small destination pin
 *   - focusDriverId?: string (admin-only) used to trigger a re-pan via postMessage
 *
 * The map auto-fits its bounds to include all visible markers.
 */
import { useMemo, useRef, useEffect } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";

export type LatLng = { lat: number; lng: number; heading?: number };
export type DriverMarker = LatLng & { id?: string; name?: string; vehicle?: string };

type Props = {
  driver?: DriverMarker | null;
  drivers?: DriverMarker[];          // admin multi-driver mode
  pickup?: LatLng | null;
  dropoff?: LatLng | null;
  height?: number | string;
  focusDriverId?: string | null;     // when set, the map pans+zooms to that driver
  style?: any;
};

const DARK_MAP_STYLE: any[] = [
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

function buildHtml(apiKey: string) {
  // SVG car icon (top-down view) — gold with black tint.
  const CAR_SVG =
    `<svg xmlns="http://www.w3.org/2000/svg" width="42" height="42" viewBox="0 0 42 42">` +
    `<g transform="translate(21 21)">` +
    // outer gold glow ring
    `<circle r="18" fill="rgba(212,175,55,0.15)" />` +
    `<circle r="14" fill="#D4AF37" stroke="#000" stroke-width="1" />` +
    // car body (top-down)
    `<g transform="rotate(-90)">` +
    `<rect x="-7" y="-10" width="14" height="20" rx="3" fill="#0a0a0a" stroke="#D4AF37" stroke-width="1" />` +
    `<rect x="-5" y="-7" width="10" height="5" rx="1" fill="#1a1a1a" />` + // windshield
    `<rect x="-5" y="2" width="10" height="5" rx="1" fill="#1a1a1a" />` + // rear window
    `</g>` +
    `</g></svg>`;

  return `<!doctype html>
<html><head>
<meta charset="utf-8" />
<meta name="viewport" content="initial-scale=1.0, user-scalable=no" />
<style>
  html,body,#map { width:100%; height:100%; margin:0; padding:0; background:#050505; }
</style>
</head>
<body>
<div id="map"></div>
<script>
  var DRIVER_ICON_URL = 'data:image/svg+xml;utf8,' + encodeURIComponent(${JSON.stringify(CAR_SVG)});
  var DARK_STYLE = ${JSON.stringify(DARK_MAP_STYLE)};
  var map, driverMarkers = {}, pickupMarker = null, dropoffMarker = null;
  var lastBoundsKey = '';
  var focusDriverId = null;

  function sendToHost(payload) {
    try {
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify(payload));
      } else if (window.parent && window.parent !== window) {
        window.parent.postMessage(payload, '*');
      }
    } catch(e) {}
  }

  function initMap() {
    map = new google.maps.Map(document.getElementById('map'), {
      center: { lat: 37.7749, lng: -122.4194 },
      zoom: 11,
      disableDefaultUI: true,
      zoomControl: true,
      gestureHandling: 'greedy',
      styles: DARK_STYLE,
      backgroundColor: '#050505'
    });
    sendToHost({ type: 'ready' });
  }
  window.initMap = initMap;

  function updateMarkers(payload) {
    if (!map) return;
    var drivers = payload.drivers || [];
    // Update/create driver markers, remove stale
    var seen = {};
    drivers.forEach(function(d) {
      seen[d.id || 'me'] = true;
      var existing = driverMarkers[d.id || 'me'];
      var pos = new google.maps.LatLng(d.lat, d.lng);
      if (existing) {
        existing.setPosition(pos);
        if (d.heading != null) {
          var icon = existing.getIcon();
          icon.rotation = d.heading;
          existing.setIcon(icon);
        }
      } else {
        var marker = new google.maps.Marker({
          position: pos,
          map: map,
          icon: {
            url: DRIVER_ICON_URL,
            scaledSize: new google.maps.Size(42, 42),
            anchor: new google.maps.Point(21, 21),
          },
          title: d.name || 'Driver',
          zIndex: 999,
        });
        marker.addListener('click', function() { sendToHost({ type: 'driver_click', id: d.id || 'me' }); });
        driverMarkers[d.id || 'me'] = marker;
      }
    });
    // Remove stale
    Object.keys(driverMarkers).forEach(function(id) {
      if (!seen[id]) {
        driverMarkers[id].setMap(null);
        delete driverMarkers[id];
      }
    });

    // Pickup pin
    if (payload.pickup) {
      var pos = new google.maps.LatLng(payload.pickup.lat, payload.pickup.lng);
      if (!pickupMarker) {
        pickupMarker = new google.maps.Marker({
          position: pos, map: map, label: { text: 'A', color: '#000', fontWeight: '700', fontSize: '13px' },
          icon: { path: google.maps.SymbolPath.CIRCLE, scale: 14, fillColor: '#D4AF37', fillOpacity: 1, strokeColor: '#000', strokeWeight: 2 },
          zIndex: 500,
        });
      } else { pickupMarker.setPosition(pos); }
    } else if (pickupMarker) { pickupMarker.setMap(null); pickupMarker = null; }

    // Dropoff pin
    if (payload.dropoff) {
      var pos = new google.maps.LatLng(payload.dropoff.lat, payload.dropoff.lng);
      if (!dropoffMarker) {
        dropoffMarker = new google.maps.Marker({
          position: pos, map: map, label: { text: 'B', color: '#fff', fontWeight: '700', fontSize: '13px' },
          icon: { path: google.maps.SymbolPath.CIRCLE, scale: 12, fillColor: '#444', fillOpacity: 1, strokeColor: '#D4AF37', strokeWeight: 1.5 },
          zIndex: 500,
        });
      } else { dropoffMarker.setPosition(pos); }
    } else if (dropoffMarker) { dropoffMarker.setMap(null); dropoffMarker = null; }

    // Fit bounds (only auto-fit when not focused on a specific driver)
    if (!focusDriverId) {
      var bounds = new google.maps.LatLngBounds();
      drivers.forEach(function(d) { bounds.extend(new google.maps.LatLng(d.lat, d.lng)); });
      if (payload.pickup) bounds.extend(new google.maps.LatLng(payload.pickup.lat, payload.pickup.lng));
      if (payload.dropoff) bounds.extend(new google.maps.LatLng(payload.dropoff.lat, payload.dropoff.lng));
      if (!bounds.isEmpty()) {
        var key = bounds.toUrlValue();
        if (key !== lastBoundsKey) {
          lastBoundsKey = key;
          var count = drivers.length + (payload.pickup?1:0) + (payload.dropoff?1:0);
          if (count === 1) { map.setCenter(bounds.getCenter()); map.setZoom(15); }
          else { map.fitBounds(bounds, 80); }
        }
      }
    }
  }

  function focusDriver(id) {
    focusDriverId = id;
    if (id && driverMarkers[id]) {
      map.panTo(driverMarkers[id].getPosition());
      map.setZoom(15);
    } else {
      lastBoundsKey = ''; // re-fit on next update
    }
  }

  function handleMessage(data) {
    try {
      if (data.type === 'update') updateMarkers(data);
      else if (data.type === 'focus_driver') focusDriver(data.id);
    } catch(e) { sendToHost({ type: 'error', message: String(e) }); }
  }
  document.addEventListener('message', function(ev) { try { handleMessage(JSON.parse(ev.data)); } catch(e){} });
  window.addEventListener('message', function(ev) {
    var data = ev.data;
    if (typeof data === 'string') { try { data = JSON.parse(data); } catch(e){ return; } }
    if (data && data.type) handleMessage(data);
  });
</script>
<script async defer src="https://maps.googleapis.com/maps/api/js?key=${apiKey}&callback=initMap"></script>
</body></html>`;
}

export default function InteractiveMap({
  driver,
  drivers,
  pickup,
  dropoff,
  height = 320,
  focusDriverId,
  style,
}: Props) {
  const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_BROWSER_KEY || "";
  const html = useMemo(() => buildHtml(apiKey), [apiKey]);
  const webRef = useRef<WebView>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const isReady = useRef(false);

  const allDrivers: DriverMarker[] = drivers && drivers.length
    ? drivers
    : (driver ? [{ id: "me", ...driver }] : []);

  const post = (msg: object) => {
    const str = JSON.stringify(msg);
    if (Platform.OS === "web") {
      iframeRef.current?.contentWindow?.postMessage(msg, "*");
    } else {
      webRef.current?.injectJavaScript(`window.handleMessage && window.handleMessage(${str}); true;`);
    }
  };

  // Send updates when markers change (debounced by deps)
  useEffect(() => {
    if (!isReady.current) return;
    post({ type: "update", drivers: allDrivers, pickup, dropoff });
  }, [JSON.stringify(allDrivers), JSON.stringify(pickup), JSON.stringify(dropoff)]);

  // Send focus instruction when admin clicks a driver row
  useEffect(() => {
    if (!isReady.current) return;
    post({ type: "focus_driver", id: focusDriverId || null });
  }, [focusDriverId]);

  if (Platform.OS === "web") {
    // Use srcDoc iframe so the WebView has the same code path
    return (
      <View style={[styles.container, { height }, style]}>
        <iframe
          ref={iframeRef}
          srcDoc={html}
          style={{ width: "100%", height: "100%", border: "none", background: "#050505" }}
          onLoad={() => {
            isReady.current = true;
            post({ type: "update", drivers: allDrivers, pickup, dropoff });
            if (focusDriverId) post({ type: "focus_driver", id: focusDriverId });
          }}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { height }, style]}>
      <WebView
        ref={webRef}
        originWhitelist={["*"]}
        source={{ html, baseUrl: "https://maps.google.com/" }}
        style={{ backgroundColor: "#050505" }}
        javaScriptEnabled
        domStorageEnabled
        scalesPageToFit={false}
        onMessage={(e) => {
          try {
            const data = JSON.parse(e.nativeEvent.data);
            if (data.type === "ready") {
              isReady.current = true;
              post({ type: "update", drivers: allDrivers, pickup, dropoff });
              if (focusDriverId) post({ type: "focus_driver", id: focusDriverId });
            }
          } catch {}
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: "100%", overflow: "hidden", backgroundColor: "#050505" },
});
