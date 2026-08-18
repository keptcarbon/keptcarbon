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
        "PROVINCE_NAME": "Rayong",
        "LU_MAP_VERSION": "2567",
        "ESTABLISHMENT_YEAR_MAP_VERSION": "2026",
        "ESTABLISHMENT_YEAR_MAP_QA_VERSION": "2026",
        "DEFAULT_SPACING_SYSTEM": "2.5x8",
        "DEFAULT_RUBBER_CLONE": "RRIM 600",
        "DEFAULT_MODEL": "weibull",
        "DEFAULT_BIOMASS_ASSESSMENT_METHOD": "hytonen_2018",
    }
}