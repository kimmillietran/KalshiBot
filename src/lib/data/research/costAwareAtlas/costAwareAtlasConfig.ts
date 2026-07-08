import type { CostAwareAtlasConfig } from "./costAwareAtlasTypes";

export const DEFAULT_COST_AWARE_ATLAS_CONFIG: CostAwareAtlasConfig = {
  minSampleThreshold: 30,
  neutralCalibrationGapThreshold: 0.001,
  tightSpreadPercentMax: 2,
  mediumSpreadPercentMax: 5,
  feeModel: {
    kind: "kalshi-fee-schedule",
    role: "taker",
    schedule: "standard",
  },
};

export const COST_AWARE_SPREAD_COHORT_ORDER = [
  "all",
  "validBidAsk",
  "tightSpread",
  "mediumSpread",
  "wideSpread",
  "missingOrInvalidQuote",
] as const;

export const COST_AWARE_TRADEABILITY_ORDER = [
  "tradeable-positive",
  "tradeable-negative",
  "gross-only",
  "untradeable-wide-spread",
  "untradeable-missing-quotes",
  "underpowered",
  "unknown",
] as const;

export function createCostAwareAtlasConfig(
  overrides?: Partial<CostAwareAtlasConfig>,
): CostAwareAtlasConfig {
  return {
    ...DEFAULT_COST_AWARE_ATLAS_CONFIG,
    ...overrides,
    feeModel: overrides?.feeModel ?? DEFAULT_COST_AWARE_ATLAS_CONFIG.feeModel,
  };
}
