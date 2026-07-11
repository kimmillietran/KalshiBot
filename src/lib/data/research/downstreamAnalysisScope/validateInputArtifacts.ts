import type {
  ArtifactValidationResult,
  CaptureRunSelection,
  InputArtifactIdentity,
} from "./downstreamAnalysisScopeTypes";
import {
  artifactMatchesSelectedRun,
  isArtifactStale,
  isRecord,
  parseArtifactScope,
} from "./downstreamAnalysisScopeUtils";

export type ArtifactValidationIo = {
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
};

/** Validates upstream artifacts for selected-run or aggregate downstream analysis. */
export function validateInputArtifacts(input: {
  io: ArtifactValidationIo;
  selection: CaptureRunSelection;
  artifactPaths: readonly string[];
  evaluatedAt: string;
  staleAfterHours?: number;
  requireIdentityInSelectedRun?: boolean;
}): ArtifactValidationResult {
  const staleAfterHours = input.staleAfterHours ?? 24;
  const identities: InputArtifactIdentity[] = [];
  const staleArtifacts: string[] = [];
  const mismatchedArtifacts: string[] = [];
  const malformedArtifacts: string[] = [];
  const missingArtifacts: string[] = [];
  const warnings: string[] = [];
  const usablePaths: string[] = [];

  for (const path of input.artifactPaths) {
    if (!input.io.fileExists(path)) {
      missingArtifacts.push(path);
      identities.push({
        path,
        present: false,
        analysisScope: null,
        selectedRunId: null,
        sourceRunIds: [],
        artifactGeneratedAt: null,
        verified: false,
        warnings: ["Artifact missing."],
      });
      continue;
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(input.io.readFile(path).replace(/^\uFEFF/, "")) as Record<string, unknown>;
    } catch {
      malformedArtifacts.push(path);
      identities.push({
        path,
        present: true,
        analysisScope: null,
        selectedRunId: null,
        sourceRunIds: [],
        artifactGeneratedAt: null,
        verified: false,
        warnings: ["Malformed JSON artifact."],
      });
      continue;
    }

    if (!isRecord(parsed)) {
      malformedArtifacts.push(path);
      identities.push({
        path,
        present: true,
        analysisScope: null,
        selectedRunId: null,
        sourceRunIds: [],
        artifactGeneratedAt: null,
        verified: false,
        warnings: ["Artifact root is not a JSON object."],
      });
      continue;
    }

    const scope = parseArtifactScope(parsed);
    const identityWarnings: string[] = [];
    let verified = true;

    if (input.selection.analysisScope === "selected-run" && input.selection.selectedRunId) {
      if (scope.analysisScope === "aggregate") {
        mismatchedArtifacts.push(path);
        identityWarnings.push("Artifact is aggregate-scoped.");
        verified = false;
      }

      if (
        scope.sourceRunIds.length > 0
        && !artifactMatchesSelectedRun(scope, input.selection.selectedRunId)
      ) {
        mismatchedArtifacts.push(path);
        identityWarnings.push("Artifact sourceRunIds do not include selected run.");
        verified = false;
      }

      if (
        scope.selectedRunId
        && scope.selectedRunId !== input.selection.selectedRunId
        && !scope.sourceRunIds.includes(input.selection.selectedRunId)
      ) {
        mismatchedArtifacts.push(path);
        identityWarnings.push("Artifact selectedRunId does not match selected run.");
        verified = false;
      }

      if (
        input.requireIdentityInSelectedRun
        && scope.analysisScope !== "selected-run"
        && scope.sourceRunIds.length === 0
        && !scope.selectedRunId
      ) {
        identityWarnings.push("Artifact run identity is missing and cannot be verified.");
        verified = false;
      }
    }

    if (isArtifactStale(scope.generatedAt, input.evaluatedAt, staleAfterHours)) {
      staleArtifacts.push(path);
      identityWarnings.push(`Artifact older than ${staleAfterHours}h.`);
      verified = false;
    }

    const identity: InputArtifactIdentity = {
      path,
      present: true,
      analysisScope: scope.analysisScope,
      selectedRunId: scope.selectedRunId,
      sourceRunIds: scope.sourceRunIds,
      artifactGeneratedAt: scope.generatedAt,
      verified,
      warnings: identityWarnings,
    };
    identities.push(identity);

    if (verified) {
      usablePaths.push(path);
    } else {
      warnings.push(...identityWarnings.map((warning) => `${path}: ${warning}`));
    }
  }

  return {
    identities,
    staleArtifacts,
    mismatchedArtifacts,
    malformedArtifacts,
    missingArtifacts,
    warnings,
    usablePaths,
  };
}
