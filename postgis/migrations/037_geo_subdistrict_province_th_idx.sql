-- ============================================================================
-- Migration 037 — geo_subdistrict: B-tree index on province_th
-- ============================================================================
-- Run against an EXISTING database:
--
--   docker compose exec -T postgis \
--     psql -U keptcarbon -d keptcarbon -v ON_ERROR_STOP=1 \
--     < postgis/migrations/037_geo_subdistrict_province_th_idx.sql
--
-- The dashboard province list (GET /api/carbon-sim/province, also used by
-- /dashboard/carbon-stock) and GET /api/service-provinces look up each
-- province's region with `geo_subdistrict WHERE province_th = ...`. Without
-- an index that is a full scan per province, which pushes the planner's cost
-- estimate past jit_above_cost: ~590 ms per request, ~310 ms of it JIT
-- compilation. With the index: ~20 ms, no JIT.
--
-- Purely additive; safe to re-run.
-- ============================================================================

BEGIN;

CREATE INDEX IF NOT EXISTS geo_subdistrict_province_th_idx
  ON public.geo_subdistrict (province_th);

ANALYZE public.geo_subdistrict;

COMMIT;
