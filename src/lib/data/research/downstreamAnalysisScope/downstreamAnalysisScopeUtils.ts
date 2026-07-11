import type { AnalysisScope, ParsedArtifactScope } from "./downstreamAnalysisScopeTypes";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string");
}

export function joinPath(root: string, child: string): string {
  return `${root.replace(/[\\/]+$/, "")}/${child}`;
}

export function resolveRunIdFromPath(captureRunDir: string): string {
  const normalized = captureRunDir.replace(/\\/g, "/").replace(/\/$/, "");
  const segments = normalized.split("/");
  return segments[segments.length - 1] ?? normalized;
}

export function parseArtifactScope(parsed: Record<string, unknown>): ParsedArtifactScope {
  const summary = isRecord(parsed.summary) ? parsed.summary : null;
  const config = isRecord(parsed.config) ? parsed.config : null;
  const scopeBlock = isRecord(parsed.scope) ? parsed.scope : null;

  const analysisScopeValue =
    readString(parsed.analysisScope)
    ?? readString(scopeBlock?.analysisScope)
    ?? readString(summary?.analysisScope);
  const analysisScope: AnalysisScope | null =
    analysisScopeValue === "selected-run" || analysisScopeValue === "aggregate"
      ? analysisScopeValue
      : null;

  const selectedRunId =
    readString(parsed.selectedRunId)
    ?? readString(scopeBlock?.selectedRunId)
    ?? readString(summary?.selectedRunId)
    ?? readString(config?.captureRunDir)?.split("/").pop()
    ?? null;

  const sourceRunIds =
    readStringArray(parsed.sourceRunIds).length > 0
      ? readStringArray(parsed.sourceRunIds)
      : readStringArray(scopeBlock?.sourceRunIds).length > 0
        ? readStringArray(scopeBlock?.sourceRunIds)
        : readStringArray(summary?.sourceRunIds);

  const generatedAt =
    readString(parsed.generatedAt)
    ?? readString(scopeBlock?.artifactGeneratedAt)
    ?? readString(summary?.generatedAt);

  return {
    analysisScope,
    selectedRunId,
    sourceRunIds,
    generatedAt,
  };
}

export function artifactMatchesSelectedRun(
  scope: ParsedArtifactScope,
  selectedRunId: string,
): boolean {
  if (scope.sourceRunIds.length > 0) {
    return (
      scope.sourceRunIds.length === 1
      && scope.sourceRunIds[0] === selectedRunId
      && (!scope.selectedRunId || scope.selectedRunId === selectedRunId)
    );
  }

  return scope.selectedRunId === selectedRunId;
}

/** Spreads scope metadata on reports with backward-compatible top-level fields. */
export function spreadDownstreamScopeFields(
  scope: import("./downstreamAnalysisScopeTypes").DownstreamScopeMetadata,
  overrides?: { sourceRunIds?: readonly string[] },
): {
  scope: import("./downstreamAnalysisScopeTypes").DownstreamScopeMetadata;
  analysisScope: import("./downstreamAnalysisScopeTypes").AnalysisScope;
  selectedRunId: string | null;
  sourceRunIds: readonly string[];
} {
  const sourceRunIds = overrides?.sourceRunIds ?? scope.sourceRunIds;

  return {
    scope,
    analysisScope: scope.analysisScope,
    selectedRunId: scope.selectedRunId,
    sourceRunIds,
  };
}

export function isArtifactStale(
  generatedAt: string | null,
  evaluatedAt: string,
  staleAfterHours: number,
): boolean {
  if (!generatedAt) {
    return false;
  }

  const generatedMs = Date.parse(generatedAt);
  const evaluatedMs = Date.parse(evaluatedAt);
  if (!Number.isFinite(generatedMs) || !Number.isFinite(evaluatedMs)) {
    return false;
  }

  const ageHours = (evaluatedMs - generatedMs) / (1000 * 60 * 60);
  return ageHours > staleAfterHours;
}

export function isArtifactFreshnessUnverifiable(
  generatedAt: string | null,
  evaluatedAt: string,
): boolean {
  if (!generatedAt) {
    return true;
  }

  const generatedMs = Date.parse(generatedAt);
  const evaluatedMs = Date.parse(evaluatedAt);
  if (!Number.isFinite(generatedMs) || !Number.isFinite(evaluatedMs)) {
    return true;
  }

  return generatedMs > evaluatedMs;
}
