import {
  DEFAULT_FORWARD_QUOTES_SCAN_DIR,
  type CaptureQualityValidationConfig,
  type CaptureQualityValidationSummary,
  type CaptureQualityValidationThresholds,
} from "./captureQualityValidationTypes";

export {
  CAPTURE_QUALITY_VALIDATION_CAVEATS,
  CAPTURE_QUALITY_VALIDATION_DISCLAIMER,
} from "./captureQualityValidationTypes";

export const DEFAULT_CAPTURE_QUALITY_VALIDATION_THRESHOLDS: CaptureQualityValidationThresholds =
  {
    minEconomicallyValidShare: 0.05,
    minParityUsableRecords: 10,
    maxHealthCountMismatch: 0,
    maxEconomicStateMismatchRecords: 0,
    maxMalformedJsonlLines: 0,
    maxEmptyRolloverRecordShare: 0.5,
  };

export const DEFAULT_CAPTURE_QUALITY_VALIDATION_CONFIG: CaptureQualityValidationConfig = {
  forwardQuotesDir: DEFAULT_FORWARD_QUOTES_SCAN_DIR,
  thresholds: DEFAULT_CAPTURE_QUALITY_VALIDATION_THRESHOLDS,
};

export function createCaptureQualityValidationConfig(
  overrides?: Partial<Omit<CaptureQualityValidationConfig, "thresholds">> & {
    thresholds?: Partial<CaptureQualityValidationThresholds>;
  },
): CaptureQualityValidationConfig {
  return {
    forwardQuotesDir:
      overrides?.forwardQuotesDir ?? DEFAULT_CAPTURE_QUALITY_VALIDATION_CONFIG.forwardQuotesDir,
    thresholds: {
      ...DEFAULT_CAPTURE_QUALITY_VALIDATION_THRESHOLDS,
      ...overrides?.thresholds,
    },
  };
}

export function resolveRecommendedNextAction(
  summary: CaptureQualityValidationSummary,
): string {
  if (summary.runsValidated === 0) {
    return "run-forward-capture-and-revalidate";
  }

  if (summary.economicStateMismatchRuns > 0) {
    return "fix-economicBookState-labeling-in-capture";
  }

  if (summary.healthMismatchRuns > 0) {
    return "align-capture-health-counts-with-recomputed-metrics";
  }

  if (summary.legacyFormatRuns > 0 && summary.economicStateFormatRuns === 0) {
    return "merge-m12.4b-economic-validity-fields";
  }

  if (!summary.latestRunEnoughForParityResearch) {
    return "extend-capture-or-improve-transition-emission";
  }

  return "proceed-with-parity-research-on-validated-captures";
}
