-- ==========================================================================
-- Tree density lookup — spacing system -> planting density (trees/ha).
-- Mirrors backend/app/core/constants.py TREE_DENSITIES.
-- ==========================================================================

CREATE TABLE IF NOT EXISTS tbl_tree_density (
  id                SERIAL       PRIMARY KEY,
  tree_spacing      VARCHAR(20)  NOT NULL UNIQUE,  -- e.g. '2.5x8'
  tree_density_ha   INTEGER      NOT NULL,          -- trees per hectare
  -- Generated so it can never drift from tree_density_ha: 1 ha = 6.25 rai.
  tree_density_rai  INTEGER      GENERATED ALWAYS AS (ROUND(tree_density_ha / 6.25)::INTEGER) STORED,
  "desc"            TEXT
);

INSERT INTO tbl_tree_density (tree_spacing, tree_density_ha, "desc") VALUES
  ('2.5x8', 500, 'Recommended standard for flat terrain'),
  ('3x7',   475, 'Common for sloped areas'),
  ('3x8',   419, 'Common for sloped areas'),
  ('2.5x7', 569, 'Common for newly planted flat zones'),
  ('3x6',   556, 'Common for newly planted flat zones')
ON CONFLICT (tree_spacing) DO NOTHING;
