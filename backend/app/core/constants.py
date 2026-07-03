# Constants and configuration for the KeptCarbon Platform

# Tree Age Homologous Threshold
TREE_AGE_HOMOLOGOUS_THRESHOLD = 0.9
TREE_COUNT_VALIDATION_THRESHOLD = 0.05

# Growth model parameters
GROWTH_MODEL_YEAR = 35   # Lookup table covers ages 0–35
MAX_TREE_AGE = 29        # Max age accepted from raster before cohort is filtered out
MEAN_CUT_TREE_AGE = 23   # Mean age used for mixed pixels when no reliable year can be determined
MIX_TREE_PROPORTION = 0.02  # Proportion for removing older age noisy pixels 

# Biometric Constants 
CARBON_FRACTION = 0.47 
CARBON_EQUIVALENT_FACTOR = 3.667  # C to CO2  Molecular weight ratio 44/12

# Defaults applied when the user does not specify a spacing system or clone
DEFAULT_SPACING_SYSTEM = "2.5x8"
DEFAULT_RUBBER_CLONE = "RRIM 600"

# Spacing to Density Mapping
TREE_DENSITIES = {
    "2.5x8": 500,  # Recommended standard for flat terrain
    "3x7": 475,    # Common for sloped areas
    "3x8": 419,
    "2.5x7": 569,
    "3x6": 556
}

# Regional Data Registry
# Maps P_CODE to local spatial files and R&D lookup tables
REGION_CONFIG = {
    "RAY": {  # Rayong Province 
        "province_name": "Rayong",
        "lu_vector": "LU_RYG_2567.gpkg",
        "plaining_year_map": "establishment_year_rayong.tif",
        "plaining_year_map_qa": "establishment_year_rayong_qa.tif",
        "model_used": "weibull",
        "biomass_estimation_method": "hytonen_2018",
        "biomass_estimation_tables": {
            ("RRIM 600", "cubic_poly", "hytonen_2018"): "rrim600_cubic_poly_hytonen_rayong.csv",
            ("RRIT 251", "cubic_poly", "hytonen_2018"): "rrim600_cubic_poly_hytonen_rayong.csv",
            ("RRIM 600", "cubic_poly", "chiarawipa_2012"): "rrim600_cubic_poly_chiarawipa_rayong.csv",
            ("RRIT 251", "cubic_poly", "chiarawipa_2012"): "rrim600_cubic_poly_chiarawipa_rayong.csv",

            ("RRIM 600", "chapman_richards", "hytonen_2018"): "rrim600_chapman_richards_hytonen_rayong.csv",
            ("RRIT 251", "chapman_richards", "hytonen_2018"): "rrim600_chapman_richards_hytonen_rayong.csv",
            ("RRIM 600", "chapman_richards", "chiarawipa_2012"): "rrim600_chapman_richards_chiarawipa_rayong.csv",
            ("RRIT 251", "chapman_richards", "chiarawipa_2012"): "rrim600_chapman_richards_chiarawipa_rayong.csv",

            ("RRIM 600", "gompertz", "hytonen_2018"): "rrim600_gompertz_hytonen_rayong.csv",
            ("RRIT 251", "gompertz", "hytonen_2018"): "rrim600_gompertz_hytonen_rayong.csv",
            ("RRIM 600", "gompertz", "chiarawipa_2012"): "rrim600_gompertz_chiarawipa_rayong.csv",
            ("RRIT 251", "gompertz", "chiarawipa_2012"): "rrim600_gompertz_chiarawipa_rayong.csv",

            ("RRIM 600", "schumacher", "hytonen_2018"): "rrim600_schumacher_hytonen_rayong.csv",
            ("RRIT 251", "schumacher", "hytonen_2018"): "rrim600_schumacher_hytonen_rayong.csv",
            ("RRIM 600", "schumacher", "chiarawipa_2012"): "rrim600_schumacher_chiarawipa_rayong.csv",
            ("RRIT 251", "schumacher", "chiarawipa_2012"): "rrim600_schumacher_chiarawipa_rayong.csv",

            ("RRIM 600", "weibull", "hytonen_2018"): "rrim600_weibull_hytonen_rayong.csv",
            ("RRIT 251", "weibull", "hytonen_2018"): "rrim600_weibull_hytonen_rayong.csv",
            ("RRIM 600", "weibull", "chiarawipa_2012"): "rrim600_weibull_chiarawipa_rayong.csv",
            ("RRIT 251", "weibull", "chiarawipa_2012"): "rrim600_weibull_chiarawipa_rayong.csv"
        }
    }
}