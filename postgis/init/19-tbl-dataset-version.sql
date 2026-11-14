-- ==========================================================================
-- Dataset version log — every R&D dataset version imported through
-- /rnd/data-management, with its lifecycle status:
--   draft    (ฉบับร่าง)  just imported, not used by any calculation yet
--   active   (ใช้งานอยู่) the version tbl_region_config points at
--   archived (เก็บถาวร)  was active before; kept forever as history/rollback
-- Activating a version archives the previous active one and updates
-- tbl_region_config in the same transaction (POST
-- /api/rnd/datasets/[id]/activate). planting_year_distribution has no
-- activate action of its own: it is active when its lu_year/plaining_year
-- pair matches the active LULC + Planting Year maps.
-- ==========================================================================

CREATE TABLE IF NOT EXISTS tbl_dataset_version (
  id            SERIAL       PRIMARY KEY,
  category      VARCHAR(40)  NOT NULL
    CONSTRAINT chk_dataset_version_category
    CHECK (category IN ('planting_year_map', 'lulc_map', 'biomass_profile', 'planting_year_distribution')),
  p_code        VARCHAR(10)  NOT NULL,
  -- planting_year_map: tbl_planting_year.year      e.g. '2026'
  -- lulc_map:          tbl_landuse.lu_year         e.g. '2567'
  -- biomass_profile:   tbl_biomass_profile.version e.g. 'v1'
  -- planting_year_distribution: '<lu_year>/<plaining_year>' e.g. '2567/2026'
  version       VARCHAR(50)  NOT NULL,
  status        VARCHAR(10)  NOT NULL DEFAULT 'draft'
    CONSTRAINT chk_dataset_version_status CHECK (status IN ('draft', 'active', 'archived')),
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_by    INTEGER      REFERENCES tbl_users(id) ON DELETE SET NULL,
  activated_at  TIMESTAMPTZ,
  activated_by  INTEGER      REFERENCES tbl_users(id) ON DELETE SET NULL,
  archived_at   TIMESTAMPTZ,
  CONSTRAINT uq_dataset_version UNIQUE (category, p_code, version)
);

-- At most one version in use per category + province.
CREATE UNIQUE INDEX IF NOT EXISTS uq_dataset_version_one_active
  ON tbl_dataset_version (category, p_code) WHERE status = 'active';

