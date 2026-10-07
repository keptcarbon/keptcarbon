/**
 * Allometric equations: value = the code stored in tbl_biomass_profile.allometry
 * and tbl_region_config.default_allometry; label = the name shown to users.
 * Single source for the plot-edit dropdown, the plot/simulation displays,
 * and the R&D biomass-profile import (client dropdown + server validation).
 */
export const ALLOMETRY_OPTIONS: { label: string; value: string }[] = [
  { label: "Hytönen et al. (2018)", value: "hytönen_2018" },
  { label: "Chiarawipa et al. (2012)", value: "chiarawipa_2012" },
];

export const ALLOMETRY_VALUES = ALLOMETRY_OPTIONS.map((o) => o.value);
