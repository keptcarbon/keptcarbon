-- ============================================================================
-- Migration 036 — tbl_plot_carbon_yearly: drop superseded assessments' rows
-- ============================================================================
-- Run against an EXISTING database (after 009):
--
--   docker compose exec -T postgis \
--     psql -U keptcarbon -d keptcarbon -v ON_ERROR_STOP=1 \
--     < postgis/migrations/036_drop_superseded_carbon_yearly.sql
--
-- Only the current assessment's yearly profile is ever read (GET
-- /api/plots). A superseded assessment (is_current = FALSE) keeps its
-- tbl_plot_assessments row -- which parameters were used, and when -- but
-- its yearly rows are deleted. From now on the app deletes them at the
-- moment an assessment is superseded or marked stale (lib/normalized-plots.ts).
--
-- Safe to re-run: deletes nothing once the superseded rows are gone.
-- ============================================================================

BEGIN;

DELETE FROM public.tbl_plot_carbon_yearly y
USING public.tbl_plot_assessments a
WHERE y.assessment_id = a.id
  AND NOT a.is_current;

COMMIT;
