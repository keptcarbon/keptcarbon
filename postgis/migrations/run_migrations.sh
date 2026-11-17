#!/usr/bin/env bash
# ============================================================================
# run_migrations.sh — bring an existing KeptCarbon database up to the schema
#                     the current code expects, in ONE transaction.
# ============================================================================
# Run from the repo root on the server, after `git pull` of the code you are
# about to deploy and BEFORE starting the new containers:
#
#   ./postgis/migrations/run_migrations.sh                 # production (keptcarbon)
#   ./postgis/migrations/run_migrations.sh --db keptcarbon_dev
#   ./postgis/migrations/run_migrations.sh --dry-run       # rehearse only
#
# What it does
#   1. Checks the database is reachable and already has the 001-010 baseline
#      (tbl_users.uuid, tbl_projects/tbl_plots, geo_*, tbl_biomass_profile).
#   2. REHEARSAL: runs every pending migration inside a transaction and then
#      ROLLS BACK, printing APPLY / skip for each step. Nothing is changed.
#   3. Asks for confirmation (skip with --yes).
#   4. pg_dump -Fc backup to ./backups/ (skip with --no-backup).
#   5. Runs the same steps again in ONE transaction and COMMITs. If any step
#      or the final schema check fails, nothing is committed.
#   6. Prints check_migrations_status.sql and data warnings (empty rasters, …).
#
# Each migration is only applied when its probe says it is still needed, so
# the script is safe to re-run: on an up-to-date database every step is "skip".
# 031 is never run (034 drops the column it adds). 039 runs between 032 and
# 033 because 033/035 need the tbl_landuse / tbl_planting_year names.
#
# Overrides for non-docker use / testing:
#   PSQL_CMD="psql -h host -U user -d db"   PGDUMP_CMD="pg_dump -h host -U user -d db"
# ============================================================================
set -euo pipefail

DB=keptcarbon
CONTAINER=keptcarbon-postgis
PGUSER_NAME=keptcarbon
DRY_RUN=0
ASSUME_YES=0
DO_BACKUP=1
BACKUP_DIR=./backups
LOCK_TIMEOUT=15s

usage() { sed -n '2,32p' "$0" | sed 's/^# \{0,1\}//'; exit "${1:-0}"; }

while [ $# -gt 0 ]; do
  case "$1" in
    --db)           DB="$2"; shift 2 ;;
    --container)    CONTAINER="$2"; shift 2 ;;
    --user)         PGUSER_NAME="$2"; shift 2 ;;
    --dry-run)      DRY_RUN=1; shift ;;
    -y|--yes)       ASSUME_YES=1; shift ;;
    --no-backup)    DO_BACKUP=0; shift ;;
    --backup-dir)   BACKUP_DIR="$2"; shift 2 ;;
    --lock-timeout) LOCK_TIMEOUT="$2"; shift 2 ;;
    -h|--help)      usage 0 ;;
    *) echo "Unknown option: $1" >&2; usage 1 ;;
  esac
done

MIG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PSQL_CMD="${PSQL_CMD:-docker exec -i $CONTAINER psql -U $PGUSER_NAME -d $DB}"
PGDUMP_CMD="${PGDUMP_CMD:-docker exec -i $CONTAINER pg_dump -U $PGUSER_NAME -d $DB}"

