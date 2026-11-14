-- ============================================================================
-- Migration 030 — tbl_plot_assessments: drop message_th, ci, model_version
-- ============================================================================
-- Run against an EXISTING database (after 009):
--
--   docker compose exec -T postgis \
--     psql -U keptcarbon -d keptcarbon -v ON_ERROR_STOP=1 \
--     < postgis/migrations/030_drop_unused_plot_assessment_columns.sql
--
-- All three columns were write-only -- nothing ever read them back:
--   - message_th:    the backend's StatusMessage has no Thai message, so it
--                    was always NULL for new assessments.
--   - ci:            the backend's CarbonAssessResponse has no top-level ci;
--                    per-year CIs live in tbl_plot_carbon_yearly.stock_ci /
--                    gain_ci.
--   - model_version: always inserted as NULL; growth_model / allometry /
--                    biomass_profile_version are already recorded in
--                    assess_parameters.
--
-- Rows backfilled by 010 may still hold legacy message_th / ci values. Check
-- before running if you want to keep them:
--
--   SELECT count(*) FILTER (WHERE message_th IS NOT NULL)    AS message_th,
--          count(*) FILTER (WHERE ci IS NOT NULL)            AS ci,
--          count(*) FILTER (WHERE model_version IS NOT NULL) AS model_version
--   FROM tbl_plot_assessments;
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tbl_plot_assessments'
      AND column_name IN ('message_th', 'ci', 'model_version')
  ) THEN
    RAISE EXCEPTION 'tbl_plot_assessments has no message_th/ci/model_version -- migration 030 already applied, aborting.';
  END IF;
END $$;

ALTER TABLE tbl_plot_assessments
  DROP COLUMN IF EXISTS message_th,
  DROP COLUMN IF EXISTS ci,
  DROP COLUMN IF EXISTS model_version;

COMMIT;
