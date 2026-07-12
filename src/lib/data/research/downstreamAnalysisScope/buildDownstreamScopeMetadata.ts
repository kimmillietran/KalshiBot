import type {
  ArtifactValidationResult,
  CaptureRunSelection,
  DownstreamScopeMetadata,
} from "./downstreamAnalysisScopeTypes";

/** Builds scope metadata attached to downstream research artifacts. */
export function buildDownstreamScopeMetadata(input: {
  selection: CaptureRunSelection;
  generatedAt: string;
  recordsScanned: number | null;
  artifactValidation: ArtifactValidationResult;
  extraWarnings?: readonly string[];
}): DownstreamScopeMetadata {
  const sourceRunIds =
    input.selection.analysisScope === "selected-run" && input.selection.selectedRunId
      ? [input.selection.selectedRunId]
      : [];

  const warnings = [
    ...input.artifactValidation.warnings,
    ...(input.extraWarnings ?? []),
  ];

  if (
    input.selection.analysisScope === "selected-run"
    && input.selection.selectedRunId
    && sourceRunIds.length !== 1
  ) {
    warnings.push("selected-run mode requires exactly one sourceRunId.");
  }

  return {
    analysisScope: input.selection.analysisScope,
    selectedRunId: input.selection.selectedRunId,
    selectedRunDirectory: input.selection.captureRunDir,
    sourceRunIds,
    recordsScanned: input.recordsScanned,
    artifactGeneratedAt: input.generatedAt,
    inputArtifactsUsed: input.artifactValidation.usablePaths,
    inputArtifactIdentities: input.artifactValidation.identities,
    warnings,
    staleArtifacts: input.artifactValidation.staleArtifacts,
    mismatchedArtifacts: input.artifactValidation.mismatchedArtifacts,
    malformedArtifacts: input.artifactValidation.malformedArtifacts,
    missingArtifacts: input.artifactValidation.missingArtifacts,
  };
}
