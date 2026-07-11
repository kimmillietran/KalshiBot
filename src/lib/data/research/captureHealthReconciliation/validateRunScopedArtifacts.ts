import type {
  AnalysisScope,
  CaptureHealthReconciliationIo,
  DownstreamArtifactScopeCheck,
} from "./captureHealthReconciliationTypes";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string");
}

function parseArtifactScope(
  parsed: Record<string, unknown>,
): {
  analysisScope: AnalysisScope | null;
  selectedRunId: string | null;
  sourceRunIds: string[];
  generatedAt: string | null;
} {
  const summary = isRecord(parsed.summary) ? parsed.summary : null;
  const config = isRecord(parsed.config) ? parsed.config : null;

  const analysisScopeValue =
    readString(parsed.analysisScope)
    ?? readString(summary?.analysisScope);
  const analysisScope =
    analysisScopeValue === "selected-run" || analysisScopeValue === "aggregate"
      ? analysisScopeValue
      : null;

  const selectedRunId =
    readString(parsed.selectedRunId)
    ?? readString(summary?.selectedRunId)
    ?? readString(config?.captureRunDir)?.split("/").pop()
    ?? null;

  const sourceRunIds =
    readStringArray(parsed.sourceRunIds).length > 0
      ? readStringArray(parsed.sourceRunIds)
      : readStringArray(summary?.sourceRunIds);

  const generatedAt = readString(parsed.generatedAt) ?? readString(summary?.generatedAt);

  return {
    analysisScope,
    selectedRunId,
    sourceRunIds,
    generatedAt,
  };
}

/** Validates downstream artifacts against the selected capture run. */
export function validateRunScopedArtifacts(input: {
  io: CaptureHealthReconciliationIo;
  selectedRunId: string;
  artifactPaths: readonly string[];
  evaluatedAt: string;
  staleAfterHours: number;
}): DownstreamArtifactScopeCheck[] {
  const evaluatedAtMs = Date.parse(input.evaluatedAt);

  return input.artifactPaths.map((artifactPath) => {
    if (!input.io.fileExists(artifactPath)) {
      return {
        artifactPath,
        present: false,
        analysisScope: null,
        selectedRunId: null,
        sourceRunIds: [],
        artifactGeneratedAt: null,
        matchesSelectedRun: false,
        stale: false,
        warnings: ["Artifact missing."],
      };
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(input.io.readFile(artifactPath).replace(/^\uFEFF/, "")) as Record<string, unknown>;
    } catch {
      return {
        artifactPath,
        present: true,
        analysisScope: null,
        selectedRunId: null,
        sourceRunIds: [],
        artifactGeneratedAt: null,
        matchesSelectedRun: false,
        stale: false,
        warnings: ["Malformed JSON artifact."],
      };
    }

    const scope = parseArtifactScope(parsed);
    const matchesSelectedRun =
      scope.selectedRunId === input.selectedRunId
      || scope.sourceRunIds.includes(input.selectedRunId);

    const warnings: string[] = [];
    if (scope.analysisScope === "aggregate") {
      warnings.push("Artifact is aggregate-scoped.");
    }

    if (
      scope.sourceRunIds.length > 0
      && !scope.sourceRunIds.includes(input.selectedRunId)
    ) {
      warnings.push("Artifact sourceRunIds do not include selected run.");
    }

    let stale = false;
    if (scope.generatedAt) {
      const generatedMs = Date.parse(scope.generatedAt);
      if (Number.isFinite(generatedMs) && Number.isFinite(evaluatedAtMs)) {
        const ageHours = (evaluatedAtMs - generatedMs) / (1000 * 60 * 60);
        stale = ageHours > input.staleAfterHours;
        if (stale) {
          warnings.push(`Artifact older than ${input.staleAfterHours}h.`);
        }
      }
    }

    return {
      artifactPath,
      present: true,
      analysisScope: scope.analysisScope,
      selectedRunId: scope.selectedRunId,
      sourceRunIds: scope.sourceRunIds,
      artifactGeneratedAt: scope.generatedAt,
      matchesSelectedRun,
      stale,
      warnings,
    };
  });
}
