-- ============================================================================
-- Migration 027 — tbl_plots: add province_th, district_th, subdistrict_th
-- ============================================================================
-- Run against an EXISTING database:
--
--   docker compose exec -T postgis \
--     psql -U keptcarbon -d keptcarbon -v ON_ERROR_STOP=1 \
--     < postgis/migrations/027_tbl_plots_admin_area.sql
--
-- Stores which จังหวัด/อำเภอ/ตำบล each plot is in, so the plot page can show
-- "ต.… อ.… จ.…" and plots can be searched/grouped by area without a spatial
-- join at read time.
--
-- province_th is stored even though province_code (geo_thailand.p_code)
-- already exists: province_code is set by app code at assessment time from
-- the largest overlap in geo_thailand (and some save paths write ""/"UNK"),
-- so it can disagree with the district for a plot on a province border.
-- All three columns here come from the same geo_subdistrict row, so they
-- always agree. province_code stays as the carbon-config key.
--
-- The values are filled by a trigger, not by application code, so every
-- writer (map-draw save, my-plots edit, guest claim, ...) gets them for free
-- and they follow the geometry whenever it changes. The plot is located by
-- ST_PointOnSurface(geometry) — always inside the polygon — so a plot that
-- straddles a border still gets exactly one subdistrict.
--
-- fn_admin_area_at(point) is the shared lookup; the backend's
-- POST /api/v1/plots/locate uses the same geo_subdistrict data.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tbl_plots' AND column_name = 'district_th'
  ) THEN
    RAISE EXCEPTION 'tbl_plots.district_th already exists -- migration 027 already applied, aborting.';
  END IF;
END $$;

ALTER TABLE public.tbl_plots
  ADD COLUMN province_th VARCHAR(100),
  ADD COLUMN district_th VARCHAR(100),
  ADD COLUMN subdistrict_th VARCHAR(100);

CREATE INDEX idx_plots_admin_area
  ON public.tbl_plots (province_th, district_th, subdistrict_th);

-- Administrative area containing a point. Bangkok is one geo_subdistrict
-- polygon with no district/subdistrict names, so those can be NULL.
CREATE OR REPLACE FUNCTION public.fn_admin_area_at(p geometry)
RETURNS TABLE (region_th text, province_th text, district_th text, subdistrict_th text)
LANGUAGE sql STABLE AS $$
  SELECT s.region_th, s.province_th, s.district_th, s.name_th
  FROM public.geo_subdistrict s
  WHERE ST_Intersects(s.geom, p)
  ORDER BY s.id
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.set_plot_admin_area()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.geometry IS NOT DISTINCT FROM OLD.geometry
     AND NEW.province_th IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT a.province_th, a.district_th, a.subdistrict_th
    INTO NEW.province_th, NEW.district_th, NEW.subdistrict_th
  FROM public.fn_admin_area_at(ST_PointOnSurface(NEW.geometry)) a;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_plots_admin_area
  BEFORE INSERT OR UPDATE ON public.tbl_plots
  FOR EACH ROW EXECUTE FUNCTION public.set_plot_admin_area();

-- Backfill existing plots. Skip the updated_at trigger so the backfill
-- doesn't make every plot look recently edited.
ALTER TABLE public.tbl_plots DISABLE TRIGGER trg_plots_updated_at;

UPDATE public.tbl_plots pl
SET province_th = a.province_th,
    district_th = a.district_th,
    subdistrict_th = a.subdistrict_th
FROM public.tbl_plots p
CROSS JOIN LATERAL public.fn_admin_area_at(ST_PointOnSurface(p.geometry)) a
WHERE pl.id = p.id;

ALTER TABLE public.tbl_plots ENABLE TRIGGER trg_plots_updated_at;

DO $$
DECLARE
  n_plots BIGINT;
  n_area  BIGINT;
BEGIN
  SELECT COUNT(*) INTO n_plots FROM public.tbl_plots;
  SELECT COUNT(*) INTO n_area FROM public.tbl_plots WHERE province_th IS NOT NULL;
  RAISE NOTICE 'tbl_plots: % rows, % with admin area backfilled', n_plots, n_area;
END $$;

COMMIT;
