import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { verifyToken, AUTH_COOKIE } from "@/lib/jwt";

type Relation = "intersects" | "touches" | "contains";

const RELATIONS: Relation[] = ["intersects", "touches", "contains"];
const HARD_LIMIT = 2000;

function buildCondition(rel: Relation): string {
  switch (rel) {
    case "touches":  return "ST_Touches(p.geom, q.g)";
    case "contains": return "ST_Within(p.geom, q.g)";
    case "intersects":
    default:         return "p.geom && q.g AND ST_Intersects(p.geom, q.g)";
  }
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get(AUTH_COOKIE)?.value;
  if (!token || !verifyToken(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { geometry?: unknown; relation?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { geometry, relation } = body;

  if (!geometry || typeof geometry !== "object" || !("type" in geometry)) {
    return NextResponse.json(
      { error: "geometry must be a GeoJSON geometry object" },
      { status: 400 },
    );
  }

  const rel: Relation = (RELATIONS as string[]).includes(relation as string)
    ? (relation as Relation)
    : "intersects";

  // CTE computes ST_MakeValid once and reuses it; bbox pre-filter (&&) hits the spatial index.
  // ST_Intersection clips each parcel to the drawn boundary so only the overlapping portion is returned.
  const sql = `
    WITH q AS (
      SELECT ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($1::text), 4326)) AS g
    )
    SELECT p.id,
           p.lu_code, p.lu_des_th, p.lu_des_en, p.lul1_code, p.lul2_code,
           p.rai AS grow_area,
           p.shape_area,
           ST_AsGeoJSON(ST_Multi(ST_Intersection(p.geom, q.g)))::json AS geometry
    FROM lu_rayong p, q
    WHERE p.lu_code = 'A302'
      AND ${buildCondition(rel)}
    LIMIT ${HARD_LIMIT}
  `;

  try {
    const result = await pool.query(sql, [JSON.stringify(geometry)]);
    const features = result.rows.map((row: Record<string, unknown>) => {
      const { geometry: g, ...properties } = row;
      const geometry = typeof g === "string" ? JSON.parse(g) : g;
      return {
        type: "Feature" as const,
        geometry,
        properties,
      };
    });
    return NextResponse.json({
      type: "FeatureCollection",
      features,
      count: features.length,
      relation: rel,
      truncated: features.length >= HARD_LIMIT,
    });
  } catch (err) {
    console.error("Parcel search error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 },
    );
  }
}
