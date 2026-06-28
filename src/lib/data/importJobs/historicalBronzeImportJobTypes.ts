import type { HistoricalBronzeValidationResult } from "@/lib/data/datasets/validation";
import type { RawHistoricalRecord } from "@/lib/data/types";

export type HistoricalBronzeProviderImportInput = {
  marketTicker: string;
  startTime: string;
  endTime: string;
  collectionTime: string;
  observedAt: string;
};

export type KalshiHistoricalBronzeProvider = {
  importKalshiMarketRecords: (
    input: HistoricalBronzeProviderImportInput,
  ) => readonly RawHistoricalRecord[];
  importKalshiCandleRecords: (
    input: HistoricalBronzeProviderImportInput,
  ) => readonly RawHistoricalRecord[];
  importKalshiSettlementRecords: (
    input: HistoricalBronzeProviderImportInput,
  ) => readonly RawHistoricalRecord[];
};

export type BtcHistoricalBronzeProvider = {
  importBtcKlineRecords: (
    input: HistoricalBronzeProviderImportInput,
  ) => readonly RawHistoricalRecord[];
};

export type RunHistoricalBronzeImportJobInput = {
  jobId: string;
  marketTicker: string;
  startTime: string;
  endTime: string;
  kalshiProvider: KalshiHistoricalBronzeProvider;
  btcProvider: BtcHistoricalBronzeProvider;
  collectionTime: string;
  observedAt: string;
};

export type HistoricalBronzeImportJobMetadata = {
  jobId: string;
  marketTicker: string;
  startTime: string;
  endTime: string;
  collectionTime: string;
  observedAt: string;
  bronzeRecordCount: number;
  valid: boolean;
};

export type HistoricalBronzeImportJobCoreResult = {
  jobId: string;
  bronzeRecords: readonly RawHistoricalRecord[];
  validationResult: HistoricalBronzeValidationResult;
  metadata: HistoricalBronzeImportJobMetadata;
};

export type HistoricalBronzeImportJobResult = HistoricalBronzeImportJobCoreResult & {
  serialized: string;
};
