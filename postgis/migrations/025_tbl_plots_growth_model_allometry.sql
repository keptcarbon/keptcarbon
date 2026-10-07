-- ============================================================================
-- Migration 025 — tbl_plots: add growth_model, allometry
-- ============================================================================
-- Run against an EXISTING database:
--
--   docker compose exec -T postgis \
--     psql -U keptcarbon -d keptcarbon -v ON_ERROR_STOP=1 \
--     < postgis/migrations/025_tbl_plots_growth_model_allometry.sql
--
-- Lets a plot's edit form (my-plots plot dashboard) pin a specific growth
-- model / allometry equation for its carbon assessment, instead of always
-- falling back to the province default. Both nullable -- null means "use
-- the province default", same convention as the other optional plot fields
-- (rubber_clone, spacing_system, ...). VARCHAR(50) matches
-- tbl_biomass_profile.growth_model/allometry sizing.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tbl_plots' AND column_name = 'growth_model'
  ) THEN
    RAISE EXCEPTION 'tbl_plots.growth_model already exists -- migration 025 already applied, aborting.';
  END IF;
END $$;

ALTER TABLE public.tbl_plots
  ADD COLUMN growth_model VARCHAR(50),
  ADD COLUMN allometry VARCHAR(50);

COMMIT;
