import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { verifyToken, AUTH_COOKIE } from "@/lib/jwt";

export async function GET(request: NextRequest) {

  try {
    const [statsResult, ageResult, bucketsResult, mapResult, bboxResult, districtsResult] =
      await Promise.all([
        // 1. Aggregate totals
        pool.query(`
          SELECT
            COUNT(*)::int AS total_plots,
            COALESCE(SUM(area_rai), 0) AS total_area_rai,
            COALESCE(SUM(calculate_carbon_co2(COALESCE(rubber_age, 0)::numeric, area_rai)), 0) AS total_carbon
          FROM (
            SELECT
              rubber_age,
              (
                COALESCE(NULLIF(split_part(grow_area,'-',1),''),'0')::numeric +
                COALESCE(NULLIF(split_part(grow_area,'-',2),''),'0')::numeric / 4.0 +
                COALESCE(NULLIF(split_part(grow_area,'-',3),''),'0')::numeric / 400.0
              ) AS area_rai
            FROM rubber_plots
          ) sub
        `),

        // 2. Per-year for line chart
        pool.query(`
          SELECT
            COALESCE(rubber_age, 0)::int AS age,
            COALESCE(SUM(calculate_carbon_co2(COALESCE(rubber_age, 0)::numeric, area_rai)), 0) AS carbon,
            COUNT(*)::int AS plot_count
          FROM (
            SELECT
              rubber_age,
              (
                COALESCE(NULLIF(split_part(grow_area,'-',1),''),'0')::numeric +
                COALESCE(NULLIF(split_part(grow_area,'-',2),''),'0')::numeric / 4.0 +
                COALESCE(NULLIF(split_part(grow_area,'-',3),''),'0')::numeric / 400.0
              ) AS area_rai
            FROM rubber_plots
            WHERE rubber_age IS NOT NULL
          ) sub
          GROUP BY 1
          ORDER BY 1
        `),

        // 3. Age buckets for donut + horizontal bars
        pool.query(`
          SELECT
            bucket,
            COUNT(*)::int AS plot_count,
            COALESCE(SUM(calculate_carbon_co2(COALESCE(rubber_age, 0)::numeric, area_rai)), 0) AS carbon
          FROM (
            SELECT
              rubber_age,
              CASE
                WHEN COALESCE(rubber_age, 0) BETWEEN 1 AND 5   THEN '1-5'
                WHEN COALESCE(rubber_age, 0) BETWEEN 6 AND 12  THEN '6-12'
                WHEN COALESCE(rubber_age, 0) BETWEEN 13 AND 18 THEN '13-18'
                WHEN COALESCE(rubber_age, 0) >= 19             THEN '19+'
                ELSE 'ไม่ระบุ'
              END AS bucket,
              (
                COALESCE(NULLIF(split_part(grow_area,'-',1),''),'0')::numeric +
                COALESCE(NULLIF(split_part(grow_area,'-',2),''),'0')::numeric / 4.0 +
                COALESCE(NULLIF(split_part(grow_area,'-',3),''),'0')::numeric / 400.0
              ) AS area_rai
            FROM rubber_plots
          ) sub
          GROUP BY 1
          ORDER BY MIN(COALESCE(rubber_age, 0))
        `),

        // 4. Map polygons (limit 2000)
        pool.query(`
          SELECT
            id,
            farm_name,
            amphoe_t,
            area_rai,
            calculate_carbon_co2(COALESCE(rubber_age, 0)::numeric, area_rai) AS carbon,
            COALESCE(rubber_age, 0) AS age,
            ST_AsGeoJSON(geom)::json AS geojson
          FROM (
            SELECT
              id,
              farm_name,
              amphoe_t,
              rubber_age,
              geom,
              (
                COALESCE(NULLIF(split_part(grow_area,'-',1),''),'0')::numeric +
                COALESCE(NULLIF(split_part(grow_area,'-',2),''),'0')::numeric / 4.0 +
                COALESCE(NULLIF(split_part(grow_area,'-',3),''),'0')::numeric / 400.0
              ) AS area_rai
            FROM rubber_plots
            WHERE geom IS NOT NULL
            LIMIT 2000
          ) sub
        `),

        // 5. Bounding box for map fitBounds
        pool.query(`
          SELECT
            ST_XMin(ST_Extent(geom))::float AS min_lng,
            ST_YMin(ST_Extent(geom))::float AS min_lat,
            ST_XMax(ST_Extent(geom))::float AS max_lng,
            ST_YMax(ST_Extent(geom))::float AS max_lat
          FROM rubber_plots
          WHERE geom IS NOT NULL
        `),

        // 6. District breakdown with dynamic buckets and centroid coords
        pool.query(`
          WITH district_bucket_stats AS (
            SELECT
              amphoe_t,
              CASE
                WHEN COALESCE(rubber_age, 0) BETWEEN 1 AND 5   THEN '1-5'
                WHEN COALESCE(rubber_age, 0) BETWEEN 6 AND 12  THEN '6-12'
                WHEN COALESCE(rubber_age, 0) BETWEEN 13 AND 18 THEN '13-18'
                WHEN COALESCE(rubber_age, 0) >= 19             THEN '19+'
                ELSE 'ไม่ระบุ'
              END AS bucket,
              COUNT(*)::int AS plots,
              SUM(area_rai) AS area_rai,
              SUM(calculate_carbon_co2(COALESCE(rubber_age, 0)::numeric, area_rai)) AS carbon
            FROM (
              SELECT
                amphoe_t,
                rubber_age,
                (
                  COALESCE(NULLIF(split_part(grow_area,'-',1),''),'0')::numeric +
                  COALESCE(NULLIF(split_part(grow_area,'-',2),''),'0')::numeric / 4.0 +
                  COALESCE(NULLIF(split_part(grow_area,'-',3),''),'0')::numeric / 400.0
                ) AS area_rai
              FROM rubber_plots
              WHERE amphoe_t IS NOT NULL
            ) sub
            GROUP BY amphoe_t, bucket
          ),
          district_totals AS (
            SELECT
              amphoe_t,
              SUM(plots)::int AS total_plots,
              SUM(area_rai) AS total_area_rai,
              SUM(carbon) AS total_carbon,
              JSON_AGG(JSON_BUILD_OBJECT(
                'key', bucket,
                'plots', plots,
                'carbon', carbon
              )) AS age_dist
            FROM district_bucket_stats
            GROUP BY amphoe_t
          )
          SELECT 
            dt.amphoe_t,
            dt.total_plots,
            dt.total_area_rai,
            dt.total_carbon,
            dt.age_dist,
            d.amphoe_e,
            ST_Y(ST_Centroid(d.geom))::float AS lat,
            ST_X(ST_Centroid(d.geom))::float AS lng
          FROM district_totals dt
          LEFT JOIN geo_district d ON dt.amphoe_t = d.name_th
          ORDER BY dt.total_carbon DESC
        `)
      ]);

    const s = statsResult.rows[0] ?? {};
    const totalAreaRai = parseFloat(String(s.total_area_rai ?? 0));
    const totalCarbon = parseFloat(String(s.total_carbon ?? 0));
    const avgCarbonPerRai = totalAreaRai > 0 ? totalCarbon / totalAreaRai : 0;

    const bbox = bboxResult.rows[0] ?? null;

    // Map District name back to expected Frontend ID
    const DISTRICT_ID_MAP: Record<string, string> = {
      "เมืองระยอง": "mueang",
      "บ้านฉาง": "ban-chang",
      "แกลง": "klaeng",
      "วังจันทร์": "wang-chan",
      "บ้านค่าย": "ban-khai",
      "ปลวกแดง": "pluak-daeng",
      "เขาชะเมา": "khao-chamao",
      "นิคมพัฒนา": "nikhom",
    };

    const districts = districtsResult.rows.map((row: any) => {
      const cleanName = row.amphoe_t.replace(/^อ\./, "");
      const id = DISTRICT_ID_MAP[cleanName] || cleanName.toLowerCase().replace(/\s+/g, "-");
      
      // Represent all 4 standard buckets
      const buckets = ["1-5", "6-12", "13-18", "19+"];
      const dbAgeDist = row.age_dist || [];
      const ageDist = buckets.map(key => {
        const found = dbAgeDist.find((b: any) => b.key === key);
        return {
          key,
          plots: found ? Number(found.plots) : 0,
          carbon: found ? parseFloat(String(found.carbon)) : 0
        };
      });

      return {
        id,
        name: cleanName,
        plots: Number(row.total_plots),
        areaRai: parseFloat(String(row.total_area_rai)),
        carbon: parseFloat(String(row.total_carbon)),
        ageDist,
        lat: parseFloat(String(row.lat || 12.6819)),
        lng: parseFloat(String(row.lng || 101.2587))
      };
    });

    // Dynamic provinceTotal aggregated from live district data
    const provinceAgeDist = ["1-5", "6-12", "13-18", "19+"].map(key => {
      let plotsSum = 0;
      let carbonSum = 0;
      districts.forEach((d: any) => {
        const b = d.ageDist.find((ad: any) => ad.key === key);
        if (b) {
          plotsSum += b.plots;
          carbonSum += b.carbon;
        }
      });
      return { key, plots: plotsSum, carbon: carbonSum };
    });

    const provinceTotal = {
      id: "all",
      name: "ทุกอำเภอ",
      plots: Number(s.total_plots ?? 0),
      areaRai: totalAreaRai,
      carbon: totalCarbon,
      ageDist: provinceAgeDist,
      lat: 12.6819,
      lng: 101.2587
    };

    return NextResponse.json({
      totalPlots: s.total_plots ?? 0,
      totalAreaRai,
      totalCarbon,
      avgCarbonPerRai,
      ageData: ageResult.rows.map((r) => ({
        age: Number(r.age),
        carbon: parseFloat(String(r.carbon)),
        plotCount: Number(r.plot_count),
      })),
      ageBuckets: bucketsResult.rows.map((r) => ({
        bucket: r.bucket,
        plotCount: Number(r.plot_count),
        carbon: parseFloat(String(r.carbon)),
      })),
      mapPlots: mapResult.rows.map((r) => ({
        id: r.id,
        name: r.farm_name ?? "ไม่มีชื่อ",
        amphoe: (r.amphoe_t ?? "").replace(/^อ\./, ""),
        areaRai: parseFloat(String(r.area_rai)),
        carbonTotal: parseFloat(String(r.carbon)),
        age: Number(r.age),
        geojson: r.geojson,
      })),
      bbox: bbox
        ? {
            minLng: bbox.min_lng,
            minLat: bbox.min_lat,
            maxLng: bbox.max_lng,
            maxLat: bbox.max_lat,
          }
        : null,
      districts,
      provinceTotal,
      luDataYear: 2567,
    });
  } catch (err) {
    console.error("Dashboard stats error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 },
    );
  }
}
