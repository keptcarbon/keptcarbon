-- ============================================================================
-- Migration 032 — model codes: growth_model 'anchored_' prefix, drop
--                 cubic_poly; allometry 'hytonen_2018' -> 'hytönen_2018'
-- ============================================================================
-- Run against an EXISTING database (after 008/014, 009, 011, 016):
--
--   docker compose exec -T postgis \
--     psql -U keptcarbon -d keptcarbon -v ON_ERROR_STOP=1 \
--     < postgis/migrations/032_growth_model_allometry_codes.sql
--
-- The growth models are the anchored variants, so the stored codes now say
-- so: 'weibull' -> 'anchored_weibull', 'chapman_richards' ->
-- 'anchored_chapman_richards', etc. The cubic polynomial model is retired and
-- its biomass profile rows are deleted. The Hytönen allometry code takes
-- the author's spelling: 'hytonen_2018' -> 'hytönen_2018' (U+00F6, NFC --
-- the app compares codes byte-for-byte, so a decomposed o + U+0308 won't match).
--
-- Both codes are lookup keys into tbl_biomass_profile, so every stored copy
-- is renamed together or assessments stop finding their profile:
--   - tbl_biomass_profile.growth_model / allometry       (the profile rows)
--   - tbl_region_config.default_growth / default_allometry (province default)
--   - tbl_plots.growth_model / allometry                 (per-plot user override)
--   - tbl_plot_assessments.assess_parameters             (growth_model.value,
--     allometry.value; the my-plots simulation re-sends them to /carbon/sim)
-- A plot override of 'cubic_poly' is cleared to NULL (= province default).
--
-- Safe to re-run: already-renamed values are left alone.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM tbl_region_config WHERE default_growth = 'cubic_poly') THEN
    RAISE EXCEPTION 'tbl_region_config has a province defaulting to cubic_poly -- choose another default before running 032.';
  END IF;
END $$;

DELETE FROM tbl_biomass_profile WHERE growth_model = 'cubic_poly';

UPDATE tbl_biomass_profile
   SET growth_model = 'anchored_' || growth_model
 WHERE growth_model NOT LIKE 'anchored\_%';

UPDATE tbl_region_config
   SET default_growth = 'anchored_' || default_growth
 WHERE default_growth NOT LIKE 'anchored\_%';

UPDATE tbl_plots SET growth_model = NULL WHERE growth_model = 'cubic_poly';

UPDATE tbl_plots
   SET growth_model = 'anchored_' || growth_model
 WHERE growth_model IS NOT NULL AND growth_model <> ''
   AND growth_model NOT LIKE 'anchored\_%';

UPDATE tbl_plot_assessments
   SET assess_parameters = jsonb_set(
         assess_parameters, '{growth_model,value}',
         to_jsonb('anchored_' || (assess_parameters #>> '{growth_model,value}')))
 WHERE assess_parameters #>> '{growth_model,value}' <> ''
   AND assess_parameters #>> '{growth_model,value}' NOT LIKE 'anchored\_%';

-- allometry: hytonen_2018 -> hytönen_2018
UPDATE tbl_biomass_profile SET allometry = 'hytönen_2018' WHERE allometry = 'hytonen_2018';

UPDATE tbl_region_config SET default_allometry = 'hytönen_2018' WHERE default_allometry = 'hytonen_2018';

UPDATE tbl_plots SET allometry = 'hytönen_2018' WHERE allometry = 'hytonen_2018';

UPDATE tbl_plot_assessments
   SET assess_parameters = jsonb_set(assess_parameters, '{allometry,value}', '"hytönen_2018"')
 WHERE assess_parameters #>> '{allometry,value}' = 'hytonen_2018';

COMMIT;
