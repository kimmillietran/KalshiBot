export type HypothesisEvidenceMemoryDiagnostics = {
  researchOutputFilesScanned: number;
  atlasBucketReferenceCount: number;
  observationsProcessed: number;
  peakHeapUsedBytes: number | null;
  largestFileBytes: number;
  largestFilePath: string | null;
  largestIntermediateCollection: string;
};
