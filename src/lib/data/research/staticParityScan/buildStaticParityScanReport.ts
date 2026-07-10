import {
  scanForwardCaptureParity,
} from "./scanForwardCaptureParity";
import {
  DEFAULT_STATIC_PARITY_FRICTION_CONFIG,
  DEFAULT_STATIC_PARITY_SCAN_HTML_PATH,
  DEFAULT_STATIC_PARITY_SCAN_INPUT_PATHS,
  DEFAULT_STATIC_PARITY_SCAN_OUTPUT_PATH,
  STATIC_PARITY_SCAN_CAVEATS,
  STATIC_PARITY_SCAN_DISCLAIMER,
  type StaticParityFrictionConfig,
  type StaticParityScanIo,
  type StaticParityScanReport,
  type StaticParityScanSummary,
  type StaticParityClassification,
} from "./staticParityScanTypes";

function resolveOverallClassification(input: {
  pricingModel: StaticParityFrictionConfig["pricingModel"];
  grossParityCandidateCount: number;
  bufferAdjustedCandidateCount: number;
  bidOnlyGrossCandidateCount: number;
  bidOnlyBufferAdjustedCandidateCount: number;
}): StaticParityClassification {
  if (input.pricingModel === "bid-only") {
    if (input.bidOnlyBufferAdjustedCandidateCount > 0) {
      return "bid-only-buffer-adjusted-candidate";
    }
    if (input.bidOnlyGrossCandidateCount > 0) {
      return "bid-only-gross-candidate";
    }
    return "bid-only-no-signal";
  }

  if (input.bufferAdjustedCandidateCount > 0) {
    return "buffer-adjusted-candidate";
  }

  if (input.grossParityCandidateCount > 0) {
    return "gross-parity-candidate";
  }

  return "no-signal";
}

function resolveRecommendedNextAction(summary: StaticParityScanSummary): string {
  if (summary.hasBidOnlyBufferAdjustedCandidates) {
    return "review-bid-only-buffer-adjusted-candidates-offline-require-executable-confirmation";
  }

  if (summary.hasBidOnlyGrossCandidates) {
    return "refine-bid-only-friction-model-and-continue-capture";
  }

  if (summary.hasBufferAdjustedCandidates) {
    return "review-buffer-adjusted-candidates-offline";
  }

  if (summary.hasGrossCandidates) {
    return "refine-friction-model-and-continue-capture";
  }

  return "continue-capture-and-rescan";
}

export function buildStaticParityScanReport(input: {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  inputPaths: typeof DEFAULT_STATIC_PARITY_SCAN_INPUT_PATHS;
  friction?: StaticParityFrictionConfig;
  io: StaticParityScanIo;
}): StaticParityScanReport {
  const friction = input.friction ?? DEFAULT_STATIC_PARITY_FRICTION_CONFIG;
  const scan = scanForwardCaptureParity({
    io: input.io,
    forwardQuotesDir: input.inputPaths.forwardQuotesDir,
    friction,
  });

  const summary: StaticParityScanSummary = {
    pricingModel: friction.pricingModel,
    overallClassification: resolveOverallClassification({
      pricingModel: friction.pricingModel,
      grossParityCandidateCount: scan.metrics.grossParityCandidateCount,
      bufferAdjustedCandidateCount: scan.metrics.bufferAdjustedCandidateCount,
      bidOnlyGrossCandidateCount: scan.metrics.bidOnlyGrossCandidateCount,
      bidOnlyBufferAdjustedCandidateCount: scan.metrics.bidOnlyBufferAdjustedCandidateCount,
    }),
    hasBufferAdjustedCandidates: scan.metrics.bufferAdjustedCandidateCount > 0,
    hasGrossCandidates: scan.metrics.grossParityCandidateCount > 0,
    hasBidOnlyGrossCandidates: scan.metrics.bidOnlyGrossCandidateCount > 0,
    hasBidOnlyBufferAdjustedCandidates:
      scan.metrics.bidOnlyBufferAdjustedCandidateCount > 0,
    requiresExecutableConfirmation: friction.requireExecutableConfirmation,
    recommendedNextAction: "continue-capture-and-rescan",
  };
  summary.recommendedNextAction = resolveRecommendedNextAction(summary);

  return {
    generatedAt: input.generatedAt,
    outputPath: input.outputPath,
    htmlOutputPath: input.htmlOutputPath,
    disclaimer: STATIC_PARITY_SCAN_DISCLAIMER,
    caveats: STATIC_PARITY_SCAN_CAVEATS,
    inputPaths: input.inputPaths,
    friction,
    summary,
    metrics: scan.metrics,
    candidateSamples: scan.candidateSamples,
    runs: scan.runs,
  };
}

export {
  DEFAULT_STATIC_PARITY_SCAN_HTML_PATH,
  DEFAULT_STATIC_PARITY_SCAN_INPUT_PATHS,
  DEFAULT_STATIC_PARITY_SCAN_OUTPUT_PATH,
};