say()  { printf '\n\033[1m== %s\033[0m\n' "$*"; }
die()  { printf '\n\033[31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }
psql_run() { $PSQL_CMD -X -v ON_ERROR_STOP=1 "$@"; }

# ----------------------------------------------------------------------------
# Steps, in the order they are applied:  "<file>|<probe: true = still needed>"
# Probes may use pg_temp.has_tbl(name), pg_temp.has_col(table, column) and
# pg_temp.q(sql) (runs a boolean query via EXECUTE, so it is only parsed once
# the earlier steps have created the tables it reads).
# ----------------------------------------------------------------------------
STEPS=(
  "006_users_reset_token.sql|NOT pg_temp.has_col('tbl_users','reset_token') OR to_regclass('public.idx_tbl_users_reset_token') IS NULL"
  "011_add_plot_owner_name.sql|pg_temp.has_tbl('carbon_projects') AND NOT pg_temp.has_col('tbl_plots','owner_name') AND NOT pg_temp.has_col('tbl_plots','plot_note')"
  "012_retire_carbon_projects.sql|pg_temp.has_tbl('carbon_projects')"
  "013_drop_geo_landuse_lu_id_columns.sql|pg_temp.has_col('geo_landuse','lu_id_l1')"
  "014_biomass_profile_version_column.sql|pg_temp.has_col('tbl_biomass_profile','created_at')"
  "015_tbl_tree_density.sql|NOT pg_temp.has_tbl('tbl_tree_density')"
  "016_tbl_region_config.sql|NOT pg_temp.has_tbl('tbl_region_config')"
  "017_tbl_rubber_clone.sql|NOT pg_temp.has_tbl('tbl_rubber_clone')"
  "018_tbl_tree_density_add_rai.sql|NOT pg_temp.has_col('tbl_tree_density','tree_density_rai')"
  "019_tbl_planting_year_dist.sql|NOT pg_temp.has_tbl('tbl_planting_year_dist')"
  "020_rename_geo_establishment_year.sql|pg_temp.has_tbl('geo_establishment_year')"
  "021_rename_tbl_planting_year_dist_columns.sql|pg_temp.has_col('tbl_planting_year_dist','amphoe_idn')"
  "022_rename_tbl_region_config_est_year_version.sql|pg_temp.has_col('tbl_region_config','est_year_version')"
  "023_tbl_region_config_biomass_profile_version.sql|NOT pg_temp.has_col('tbl_region_config','biomass_profile_version')"
  "024_tbl_biomass_profile_backfill_version.sql|pg_temp.q('SELECT EXISTS (SELECT 1 FROM tbl_biomass_profile WHERE version IS NULL)')"
  "025_tbl_plots_growth_model_allometry.sql|NOT pg_temp.has_col('tbl_plots','growth_model')"
  "026_geo_thailand_region_reclassify.sql|pg_temp.q(\$q\$SELECT EXISTS (SELECT 1 FROM geo_thailand WHERE (p_code IN ('CHB','RAY','CTB','TRT','CCS','PCN','SKW') AND region IS DISTINCT FROM 'E') OR (p_code IN ('TAK','RCB','KCB','PBR','PKK') AND region IS DISTINCT FROM 'W'))\$q\$)"
  "027_tbl_plots_admin_area.sql|NOT pg_temp.has_col('tbl_plots','district_th')"
  "028_rename_tbl_plots_owner_name_plot_note.sql|pg_temp.has_col('tbl_plots','owner_name') AND NOT pg_temp.has_col('tbl_plots','plot_note')"
  "029_tbl_biomass_profile_version_unique_key.sql|NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey) WHERE c.conname = 'uq_biomass_profile_key' AND a.attname = 'version')"
  "030_drop_unused_plot_assessment_columns.sql|pg_temp.has_col('tbl_plot_assessments','message_th') OR pg_temp.has_col('tbl_plot_assessments','ci') OR pg_temp.has_col('tbl_plot_assessments','model_version')"
  "031_tbl_region_config_utm_epsg.sql|false"
  "032_growth_model_allometry_codes.sql|pg_temp.q(\$q\$SELECT EXISTS (SELECT 1 FROM tbl_biomass_profile WHERE growth_model NOT LIKE 'anchored\_%' OR allometry = 'hytonen_2018') OR EXISTS (SELECT 1 FROM tbl_region_config WHERE default_growth NOT LIKE 'anchored\_%' OR default_allometry = 'hytonen_2018') OR EXISTS (SELECT 1 FROM tbl_plots WHERE (growth_model <> '' AND growth_model NOT LIKE 'anchored\_%') OR allometry = 'hytonen_2018') OR EXISTS (SELECT 1 FROM tbl_plot_assessments WHERE (assess_parameters #>> '{growth_model,value}' <> '' AND assess_parameters #>> '{growth_model,value}' NOT LIKE 'anchored\_%') OR assess_parameters #>> '{allometry,value}' = 'hytonen_2018')\$q\$)"
  "039_init_only_gaps.sql|pg_temp.has_tbl('geo_landuse') OR pg_temp.has_tbl('geo_planting_year') OR NOT pg_temp.has_tbl('tbl_region_config_history') OR NOT pg_temp.has_col('tbl_region_config','planting_year_dist_version') OR EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.tbl_region_config'::regclass AND attname = 'planting_year_version' AND attnotnull)"
  "033_tbl_dataset_version.sql|NOT pg_temp.has_tbl('tbl_dataset_version') OR NOT pg_temp.has_tbl('tbl_dataset_import')"
  "034_drop_tbl_region_config_utm_epsg.sql|pg_temp.has_col('tbl_region_config','utm_epsg')"
  "035_tbl_plots_assessment_geometry.sql|NOT pg_temp.has_col('tbl_plots','assessment_geometry') OR NOT pg_temp.has_col('tbl_plots','assessment_lu_version')"
  "036_drop_superseded_carbon_yearly.sql|pg_temp.q('SELECT EXISTS (SELECT 1 FROM tbl_plot_carbon_yearly y JOIN tbl_plot_assessments a ON a.id = y.assessment_id WHERE NOT a.is_current)')"
  "037_geo_subdistrict_province_th_idx.sql|to_regclass('public.geo_subdistrict_province_th_idx') IS NULL"
  "038_tbl_role_quota.sql|NOT pg_temp.has_tbl('tbl_role_quota') OR NOT pg_temp.has_tbl('tbl_role_quota_history')"
  "040_tbl_kitty_blog_visibility.sql|NOT pg_temp.has_tbl('tbl_kitty_blog_visibility')"
  "041_tbl_blog.sql|NOT pg_temp.has_tbl('tbl_blog')"
  "042_tbl_blog_tag.sql|NOT pg_temp.has_tbl('tbl_blog_tag') OR NOT pg_temp.has_tbl('tbl_blog_tag_map')"
  "043_tbl_blog_image.sql|NOT pg_temp.has_tbl('tbl_blog_image')"
  "044_tbl_kitty_book.sql|NOT pg_temp.has_tbl('tbl_kitty_section') OR NOT pg_temp.has_tbl('tbl_kitty_page') OR NOT pg_temp.has_tbl('tbl_kitty_page_image')"
)

HELPERS=$(cat <<'SQL'
CREATE FUNCTION pg_temp.has_tbl(t text) RETURNS boolean LANGUAGE sql AS
  $f$ SELECT to_regclass('public.' || quote_ident(t)) IS NOT NULL $f$;
CREATE FUNCTION pg_temp.has_col(t text, c text) RETURNS boolean LANGUAGE sql AS
  $f$ SELECT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema = 'public' AND table_name = t AND column_name = c) $f$;
CREATE FUNCTION pg_temp.q(sql text) RETURNS boolean LANGUAGE plpgsql AS
  $f$ DECLARE r boolean; BEGIN EXECUTE sql INTO r; RETURN coalesce(r, false); END $f$;
SQL
)

