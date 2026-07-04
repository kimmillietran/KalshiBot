import {
  DEFAULT_HYPOTHESIS_MIN_SAMPLE_SIZE,
  DEFAULT_TRIPLE_AXIS_MIN_SAMPLE_SIZE,
  type HypothesisAtlasGroupId,
  type HypothesisBucketSampleThresholds,
  type HypothesisCandidateConfig,
} from "./hypothesisCandidateTypes";

/** Resolves the minimum observation threshold for an atlas bucket group. */
export function resolveMinSampleSizeForGroup(
  groupId: HypothesisAtlasGroupId,
  config: HypothesisCandidateConfig,
): number {
  const override = config.minSampleSizeByGroup[groupId];
  if (override !== undefined) {
    return override;
  }

  if (groupId === "volatilityProbabilityTime") {
    return DEFAULT_TRIPLE_AXIS_MIN_SAMPLE_SIZE;
  }

  return config.minSampleSize;
}

export function createDefaultHypothesisBucketSampleThresholds(): HypothesisBucketSampleThresholds {
  return {
    volatilityProbabilityTime: DEFAULT_TRIPLE_AXIS_MIN_SAMPLE_SIZE,
  };
}

export function resolveDefaultMinSampleSize(
  partial?: Partial<HypothesisCandidateConfig>,
): number {
  return partial?.minSampleSize ?? DEFAULT_HYPOTHESIS_MIN_SAMPLE_SIZE;
}
