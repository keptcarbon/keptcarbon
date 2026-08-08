#!/usr/bin/env python3
"""Generate SQL init files for provinces and districts from GeoJSON."""

import json
import os

GEOJSON_DIR = os.path.join(os.path.dirname(__file__), '..', 'geojson')
INIT_DIR = os.path.dirname(__file__) + '/init'


def esc(val):
    if val is None:
        return 'NULL'
    return "'" + str(val).replace("'", "''") + "'"


def geom_sql(geometry):
    return f"ST_SetSRID(ST_GeomFromGeoJSON('{json.dumps(geometry, separators=(',', ':'))}'), 4326)"


def col_name(key):
    """GeoJSON property key → lowercase SQL column name; rename 'id' to avoid PK conflict."""
    name = key.lower()
    return 'fid' if name == 'id' else name


def infer_type(values):
    """Infer SQL type from a list of sample values (nulls excluded)."""
    non_null = [v for v in values if v is not None]
    if not non_null:
        return 'TEXT'
    if all(isinstance(v, bool) for v in non_null):
        return 'BOOLEAN'
    if all(isinstance(v, int) for v in non_null):
        return 'INTEGER'
    if all(isinstance(v, (int, float)) for v in non_null):
        return 'NUMERIC'
    return 'TEXT'


def build_sql(geojson_path, table, comment, indexes):
    with open(geojson_path, encoding='utf-8') as f:
        data = json.load(f)

    features = data['features']
    if not features:
        raise ValueError(f'No features in {geojson_path}')

    # Collect all property keys in order of first appearance
    keys = list(dict.fromkeys(k for feat in features for k in feat['properties']))

    # Infer column types from all feature values
    col_types = {
        k: infer_type([feat['properties'].get(k) for feat in features])
        for k in keys
    }

    cols = [(col_name(k), col_types[k], k) for k in keys]  # (sql_col, sql_type, orig_key)

    # CREATE TABLE
    col_defs = ['  id    SERIAL PRIMARY KEY']
    for sql_col, sql_type, _ in cols:
        col_defs.append(f'  {sql_col:<14}{sql_type}')
    col_defs.append('  geom           GEOMETRY(MultiPolygon, 4326)')

    lines = [
        f'-- {"=" * 72}',
        f'-- {comment}',
        f'-- Source: {os.path.basename(geojson_path)} (EPSG:4326 / CRS84)',
        f'-- {"=" * 72}',
        '',
        f'CREATE TABLE IF NOT EXISTS {table} (',
        ',\n'.join(col_defs),
        ');',
        '',
    ]

    # Indexes
    for idx_name, idx_col in indexes:
        if idx_col == 'geom':
            lines.append(f'CREATE INDEX IF NOT EXISTS {idx_name} ON {table} USING GIST(geom);')
        else:
            lines.append(f'CREATE INDEX IF NOT EXISTS {idx_name} ON {table} ({idx_col});')
    lines.append('')

    # INSERT
    insert_cols = ', '.join(sql_col for sql_col, _, _ in cols) + ', geom'
    lines += [
        f'INSERT INTO {table}',
        f'  ({insert_cols})',
        'VALUES',
    ]

    rows = []
    for feat in features:
        p = feat['properties']
        vals = ', '.join(esc(p.get(orig_key)) for _, _, orig_key in cols)
        rows.append(f'  ({vals}, {geom_sql(feat["geometry"])})')

    lines.append(',\n'.join(rows) + ';')
    lines.append('')

    return '\n'.join(lines), len(features)


def gen_provinces():
    sql, n = build_sql(
        os.path.join(GEOJSON_DIR, 'pro_rayong.geojson'),
        table='provinces',
        comment='Provinces – Rayong',
        indexes=[
            ('idx_provinces_geom',      'geom'),
            ('idx_provinces_prov_code', 'prov_code'),
        ],
    )
    out = os.path.join(INIT_DIR, '04-provinces.sql')
    with open(out, 'w', encoding='utf-8') as f:
        f.write(sql)
    print(f'Written {out}  ({n} rows)')


def gen_districts():
    sql, n = build_sql(
        os.path.join(GEOJSON_DIR, 'amp_rayong.geojson'),
        table='districts',
        comment='Districts (Amphoe) – Rayong',
        indexes=[
            ('idx_districts_geom',      'geom'),
            ('idx_districts_prov_code', 'prov_code'),
            ('idx_districts_amp_code',  'amp_code'),
        ],
    )
    out = os.path.join(INIT_DIR, '05-districts.sql')
    with open(out, 'w', encoding='utf-8') as f:
        f.write(sql)
    print(f'Written {out}  ({n} rows)')


if __name__ == '__main__':
    gen_provinces()
    gen_districts()
