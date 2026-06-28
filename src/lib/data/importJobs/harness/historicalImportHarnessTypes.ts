import type { HistoricalBronzeImportConfig } from "../config/historicalBronzeImportConfigTypes";
import type {
  BtcHistoricalBronzeProvider,
  HistoricalBronzeImportJobResult,
  KalshiHistoricalBronzeProvider,
} from "../historicalBronzeImportJobTypes";

export type RunConfiguredHistoricalBronzeImportInput = {
  config: HistoricalBronzeImportConfig;
  kalshiProvider: KalshiHistoricalBronzeProvider;
  btcProvider: BtcHistoricalBronzeProvider;
};

export type { HistoricalBronzeImportJobResult };
