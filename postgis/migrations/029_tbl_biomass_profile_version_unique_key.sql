-- ============================================================================
-- Migration 029 — tbl_biomass_profile: make version part of the unique key
-- ============================================================================
-- Run against an EXISTING database (fresh volumes get the same schema from
-- postgis/init/05-tbl-biomass-profile.sql):
--
--   docker compose exec -T postgis \
--     psql -U keptcarbon -d keptcarbon -v ON_ERROR_STOP=1 \
--     < postgis/migrations/029_tbl_biomass_profile_version_unique_key.sql
--
-- uq_biomass_profile_key was (p_code, clone, growth_model, allometry, age),
-- so loading a second vintage (e.g. 'v2') of an existing curve would fail
-- with a duplicate-key error. Every lookup (CarbonService assess + sim)
-- already filters on version, so it belongs in the key.
--
-- Also repairs a row whose version drifted to '' (RAY / RRIM 600 /
-- chapman_richards / chiarawipa_2012, age 0 -- 'v1' in init/14), which left
-- that curve's v1 lookup without age 0, then makes version NOT NULL so a
-- row can't fall out of every lookup again.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.conname = 'uq_biomass_profile_key' AND a.attname = 'version'
  ) THEN
    RAISE EXCEPTION 'uq_biomass_profile_key already includes version -- migration 029 already applied, aborting.';
  END IF;
END $$;

UPDATE tbl_biomass_profile SET version = 'v1' WHERE version IS NULL OR version = '';

ALTER TABLE tbl_biomass_profile ALTER COLUMN version SET NOT NULL;

ALTER TABLE tbl_biomass_profile DROP CONSTRAINT uq_biomass_profile_key;
ALTER TABLE tbl_biomass_profile
  ADD CONSTRAINT uq_biomass_profile_key UNIQUE (p_code, clone, growth_model, allometry, version, age);

-- The unique key's index now covers (p_code, clone, growth_model, allometry, version)
-- prefix lookups, so the old 4-column lookup index is redundant.
DROP INDEX IF EXISTS idx_biomass_profile_lookup;

COMMIT;
