-- ============================================================================
-- Migration 028 — tbl_plots: rename owner_name -> plot_note
-- ============================================================================
-- Run against an EXISTING database:
--
--   docker compose exec -T postgis \
--     psql -U keptcarbon -d keptcarbon -v ON_ERROR_STOP=1 \
--     < postgis/migrations/028_rename_tbl_plots_owner_name_plot_note.sql
--
-- The column (added in 011 as a landowner name, later auto-filled with the
-- account display name) is now optional free-text plot info entered per plot
-- -- e.g. landowner name, land title (โฉนด) number -- max 100 chars, NULL by
-- default. Project ownership comes from tbl_projects.user_uuid, so the old
-- name was misleading. Rename only: type and data are unchanged.
--
-- Deploy together with the app change that reads/writes plot_note.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tbl_plots' AND column_name = 'plot_note'
  ) THEN
    RAISE EXCEPTION 'tbl_plots.plot_note already exists -- migration 028 already applied, aborting.';
  END IF;
END $$;

ALTER TABLE public.tbl_plots RENAME COLUMN owner_name TO plot_note;

COMMIT;
