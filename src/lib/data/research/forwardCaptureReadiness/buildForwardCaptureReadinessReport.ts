import { evaluateForwardCaptureReadiness } from "./evaluateForwardCaptureReadiness";
import {
  getResearchEligibilityExclusionReason,
  isResearchEligibleCaptureRun,
  loadForwardCaptureRunsWithWarnings,
  loadRun,
} from "./loadForwardCaptureRuns";
import {
  buildDownstreamScopeMetadata,
  documentSequenceGapSemantics,
  resolveRunIdFromPath,
  spreadDownstreamScopeFields,
} from "../downstreamAnalysisScope";
import {
  DEFAULT_FORWARD_CAPTURE_READINESS_THRESHOLDS,
  type ExcludedCaptureRun,
  type ForwardCaptureReadinessInputPaths,
  type ForwardCaptureReadinessIo,
  type ForwardCaptureReadinessReport,
} from "./forwardCaptureReadinessTypes";

function joinPath(root: string, child: string): string {
  return `${root.replace(/[\\/]+$/, "")}/${child}`;
}

/** Builds the forward capture readiness report from on-disk capture runs. */
export function buildForwardCaptureReadinessReport(input: {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  inputPaths: ForwardCaptureReadinessInputPaths;
  io: ForwardCaptureReadinessIo;
}): ForwardCaptureReadinessReport {
  const selection = {
    analysisScope: input.inputPaths.captureRunDir ? "selected-run" as const : "aggregate" as const,
    forwardQuotesDir: input.inputPaths.forwardQuotesDir,
    captureRunDir: input.inputPaths.captureRunDir,
    selectedRunId: input.inputPaths.captureRunDir
      ? resolveRunIdFromPath(input.inputPaths.captureRunDir)
      : null,
  };

  const loadedCapture = loadForwardCaptureRunsWithWarnings(input.io, input.inputPaths);
  let runs = loadedCapture.runs;
  let warnings = loadedCapture.warnings;
  const excludedRuns: ExcludedCaptureRun[] = [];
  let sequenceGapSemantics: ReturnType<typeof documentSequenceGapSemantics> | undefined;

  if (selection.analysisScope === "selected-run" && selection.captureRunDir) {
    const loaded = loadRun(input.io, selection.captureRunDir, input.inputPaths.forwardQuotesDir);
    if (loaded.run) {
      runs = [loaded.run];
      sequenceGapSemantics = documentSequenceGapSemantics(
        loaded.run.health as Record<string, unknown>,
      );
    } else {
      runs = [];
      if (loaded.warning) {
        warnings = [loaded.warning];
      }
    }
  } else {
    const allRuns = runs;
    runs = allRuns.filter(isResearchEligibleCaptureRun);
    for (const run of allRuns) {
      const reason = getResearchEligibilityExclusionReason(run);
      if (reason) {
        excludedRuns.push({
          runId: run.runId,
          runDir: joinPath(run.sourceRoot, run.runId),
          reason,
        });
      }
    }
  }

  const evaluation = evaluateForwardCaptureReadiness(runs);  const recordsScanned = evaluation.aggregates.topOfBookRecordCount;
  const sourceRunIds = selection.analysisScope === "selected-run"
    ? selection.selectedRunId
      ? [selection.selectedRunId]
      : []
    : runs.map((run) => run.runId);

  const scopeWarnings = [
    ...warnings.map((warning) =>
      warning.runId
        ? `${warning.runId}: ${warning.message}`
        : `${warning.runDir}: ${warning.message}`,
    ),
    ...excludedRuns.map((entry) => `Excluded run ${entry.runId}: ${entry.reason}`),
    ...(sequenceGapSemantics
      ? sequenceGapSemantics.flatMap((entry) => entry.notes)
      : []),
  ];

  const scope = buildDownstreamScopeMetadata({
    selection,
    generatedAt: input.generatedAt,
    recordsScanned,
    artifactValidation: {
      identities: [],
      staleArtifacts: [],
      mismatchedArtifacts: [],
      malformedArtifacts: [],
      missingArtifacts: [],
      warnings: [],
      usablePaths: [],
    },
    extraWarnings: scopeWarnings,
  });
  const scopeFields = spreadDownstreamScopeFields(scope, { sourceRunIds });

  return {
    generatedAt: input.generatedAt,
    outputPath: input.outputPath,
    htmlOutputPath: input.htmlOutputPath,
    disclaimer: evaluation.disclaimer,
    caveats: evaluation.caveats,
    warnings: scopeWarnings,
    inputPaths: input.inputPaths,
    thresholds: DEFAULT_FORWARD_CAPTURE_READINESS_THRESHOLDS,
    summary: evaluation.summary,
    aggregates: evaluation.aggregates,
    runs: evaluation.runs,
    byDate: evaluation.byDate,
    bySeriesTicker: evaluation.bySeriesTicker,
    byMarketTicker: evaluation.byMarketTicker,
    byRunId: evaluation.byRunId,
    ...scopeFields,
    ...(excludedRuns.length > 0 ? { excludedRuns } : {}),
    ...(sequenceGapSemantics ? { sequenceGapSemantics } : {}),
  };
}
