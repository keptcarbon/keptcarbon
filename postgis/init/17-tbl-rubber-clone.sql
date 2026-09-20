-- ==========================================================================
-- Rubber clone lookup — clone name -> origin, use, site traits, description.
-- ==========================================================================

CREATE TABLE IF NOT EXISTS tbl_rubber_clone (
  id                 SERIAL       PRIMARY KEY,
  clone              VARCHAR(20)  NOT NULL UNIQUE,  -- e.g. 'RRIM 600'
  clone_origin       VARCHAR(50)  NOT NULL,          -- country of origin
  clone_use          VARCHAR(30)  NOT NULL,          -- e.g. 'Latex', 'Latex–Timber'
  clone_site_trait   VARCHAR(100) NOT NULL,          -- site suitability notes
  clone_description  TEXT         NOT NULL
);

INSERT INTO tbl_rubber_clone
  (clone, clone_origin, clone_use, clone_site_trait, clone_description)
VALUES
  ('RRIM 600',  'Malaysia',  'Latex',           'Slope-suitable; broad adaptation',   'Widely planted Malaysian clone with reliable latex yield and good adaptability, including sloping areas.'),
  ('RRIT 251',  'Thailand',  'Latex',           'Broad adaptation',                   'High-yield Thai latex clone suitable for both traditional and new rubber-growing areas.'),
  ('BPM 24',    'Indonesia', 'Latex',           'Disease-tolerant',                   'High-yield Indonesian latex clone with good resistance to major Phytophthora-related diseases.'),
  ('PB 235',    'Malaysia',  'Latex–Timber',    'Avoid steep/shallow sites',           'Vigorous Malaysian clone with high latex and biomass production; less suitable for steep or shallow soils.'),
  ('PR 255',    'Indonesia', 'Latex',           'Avoid steep slopes',                 'Indonesian latex clone with good stimulation response and wind tolerance; not preferred on steep slopes.'),
  ('GT 1',      'Indonesia', 'Latex',           'Slope-suitable; stress-tolerant',    'Robust, broadly adaptable clone with moderate latex yield and good tolerance of marginal sites.'),
  ('PB 311',    'Malaysia',  'Latex',           'General cultivation',                'Older Malaysian PB clone used as a productive latex clone and breeding germplasm.'),
  ('PB 260',    'Malaysia',  'Latex–Timber',    'Slope-suitable; broad adaptation',   'Dual-purpose Malaysian clone combining high latex yield, vigorous growth, and good timber potential.'),
  ('PB 255',    'Malaysia',  'Latex–Timber',    'Slope-suitable; broad adaptation',   'High-yield dual-purpose Malaysian clone with good wind resistance and adaptability to varied sites.'),
  ('RRIT 209',  'Thailand',  'Latex',           'General cultivation',                'Thai latex clone formerly recommended for both traditional and expanding rubber-growing areas.'),
  ('RRIT 225',  'Thailand',  'Latex',           'General cultivation',                'Thai latex clone used in commercial planting and as breeding material for later RRIT selections.'),
  ('RRIC 100',  'Sri Lanka', 'Latex/breeding',  'Broad adaptation; disease-tolerant', 'Sri Lankan clone valued for vigorous growth, good latex yield, and resistance to several foliar diseases.'),
  ('RRIT 408',  'Thailand',  'Latex–Timber',    'Marginal-area suitable',             'Thai dual-purpose clone with strong growth and productivity, including in non-traditional rubber areas.'),
  ('RRIT 214',  'Thailand',  'Latex',           'Traditional areas',                  'Older Thai latex clone historically recommended mainly for established rubber-growing regions.'),
  ('RRIT 250',  'Thailand',  'Latex',           'Broad adaptation',                   'Thai latex clone historically recommended for both traditional and new rubber-growing areas.'),
  ('RRIM 3001', 'Malaysia',  'Latex–Timber',    'Vigorous growth; timber-oriented',   'Malaysian latex–timber clone with fast growth, high latex production, and good stem form for wood production.'),
  ('RRIC 110',  'Sri Lanka', 'Latex–Timber',    'Vigorous growth',                    'Sri Lankan dual-purpose clone valued for strong vegetative growth, latex production, and timber potential.'),
  ('RRIT 3904', 'Thailand',  'Latex',           'Broad adaptation; disease-tolerant', 'Thai-bred RRII 203 × PB 235 clone with vigorous growth, high latex yield, and good environmental adaptability.')
ON CONFLICT (clone) DO NOTHING;
