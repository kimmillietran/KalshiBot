import type { HistoricalImporter } from "@/lib/data/importers/kalshi";
import type { KalshiMarketWireShape } from "@/lib/data/importers/kalshi/kalshiMarketImportDiagnostics";
import type {
  HistoricalCandlesticksResult,
  HistoricalDateRange,
  HistoricalMarketRecord,
  HistoricalSettlementResult,
} from "@/lib/data/importers/kalshi/kalshiHistoricalTypes";

export type PrefetchKalshiHistoricalBronzeImporterInput = {
  importer: HistoricalImporter;
  marketTicker: string;
  startTime: string;
  endTime: string;
  listMarketWire?: KalshiMarketWireShape | null;
};

export type PrefetchedKalshiHistoricalBronzeState = {
  marketTicker: string;
  dateRange: HistoricalDateRange;
  market: HistoricalMarketRecord | null;
  candlesticks: HistoricalCandlesticksResult;
  settlement: HistoricalSettlementResult | null;
};

export type CreatePrefetchedKalshiHistoricalBronzeProviderInput = {
  importer: HistoricalImporter;
  marketTicker: string;
  startTime: string;
  endTime: string;
  collectionTime: string;
  observedAt: string;
  listMarketWire?: KalshiMarketWireShape | null;
};
