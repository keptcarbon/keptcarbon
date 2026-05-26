import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { verifyToken, AUTH_COOKIE } from "@/lib/jwt";

function rowToPlot(row: any) {
  return {
    id: row.id,
    userId: String(row.user_id),
    name: row.name,
    areaRai: parseFloat(row.area_rai) || 0,
    carbonTotal: parseFloat(row.carbon_total) || 0,
    rubberAge: row.rubber_age || 0,
    plantYearBE: row.plant_year_be ?? undefined,
    trees: row.trees ?? undefined,
    variety: row.variety ?? undefined,
    spacing: row.spacing ?? undefined,
    ownerName: row.owner_name ?? undefined,
    province: row.province ?? undefined,
    date: row.created_at,
    plantStatus: row.plant_status ?? undefined,
    processed: row.processed ?? false,
    luChecked: row.lu_checked ?? undefined,
    forecast: row.forecast ?? undefined,
    carbonProfile: row.carbon_profile ?? undefined,
    backendData: row.backend_data ?? undefined,
    geojson: row.geojson_data ?? undefined,
    boundaryGeojson: row.boundary_geojson_data ?? undefined,
  };
}

/** GET /api/plots — list plots for current user (admin: ?all=true) */
export async function GET(request: NextRequest) {
  const token = request.cookies.get(AUTH_COOKIE)?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const payload = verifyToken(token);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const showAll = payload.role === "admin" && searchParams.get("all") === "true";
  const filterName = searchParams.get("name");

  try {
    let query: string;
    let params: unknown[];

    if (showAll) {
      query = `
        SELECT cp.*,
               u.fullname AS owner_fullname,
               ST_AsGeoJSON(cp.geom)::json          AS geojson_data,
               ST_AsGeoJSON(cp.boundary_geom)::json AS boundary_geojson_data
        FROM carbon_projects cp
        LEFT JOIN users u ON cp.user_id = u.id
        ${filterName ? "WHERE cp.name = $1" : ""}
        ORDER BY cp.updated_at DESC
      `;
      params = filterName ? [filterName] : [];
    } else {
      query = `
        SELECT *,
               ST_AsGeoJSON(geom)::json          AS geojson_data,
               ST_AsGeoJSON(boundary_geom)::json AS boundary_geojson_data
        FROM carbon_projects
        WHERE user_id = $1
        ${filterName ? "AND name = $2" : ""}
        ORDER BY updated_at DESC
      `;
      params = filterName ? [payload.userId, filterName] : [payload.userId];
    }

    const result = await pool.query(query, params);
    const plots = result.rows.map((row) => {
      const p = rowToPlot(row);
      if (showAll && row.owner_fullname && !p.ownerName) {
        p.ownerName = row.owner_fullname;
      }
      return p;
    });

    return NextResponse.json({ plots });
  } catch (err) {
    console.error("GET /api/plots error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/** POST /api/plots — upsert one or many plots (body: { plots: Plot[] }) */
export async function POST(request: NextRequest) {
  const token = request.cookies.get(AUTH_COOKIE)?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const payload = verifyToken(token);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const plots: any[] = Array.isArray(body.plots)
      ? body.plots
      : body.plot
      ? [body.plot]
      : [];

    if (plots.length === 0) {
      return NextResponse.json({ error: "No plots provided" }, { status: 400 });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const plot of plots) {
        await client.query(
          `INSERT INTO carbon_projects (
             id, user_id, name, area_rai, carbon_total, rubber_age,
             plant_year_be, trees, variety, spacing, owner_name, province,
             plant_status, processed, lu_checked, forecast, carbon_profile,
             backend_data, geom, boundary_geom
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
             $15, $16, $17, $18,
             CASE WHEN $19::text IS NOT NULL THEN ST_SetSRID(ST_GeomFromGeoJSON($19::text), 4326) ELSE NULL END,
             CASE WHEN $20::text IS NOT NULL THEN ST_SetSRID(ST_GeomFromGeoJSON($20::text), 4326) ELSE NULL END
           )
           ON CONFLICT (id) DO UPDATE SET
             name           = EXCLUDED.name,
             area_rai       = EXCLUDED.area_rai,
             carbon_total   = EXCLUDED.carbon_total,
             rubber_age     = EXCLUDED.rubber_age,
             plant_year_be  = EXCLUDED.plant_year_be,
             trees          = EXCLUDED.trees,
             variety        = EXCLUDED.variety,
             spacing        = EXCLUDED.spacing,
             owner_name     = EXCLUDED.owner_name,
             province       = EXCLUDED.province,
             plant_status   = EXCLUDED.plant_status,
             processed      = EXCLUDED.processed,
             lu_checked     = EXCLUDED.lu_checked,
             forecast       = EXCLUDED.forecast,
             carbon_profile = EXCLUDED.carbon_profile,
             backend_data   = EXCLUDED.backend_data,
             geom           = EXCLUDED.geom,
             boundary_geom  = EXCLUDED.boundary_geom,
             updated_at     = NOW()`,
          [
            plot.id,
            payload.userId,
            plot.name ?? "",
            plot.areaRai ?? 0,
            plot.carbonTotal ?? 0,
            plot.rubberAge ?? 0,
            plot.plantYearBE ?? null,
            plot.trees ?? null,
            plot.variety ?? null,
            plot.spacing ?? null,
            plot.ownerName ?? null,
            plot.province ?? null,
            plot.plantStatus ?? null,
            plot.processed ?? false,
            plot.luChecked ? JSON.stringify(plot.luChecked) : null,
            plot.forecast ? JSON.stringify(plot.forecast) : null,
            plot.carbonProfile ? JSON.stringify(plot.carbonProfile) : null,
            plot.backendData ? JSON.stringify(plot.backendData) : null,
            plot.geojson ? JSON.stringify(plot.geojson) : null,
            plot.boundaryGeojson ? JSON.stringify(plot.boundaryGeojson) : null,
          ]
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    return NextResponse.json({ success: true, count: plots.length });
  } catch (err) {
    console.error("POST /api/plots error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/** DELETE /api/plots — ลบทุกแปลงของ user ปัจจุบัน */
export async function DELETE(request: NextRequest) {
  const token = request.cookies.get(AUTH_COOKIE)?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const payload = verifyToken(token);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await pool.query("DELETE FROM carbon_projects WHERE user_id = $1", [payload.userId]);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/plots error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
