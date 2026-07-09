import { evaluateForwardCaptureReadiness } from "./evaluateForwardCaptureReadiness";
import {
  loadForwardCaptureRunsWithWarnings,
} from "./loadForwardCaptureRuns";
import {
  DEFAULT_FORWARD_CAPTURE_READINESS_THRESHOLDS,
  type ForwardCaptureReadinessInputPaths,
  type ForwardCaptureReadinessIo,
  type ForwardCaptureReadinessReport,
} from "./forwardCaptureReadinessTypes";

/** Builds the forward capture readiness report from on-disk capture runs. */
export function buildForwardCaptureReadinessReport(input: {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  inputPaths: ForwardCaptureReadinessInputPaths;
  io: ForwardCaptureReadinessIo;
}): ForwardCaptureReadinessReport {
  const { runs, warnings } = loadForwardCaptureRunsWithWarnings(
    input.io,
    input.inputPaths,
  );
  const evaluation = evaluateForwardCaptureReadiness(runs);

  return {
    generatedAt: input.generatedAt,
    outputPath: input.outputPath,
    htmlOutputPath: input.htmlOutputPath,
    disclaimer: evaluation.disclaimer,
    caveats: evaluation.caveats,
    warnings: warnings.map((warning) =>
      warning.runId
        ? `${warning.runId}: ${warning.message}`
        : `${warning.runDir}: ${warning.message}`,
    ),
    inputPaths: input.inputPaths,
    thresholds: DEFAULT_FORWARD_CAPTURE_READINESS_THRESHOLDS,
    summary: evaluation.summary,
    aggregates: evaluation.aggregates,
    runs: evaluation.runs,
    byDate: evaluation.byDate,
    bySeriesTicker: evaluation.bySeriesTicker,
    byMarketTicker: evaluation.byMarketTicker,
    byRunId: evaluation.byRunId,
  };
}
