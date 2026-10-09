-- ============================================================================
-- Migration 035 — tbl_plots: add assessment_geometry, assessment_lu_version
-- ============================================================================
-- Run against an EXISTING database (after 009, 010):
--
--   docker compose exec -T postgis \
--     psql -U keptcarbon -d keptcarbon -v ON_ERROR_STOP=1 \
--     < postgis/migrations/035_tbl_plots_assessment_geometry.sql
--
-- LU data is now only a drawing aid: when a user draws a plot, the LU
-- overlaps show which parts of it are rubber/other land, and the user picks
-- the parts that are really their plot. Those parts, merged, are the plot's
-- assessment area -- stored here and sent as-is to /carbon/assess, which no
-- longer consults tbl_landuse. A later LU version therefore never changes a
-- saved plot's area.
--
--   assessment_geometry    the merged selected area (WGS84). NULL = not
--                          known; the app falls back to rebuilding it from
--                          the saved overlaps, as before.
--   assessment_lu_version  provenance only: the tbl_landuse lu_year the
--                          selection was made on. Together with
--                          selected_lu_classes and tbl_plot_landuse_overlaps
--                          (per-class area) it records what was included.
--
-- Backfill: the union of each plot's saved overlaps whose class it selected;
-- a plot with no saved overlaps uses its drawn geometry (what map-draw sends
-- in that case). lu_version is the province's current one -- each province
-- has had a single LU version so far.
--
-- Safe to re-run: columns are IF NOT EXISTS and only NULL rows are filled.
-- ============================================================================

BEGIN;

ALTER TABLE public.tbl_plots
  ADD COLUMN IF NOT EXISTS assessment_geometry geometry(Geometry, 4326),
  ADD COLUMN IF NOT EXISTS assessment_lu_version INTEGER;

UPDATE public.tbl_plots p
SET assessment_geometry = sub.geom,
    assessment_lu_version = rc.lu_version
FROM (
  SELECT o.plot_id,
         ST_CollectionExtract(ST_UnaryUnion(ST_Collect(ST_MakeValid(o.geometry))), 3) AS geom
  FROM public.tbl_plot_landuse_overlaps o
  JOIN public.tbl_plots pl ON pl.id = o.plot_id
  WHERE o.lu_class = ANY(pl.selected_lu_classes)
  GROUP BY o.plot_id
) sub
LEFT JOIN public.tbl_plots pp ON pp.id = sub.plot_id
LEFT JOIN public.tbl_region_config rc ON rc.p_code = pp.province_code
WHERE p.id = sub.plot_id
  AND p.assessment_geometry IS NULL
  AND NOT ST_IsEmpty(sub.geom);

UPDATE public.tbl_plots p
SET assessment_geometry = p.geometry
WHERE p.assessment_geometry IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.tbl_plot_landuse_overlaps o WHERE o.plot_id = p.id);

COMMIT;
