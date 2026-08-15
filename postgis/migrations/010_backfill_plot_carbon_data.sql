-- ============================================================================
-- Migration 010 — backfill tbl_projects / tbl_plots / tbl_plot_landuse_overlaps /
--                  tbl_plot_assessments / tbl_plot_carbon_yearly from carbon_projects
-- ============================================================================
-- Run against an EXISTING database, AFTER migration 009 has been applied:
--
--   docker compose exec -T postgis \
--     psql -U keptcarbon -d keptcarbon -v ON_ERROR_STOP=1 \
--     < postgis/migrations/010_backfill_plot_carbon_data.sql
--
-- Read-only against carbon_projects — this migration only INSERTs into the
-- five tables created by migration 009. carbon_projects itself, and every
-- column the running application reads, are untouched, so the app keeps
-- working unmodified after this runs; it does not yet read the new tables.
--
-- Source → destination mapping:
--   carbon_projects (header cols)                    -> tbl_projects (same id preserved)
--   frontend_plots[]                                  -> tbl_plots (one row per id -- the stable
--                                                         identity anchor; frontend_plots itself
--                                                         is not stored anywhere, only read as
--                                                         the correlation key and geometry/status
--                                                         source alongside plantation_info)
--   plantation_info[], polygons_payload[]             -> tbl_plots (geometry/status/request params)
--   plantation_info[].lu_polygon[]                    -> tbl_plot_landuse_overlaps
--   backend_responses[]                               -> tbl_plot_assessments
--   backend_responses[].carbon_profile[]               -> tbl_plot_carbon_yearly
--
-- frontend_plots is being retired in favor of a view over the tables above
-- (see migration 009's header) -- this migration reads it only to anchor the
-- other three arrays, it doesn't get stored as its own column anywhere.
--
-- IMPORTANT — how the four arrays actually correlate (verified against real
-- dev data, not just the TS types): polygons_payload[].id, backend_responses
-- [].polygon_id, and frontend_plots[].id are the SAME real, client-generated
-- id (nextjs/app/components/organisms/ParcelResultsPanel/ParcelResultsPanel.tsx,
-- stablePlotIds -- short random strings like "alkm9e"). This migration joins
-- those three BY REAL ID MATCH. plantation_info[].polygon_id comes from a
-- separate land-classification API call ("parcel-0-<ts>") and never matches
-- the other three -- the frontend only keeps plantation_info aligned with
-- the rest by building it in the same iteration order over the same polygon
-- list within one save, so this migration joins plantation_info[i] to
-- frontend_plots[i] BY ARRAY POSITION per project, not by any id field. This
-- is correct as long as a project's frontend_plots and plantation_info
-- arrays are the same length and order, which the summary NOTICE at the end
-- checks and reports on -- review any project it flags before trusting its
-- tbl_plots.geometry/status or tbl_plot_landuse_overlaps rows.
--
-- tbl_plots.polygon_id is deliberately sourced from frontend_plots[i].id (NOT
-- plantation_info[i].polygon_id, which an earlier version of this migration
-- used by mistake) because that is the id the live write path treats as a
-- plot's stable identity across repeated saves/re-edits.
--
-- Not recoverable from the source data (left NULL): tbl_plot_assessments.
-- model_version -- carbon_projects never recorded which backend/allometry
-- version produced a result, only its output. Every tbl_plot_assessments row
-- inserted here uses carbon_projects.updated_at as its created_at, since
-- backend_responses[] entries carry no timestamp of their own.
--
-- To re-run from scratch (e.g. after fixing a data issue), first undo this
-- migration's inserts -- the FK chain cascades from tbl_projects:
--   TRUNCATE tbl_projects, tbl_plots, tbl_plot_landuse_overlaps, tbl_plot_assessments,
--            tbl_plot_carbon_yearly RESTART IDENTITY CASCADE;
-- The guard below refuses to run over a non-empty tbl_plots table so a second
-- run can't silently double-insert.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM tbl_plots LIMIT 1) THEN
    RAISE EXCEPTION 'tbl_plots already has rows -- migration 010 already applied (or tbl_plots is not empty), aborting. See header for how to reset and re-run.';
  END IF;
END $$;

-- ============================================================================
-- 1) tbl_projects — one row per carbon_projects row, id preserved so any
--    lingering references (e.g. SavedPlot.dbProjectId in old frontend state)
--    still resolve during the transition period.
-- ============================================================================
INSERT INTO tbl_projects (id, user_uuid, guest_uuid, project_name, status, deleted_at, created_at, updated_at)
SELECT id, user_uuid, guest_key, project_name, status, deleted_at, created_at, updated_at
FROM carbon_projects
ON CONFLICT (id) DO NOTHING;

