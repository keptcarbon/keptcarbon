/**
 * Growth models: value = the code stored in tbl_biomass_profile.growth_model,
 * tbl_region_config.default_growth and tbl_plots.growth_model; label = the
 * name shown to users. Single source for the plot-edit dropdown, the
 * plot/simulation displays, and the R&D biomass-profile import (client
 * dropdown + server validation).
 */
export const GROWTH_MODEL_OPTIONS: { label: string; value: string }[] = [
  { label: "Anchored Chapman-Richards", value: "anchored_chapman_richards" },
  { label: "Anchored Weibull", value: "anchored_weibull" },
  { label: "Anchored Gompertz", value: "anchored_gompertz" },
  { label: "Anchored Schumacher", value: "anchored_schumacher" },
];

export const GROWTH_MODEL_VALUES = GROWTH_MODEL_OPTIONS.map((o) => o.value);
