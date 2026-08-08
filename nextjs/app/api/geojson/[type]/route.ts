import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

const TARGET_PROVINCES = ['ระยอง', 'บึงกาฬ', 'สุราษฎร์ธานี'];

function emptyFC() {
  return NextResponse.json({ type: 'FeatureCollection', features: [] });
}

function buildFC(rows: { geojson: any }[]) {
  if (!rows?.length || !rows[0].geojson) return emptyFC();
  const fc = rows[0].geojson;
  fc.features = fc.features || [];
  return NextResponse.json(fc);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ type: string }> }
) {
  try {
    const { type } = await params;
    const { searchParams } = new URL(request.url);

    // ── geo_country: Thailand boundary ───────────────────────────────────────
    if (type === 'th-boundary') {
      const { rows } = await pool.query(`
        SELECT json_build_object(
          'type', 'FeatureCollection',
          'features', json_agg(json_build_object(
            'type', 'Feature',
            'geometry', ST_AsGeoJSON(geom)::json,
            'properties', json_build_object('name_th', name_th, 'name_en', name_en)
          ))
        ) AS geojson
        FROM geo_country;
      `);
      return buildFC(rows);
    }

    // ── geo_region: All 5 regions ─────────────────────────────────────────────
    if (type === 'regions') {
      const { rows } = await pool.query(`
        SELECT json_build_object(
          'type', 'FeatureCollection',
          'features', json_agg(json_build_object(
            'type', 'Feature',
            'geometry', ST_AsGeoJSON(geom)::json,
            'properties', json_build_object(
              'name_th', name_th, 'name_en', name_en,
              'cen_lon', cen_lon, 'cen_lat', cen_lat
            )
          ) ORDER BY name_th)
        ) AS geojson
        FROM geo_region;
      `);
      return buildFC(rows);
    }

    // ── geo_province: Province boundary ──────────────────────────────────────
    if (type === 'boundary') {
      const province = searchParams.get('province');
      let query: string;
      let queryParams: string[];

      if (province) {
        query = `
          SELECT json_build_object(
            'type', 'FeatureCollection',
            'features', json_agg(json_build_object(
              'type', 'Feature',
              'geometry', ST_AsGeoJSON(geom)::json,
              'properties', json_build_object('name_th', name_th, 'region_th', region_th)
            ))
          ) AS geojson
          FROM geo_province WHERE name_th = $1;
        `;
        queryParams = [province];
      } else {
        query = `
          SELECT json_build_object(
            'type', 'FeatureCollection',
            'features', json_agg(json_build_object(
              'type', 'Feature',
              'geometry', ST_AsGeoJSON(geom)::json,
              'properties', json_build_object('name_th', name_th, 'region_th', region_th)
            ))
          ) AS geojson
          FROM geo_province;
        `;
        queryParams = [];
      }
      const { rows } = await pool.query(query, queryParams);
      return buildFC(rows);
    }

    // ── geo_district: District boundaries (only 3 provinces) ─────────────────
    if (type === 'districts') {
      const district = searchParams.get('district');
      const province = searchParams.get('province');
      let query: string;
      let queryParams: string[];

      if (district && province) {
        query = `
          SELECT json_build_object(
            'type', 'FeatureCollection',
            'features', json_agg(json_build_object(
              'type', 'Feature',
              'geometry', ST_AsGeoJSON(geom)::json,
              'properties', json_build_object(
                'amphoe_t', name_th, 'prov_nam_t', province_th
              )
            ))
          ) AS geojson
          FROM geo_district
          WHERE name_th = $1 AND province_th = $2;
        `;
        queryParams = [district, province];
      } else if (district) {
        query = `
          SELECT json_build_object(
            'type', 'FeatureCollection',
            'features', json_agg(json_build_object(
              'type', 'Feature',
              'geometry', ST_AsGeoJSON(geom)::json,
              'properties', json_build_object(
                'amphoe_t', name_th, 'prov_nam_t', province_th
              )
            ))
          ) AS geojson
          FROM geo_district WHERE name_th = $1;
        `;
        queryParams = [district];
      } else if (province) {
        query = `
          SELECT json_build_object(
            'type', 'FeatureCollection',
            'features', json_agg(json_build_object(
              'type', 'Feature',
              'geometry', ST_AsGeoJSON(ST_PointOnSurface(geom))::json,
              'properties', json_build_object(
                'amphoe_t', name_th, 'prov_nam_t', province_th
              )
            ) ORDER BY name_th)
          ) AS geojson
          FROM geo_district WHERE province_th = $1;
        `;
        queryParams = [province];
      } else {
        // No params — only return data for the 3 active provinces
        query = `
          SELECT json_build_object(
            'type', 'FeatureCollection',
            'features', json_agg(json_build_object(
              'type', 'Feature',
              'geometry', ST_AsGeoJSON(geom)::json,
              'properties', json_build_object(
                'amphoe_t', name_th, 'prov_nam_t', province_th
              )
            ))
          ) AS geojson
          FROM geo_district
          WHERE province_th = ANY($1::text[]);
        `;
        queryParams = [TARGET_PROVINCES as any];
      }
      const { rows } = await pool.query(query, queryParams);
      return buildFC(rows);
    }

    // ── geo_subdistrict: Subdistrict boundaries (only 3 provinces) ───────────
    if (type === 'tambon') {
      const tambon = searchParams.get('tambon');
      const district = searchParams.get('district');
      let query: string;
      let queryParams: string[];

      if (tambon && district) {
        query = `
          SELECT json_build_object(
            'type', 'FeatureCollection',
            'features', json_agg(json_build_object(
              'type', 'Feature',
              'geometry', ST_AsGeoJSON(geom)::json,
              'properties', json_build_object(
                'tambon_t', name_th, 'amphoe_t', district_th, 'prov_nam_t', province_th
              )
            ))
          ) AS geojson
          FROM geo_subdistrict
          WHERE name_th = $1 AND district_th = $2;
        `;
        queryParams = [tambon, district];
      } else if (tambon) {
        query = `
          SELECT json_build_object(
            'type', 'FeatureCollection',
            'features', json_agg(json_build_object(
              'type', 'Feature',
              'geometry', ST_AsGeoJSON(geom)::json,
              'properties', json_build_object(
                'tambon_t', name_th, 'amphoe_t', district_th, 'prov_nam_t', province_th
              )
            ))
          ) AS geojson
          FROM geo_subdistrict WHERE name_th = $1;
        `;
        queryParams = [tambon];
      } else if (district) {
        query = `
          SELECT json_build_object(
            'type', 'FeatureCollection',
            'features', json_agg(json_build_object(
              'type', 'Feature',
              'geometry', ST_AsGeoJSON(ST_PointOnSurface(geom))::json,
              'properties', json_build_object(
                'tambon_t', name_th, 'amphoe_t', district_th, 'prov_nam_t', province_th
              )
            ) ORDER BY name_th)
          ) AS geojson
          FROM geo_subdistrict WHERE district_th = $1;
        `;
        queryParams = [district];
      } else {
        // No params — only return data for the 3 active provinces
        query = `
          SELECT json_build_object(
            'type', 'FeatureCollection',
            'features', json_agg(json_build_object(
              'type', 'Feature',
              'geometry', ST_AsGeoJSON(geom)::json,
              'properties', json_build_object(
                'tambon_t', name_th, 'amphoe_t', district_th, 'prov_nam_t', province_th
              )
            ))
          ) AS geojson
          FROM geo_subdistrict
          WHERE province_th = ANY($1::text[]);
        `;
        queryParams = [TARGET_PROVINCES as any];
      }
      const { rows } = await pool.query(query, queryParams);
      return buildFC(rows);
    }

    return NextResponse.json({ error: 'Invalid geojson type' }, { status: 400 });

  } catch (error) {
    console.error('geojson API error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
