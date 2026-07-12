import type { BidOnlyCandidateLifecycleConfig } from "./bidOnlyCandidateLifecycleTypes";
import {
  DEFAULT_BID_ONLY_CANDIDATE_LIFECYCLE_INPUT_DIR,
  DEFAULT_STATIC_PARITY_SCAN_ARTIFACT_PATH,
} from "./bidOnlyCandidateLifecycleTypes";
import { DEFAULT_STATIC_PARITY_FRICTION_CONFIG } from "../staticParityScan/staticParityScanTypes";

export const DEFAULT_BID_ONLY_CANDIDATE_LIFECYCLE_CONFIG: BidOnlyCandidateLifecycleConfig =
  {
    forwardQuotesDir: DEFAULT_BID_ONLY_CANDIDATE_LIFECYCLE_INPUT_DIR,
    captureRunDir: null,
    staticParityScanPath: DEFAULT_STATIC_PARITY_SCAN_ARTIFACT_PATH,
    pricingModel: "bid-only",
    maxGapMs: 2_500,
    minEpisodeDurationMs: 2_500,
    minEdgeCents: DEFAULT_STATIC_PARITY_FRICTION_CONFIG.minGrossEdgeCents,
    minSizeContracts: DEFAULT_STATIC_PARITY_FRICTION_CONFIG.minSizeContracts,
    persistentEpisodeDurationMs: 10_000,
    persistentEpisodeMinRecords: 3,
    feeBufferCents: DEFAULT_STATIC_PARITY_FRICTION_CONFIG.feeBufferCents,
    minGrossEdgeCents: DEFAULT_STATIC_PARITY_FRICTION_CONFIG.minGrossEdgeCents,
    minBidOnlyEdgeCents: DEFAULT_STATIC_PARITY_FRICTION_CONFIG.minBidOnlyEdgeCents,
    requireExecutableConfirmation:
      DEFAULT_STATIC_PARITY_FRICTION_CONFIG.requireExecutableConfirmation,
  };

export function createBidOnlyCandidateLifecycleConfig(
  overrides?: Partial<BidOnlyCandidateLifecycleConfig>,
): BidOnlyCandidateLifecycleConfig {
  return {
    ...DEFAULT_BID_ONLY_CANDIDATE_LIFECYCLE_CONFIG,
    ...overrides,
  };
}

export function resolveRecommendedNextAction(input: {
  persistentCandidateEpisodes: number;
  bufferAdjustedCandidateEpisodes: number;
  grossCandidateEpisodes: number;
  episodesBuilt: number;
  runsScanned: number;
}): string {
  if (input.runsScanned === 0) {
    return "run-forward-capture-then-rebuild-lifecycle";
  }

  if (input.episodesBuilt === 0) {
    return "improve-bid-size-coverage-and-re-run-m12.7-scan";
  }

  if (input.persistentCandidateEpisodes > 0) {
    return "evaluate-persistent-episodes-offline-require-executable-confirmation";
  }

  if (input.bufferAdjustedCandidateEpisodes > 0) {
    return "review-buffer-adjusted-episodes-offline-require-executable-confirmation";
  }

  if (input.grossCandidateEpisodes > 0) {
    return "refine-friction-thresholds-and-extend-capture";
  }

  return "continue-capture-until-persistent-candidate-episodes-emerge";
}
