-- ============================================================================
-- Migration 013 — drop geo_landuse.lu_id_l1/l2/l3
-- ============================================================================
-- Run against an EXISTING database:
--
--   docker compose exec -T postgis \
--     psql -U keptcarbon -d keptcarbon -v ON_ERROR_STOP=1 \
--     < postgis/migrations/013_drop_geo_landuse_lu_id_columns.sql
--
-- lu_id_l1/l2/l3 are the numeric land-use ID codes carried over from the
-- source LU_RYG_2567.gpkg (see gen_geo_landuse_sql.py). No application code
-- reads them -- LanduseService groups by lul1_code, falling back to lu_code,
-- for its area calculations -- so they're dead weight. Dropped here;
-- gen_geo_landuse_sql.py updated to stop emitting them so a future
-- regeneration of postgis/init/12-geo-landuse.sql stays consistent with
-- this schema instead of reintroducing the columns.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'geo_landuse' AND column_name = 'lu_id_l1'
  ) THEN
    RAISE EXCEPTION 'geo_landuse.lu_id_l1 does not exist -- migration 013 already applied, aborting.';
  END IF;
END $$;

ALTER TABLE public.geo_landuse
  DROP COLUMN lu_id_l1,
  DROP COLUMN lu_id_l2,
  DROP COLUMN lu_id_l3;

COMMIT;
