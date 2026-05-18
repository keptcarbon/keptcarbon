import geopandas as gpd
import random
import sys

def main():
    try:
        print("Loading landuse geopackage (LU_RYG_2567.gpkg)...")
        gdf = gpd.read_file('app/data/shp/LU/LU_RYG_2567.gpkg')
        print(f"Loaded {len(gdf)} total records.")
        
        # Filter for A302 rubber cultivation plots
        rubber_gdf = gdf[gdf['LU_CODE'].astype(str).str.contains('A302', na=False)].copy()
        print(f"Found {len(rubber_gdf)} rubber cultivation (A302) records.")
        
        if rubber_gdf.empty:
            print("Error: No A302 rubber plots found!")
            sys.exit(1)
            
        # Reproject UTM to WGS84 (lat/lng)
        print("Reprojecting geometries to EPSG:4326...")
        rubber_gdf = rubber_gdf.to_crs('EPSG:4326')
        
        # Take a representative sample of 2,000 plots for density and performance
        sample_size = min(2000, len(rubber_gdf))
        print(f"Sampling {sample_size} plots for the database...")
        sample_gdf = rubber_gdf.sample(n=sample_size, random_state=42).copy()
        
        sql_lines = []
        
        # 1. Custom PL/pgSQL Carbon Estimation function
        sql_lines.append("""
-- 1. Create calculate_carbon_co2 custom function matching standard app formula
CREATE OR REPLACE FUNCTION calculate_carbon_co2(age numeric, area_rai numeric)
RETURNS numeric AS $$
DECLARE
    H numeric;
    D numeric;
    AGB numeric;
    BGB numeric;
    TB numeric;
    carbon numeric;
    co2_per_tree numeric;
    trees numeric;
BEGIN
    -- default trees is 80 per rai
    trees := area_rai * 80.0;
    
    -- calculate H (height limit 28m) and D (diameter limit 60cm)
    H := LEAST(2.0 + 1.8 * age, 28.0);
    D := LEAST(3.0 + 4.5 * age, 60.0);
    
    -- AGB in tonnes
    AGB := 0.1284 * POWER(D, 2) * H * 0.001;
    
    -- BGB (Below Ground Biomass)
    BGB := AGB * 0.26;
    
    -- Total Biomass
    TB := AGB + BGB;
    
    -- Carbon content
    carbon := TB * 0.47;
    
    -- CO2 equivalent per tree
    co2_per_tree := carbon * 3.67;
    
    -- Return total CO2 for the plot
    RETURN co2_per_tree * trees;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
""")
        
        # 2. Table creation
        sql_lines.append("""
-- 2. Create rubber_plots table
CREATE TABLE IF NOT EXISTS rubber_plots (
    id SERIAL PRIMARY KEY,
    farm_name VARCHAR(255),
    farm_idc VARCHAR(255),
    app_no VARCHAR(255),
    land_seq INTEGER,
    tambon VARCHAR(255),
    amphoe_t VARCHAR(255),
    province VARCHAR(255),
    grow_year INTEGER,
    rip_type VARCHAR(255),
    rubber_age INTEGER,
    grow_area VARCHAR(255),
    geom GEOMETRY(Geometry, 4326)
);

-- Truncate existing data
TRUNCATE TABLE rubber_plots RESTART IDENTITY;
""")
        
        # Seed generator
        random.seed(42)
        print("Formatting SQL INSERT statements...")
        
        for idx, row in enumerate(sample_gdf.itertuples(), 1):
            geom = row.geometry
            if geom is None or geom.is_empty:
                continue
                
            farm_name = f"สวนยางพาราโฉนดเลขที่ {105430 + idx}"
            farm_idc = f"IDC_{random.randint(10200, 99800)}"
            app_no = f"APP_{random.randint(123456, 987654)}"
            land_seq = 1
            tambon = ""
            amphoe_t = ""
            province = "ระยอง"
            
            # Select age between 1 and 35 years
            rubber_age = random.randint(1, 35)
            grow_year = 2026 - rubber_age
            rip_type = random.choice(["RRIM 600", "RRIT 251"])
            
            # Area_Rai from the geopackage
            area_rai = getattr(row, 'Area_Rai', None)
            if area_rai is None or area_rai <= 0:
                area_rai = 5.4 # realistic fallback
                
            rai = int(area_rai)
            ngan_float = (area_rai - rai) * 4
            ngan = int(ngan_float)
            wa = int(round((ngan_float - ngan) * 100))
            grow_area = f"{rai}-{ngan}-{wa}"
            
            wkt = geom.wkt
            farm_name_esc = farm_name.replace("'", "''")
            
            insert_stmt = (
                f"INSERT INTO rubber_plots (farm_name, farm_idc, app_no, land_seq, tambon, amphoe_t, province, grow_year, rip_type, rubber_age, grow_area, geom) "
                f"VALUES ('{farm_name_esc}', '{farm_idc}', '{app_no}', {land_seq}, NULL, NULL, '{province}', {grow_year}, '{rip_type}', {rubber_age}, '{grow_area}', ST_GeomFromText('{wkt}', 4326));"
            )
            sql_lines.append(insert_stmt)
            
        # 3. Spatial updates
        sql_lines.append("""
-- 3. Update amphoe_t spatially from districts table
UPDATE rubber_plots rp
SET amphoe_t = d.amphoe_t
FROM districts d
WHERE ST_Intersects(rp.geom, d.geom);

-- Fallback nearest district in case of minor boundary offset
UPDATE rubber_plots rp
SET amphoe_t = (SELECT amphoe_t FROM districts d ORDER BY rp.geom <-> d.geom LIMIT 1)
WHERE rp.amphoe_t IS NULL;

-- 4. Spatial indexes for high performance
CREATE INDEX IF NOT EXISTS idx_rubber_plots_geom ON rubber_plots USING gist(geom);
CREATE INDEX IF NOT EXISTS idx_rubber_plots_amphoe ON rubber_plots (amphoe_t);

ANALYZE rubber_plots;
""")
        
        print("Writing seed_rubber_plots.sql...")
        with open('seed_rubber_plots.sql', 'w', encoding='utf-8') as f:
            f.write('\n'.join(sql_lines))
            
        print("✓ Successfully generated seed_rubber_plots.sql!")
        
    except Exception as e:
        print(f"Error occurred: {str(e)}")
        sys.exit(1)

if __name__ == '__main__':
    main()
