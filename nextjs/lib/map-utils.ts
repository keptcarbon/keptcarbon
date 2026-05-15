export type LngLat = [number, number];

export function emptyFC(): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

export function isMobile() {
  return typeof window !== "undefined" && window.innerWidth <= 768;
}

// Equal-area-ish polygon area in m^2 (matches the original map-draw.html algorithm).
export function polygonAreaM2(coords: LngLat[]): number {
  let a = 0;
  const R = 6371000;
  for (let i = 0; i < coords.length; i++) {
    const [lo1, la1] = coords[i];
    const [lo2, la2] = coords[(i + 1) % coords.length];
    const x1 = ((lo1 * Math.PI) / 180) * R * Math.cos((la1 * Math.PI) / 180);
    const y1 = ((la1 * Math.PI) / 180) * R;
    const x2 = ((lo2 * Math.PI) / 180) * R * Math.cos((la2 * Math.PI) / 180);
    const y2 = ((la2 * Math.PI) / 180) * R;
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

export function carbonForAge(age: number, trees: number) {
  const H = Math.min(2.0 + 1.8 * age, 28);
  const D = Math.min(3 + 4.5 * age, 60);
  const AGB = 0.1284 * D * D * H * 0.001; // tonnes/tree
  const BGB = AGB * 0.26;
  const co2 = (AGB + BGB) * 0.47 * 3.67 * trees; // tCO2 total
  return { H, D, AGB, BGB, co2 };
}

// UTM (WGS84) → WGS84 geographic [lng, lat] in degrees.
export function utmToWgs84(
  easting: number,
  northing: number,
  zone: number,
  isNorth: boolean,
): LngLat {
  const a = 6378137.0;
  const e2 = 0.00669437999014;
  const ePrime2 = e2 / (1 - e2);
  const k0 = 0.9996;

  const x = easting - 500000;
  const y = isNorth ? northing : northing - 10000000;
  const lon0 = ((zone - 1) * 6 - 180 + 3) * (Math.PI / 180);

  const M = y / k0;
  const mu =
    M /
    (a *
      (1 -
        e2 / 4 -
        (3 * e2 * e2) / 64 -
        (5 * e2 ** 3) / 256));

  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);

  const N1 = a / Math.sqrt(1 - e2 * Math.sin(phi1) ** 2);
  const T1 = Math.tan(phi1) ** 2;
  const C1 = ePrime2 * Math.cos(phi1) ** 2;
  const R1 = (a * (1 - e2)) / (1 - e2 * Math.sin(phi1) ** 2) ** 1.5;
  const D = x / (N1 * k0);

  const lat =
    phi1 -
    ((N1 * Math.tan(phi1)) / R1) *
      (D ** 2 / 2 -
        ((5 + 3 * T1 + 10 * C1 - 4 * C1 ** 2 - 9 * ePrime2) * D ** 4) / 24 +
        ((61 + 90 * T1 + 298 * C1 + 45 * T1 ** 2 - 252 * ePrime2 - 3 * C1 ** 2) * D ** 6) / 720);

  const lon =
    lon0 +
    (D -
      ((1 + 2 * T1 + C1) * D ** 3) / 6 +
      ((5 - 2 * C1 + 28 * T1 - 3 * C1 ** 2 + 8 * ePrime2 + 24 * T1 ** 2) * D ** 5) / 120) /
      Math.cos(phi1);

  return [lon * (180 / Math.PI), lat * (180 / Math.PI)];
}

// Parse UTM zone info from a .prj file string.
// Returns null if the projection is not a recognisable UTM.
export function detectUtmFromPrj(prjText: string): { zone: number; isNorth: boolean } | null {
  const m =
    prjText.match(/UTM[_\s-]*Zone[_\s-]*(\d+)\s*([NS])/i) ??
    prjText.match(/Zone[_\s-]*(\d+)[_\s-]*([NS])/i) ??
    prjText.match(/(\d{2})[_\s]*([NS])["\s]/i);
  if (!m) return null;
  const zone = parseInt(m[1], 10);
  if (zone < 1 || zone > 60) return null;
  return { zone, isNorth: m[2].toUpperCase() === "N" };
}

// Auto-detect UTM zone for a sample point when no .prj is available.
// Tries zones 47N and 48N (covers all of Thailand) and returns the one
// whose converted coordinate lands inside the Thailand bounding box.
export function detectUtmZoneAuto(
  sampleEasting: number,
  sampleNorthing: number,
): { zone: number; isNorth: boolean } | null {
  for (const zone of [47, 48, 46, 49]) {
    const [lng, lat] = utmToWgs84(sampleEasting, sampleNorthing, zone, true);
    if (lng >= 97 && lng <= 107 && lat >= 4 && lat <= 22) {
      return { zone, isNorth: true };
    }
  }
  return null;
}

// Reduce coordinate precision to 6 decimal places (~10 cm) to shrink payload.
export function truncateCoords(geom: GeoJSON.Geometry): GeoJSON.Geometry {
  const F = 1e6;
  const walk = (c: any): any => {
    if (typeof c[0] === "number") return [Math.round(c[0] * F) / F, Math.round(c[1] * F) / F];
    return c.map(walk);
  };
  return { ...(geom as any), coordinates: walk((geom as any).coordinates) } as GeoJSON.Geometry;
}

export function validateAndFixGeoJSON(
  feature: GeoJSON.Feature,
  utm?: { zone: number; isNorth: boolean },
): GeoJSON.Feature {
  const f = JSON.parse(JSON.stringify(feature)) as GeoJSON.Feature;

  const walk = (coords: any) => {
    if (typeof coords[0] === "number" && typeof coords[1] === "number") {
      const x = coords[0];
      const y = coords[1];

      if (Math.abs(x) > 2000 || Math.abs(y) > 2000) {
        if (!utm) {
          throw new Error(
            "ไฟล์ของคุณอาจใช้พิกัด UTM หรือโปรเจกชันอื่น กรุณาใช้ไฟล์ที่เป็น WGS84 (EPSG:4326) หรือ UTM WGS84",
          );
        }
        const [lng, lat] = utmToWgs84(x, y, utm.zone, utm.isNorth);
        coords[0] = lng;
        coords[1] = lat;
        return;
      }

      // Swap swapped Lng/Lat for Thailand context
      if (Math.abs(y) > 90 && Math.abs(x) <= 90) {
        coords[0] = y;
        coords[1] = x;
      }
      return;
    }
    if (Array.isArray(coords)) {
      for (const c of coords) walk(c);
    }
  };

  if (f.geometry) {
    walk((f.geometry as any).coordinates);
  }
  return f;
}
