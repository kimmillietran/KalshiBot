import {
  DEFAULT_HYPOTHESIS_MIN_SAMPLE_SIZE,
  DEFAULT_TRIPLE_AXIS_MIN_SAMPLE_SIZE,
  type HypothesisAtlasGroupId,
  type HypothesisBucketSampleThresholds,
  type HypothesisCandidateConfig,
} from "./hypothesisCandidateTypes";
import { resolveAxisGroupSampleThreshold } from "@/lib/data/research/dimensions";

/** Resolves the minimum observation threshold for an atlas bucket group. */
export function resolveMinSampleSizeForGroup(
  groupId: HypothesisAtlasGroupId,
  config: HypothesisCandidateConfig,
): number {
  const override = config.minSampleSizeByGroup[groupId];
  if (override !== undefined) {
    return override;
  }

  return resolveAxisGroupSampleThreshold(groupId, config.minSampleSize);
}

export function createDefaultHypothesisBucketSampleThresholds(): HypothesisBucketSampleThresholds {
  return {
    volatilityProbabilityTime: DEFAULT_TRIPLE_AXIS_MIN_SAMPLE_SIZE,
    probabilityMomentumTime: DEFAULT_TRIPLE_AXIS_MIN_SAMPLE_SIZE,
  };
}

export function resolveDefaultMinSampleSize(
  partial?: Partial<HypothesisCandidateConfig>,
): number {
  return partial?.minSampleSize ?? DEFAULT_HYPOTHESIS_MIN_SAMPLE_SIZE;
}
