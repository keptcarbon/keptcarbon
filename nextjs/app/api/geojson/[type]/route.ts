import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ type: string }> }
) {
  try {
    const { type } = await params;
    const { searchParams } = new URL(request.url);
    const province = searchParams.get('province');

    if (type === 'boundary') {
      let query: string;
      let queryParams: string[];

      if (province) {
        // Return single province feature for zoom/fitBounds
        query = `
          SELECT json_build_object(
            'type', 'FeatureCollection',
            'features', json_agg(
              json_build_object(
                'type', 'Feature',
                'geometry', ST_AsGeoJSON(geom)::json,
                'properties', to_jsonb(t.*) - 'geom'
              )
            )
          ) AS geojson
          FROM province_boundaries AS t
          WHERE prov_nam_t = $1;
        `;
        queryParams = [province];
      } else {
        // Return all provinces
        query = `
          SELECT json_build_object(
            'type', 'FeatureCollection',
            'features', json_agg(
              json_build_object(
                'type', 'Feature',
                'geometry', ST_AsGeoJSON(geom)::json,
                'properties', to_jsonb(t.*) - 'geom'
              )
            )
          ) AS geojson
          FROM province_boundaries AS t;
        `;
        queryParams = [];
      }

      const { rows } = await pool.query(query, queryParams);
      if (!rows || rows.length === 0 || !rows[0].geojson) {
        return NextResponse.json({ type: 'FeatureCollection', features: [] });
      }
      if (!rows[0].geojson.features) {
        rows[0].geojson.features = [];
      }
      return NextResponse.json(rows[0].geojson);

    } else if (type === 'districts') {
      const district = searchParams.get('district');
      const province = searchParams.get('province');
      let query: string;
      let queryParams: string[];

      if (district && province) {
        query = `
          SELECT json_build_object(
            'type', 'FeatureCollection',
            'features', json_agg(
              json_build_object(
                'type', 'Feature',
                'geometry', ST_AsGeoJSON(geom)::json,
                'properties', to_jsonb(t.*) - 'geom'
              )
            )
          ) AS geojson
          FROM districts AS t
          WHERE amphoe_t = $1 AND prov_nam_t = $2;
        `;
        queryParams = [district, province];
      } else if (district) {
        query = `
          SELECT json_build_object(
            'type', 'FeatureCollection',
            'features', json_agg(
              json_build_object(
                'type', 'Feature',
                'geometry', ST_AsGeoJSON(geom)::json,
                'properties', to_jsonb(t.*) - 'geom'
              )
            )
          ) AS geojson
          FROM districts AS t
          WHERE amphoe_t = $1;
        `;
        queryParams = [district];
      } else if (province) {
        // Return districts for a province (no geometry needed — just properties for dropdown)
        query = `
          SELECT json_build_object(
            'type', 'FeatureCollection',
            'features', json_agg(
              json_build_object(
                'type', 'Feature',
                'geometry', ST_AsGeoJSON(ST_PointOnSurface(geom))::json,
                'properties', to_jsonb(t.*) - 'geom'
              ) ORDER BY t.amphoe_t
            )
          ) AS geojson
          FROM districts AS t
          WHERE prov_nam_t = $1;
        `;
        queryParams = [province];
      } else {
        query = `
          SELECT json_build_object(
            'type', 'FeatureCollection',
            'features', json_agg(
              json_build_object(
                'type', 'Feature',
                'geometry', ST_AsGeoJSON(geom)::json,
                'properties', to_jsonb(t.*) - 'geom'
              )
            )
          ) AS geojson
          FROM districts AS t;
        `;
        queryParams = [];
      }

      const { rows } = await pool.query(query, queryParams);
      if (!rows || rows.length === 0 || !rows[0].geojson) {
        return NextResponse.json({ type: 'FeatureCollection', features: [] });
      }
      if (!rows[0].geojson.features) {
        rows[0].geojson.features = [];
      }
      return NextResponse.json(rows[0].geojson);

    } else if (type === 'tambon') {
      const tambon = searchParams.get('tambon');
      const district = searchParams.get('district');
      let query: string;
      let queryParams: string[];

      if (tambon && district) {
        query = `
          SELECT json_build_object(
            'type', 'FeatureCollection',
            'features', json_agg(
              json_build_object(
                'type', 'Feature',
                'geometry', ST_AsGeoJSON(geom)::json,
                'properties', to_jsonb(t.*) - 'geom'
              )
            )
          ) AS geojson
          FROM tambon AS t
          WHERE tambon_t = $1 AND amphoe_t = $2;
        `;
        queryParams = [tambon, district];
      } else if (tambon) {
        query = `
          SELECT json_build_object(
            'type', 'FeatureCollection',
            'features', json_agg(
              json_build_object(
                'type', 'Feature',
                'geometry', ST_AsGeoJSON(geom)::json,
                'properties', to_jsonb(t.*) - 'geom'
              )
            )
          ) AS geojson
          FROM tambon AS t
          WHERE tambon_t = $1;
        `;
        queryParams = [tambon];
      } else if (district) {
        // Return tambons for an amphoe (properties only for dropdown)
        query = `
          SELECT json_build_object(
            'type', 'FeatureCollection',
            'features', json_agg(
              json_build_object(
                'type', 'Feature',
                'geometry', ST_AsGeoJSON(ST_PointOnSurface(geom))::json,
                'properties', to_jsonb(t.*) - 'geom'
              ) ORDER BY t.tambon_t
            )
          ) AS geojson
          FROM tambon AS t
          WHERE amphoe_t = $1;
        `;
        queryParams = [district];
      } else {
        query = `
          SELECT json_build_object(
            'type', 'FeatureCollection',
            'features', json_agg(
              json_build_object(
                'type', 'Feature',
                'geometry', ST_AsGeoJSON(geom)::json,
                'properties', to_jsonb(t.*) - 'geom'
              )
            )
          ) AS geojson
          FROM tambon AS t;
        `;
        queryParams = [];
      }

      const { rows } = await pool.query(query, queryParams);
      if (!rows || rows.length === 0 || !rows[0].geojson) {
        return NextResponse.json({ type: 'FeatureCollection', features: [] });
      }
      if (!rows[0].geojson.features) {
        rows[0].geojson.features = [];
      }
      return NextResponse.json(rows[0].geojson);

    } else {
      return NextResponse.json({ error: 'Invalid geojson type requested' }, { status: 400 });
    }
  } catch (error) {
    console.error(`Failed to fetch geojson:`, error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
