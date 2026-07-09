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
  grossParityCandidateCount: number;
  bufferAdjustedCandidateCount: number;
}): StaticParityClassification {
  if (input.bufferAdjustedCandidateCount > 0) {
    return "buffer-adjusted-candidate";
  }

  if (input.grossParityCandidateCount > 0) {
    return "gross-parity-candidate";
  }

  return "no-signal";
}

function resolveRecommendedNextAction(summary: StaticParityScanSummary): string {
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
    overallClassification: resolveOverallClassification(scan.metrics),
    hasBufferAdjustedCandidates: scan.metrics.bufferAdjustedCandidateCount > 0,
    hasGrossCandidates: scan.metrics.grossParityCandidateCount > 0,
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
