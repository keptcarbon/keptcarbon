-- ============================================================================
-- Migration 011 — add tbl_plots.owner_name
-- ============================================================================
-- Run against an EXISTING database, AFTER migrations 009 and 010:
--
--   docker compose exec -T postgis \
--     psql -U keptcarbon -d keptcarbon -v ON_ERROR_STOP=1 \
--     < postgis/migrations/011_add_plot_owner_name.sql
--
-- carbon_projects.frontend_plots[].ownerName (free-text landowner name,
-- independent of the account name) has no column in the normalized schema
-- from migration 009 — every other frontend_plots[] field is either already
-- covered by an existing tbl_plots/tbl_plot_assessments column, reconstructed
-- at read time, or has no downstream reader (see the GET /api/plots
-- migration plan). This is the one exception, so it gets a real column.
--
-- Read-only against carbon_projects: only INSERTs/UPDATEs tbl_plots, does not
-- touch carbon_projects or any column the running application reads today.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tbl_plots' AND column_name = 'owner_name'
  ) THEN
    RAISE EXCEPTION 'tbl_plots.owner_name already exists -- migration 011 already applied, aborting.';
  END IF;
END $$;

ALTER TABLE tbl_plots ADD COLUMN owner_name VARCHAR(255);

-- Backfill from carbon_projects.frontend_plots[].ownerName, matched to its
-- plot by real id (frontend_plots[].id == tbl_plots.polygon_id, same
-- correlation migration 010 already established for this project/plot pair).
UPDATE tbl_plots pl
SET owner_name = fp.value->>'ownerName'
FROM carbon_projects cp
CROSS JOIN LATERAL jsonb_array_elements(
  CASE jsonb_typeof(cp.frontend_plots) WHEN 'array' THEN cp.frontend_plots ELSE '[]'::jsonb END
) AS fp(value)
WHERE pl.project_id = cp.id
  AND pl.polygon_id = fp.value->>'id'
  AND fp.value->>'ownerName' IS NOT NULL;

DO $$
DECLARE
  n_plots  BIGINT;
  n_owner  BIGINT;
BEGIN
  SELECT COUNT(*) INTO n_plots FROM tbl_plots;
  SELECT COUNT(*) INTO n_owner FROM tbl_plots WHERE owner_name IS NOT NULL;
  RAISE NOTICE 'tbl_plots: % rows, % with owner_name backfilled', n_plots, n_owner;
END $$;

COMMIT;
