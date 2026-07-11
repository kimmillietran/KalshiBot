import {
  buildDownstreamScopeMetadata,
  resolveRunIdFromPath,
  spreadDownstreamScopeFields,
} from "../downstreamAnalysisScope";
import {
  buildDataAssessment,
  evaluateExecutableConfirmationReadiness,
} from "./evaluateExecutableConfirmationReadiness";
import { loadExecutableConfirmationArtifacts } from "./loadExecutableConfirmationArtifacts";
import {
  DEFAULT_EXECUTABLE_CONFIRMATION_DESIGN_CONFIG,
  EXECUTABLE_CONFIRMATION_DESIGN_CAVEATS,
  EXECUTABLE_CONFIRMATION_DESIGN_DISCLAIMER,
  type ExecutableConfirmationDesignConfig,
  type ExecutableConfirmationDesignInputPaths,
  type ExecutableConfirmationDesignIo,
  type ExecutableConfirmationDesignReport,
} from "./executableConfirmationDesignTypes";

/** Builds the executable confirmation design harness report. */
export function buildExecutableConfirmationDesignReport(input: {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  inputPaths: ExecutableConfirmationDesignInputPaths;
  config?: ExecutableConfirmationDesignConfig;
  io: ExecutableConfirmationDesignIo;
}): ExecutableConfirmationDesignReport {
  const config = input.config ?? DEFAULT_EXECUTABLE_CONFIRMATION_DESIGN_CONFIG;
  const loaded = loadExecutableConfirmationArtifacts({
    inputPaths: input.inputPaths,
    config,
    io: input.io,
    evaluatedAt: input.generatedAt,
  });
  const evaluation = evaluateExecutableConfirmationReadiness({
    artifacts: loaded.artifacts,
    config,
    generatedAt: input.generatedAt,
  });

  const dataAssessment = buildDataAssessment({
    artifacts: loaded.artifacts,
    records: evaluation.confirmationRecords,
    staticParityScanPresent: loaded.staticParityScanPresent,
    bidOnlyCandidateLifecyclePresent: loaded.bidOnlyCandidateLifecyclePresent,
  });

  const selection = {
    analysisScope: input.inputPaths.captureRunDir ? "selected-run" as const : "aggregate" as const,
    forwardQuotesDir: "data/live-capture/forward-quotes",
    captureRunDir: input.inputPaths.captureRunDir,
    selectedRunId: input.inputPaths.captureRunDir
      ? resolveRunIdFromPath(input.inputPaths.captureRunDir)
      : null,
  };
  const sourceRunIds = selection.analysisScope === "selected-run"
    ? selection.selectedRunId
      ? [selection.selectedRunId]
      : []
    : [];
  const scope = buildDownstreamScopeMetadata({
    selection,
    generatedAt: input.generatedAt,
    recordsScanned: evaluation.summary.episodesAssessed,
    artifactValidation: loaded.artifacts.artifactValidation ?? {
      identities: [],
      staleArtifacts: [],
      mismatchedArtifacts: [],
      malformedArtifacts: [],
      missingArtifacts: [],
      warnings: [],
      usablePaths: [
        ...(loaded.staticParityScanPresent ? [input.inputPaths.staticParityScanPath] : []),
        ...(loaded.bidOnlyCandidateLifecyclePresent
          ? [input.inputPaths.bidOnlyCandidateLifecyclePath]
          : []),
      ],
    },
  });
  const scopeFields = spreadDownstreamScopeFields(scope, { sourceRunIds });

  return {
    generatedAt: input.generatedAt,
    outputPath: input.outputPath,
    htmlOutputPath: input.htmlOutputPath,
    disclaimer: EXECUTABLE_CONFIRMATION_DESIGN_DISCLAIMER,
    caveats: EXECUTABLE_CONFIRMATION_DESIGN_CAVEATS,
    inputPaths: input.inputPaths,
    config,
    summary: evaluation.summary,
    dataAssessment,
    confirmationRecords: evaluation.confirmationRecords,
    exampleConfirmationRecord: evaluation.exampleConfirmationRecord,
    ...scopeFields,
  };
}