# Baseline the steps above build on (migrations 001-010 + the data loads).
# Anything missing here needs 000_bootstrap / 001_DEPLOY_RUNBOOK.md first.
BASELINE_SQL=$(cat <<'SQL'
DO $$
DECLARE missing text[] := '{}';
BEGIN
  IF NOT pg_temp.has_col('tbl_users','uuid')          THEN missing := array_append(missing, 'tbl_users.uuid (001 / 000 bootstrap)'::text); END IF;
  IF NOT pg_temp.has_tbl('geo_thailand')               THEN missing := array_append(missing, 'geo_thailand (002)'::text); END IF;
  IF NOT pg_temp.has_tbl('geo_subdistrict')            THEN missing := array_append(missing, 'geo_subdistrict'::text); END IF;
  IF NOT (pg_temp.has_col('geo_landuse','lu_year') OR pg_temp.has_col('tbl_landuse','lu_year'))
                                                       THEN missing := array_append(missing, 'geo_landuse with lu_year (004/005)'::text); END IF;
  IF NOT (pg_temp.has_tbl('geo_planting_year') OR pg_temp.has_tbl('tbl_planting_year') OR pg_temp.has_tbl('geo_establishment_year'))
                                                       THEN missing := array_append(missing, 'geo_planting_year (007)'::text); END IF;
  IF NOT pg_temp.has_tbl('tbl_biomass_profile')        THEN missing := array_append(missing, 'tbl_biomass_profile (000 bootstrap)'::text); END IF;
  IF NOT (pg_temp.has_tbl('tbl_projects') AND pg_temp.has_tbl('tbl_plots') AND pg_temp.has_tbl('tbl_plot_assessments')
          AND pg_temp.has_tbl('tbl_plot_landuse_overlaps') AND pg_temp.has_tbl('tbl_plot_carbon_yearly'))
                                                       THEN missing := array_append(missing, 'tbl_projects/tbl_plots/... (009/010)'::text); END IF;
  IF cardinality(missing) > 0 THEN
    RAISE EXCEPTION 'Database is older than this script supports. Missing: %. Follow postgis/migrations/001_DEPLOY_RUNBOOK.md / 000_bootstrap_production_to_current.sql first.',
      array_to_string(missing, ', ');
  END IF;
END $$;
SQL
)

