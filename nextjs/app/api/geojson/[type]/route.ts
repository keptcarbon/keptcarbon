import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ type: string }> }
) {
  try {
    const { type } = await params;
    
    let tableName = '';
    
    if (type === 'boundary') {
      tableName = 'rayong_boundary';
    } else if (type === 'districts') {
      tableName = 'districts';
    } else {
      return NextResponse.json({ error: 'Invalid geojson type requested' }, { status: 400 });
    }

    const query = `
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
      FROM ${tableName} AS t;
    `;

    const { rows } = await pool.query(query);
    
    if (!rows || rows.length === 0 || !rows[0].geojson) {
      return NextResponse.json({ type: 'FeatureCollection', features: [] });
    }

    // rows[0].geojson might have null features if table is empty
    if (!rows[0].geojson.features) {
      rows[0].geojson.features = [];
    }

    return NextResponse.json(rows[0].geojson);
  } catch (error) {
    console.error(`Failed to fetch geojson:`, error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