SELECT setval(pg_get_serial_sequence('tbl_projects', 'id'), COALESCE((SELECT MAX(id) FROM tbl_projects), 1), true);

-- ============================================================================
-- 2) tbl_plots — one row per frontend_plots[] element (the id space the live
--    write path treats as a plot's stable identity). plantation_info is
--    joined in by ARRAY POSITION (see header note -- no shared key exists).
--    polygons_payload is joined in by REAL ID MATCH.
--    Rows with no id, or no geometry, are skipped (reported below).
-- ============================================================================
INSERT INTO tbl_plots (
  project_id, polygon_id, geometry, area_m2, province_code,
  status, status_code, message,
  year_of_planting, rubber_clone, tree_count, spacing_system, project_type,
  selected_lu_classes, created_at, updated_at
)
SELECT
  cp.id,
  fp.value->>'id',
  ST_SetSRID(ST_GeomFromGeoJSON(pinfo.value->>'geometry'), 4326),
  NULLIF(pinfo.value->>'area_m2', '')::double precision,
  pinfo.value->>'province_code',
  pinfo.value->'status'->>'status',
  pinfo.value->'status'->>'status_code',
  pinfo.value->'status'->>'message',
  NULLIF(payload.value->>'year_of_planting', '')::double precision::smallint,
  payload.value->>'rubber_clone',
  NULLIF(payload.value->>'tree_count', '')::double precision::integer,
  payload.value->>'spacing_system',
  payload.value->>'project_type',
  ARRAY(SELECT jsonb_array_elements_text(COALESCE(payload.value->'selected_lu_classes', '[]'::jsonb))),
  cp.created_at,
  cp.updated_at
FROM carbon_projects cp
CROSS JOIN LATERAL jsonb_array_elements(
  CASE jsonb_typeof(cp.frontend_plots) WHEN 'array' THEN cp.frontend_plots ELSE '[]'::jsonb END
) WITH ORDINALITY AS fp(value, ord)
LEFT JOIN LATERAL jsonb_array_elements(
  CASE jsonb_typeof(cp.plantation_info) WHEN 'array' THEN cp.plantation_info ELSE '[]'::jsonb END
) WITH ORDINALITY AS pinfo(value, ord) ON pinfo.ord = fp.ord
LEFT JOIN LATERAL jsonb_array_elements(
  CASE jsonb_typeof(cp.polygons_payload) WHEN 'array' THEN cp.polygons_payload ELSE '[]'::jsonb END
) AS payload(value) ON payload.value->>'id' = fp.value->>'id'
WHERE fp.value->>'id' IS NOT NULL
  AND pinfo.value->'geometry' IS NOT NULL
  AND pinfo.value->'geometry' != 'null'::jsonb
ON CONFLICT (project_id, polygon_id) DO NOTHING;

-- ============================================================================
-- 3) tbl_plot_landuse_overlaps — one row per plantation_info[].lu_polygon[],
--    matched to its plot via the SAME positional correlation as step 2
--    (plantation_info[i] <-> frontend_plots[i] by array position).
-- ============================================================================
INSERT INTO tbl_plot_landuse_overlaps (plot_id, lu_class, lu_class_desc_th, geometry, area_m2, area_percent, created_at)
SELECT
  pl.id,
  lu.value->>'lu_class',
  lu.value->>'lu_class_desc_th',
  ST_SetSRID(ST_GeomFromGeoJSON(lu.value->>'geometry'), 4326),
  NULLIF(lu.value->>'area_m2', '')::double precision,
  NULLIF(lu.value->>'area_percent', '')::double precision,
  cp.created_at
