-- ============================================================================
-- Migration 003 — GiST indexes for geo_district / geo_subdistrict
-- ============================================================================
-- Run against an EXISTING database (the postgis/init/*.sql scripts only run
-- when the Docker volume is created fresh):
--
--   docker compose exec -T postgis \
--     psql -U keptcarbon -d keptcarbon -v ON_ERROR_STOP=1 \
--     < postgis/migrations/003_geo_district_subdistrict_gist.sql
--
-- geo_district and geo_subdistrict were created (postgis/init/10-*.sql,
-- 11-*.sql) with a geom column but no spatial index -- unlike every other
-- geo_* table, which has a GiST index on geom. Any ST_Intersects/ST_Contains/
-- ST_Within query against them falls back to a full sequential scan. This is
-- purely additive (two new indexes, nothing else touched), so no maintenance
-- window is required.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'geo_district_geom_idx'
  ) THEN
    RAISE EXCEPTION 'geo_district_geom_idx already exists -- migration 003 already applied, aborting.';
  END IF;
END $$;

CREATE INDEX geo_district_geom_idx ON public.geo_district USING gist (geom);
CREATE INDEX geo_subdistrict_geom_idx ON public.geo_subdistrict USING gist (geom);

-- Migration summary, printed before commit
DO $$
DECLARE
  n_district    BIGINT;
  n_subdistrict BIGINT;
BEGIN
  SELECT COUNT(*) INTO n_district    FROM geo_district;
  SELECT COUNT(*) INTO n_subdistrict FROM geo_subdistrict;
  RAISE NOTICE 'GiST indexes created: geo_district (% rows), geo_subdistrict (% rows)',
    n_district, n_subdistrict;
END $$;

COMMIT;