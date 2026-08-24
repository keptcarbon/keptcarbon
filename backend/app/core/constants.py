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

# NOTE: per-province defaults (rubber clone, spacing system, growth model,
# allometry, dataset versions) and the spacing-to-density mapping now live in
# the DB (tbl_region_config, tbl_tree_density) instead of being hardcoded
# here -- see CarbonService, LanduseService, AgeMapService, TreeService,
# PlotsService.