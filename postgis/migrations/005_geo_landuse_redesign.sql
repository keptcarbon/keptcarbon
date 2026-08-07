-- ============================================================================
-- Migration 005 — geo_landuse redesign: integer ID codes + lu_year
-- ============================================================================
-- Run against an EXISTING database (the postgis/init/*.sql scripts only run
-- when the Docker volume is created fresh):
--
--   docker compose exec -T postgis \
--     psql -U keptcarbon -d keptcarbon -v ON_ERROR_STOP=1 \
--     < postgis/migrations/005_geo_landuse_redesign.sql
--
-- Replaces the geo_landuse table added in migration 004 (lu_id_l1/l2/l3 as
-- double precision, no version column) with the redesigned schema:
--   - lu_id_l1/l2/l3 -> integer (they're ID codes; the double precision
--     values carried ~1e-8 float32->float64 rounding noise, not real
--     fractional data -- see gen_geo_landuse_sql.py for detail)
--   - lu_year added (Buddhist-Era year of the source dataset, e.g. 2567) so
--     the planned R&D data-ingestion feature can add new vintages per
--     province without overwriting old ones; (p_code, lu_year) identifies
--     one ingested dataset
--
-- No application code queries geo_landuse yet (LanduseService still reads
-- LU_RYG_2567.gpkg directly via geopandas), so this is a straight drop and
-- recreate rather than an in-place ALTER + backfill -- simpler and there's
-- no data to preserve.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'geo_landuse' AND column_name = 'lu_year'
  ) THEN
    RAISE EXCEPTION 'geo_landuse already has lu_year -- migration 005 already applied, aborting.';
  END IF;
END $$;

DROP TABLE IF EXISTS public.geo_landuse;

\i /docker-entrypoint-initdb.d/12-geo-landuse.sql

-- Migration summary, printed before commit
DO $$
DECLARE
  n_features BIGINT;
BEGIN
  SELECT COUNT(*) INTO n_features FROM geo_landuse;
  RAISE NOTICE 'geo_landuse redesigned and reseeded: % land-use features', n_features;
END $$;

COMMIT;