FROM carbon_projects cp
CROSS JOIN LATERAL jsonb_array_elements(
  CASE jsonb_typeof(cp.frontend_plots) WHEN 'array' THEN cp.frontend_plots ELSE '[]'::jsonb END
) WITH ORDINALITY AS fp(value, ord)
JOIN LATERAL jsonb_array_elements(
  CASE jsonb_typeof(cp.plantation_info) WHEN 'array' THEN cp.plantation_info ELSE '[]'::jsonb END
) WITH ORDINALITY AS pinfo(value, ord) ON pinfo.ord = fp.ord
CROSS JOIN LATERAL jsonb_array_elements(
  CASE jsonb_typeof(pinfo.value->'lu_polygon') WHEN 'array' THEN pinfo.value->'lu_polygon' ELSE '[]'::jsonb END
) AS lu(value)
JOIN tbl_plots pl
  ON pl.project_id = cp.id AND pl.polygon_id = fp.value->>'id'
WHERE lu.value->'geometry' IS NOT NULL
  AND lu.value->'geometry' != 'null'::jsonb;

-- ============================================================================
-- 4) tbl_plot_assessments — one row per backend_responses[] element, matched to
--    its plot by REAL ID (backend_responses[].polygon_id == tbl_plots.polygon_id,
--    both == frontend_plots[].id / polygons_payload[].id / stablePlotIds[i]).
--    No positional join needed here (unlike steps 2/3) since this id space is
--    shared for real. Every row is is_current = true: the source only ever
--    held one (the latest) response per polygon.
-- ============================================================================
INSERT INTO tbl_plot_assessments (plot_id, status, status_code, message, message_th, ci, assess_parameters, model_version, is_current, created_at)
SELECT
  pl.id,
  br.value->'status'->>'status',
  br.value->'status'->>'status_code',
  br.value->'status'->>'message',
  br.value->'status'->>'message_th',
  NULLIF(br.value->>'ci', '')::double precision,
  COALESCE(br.value->'assess_parameters', '{}'::jsonb),
  NULL,
  TRUE,
  cp.updated_at
FROM carbon_projects cp
CROSS JOIN LATERAL jsonb_array_elements(
  CASE jsonb_typeof(cp.backend_responses) WHEN 'array' THEN cp.backend_responses ELSE '[]'::jsonb END
) AS br(value)
JOIN tbl_plots pl
  ON pl.project_id = cp.id AND pl.polygon_id = br.value->>'polygon_id';

-- ============================================================================
-- 5) tbl_plot_carbon_yearly — one row per backend_responses[].carbon_profile[],
--    reached via the same REAL ID correlation used in step 4.
-- ============================================================================
INSERT INTO tbl_plot_carbon_yearly (
  assessment_id, year, year_at, age,
  stock_value, stock_ci, stock_ci_lower, stock_ci_upper,
  gain_value, gain_ci, gain_ci_lower, gain_ci_upper
)
SELECT
  pa.id,
  NULLIF(yr.value->>'year', '')::double precision::smallint,
  NULLIF(yr.value->>'year_at', '')::double precision::smallint,
  NULLIF(yr.value->>'age', '')::double precision,
  NULLIF(yr.value->'stocks'->>'value', '')::double precision,
  NULLIF(yr.value->'stocks'->>'ci', '')::double precision,
  NULLIF(yr.value->'stocks'->>'ci_lower', '')::double precision,
  NULLIF(yr.value->'stocks'->>'ci_upper', '')::double precision,
  NULLIF(yr.value->'gain'->>'value', '')::double precision,
  NULLIF(yr.value->'gain'->>'ci', '')::double precision,
  NULLIF(yr.value->'gain'->>'ci_lower', '')::double precision,
  NULLIF(yr.value->'gain'->>'ci_upper', '')::double precision
FROM carbon_projects cp
CROSS JOIN LATERAL jsonb_array_elements(
  CASE jsonb_typeof(cp.backend_responses) WHEN 'array' THEN cp.backend_responses ELSE '[]'::jsonb END
) AS br(value)
JOIN tbl_plots pl
  ON pl.project_id = cp.id AND pl.polygon_id = br.value->>'polygon_id'
