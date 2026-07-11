import { DEFAULT_BID_ONLY_CANDIDATE_LIFECYCLE_CONFIG } from "../bidOnlyCandidateLifecycle/bidOnlyCandidateLifecycleConfig";
import { DEFAULT_EXECUTABLE_CONFIRMATION_DESIGN_CONFIG } from "../executableConfirmationDesign/executableConfirmationDesignTypes";
import { DEFAULT_STATIC_PARITY_FRICTION_CONFIG } from "../staticParityScan/staticParityScanTypes";
import type { ParityNearMissAnalysisConfig } from "./parityNearMissAnalysisTypes";

export const DEFAULT_PARITY_NEAR_MISS_ANALYSIS_CONFIG: ParityNearMissAnalysisConfig = {
  captureRunDir: "",
  nearMissLimit: 25,
  stalenessBoundMs: DEFAULT_EXECUTABLE_CONFIRMATION_DESIGN_CONFIG.stalenessBoundMs,
  friction: {
    ...DEFAULT_STATIC_PARITY_FRICTION_CONFIG,
    pricingModel: "bid-only",
  },
  lifecycle: {
    maxGapMs: DEFAULT_BID_ONLY_CANDIDATE_LIFECYCLE_CONFIG.maxGapMs,
    minEpisodeDurationMs: DEFAULT_BID_ONLY_CANDIDATE_LIFECYCLE_CONFIG.minEpisodeDurationMs,
    persistentEpisodeDurationMs:
      DEFAULT_BID_ONLY_CANDIDATE_LIFECYCLE_CONFIG.persistentEpisodeDurationMs,
    persistentEpisodeMinRecords:
      DEFAULT_BID_ONLY_CANDIDATE_LIFECYCLE_CONFIG.persistentEpisodeMinRecords,
    requireExecutableConfirmation:
      DEFAULT_BID_ONLY_CANDIDATE_LIFECYCLE_CONFIG.requireExecutableConfirmation,
  },
};

export function createParityNearMissAnalysisConfig(
  overrides: Partial<ParityNearMissAnalysisConfig> & Pick<ParityNearMissAnalysisConfig, "captureRunDir">,
): ParityNearMissAnalysisConfig {
  return {
    ...DEFAULT_PARITY_NEAR_MISS_ANALYSIS_CONFIG,
    ...overrides,
    friction: {
      ...DEFAULT_PARITY_NEAR_MISS_ANALYSIS_CONFIG.friction,
      ...overrides.friction,
    },
    lifecycle: {
      ...DEFAULT_PARITY_NEAR_MISS_ANALYSIS_CONFIG.lifecycle,
      ...overrides.lifecycle,
    },
  };
}
