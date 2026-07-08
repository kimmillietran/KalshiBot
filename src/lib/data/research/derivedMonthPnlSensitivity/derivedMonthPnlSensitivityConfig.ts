import { createPnlForensicsGateConfig } from "@/lib/data/research/pnlForensicsGate";

import type { DerivedMonthPnlSensitivityConfig } from "./derivedMonthPnlSensitivityTypes";

export const DEFAULT_SENSITIVE_MONTH = "2025-12";

export const DERIVED_MONTH_PNL_SENSITIVITY_DISCLAIMER =
  "Derived-month PnL sensitivity analysis only. This report tests whether in-sample calibration-fade PnL survives after excluding a known derived-settlement-sensitive month. This does not prove alpha and does not replace out-of-sample validation.";

export const DERIVED_MONTH_PNL_SENSITIVITY_CAVEATS = [
  "This is in-sample sensitivity analysis only.",
  "This does not prove alpha.",
  "This does not test out-of-sample PnL.",
  "Excluding a month is a diagnostic filter — not a live trading rule.",
  "A proceed recommendation only means full M12 OOS overlay may be worth building.",
  "A pause or reject recommendation means wait before investing in full M12.",
] as const;

export const DEFAULT_DERIVED_MONTH_PNL_SENSITIVITY_CONFIG: DerivedMonthPnlSensitivityConfig =
  {
    sensitiveMonth: DEFAULT_SENSITIVE_MONTH,
    excludeMonth: DEFAULT_SENSITIVE_MONTH,
    topMonthMaxShareAfterExclusion: 0.6,
    minNonSensitivePositiveMonths: 2,
    minUniqueTradingDays: 5,
    sensitiveMonthExplainsNearlyAllRetentionShare: 0.1,
    hypothesisSignFlipMajorityShare: 0.5,
    forensicsConfig: createPnlForensicsGateConfig(),
  };

export function createDerivedMonthPnlSensitivityConfig(
  overrides?: Partial<DerivedMonthPnlSensitivityConfig>,
): DerivedMonthPnlSensitivityConfig {
  return {
    ...DEFAULT_DERIVED_MONTH_PNL_SENSITIVITY_CONFIG,
    ...overrides,
    forensicsConfig: {
      ...DEFAULT_DERIVED_MONTH_PNL_SENSITIVITY_CONFIG.forensicsConfig,
      ...overrides?.forensicsConfig,
    },
  };
}
