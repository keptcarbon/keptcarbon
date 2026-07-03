import maplibregl from "maplibre-gl";

export type Tab = "draw" | "shp";

export const REGIONS_DATA = [
  { name: "ภาคตะวันออกเฉียงเหนือ", provinces: ["บึงกาฬ"] },
  { name: "ภาคตะวันออก", provinces: ["ระยอง"] },
  { name: "ภาคใต้", provinces: ["สุราษฎร์ธานี"] },
];

export const zoomToGeoJSONFeatures = (features: GeoJSON.Feature[], map: maplibregl.Map) => {
  if (!features || !features.length || !map) return;
  let minLng = 180, maxLng = -180, minLat = 90, maxLat = -90;
  let hasCoords = false;

  const updateBounds = (ring: number[][]) => {
    ring.forEach(([lng, lat]) => {
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      hasCoords = true;
    });
  };

  features.forEach(feature => {
    if (!feature.geometry) return;
    if (feature.geometry.type === "Polygon") {
      (feature.geometry as GeoJSON.Polygon).coordinates.forEach(updateBounds);
    } else if (feature.geometry.type === "MultiPolygon") {
      (feature.geometry as GeoJSON.MultiPolygon).coordinates.forEach(poly => poly.forEach(updateBounds));
    }
  });

  if (hasCoords) {
    // Adding checks to prevent identical bounds error
    if (minLng === maxLng) { minLng -= 0.01; maxLng += 0.01; }
    if (minLat === maxLat) { minLat -= 0.01; maxLat += 0.01; }
    map.fitBounds([[minLng, minLat], [maxLng, maxLat]], {
      padding: 60,
      duration: 2500, // Slower, smoother animation
      essential: true
    });
  }
};

export const AMPHOE_DATA: Record<string, string[]> = {
  "บึงกาฬ": ["เมืองบึงกาฬ", "พรเจริญ", "โซ่พิสัย", "เซกา", "ปากคาด", "บึงโขงหลง", "ศรีวิไล", "บุ้งคล้า"],
  "ระยอง": ["เมืองระยอง", "บ้านฉาง", "แกลง", "วังจันทร์", "บ้านค่าย", "ปลวกแดง", "เขาชะเมา", "นิคมพัฒนา"],
  "สุราษฎร์ธานี": ["เมืองสุราษฎร์ธานี", "กาญจนดิษฐ์", "ดอนสัก", "เกาะสมุย", "เกาะพะงัน", "ไชยา", "ท่าชนะ", "คีรีรัฐนิคม", "บ้านตาขุน", "พนม", "ท่าฉาง", "บ้านนาสาร", "บ้านนาเดิม", "เคียนซา", "เวียงสระ", "พระแสง", "พุนพิน", "ชัยบุรี", "วิภาวดี"],
};

// UTM Zone 47N/48N → WGS84
export function utmToLatLng(easting: number, northing: number, zone: number, isNorth = true) {
  const a = 6378137.0, f = 1 / 298.257223563;
  const b = a * (1 - f);
  const e2 = 1 - (b * b) / (a * a);
  const ep2 = e2 / (1 - e2);
  const k0 = 0.9996, E0 = 500000, N0 = isNorth ? 0 : 10000000;
  const lam0 = ((zone - 1) * 6 - 180 + 3) * (Math.PI / 180);
  const x = easting - E0, y = northing - N0;
  const M = y / k0;
  const mu = M / (a * (1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 * e2 * e2) / 256));
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const phi1 = mu
    + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu)
    + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
    + (151 * e1 ** 3 / 96) * Math.sin(6 * mu);
  const sp = Math.sin(phi1), cp = Math.cos(phi1), tp = Math.tan(phi1);
  const N1 = a / Math.sqrt(1 - e2 * sp * sp);
  const T1 = tp * tp, C1 = ep2 * cp * cp;
  const R1 = a * (1 - e2) / (1 - e2 * sp * sp) ** 1.5;
  const D = x / (N1 * k0);
  const lat = phi1 - (N1 * tp / R1) * (D * D / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D ** 4 / 24 + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D ** 6 / 720);
  const lon = lam0 + (D - (1 + 2 * T1 + C1) * D ** 3 / 6 + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D ** 5 / 120) / cp;
  return { lat: lat * 180 / Math.PI, lng: lon * 180 / Math.PI };
}

export const cursorAddNode = "cell";

export const SNAP_PX = 15;