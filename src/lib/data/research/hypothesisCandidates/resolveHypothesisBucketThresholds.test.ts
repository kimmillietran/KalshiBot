import { describe, expect, it } from "vitest";

import {
  createDefaultHypothesisBucketSampleThresholds,
  resolveMinSampleSizeForGroup,
} from "./resolveHypothesisBucketThresholds";
import type { HypothesisCandidateConfig } from "./hypothesisCandidateTypes";

function createConfig(
  overrides: Partial<HypothesisCandidateConfig> = {},
): HypothesisCandidateConfig {
  return {
    minSampleSize: 30,
    minCalibrationError: 0.05,
    minLeadLagCorrelation: 0.2,
    minUniqueTradingDays: 2,
    minSampleSizeByGroup: createDefaultHypothesisBucketSampleThresholds(),
    ...overrides,
  };
}

describe("resolveMinSampleSizeForGroup", () => {
  it("uses a higher default threshold for triple-axis buckets", () => {
    expect(
      resolveMinSampleSizeForGroup("volatilityProbabilityTime", createConfig()),
    ).toBe(45);
  });

  it("honors per-group overrides", () => {
    expect(
      resolveMinSampleSizeForGroup(
        "probabilityMoneyness",
        createConfig({
          minSampleSizeByGroup: { probabilityMoneyness: 20 },
        }),
      ),
    ).toBe(20);
  });
});