# Final schema check, run inside the transaction before COMMIT.
VERIFY_SQL=$(cat <<'SQL'
DO $$
DECLARE missing text[] := '{}'; t text; c text[];
BEGIN
  FOREACH t IN ARRAY ARRAY['tbl_landuse','tbl_planting_year','tbl_tree_density','tbl_region_config',
    'tbl_rubber_clone','tbl_planting_year_dist','tbl_dataset_version','tbl_dataset_import',
    'tbl_region_config_history','tbl_role_quota','tbl_role_quota_history',
    'tbl_kitty_blog_visibility','tbl_blog','tbl_blog_tag','tbl_blog_tag_map','tbl_blog_image',
    'tbl_kitty_section','tbl_kitty_page','tbl_kitty_page_image'] LOOP
    IF NOT pg_temp.has_tbl(t) THEN missing := missing || t; END IF;
  END LOOP;
  FOREACH c SLICE 1 IN ARRAY ARRAY[
    ['tbl_users','reset_token'], ['tbl_biomass_profile','version'], ['tbl_tree_density','tree_density_rai'],
    ['tbl_region_config','planting_year_version'], ['tbl_region_config','biomass_profile_version'],
    ['tbl_region_config','planting_year_dist_version'], ['tbl_planting_year_dist','district_idn'],
    ['tbl_plots','growth_model'], ['tbl_plots','allometry'], ['tbl_plots','district_th'],
    ['tbl_plots','plot_note'], ['tbl_plots','assessment_geometry'], ['tbl_plots','assessment_lu_version']] LOOP
    IF NOT pg_temp.has_col(c[1], c[2]) THEN missing := missing || (c[1] || '.' || c[2]); END IF;
  END LOOP;
  FOREACH t IN ARRAY ARRAY['geo_landuse','geo_planting_year','geo_establishment_year','carbon_projects'] LOOP
    IF pg_temp.has_tbl(t) THEN missing := missing || ('old table still present: ' || t); END IF;
  END LOOP;
  IF pg_temp.has_col('tbl_region_config','utm_epsg') THEN missing := array_append(missing, 'tbl_region_config.utm_epsg still present'::text); END IF;
  IF pg_temp.has_col('tbl_plot_assessments','message_th') THEN missing := array_append(missing, 'tbl_plot_assessments.message_th still present'::text); END IF;
  IF cardinality(missing) > 0 THEN
    RAISE EXCEPTION 'Final schema check failed: %', array_to_string(missing, '; ');
  END IF;
  RAISE NOTICE 'Final schema check passed.';
END $$;
SQL
)

