-- ==========================================================================
-- Land Use – Rayong Province 2563 (EPSG:4326)
-- Source: lu_rayong_2563_4326.geojson
-- Load with: ogr2ogr or psql COPY after this table is created
-- ==========================================================================

CREATE TABLE IF NOT EXISTS lu_rayong (
  id          SERIAL PRIMARY KEY,
  lu_id_l1   DOUBLE PRECISION,
  lu_id_l2   DOUBLE PRECISION,
  lu_id_l3   DOUBLE PRECISION,
  lu_code    VARCHAR,
  lu_des_th  VARCHAR,
  lu_des_en  VARCHAR,
  lul1_code  VARCHAR,
  lul2_code  VARCHAR,
  shape_area DOUBLE PRECISION,
  lu_des     VARCHAR,
  rai        INTEGER,
  geom       GEOMETRY(MultiPolygon, 4326)
);

CREATE INDEX IF NOT EXISTS idx_lu_rayong_geom     ON lu_rayong USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_lu_rayong_lu_code  ON lu_rayong (lu_code);
CREATE INDEX IF NOT EXISTS idx_lu_rayong_lul1_code ON lu_rayong (lul1_code);
