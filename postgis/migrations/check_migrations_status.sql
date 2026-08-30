-- Read-only probe. Prints RUN / DONE / SKIP for migrations 006-024.
-- Usage (dev server, from repo root):
--   docker exec -i keptcarbon-postgis \
--     psql -U postgres -d keptcarbon_dev < postgis/migrations/check_migrations_status.sql

DO $$
DECLARE n bigint;
BEGIN
  RAISE NOTICE '=== migration status (RUN = still needs applying) ===';

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='tbl_users' AND column_name='reset_token')
  THEN RAISE NOTICE '006_users_reset_token ................... DONE';
  ELSE RAISE NOTICE '006_users_reset_token ................... RUN';  END IF;

  IF to_regclass('public.geo_planting_year') IS NOT NULL
     OR to_regclass('public.geo_establishment_year') IS NOT NULL
  THEN RAISE NOTICE '007_geo_planting_year .................. DONE (raster load may still be needed)';
  ELSE RAISE NOTICE '007_geo_planting_year .................. RUN';  END IF;

  IF to_regclass('public.tbl_biomass_profile') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.tbl_biomass_profile' INTO n;
    IF n > 0 THEN RAISE NOTICE '008_biomass_profile_data ............... DONE (% rows)', n;
    ELSE          RAISE NOTICE '008_biomass_profile_data ............... RUN';  END IF;
  ELSE RAISE NOTICE '008_biomass_profile_data ............... RUN (table missing)';  END IF;

  IF to_regclass('public.tbl_projects') IS NOT NULL
  THEN RAISE NOTICE '009_plot_carbon_normalization .......... DONE';
  ELSE RAISE NOTICE '009_plot_carbon_normalization .......... RUN';  END IF;

  IF to_regclass('public.tbl_projects') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.tbl_projects' INTO n;
    RAISE NOTICE '010_backfill_plot_carbon_data .......... tbl_projects has % rows', n;
  ELSE RAISE NOTICE '010_backfill_plot_carbon_data .......... RUN after 009';  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='tbl_plots' AND column_name='owner_name')
  THEN RAISE NOTICE '011_add_plot_owner_name ................ DONE';
  ELSE RAISE NOTICE '011_add_plot_owner_name ................ RUN';  END IF;

  IF to_regclass('public.carbon_projects_deprecated_20260816') IS NOT NULL
     AND to_regclass('public.carbon_projects') IS NULL
  THEN RAISE NOTICE '012_retire_carbon_projects ............. DONE';
  ELSE RAISE NOTICE '012_retire_carbon_projects ............. RUN (deploy app first)';  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='geo_landuse' AND column_name='lu_id_l1')
  THEN RAISE NOTICE '013_drop_geo_landuse_lu_id_columns ..... RUN';
  ELSE RAISE NOTICE '013_drop_geo_landuse_lu_id_columns ..... DONE';  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='tbl_biomass_profile' AND column_name='version')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='tbl_biomass_profile' AND column_name='created_at')
  THEN RAISE NOTICE '014_biomass_profile_version_column .... DONE';
  ELSE RAISE NOTICE '014_biomass_profile_version_column .... RUN';  END IF;

  IF to_regclass('public.tbl_tree_density') IS NOT NULL
  THEN RAISE NOTICE '015_tbl_tree_density .................. DONE';
  ELSE RAISE NOTICE '015_tbl_tree_density .................. RUN';  END IF;

  IF to_regclass('public.tbl_region_config') IS NOT NULL
  THEN RAISE NOTICE '016_tbl_region_config ................. DONE';
  ELSE RAISE NOTICE '016_tbl_region_config ................. RUN';  END IF;

  IF to_regclass('public.tbl_rubber_clone') IS NOT NULL
  THEN RAISE NOTICE '017_tbl_rubber_clone .................. DONE';
  ELSE RAISE NOTICE '017_tbl_rubber_clone .................. RUN';  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='tbl_tree_density' AND column_name='tree_density_rai')
  THEN RAISE NOTICE '018_tbl_tree_density_add_rai .......... DONE';
  ELSE RAISE NOTICE '018_tbl_tree_density_add_rai .......... RUN (after 015)';  END IF;

  IF to_regclass('public.tbl_planting_year_dist') IS NOT NULL
  THEN RAISE NOTICE '019_tbl_planting_year_dist ............ DONE';
  ELSE RAISE NOTICE '019_tbl_planting_year_dist ............ RUN';  END IF;

  IF to_regclass('public.geo_establishment_year') IS NOT NULL
  THEN RAISE NOTICE '020_rename_geo_establishment_year ..... RUN (old table present)';
  ELSE RAISE NOTICE '020_rename_geo_establishment_year ..... SKIP';  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='tbl_planting_year_dist' AND column_name='amphoe_idn')
  THEN RAISE NOTICE '021_rename_tbl_planting_year_dist_cols  RUN (old columns present)';
  ELSE RAISE NOTICE '021_rename_tbl_planting_year_dist_cols  SKIP';  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='tbl_region_config' AND column_name='est_year_version')
  THEN RAISE NOTICE '022_rename_tbl_region_config_est_year . RUN (old column present)';
  ELSE RAISE NOTICE '022_rename_tbl_region_config_est_year . SKIP';  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='tbl_region_config' AND column_name='biomass_profile_version')
  THEN RAISE NOTICE '023_tbl_region_config_biomass_profile_v DONE';
  ELSE RAISE NOTICE '023_tbl_region_config_biomass_profile_v RUN (after 016)';  END IF;

  IF to_regclass('public.tbl_biomass_profile') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.tbl_biomass_profile WHERE version IS NULL' INTO n;
    IF n > 0 THEN RAISE NOTICE '024_tbl_biomass_profile_backfill_versn RUN (% NULL-version rows)', n;
    ELSE          RAISE NOTICE '024_tbl_biomass_profile_backfill_versn DONE';  END IF;
  ELSE RAISE NOTICE '024_tbl_biomass_profile_backfill_versn RUN after 008/014';  END IF;
END $$;