# Build the whole migration as one psql script. $1 = COMMIT | ROLLBACK
build_script() {
  local finish="$1" entry file probe
  printf '%s\n' '\set ON_ERROR_STOP on' '\pset pager off' 'SET client_min_messages = warning;' 'BEGIN;'
  printf "SET LOCAL lock_timeout = '%s';\n" "$LOCK_TIMEOUT"
  printf '%s\n' "$HELPERS" "$BASELINE_SQL" 'SET client_min_messages = notice;'
  for entry in "${STEPS[@]}"; do
    file="${entry%%|*}"; probe="${entry#*|}"
    [ -f "$MIG_DIR/$file" ] || die "missing migration file $MIG_DIR/$file"
    printf 'SELECT (%s) AS need \\gset\n' "$probe"
    printf '\\if :need\n\\echo '"'"'  APPLY  %s'"'"'\n' "$file"
    # Each file carries its own BEGIN;/COMMIT; — drop those lines so every
    # step runs inside this script's single transaction instead.
    sed -E '/^[[:space:]]*(BEGIN|COMMIT);[[:space:]]*$/d' "$MIG_DIR/$file"
    printf '\n\\else\n\\echo '"'"'  skip   %s'"'"'\n\\endif\n' "$file"
  done
  printf '%s\n' "$VERIFY_SQL" "$finish;"
}

run_script() { build_script "$1" | psql_run -q; }

# ----------------------------------------------------------------------------
say "Target: database '$DB'  (${PSQL_CMD})"
psql_run -qAt -c "SELECT 'connected: ' || current_database() || ' / ' || split_part(version(), ',', 1)" \
  || die "cannot connect — is the '$CONTAINER' container running?"

say "Rehearsal (all steps in a transaction, then ROLLBACK — nothing is changed)"
if ! run_script ROLLBACK; then
  die "rehearsal failed — the database was NOT changed. Fix the error above before deploying."
fi

if [ "$DRY_RUN" = 1 ]; then
  say "Dry run finished. Nothing was changed."
  exit 0
fi

if [ "$ASSUME_YES" != 1 ]; then
  printf '\nApply the APPLY steps above to "%s" and COMMIT? [y/N] ' "$DB"
  read -r answer
  case "$answer" in y|Y|yes|YES) ;; *) echo "Aborted. Nothing was changed."; exit 1 ;; esac
fi

if [ "$DO_BACKUP" = 1 ]; then
  mkdir -p "$BACKUP_DIR"
  BACKUP_FILE="$BACKUP_DIR/${DB}_pre_migrate_$(date +%Y%m%d_%H%M%S).dump"
  say "Backup → $BACKUP_FILE"
  $PGDUMP_CMD -Fc > "$BACKUP_FILE" || { rm -f "$BACKUP_FILE"; die "pg_dump failed — nothing was changed."; }
  [ -s "$BACKUP_FILE" ] || die "backup file is empty — nothing was changed."
  ls -lh "$BACKUP_FILE" | awk '{print "   " $5}'
fi

say "Applying (one transaction)"
if ! run_script COMMIT; then
  die "migration failed and was rolled back — the database is unchanged.${BACKUP_FILE:+ Backup: $BACKUP_FILE}"
fi
say "Committed."

say "Status (postgis/migrations/check_migrations_status.sql)"
psql_run -q < "$MIG_DIR/check_migrations_status.sql" 2>&1 | sed -n 's/^.*NOTICE:  //p'

say "Data checks"
psql_run -qAt <<'SQL' | sed 's/^/   /'
SELECT 'tbl_planting_year raster tiles:  ' || count(*) || CASE WHEN count(*) = 0 THEN '   <-- EMPTY: load the raster (see deploy steps)' ELSE '' END FROM tbl_planting_year;
SELECT 'tbl_landuse features:            ' || count(*) || CASE WHEN count(*) = 0 THEN '   <-- EMPTY' ELSE '' END FROM tbl_landuse;
SELECT 'tbl_biomass_profile rows:        ' || count(*) || CASE WHEN count(*) = 0 THEN '   <-- EMPTY' ELSE '' END FROM tbl_biomass_profile;
SELECT 'tbl_planting_year_dist rows:     ' || count(*) || CASE WHEN count(*) = 0 THEN '   (empty: import via R&D > Data management to show provinces on dashboards)' ELSE '' END FROM tbl_planting_year_dist;
SELECT 'tbl_region_config:               ' || coalesce(string_agg(p_code || ' lu=' || lu_version || ' py=' || coalesce(planting_year_version::text, 'NULL') || ' bp=' || biomass_profile_version || ' ' || default_growth || '/' || default_allometry, '; '), '(no rows)') FROM tbl_region_config;
SQL
echo
echo "Done.${BACKUP_FILE:+ Backup kept at $BACKUP_FILE}"