-- One row per uploaded file. A biomass_profile version is built from several
-- files (one per clone / growth model / allometry), the other categories
-- from exactly one.
CREATE TABLE IF NOT EXISTS tbl_dataset_import (
  id                  SERIAL       PRIMARY KEY,
  dataset_version_id  INTEGER      NOT NULL REFERENCES tbl_dataset_version(id) ON DELETE CASCADE,
  file_name           VARCHAR(255) NOT NULL,
  row_count           INTEGER      NOT NULL,
  detail              JSONB,       -- biomass_profile: {"clone", "growthModel", "allometry"}
  imported_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  imported_by         INTEGER      REFERENCES tbl_users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_dataset_import_version ON tbl_dataset_import (dataset_version_id);

-- Backfill: register every dataset already in the data tables. The version
-- tbl_region_config points at is 'active'; any other version of a configured
-- province is 'archived' (it predates this log, so it may have been used
-- before — never offered for deletion). A province with no tbl_region_config
-- row has never been used by a calculation, so its versions are 'draft'.
INSERT INTO tbl_dataset_version (category, p_code, version, status, activated_at, archived_at)
SELECT 'planting_year_map', g.p_code, g.year::text,
       CASE WHEN rc.planting_year_version = g.year THEN 'active' WHEN rc.p_code IS NULL THEN 'draft' ELSE 'archived' END,
       CASE WHEN rc.planting_year_version = g.year THEN NOW() END,
       CASE WHEN rc.planting_year_version = g.year OR rc.p_code IS NULL THEN NULL ELSE NOW() END
FROM (SELECT DISTINCT p_code, year FROM tbl_planting_year) g
LEFT JOIN tbl_region_config rc ON rc.p_code = g.p_code
ON CONFLICT (category, p_code, version) DO NOTHING;

INSERT INTO tbl_dataset_version (category, p_code, version, status, activated_at, archived_at)
SELECT 'lulc_map', g.p_code, g.lu_year::text,
       CASE WHEN rc.lu_version = g.lu_year THEN 'active' WHEN rc.p_code IS NULL THEN 'draft' ELSE 'archived' END,
       CASE WHEN rc.lu_version = g.lu_year THEN NOW() END,
       CASE WHEN rc.lu_version = g.lu_year OR rc.p_code IS NULL THEN NULL ELSE NOW() END
FROM (SELECT DISTINCT p_code, lu_year FROM tbl_landuse) g
LEFT JOIN tbl_region_config rc ON rc.p_code = g.p_code
ON CONFLICT (category, p_code, version) DO NOTHING;

INSERT INTO tbl_dataset_version (category, p_code, version, status, activated_at, archived_at)
SELECT 'biomass_profile', b.p_code, b.version,
       CASE WHEN rc.biomass_profile_version = b.version THEN 'active' WHEN rc.p_code IS NULL THEN 'draft' ELSE 'archived' END,
       CASE WHEN rc.biomass_profile_version = b.version THEN NOW() END,
       CASE WHEN rc.biomass_profile_version = b.version OR rc.p_code IS NULL THEN NULL ELSE NOW() END
FROM (SELECT DISTINCT p_code, version FROM tbl_biomass_profile) b
LEFT JOIN tbl_region_config rc ON rc.p_code = b.p_code
ON CONFLICT (category, p_code, version) DO NOTHING;

INSERT INTO tbl_dataset_version (category, p_code, version, status, activated_at, archived_at)
SELECT 'planting_year_distribution', d.p_code, d.lu_year || '/' || d.plaining_year,
       CASE WHEN rc.lu_version = d.lu_year AND rc.planting_year_version = d.plaining_year THEN 'active' WHEN rc.p_code IS NULL THEN 'draft' ELSE 'archived' END,
       CASE WHEN rc.lu_version = d.lu_year AND rc.planting_year_version = d.plaining_year THEN NOW() END,
       CASE WHEN rc.lu_version = d.lu_year AND rc.planting_year_version = d.plaining_year OR rc.p_code IS NULL THEN NULL ELSE NOW() END
FROM (SELECT DISTINCT p_code, lu_year, plaining_year FROM tbl_planting_year_dist) d
LEFT JOIN tbl_region_config rc ON rc.p_code = d.p_code
ON CONFLICT (category, p_code, version) DO NOTHING;

-- One placeholder import row per backfilled version, so the history isn't
-- empty. Row counts are counted from the data tables.
INSERT INTO tbl_dataset_import (dataset_version_id, file_name, row_count, imported_at)
SELECT v.id, '(ข้อมูลเดิมก่อนมีระบบบันทึกการนำเข้า)',
       CASE v.category
         WHEN 'planting_year_map' THEN (SELECT count(*) FROM tbl_planting_year WHERE p_code = v.p_code AND year::text = v.version)
         WHEN 'lulc_map' THEN (SELECT count(*) FROM tbl_landuse WHERE p_code = v.p_code AND lu_year::text = v.version)
         WHEN 'biomass_profile' THEN (SELECT count(*) FROM tbl_biomass_profile WHERE p_code = v.p_code AND version = v.version)
         ELSE (SELECT count(*) FROM tbl_planting_year_dist WHERE p_code = v.p_code AND lu_year || '/' || plaining_year = v.version)
       END,
       v.created_at
FROM tbl_dataset_version v
WHERE NOT EXISTS (SELECT 1 FROM tbl_dataset_import i WHERE i.dataset_version_id = v.id);
