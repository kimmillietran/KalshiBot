import type {
  BtcHistoricalBronzeProvider,
  HistoricalBronzeImportJobResult,
  KalshiHistoricalBronzeProvider,
} from "../historicalBronzeImportJobTypes";
import type { HistoricalBronzeImportConfig } from "../config/historicalBronzeImportConfigTypes";

export type HistoricalImportFetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export type HistoricalImportProviders = {
  kalshiProvider: KalshiHistoricalBronzeProvider;
  btcProvider: BtcHistoricalBronzeProvider;
};

export type CreateHistoricalImportProvidersFromConfigInput = {
  config: HistoricalBronzeImportConfig;
  fetchImpl?: HistoricalImportFetchLike;
};

export type RunHistoricalImportFromConfigInput = {
  config: HistoricalBronzeImportConfig;
  fetchImpl?: HistoricalImportFetchLike;
};

export type { HistoricalBronzeImportJobResult };

export const HistoricalImportBootstrapErrorCode = {
  MISSING_FETCH_IMPL: "missing-fetch-impl",
  UNSUPPORTED_BTC_PROVIDER: "unsupported-btc-provider",
  UNSUPPORTED_BTC_INTERVAL: "unsupported-btc-interval",
} as const;

export type HistoricalImportBootstrapErrorCode =
  (typeof HistoricalImportBootstrapErrorCode)[keyof typeof HistoricalImportBootstrapErrorCode];

export class HistoricalImportBootstrapError extends Error {
  readonly code: HistoricalImportBootstrapErrorCode;

  constructor(message: string, code: HistoricalImportBootstrapErrorCode) {
    super(message);
    this.name = "HistoricalImportBootstrapError";
    this.code = code;
  }
}
