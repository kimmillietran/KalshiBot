import type { CaptureBaselineComparisonConfig } from "./captureBaselineComparisonTypes";
import { DEFAULT_CAPTURE_BASELINE_COMPARISON_INPUT_PATHS } from "./captureBaselineComparisonTypes";

export const DEFAULT_CAPTURE_BASELINE_COMPARISON_CONFIG: CaptureBaselineComparisonConfig =
  {
    forwardQuotesDir: DEFAULT_CAPTURE_BASELINE_COMPARISON_INPUT_PATHS.forwardQuotesDir,
    artifacts: DEFAULT_CAPTURE_BASELINE_COMPARISON_INPUT_PATHS.artifacts,
    baselineRunId: null,
    comparisonRunId: null,
    useLatestComparisonRun: false,
    useConfiguredBaseline: true,
  };

export function createCaptureBaselineComparisonConfig(
  overrides?: Partial<CaptureBaselineComparisonConfig>,
): CaptureBaselineComparisonConfig {
  return {
    ...DEFAULT_CAPTURE_BASELINE_COMPARISON_CONFIG,
    ...overrides,
  };
}
