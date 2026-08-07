/**
 * Convert Province_Rayong.shp (UTM Zone 47N / WGS84) → WGS84 GeoJSON
 * Run from: next/  →  node scripts/convert-rayong-shp.mjs
 */
import { open } from "shapefile";
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// UTM Zone 47N (WGS84) → WGS84 Geographic
// Using manual Transverse Mercator inverse projection
const a = 6378137.0;          // WGS84 semi-major axis
const f = 1 / 298.257223563;  // WGS84 flattening
const k0 = 0.9996;            // scale factor
const E0 = 500000;            // false easting
const N0 = 0;                 // false northing (northern hemisphere)
const lon0 = 99.0 * Math.PI / 180; // central meridian zone 47N

const e2 = 2 * f - f * f;
const e = Math.sqrt(e2);
const ep2 = e2 / (1 - e2);

function utmToWgs84(E, N) {
  const M = (N - N0) / k0;
  const mu = M / (a * (1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 * e2 * e2 / 256));

  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const phi1 = mu
    + (3 * e1 / 2 - 27 * e1 * e1 * e1 / 32) * Math.sin(2 * mu)
    + (21 * e1 * e1 / 16 - 55 * e1 * e1 * e1 * e1 / 32) * Math.sin(4 * mu)
    + (151 * e1 * e1 * e1 / 96) * Math.sin(6 * mu)
    + (1097 * e1 * e1 * e1 * e1 / 512) * Math.sin(8 * mu);

  const N1 = a / Math.sqrt(1 - e2 * Math.sin(phi1) * Math.sin(phi1));
  const T1 = Math.tan(phi1) * Math.tan(phi1);
  const C1 = ep2 * Math.cos(phi1) * Math.cos(phi1);
  const R1 = a * (1 - e2) / Math.pow(1 - e2 * Math.sin(phi1) * Math.sin(phi1), 1.5);
  const D = (E - E0) / (N1 * k0);

  const lat = phi1 - (N1 * Math.tan(phi1) / R1) * (
    D * D / 2
    - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D * D * D * D / 24
    + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D * D * D * D * D * D / 720
  );

  const lon = lon0 + (
    D
    - (1 + 2 * T1 + C1) * D * D * D / 6
    + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D * D * D * D * D / 120
  ) / Math.cos(phi1);

  return [lon * 180 / Math.PI, lat * 180 / Math.PI];
}

function transformCoords(coords) {
  if (!Array.isArray(coords)) return coords;
  if (typeof coords[0] === "number") {
    return utmToWgs84(coords[0], coords[1]);
  }
  return coords.map(transformCoords);
}

function transformGeometry(geom) {
  if (!geom) return geom;
  return { ...geom, coordinates: transformCoords(geom.coordinates) };
}

const shpPath = join(__dirname, "../../shp/Province_Rayong.shp");
const dbfPath = join(__dirname, "../../shp/Province_Rayong.dbf");
const outPath = join(__dirname, "../public/assets/rayong-boundary.geojson");

mkdirSync(dirname(outPath), { recursive: true });

const src = await open(shpPath, dbfPath);
const features = [];
let r;
while (!(r = await src.read()).done) {
  features.push({
    ...r.value,
    geometry: transformGeometry(r.value.geometry),
  });
}

const geojson = { type: "FeatureCollection", features };
writeFileSync(outPath, JSON.stringify(geojson, null, 2), "utf-8");
console.log(`✓ Converted ${features.length} feature(s) → ${outPath}`);
