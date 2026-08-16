-- ============================================================================
-- Migration 012 — retire carbon_projects
-- ============================================================================
-- Run against an EXISTING database, AFTER migrations 009, 010, and 011, and
-- AFTER deploying the app version whose POST/PATCH/DELETE /api/plots and
-- /api/plots/claim routes write only tbl_projects/tbl_plots/
-- tbl_plot_landuse_overlaps/tbl_plot_assessments/tbl_plot_carbon_yearly
-- (carbon_projects is no longer read or written by any route):
--
--   docker compose exec -T postgis \
--     psql -U keptcarbon -d keptcarbon -v ON_ERROR_STOP=1 \
--     < postgis/migrations/012_retire_carbon_projects.sql
--
-- Renames rather than drops -- costs nothing, keeps the data recoverable if
-- something was missed, and any surviving code path that still queries
-- carbon_projects by name will now fail loudly ("relation does not exist")
-- instead of silently reading stale data.
--
-- Also fixes tbl_projects_id_seq: every prior write to tbl_projects (the
-- migration 010 backfill, and every shadow-write since) inserted an explicit
-- id copied from carbon_projects.id, which never advances a SERIAL column's
-- sequence. Now that inserts rely on the sequence-generated default (the app
-- no longer has a carbon_projects id to carry over), the sequence must be
-- caught up to the real max id or the very next INSERT collides with an
-- existing row.
--
-- Once the app has run against the normalized-only path in production for a
-- bake period (propose ~2 weeks), a follow-up migration can
-- `DROP TABLE carbon_projects_deprecated_20260816`.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'carbon_projects'
  ) THEN
    RAISE EXCEPTION 'carbon_projects does not exist -- migration 012 already applied, aborting.';
  END IF;
END $$;

ALTER TABLE carbon_projects RENAME TO carbon_projects_deprecated_20260816;

SELECT setval(pg_get_serial_sequence('tbl_projects', 'id'), COALESCE((SELECT MAX(id) FROM tbl_projects), 1), true);

COMMIT;
