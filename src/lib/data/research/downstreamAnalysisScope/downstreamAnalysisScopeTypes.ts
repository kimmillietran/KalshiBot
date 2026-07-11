export type AnalysisScope = "selected-run" | "aggregate";

export type InputArtifactIdentity = {
  path: string;
  present: boolean;
  analysisScope: AnalysisScope | null;
  selectedRunId: string | null;
  sourceRunIds: readonly string[];
  artifactGeneratedAt: string | null;
  verified: boolean;
  warnings: readonly string[];
};

export type DownstreamScopeMetadata = {
  analysisScope: AnalysisScope;
  selectedRunId: string | null;
  selectedRunDirectory: string | null;
  sourceRunIds: readonly string[];
  recordsScanned: number | null;
  artifactGeneratedAt: string;
  inputArtifactsUsed: readonly string[];
  inputArtifactIdentities: readonly InputArtifactIdentity[];
  warnings: readonly string[];
  staleArtifacts: readonly string[];
  mismatchedArtifacts: readonly string[];
  malformedArtifacts: readonly string[];
  missingArtifacts: readonly string[];
};

export type CaptureRunSelection = {
  analysisScope: AnalysisScope;
  forwardQuotesDir: string;
  captureRunDir: string | null;
  selectedRunId: string | null;
};

export type ParsedArtifactScope = {
  analysisScope: AnalysisScope | null;
  selectedRunId: string | null;
  sourceRunIds: readonly string[];
  generatedAt: string | null;
};

export type ArtifactValidationResult = {
  identities: InputArtifactIdentity[];
  staleArtifacts: string[];
  mismatchedArtifacts: string[];
  malformedArtifacts: string[];
  missingArtifacts: string[];
  warnings: string[];
  usablePaths: string[];
};

export type SequenceGapCounterSemantics = {
  fieldName: string;
  reportedValue: number | null;
  semanticDefinition: string;
  notes: readonly string[];
};

export class DownstreamAnalysisScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DownstreamAnalysisScopeError";
  }
}
