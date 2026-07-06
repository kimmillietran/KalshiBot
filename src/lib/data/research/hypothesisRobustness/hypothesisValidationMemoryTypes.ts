export type HypothesisValidationMemoryDiagnostics = {
  hypothesisCandidateCount: number;
  validationCandidateCount: number;
  atlasBucketReferenceCount: number;
  researchOutputFilesScanned: number;
  observationsProcessed: number;
  observationsMatched: number;
  monthBucketCount: number;
  peakHeapUsedBytes: number | null;
  largestFileBytes: number;
  largestFilePath: string | null;
  largestIntermediateCollection: string;
  skippedUnsupportedCandidates: number;
};
