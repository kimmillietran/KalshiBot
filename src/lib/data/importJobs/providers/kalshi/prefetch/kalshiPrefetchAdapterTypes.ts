import type { HistoricalImporter } from "@/lib/data/importers/kalshi";
import type { KalshiMarketWireShape } from "@/lib/data/importers/kalshi/kalshiMarketImportDiagnostics";
import type { KalshiHistoricalMarketReconciliationTraceHooks } from "@/lib/data/importers/kalshi/kalshiMarketReconciliationTraceHooks";
import type {
  HistoricalCandlesticksResult,
  HistoricalDateRange,
  HistoricalMarketRecord,
  HistoricalSettlementResult,
} from "@/lib/data/importers/kalshi/kalshiHistoricalTypes";

export type PrefetchKalshiHistoricalReconciliationTraceCallbacks = {
  onPrefetchListMarketWire?: (input: {
    ticker: string;
    listMarketWire: KalshiMarketWireShape | null | undefined;
  }) => void;
  importerTrace?: KalshiHistoricalMarketReconciliationTraceHooks;
};

export type PrefetchKalshiHistoricalBronzeImporterInput = {
  importer: HistoricalImporter;
  marketTicker: string;
  startTime: string;
  endTime: string;
  listMarketWire?: KalshiMarketWireShape | null;
  reconciliationTrace?: PrefetchKalshiHistoricalReconciliationTraceCallbacks | null;
};

export type PrefetchedKalshiHistoricalBronzeState = {
  marketTicker: string;
  dateRange: HistoricalDateRange;
  market: HistoricalMarketRecord | null;
  candlesticks: HistoricalCandlesticksResult;
  settlement: HistoricalSettlementResult | null;
};

import type { DataQualityFlag } from "@/lib/data/schemas";

export type CreatePrefetchedKalshiHistoricalBronzeProviderInput = {
  importer: HistoricalImporter;
  marketTicker: string;
  startTime: string;
  endTime: string;
  collectionTime: string;
  observedAt: string;
  listMarketWire?: KalshiMarketWireShape | null;
  reconciliationTrace?: PrefetchKalshiHistoricalReconciliationTraceCallbacks | null;
  settlementQualityFlags?: readonly DataQualityFlag[];
};
