-- ============================================================================
-- geo_planting_year: per-pixel plantation planting-year rasters
-- ============================================================================
-- Queried by AgeMapService (backend/app/services/agemap_service.py) to derive
-- tree age cohorts within a drawn polygon. Pixel values in `rast` ARE
-- planting years (0 = no reliable year / "NA", see
-- get_plantation_year_of_planting_info); `year` is metadata identifying which
-- *vintage* of the raster a row belongs to, mirroring geo_landuse's
-- (p_code, lu_year) pattern -- lets a future re-ingestion add a newer vintage
-- per province without overwriting the old one. _latest_year() always reads
-- the most recent vintage.
--
-- The actual raster data is loaded by init/13-geo-planting-year.sh
-- (fresh volumes) or postgis/migrations/007_geo_planting_year.sql +
-- 020_rename_geo_planting_year.sql (existing databases, table created
-- under the old name then renamed) via raster2pgsql, not by this file -- SQL
-- text can't embed hundreds of MB of hex-encoded raster tiles sanely, so
-- unlike geo_landuse the data load is a separate step from the schema.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.geo_planting_year (
    rid   serial PRIMARY KEY,
    p_code text NOT NULL DEFAULT 'RAY',
    year  integer NOT NULL DEFAULT 2026,
    rast  raster
);

CREATE INDEX IF NOT EXISTS geo_planting_year_p_code_year_idx
    ON public.geo_planting_year (p_code, year);
