import { open } from "shapefile";
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const shpPath = join(__dirname, "../../shp_A/District_rayongshp.shp");
const dbfPath = join(__dirname, "../../shp_A/District_rayongshp.dbf");
const outPath = join(__dirname, "../public/assets/rayong-districts.geojson");

const THAI_NAMES = {
  "TH2101": "เมืองระยอง",
  "TH2102": "บ้านฉาง",
  "TH2103": "แกลง",
  "TH2104": "วังจันทร์",
  "TH2105": "บ้านค่าย",
  "TH2106": "ปลวกแดง",
  "TH2107": "เขาชะเมา",
  "TH2108": "นิคมพัฒนา",
};

const ENGLISH_NAMES = {
  "TH2101": "Mueang Rayong",
  "TH2102": "Ban Chang",
  "TH2103": "Klaeng",
  "TH2104": "Wang Chan",
  "TH2105": "Ban Khai",
  "TH2106": "Pluak Daeng",
  "TH2107": "Khao Chamao",
  "TH2108": "Nikhom Phatthana",
};

mkdirSync(dirname(outPath), { recursive: true });

const src = await open(shpPath, dbfPath);
const features = [];
let r;
while (!(r = await src.read()).done) {
  const f = r.value;
  const pcode = f.properties?.ADM2_PCODE;
  const districtTh = THAI_NAMES[pcode] || f.properties?.ADM2_TH || "";
  const districtEn = ENGLISH_NAMES[pcode] || f.properties?.ADM2_EN || "";
  features.push({
    ...f,
    properties: {
      ADM2_PCODE: pcode,
      amphoe_t: districtTh,
      amphoe_e: districtEn,
      prov_code: "21",
      prov_nam_t: "จังหวัดระยอง",
    },
  });
}

const geojson = { type: "FeatureCollection", features };
writeFileSync(outPath, JSON.stringify(geojson, null, 2), "utf-8");
console.log(`✓ Converted ${features.length} feature(s) → ${outPath}`);
