import { createCaptureBaselineComparisonConfig } from "./captureBaselineComparisonConfig";
import { compareCaptureBaselines } from "./compareCaptureBaselines";
import type {
  CaptureBaselineComparisonConfig,
  CaptureBaselineComparisonIo,
  CaptureBaselineComparisonReport,
} from "./captureBaselineComparisonTypes";
import {
  CAPTURE_BASELINE_COMPARISON_CAVEATS,
  CAPTURE_BASELINE_COMPARISON_DISCLAIMER,
  DEFAULT_CAPTURE_BASELINE_COMPARISON_HTML_PATH,
  DEFAULT_CAPTURE_BASELINE_COMPARISON_OUTPUT_PATH,
} from "./captureBaselineComparisonTypes";
import {
  buildBaselineSnapshot,
  buildComparisonSnapshot,
  loadCaptureBaselineComparisonInputs,
} from "./loadCaptureBaselineComparisonInputs";

/** Builds the post-capture baseline comparison report. */
export function buildCaptureBaselineComparisonReport(input: {
  generatedAt: string;
  outputPath?: string;
  htmlOutputPath?: string;
  config?: CaptureBaselineComparisonConfig;
  io: CaptureBaselineComparisonIo;
}): CaptureBaselineComparisonReport {
  const config = input.config ?? createCaptureBaselineComparisonConfig();
  const outputPath = input.outputPath ?? DEFAULT_CAPTURE_BASELINE_COMPARISON_OUTPUT_PATH;
  const htmlOutputPath =
    input.htmlOutputPath ?? DEFAULT_CAPTURE_BASELINE_COMPARISON_HTML_PATH;

  const loaded = loadCaptureBaselineComparisonInputs({ config, io: input.io });
  const baseline = buildBaselineSnapshot({
    config,
    artifacts: loaded.artifacts,
    runs: loaded.runs,
    io: input.io,
  });
  const comparison = buildComparisonSnapshot({
    config,
    artifacts: loaded.artifacts,
    runs: loaded.runs,
    io: input.io,
  });
  const compared = compareCaptureBaselines({ baseline, comparison });

  const artifactsLoaded = Object.values(loaded.artifacts).map((artifact) => artifact.path);

  return {
    generatedAt: input.generatedAt,
    outputPath,
    htmlOutputPath,
    disclaimer: CAPTURE_BASELINE_COMPARISON_DISCLAIMER,
    caveats: [...CAPTURE_BASELINE_COMPARISON_CAVEATS],
    config,
    baseline,
    comparison,
    deltas: compared.deltas,
    summary: {
      overallVerdict: compared.overallVerdict,
      recommendedNextAction: compared.recommendedNextAction,
      currentBottleneck: compared.currentBottleneck,
      improvements: compared.improvements,
      regressions: compared.regressions,
      warnings: loaded.warnings,
      artifactsLoaded,
      missingArtifacts: loaded.missingArtifacts,
    },
  };
}