JOIN tbl_plot_assessments pa
  ON pa.plot_id = pl.id AND pa.is_current
CROSS JOIN LATERAL jsonb_array_elements(
  CASE jsonb_typeof(br.value->'carbon_profile') WHEN 'array' THEN br.value->'carbon_profile' ELSE '[]'::jsonb END
) AS yr(value)
ON CONFLICT (assessment_id, year) DO NOTHING;

-- Migration summary, printed before commit
DO $$
DECLARE
  n_source_projects  BIGINT;
  n_projects         BIGINT;
  n_source_plots     BIGINT;
  n_plots            BIGINT;
  n_overlaps         BIGINT;
  n_assessments      BIGINT;
  n_yearly           BIGINT;
  mismatch           RECORD;
  n_mismatched       INT := 0;
BEGIN
  SELECT COUNT(*) INTO n_source_projects FROM carbon_projects;
  SELECT COUNT(*) INTO n_projects        FROM tbl_projects;
  SELECT COUNT(*) INTO n_source_plots
    FROM carbon_projects cp,
         LATERAL jsonb_array_elements(
           CASE jsonb_typeof(cp.frontend_plots) WHEN 'array' THEN cp.frontend_plots ELSE '[]'::jsonb END
         ) AS fp(value);
  SELECT COUNT(*) INTO n_plots       FROM tbl_plots;
  SELECT COUNT(*) INTO n_overlaps    FROM tbl_plot_landuse_overlaps;
  SELECT COUNT(*) INTO n_assessments FROM tbl_plot_assessments;
  SELECT COUNT(*) INTO n_yearly      FROM tbl_plot_carbon_yearly;

  RAISE NOTICE 'carbon_projects: % rows -> tbl_projects: % rows', n_source_projects, n_projects;
  RAISE NOTICE 'frontend_plots[] entries: % -> tbl_plots: % rows (% skipped: missing id or geometry)',
    n_source_plots, n_plots, n_source_plots - n_plots;
  RAISE NOTICE 'tbl_plot_landuse_overlaps: % rows, tbl_plot_assessments: % rows, tbl_plot_carbon_yearly: % rows',
    n_overlaps, n_assessments, n_yearly;

  -- Positional join sanity check: plantation_info has no shared id with the
  -- other three arrays, so steps 2/3 join it to frontend_plots[i] BY ARRAY
  -- POSITION. Flag any project whose frontend_plots/plantation_info arrays
  -- are not the same length -- those cannot be reliably correlated by
  -- position and should be reviewed by hand. polygons_payload and
  -- backend_responses are NOT part of this check -- they join by real id and
  -- are unaffected by array-length mismatches.
  FOR mismatch IN
    SELECT
      cp.id,
      jsonb_array_length(CASE jsonb_typeof(cp.frontend_plots) WHEN 'array' THEN cp.frontend_plots ELSE '[]'::jsonb END) AS n_frontend,
      jsonb_array_length(CASE jsonb_typeof(cp.plantation_info) WHEN 'array' THEN cp.plantation_info ELSE '[]'::jsonb END) AS n_plantation
    FROM carbon_projects cp
  LOOP
    IF mismatch.n_frontend != mismatch.n_plantation THEN
      n_mismatched := n_mismatched + 1;
      RAISE WARNING 'carbon_projects.id=% has mismatched array lengths -- frontend_plots: %, plantation_info: % -- positional join may be wrong for this project''s geometry/status/tbl_plot_landuse_overlaps, review by hand',
        mismatch.id, mismatch.n_frontend, mismatch.n_plantation;
    END IF;
  END LOOP;

  IF n_mismatched = 0 THEN
    RAISE NOTICE 'positional join check: all % project(s) have matching frontend_plots/plantation_info array lengths', n_source_projects;
  ELSE
    RAISE NOTICE 'positional join check: % of % project(s) flagged above -- review before trusting their tbl_plots.geometry/status and tbl_plot_landuse_overlaps rows', n_mismatched, n_source_projects;
  END IF;
END $$;

COMMIT;