import type { HistoricalDataset } from "../datasetTypes";
import type { DatasetVersion } from "@/lib/data/versioning";

export type HistoricalDatasetManifestGeneratedMetadata = {
  generatedAt?: string;
  generatedBy?: string;
  label?: string;
  source?: string;
};

export type HistoricalDatasetManifest = {
  datasetId: string;
  contractVersion: DatasetVersion;
  snapshotCount: number;
  marketCount: number;
  marketTickers: readonly string[];
  earliestTimestamp: string;
  latestTimestamp: string;
  btcBarCount: number;
  marketWindowCount: number;
  settlementCount: number;
  generatedMetadata: HistoricalDatasetManifestGeneratedMetadata;
};

export type BuildHistoricalDatasetManifestInput = {
  dataset: HistoricalDataset;
  generatedMetadata: HistoricalDatasetManifestGeneratedMetadata;
};
