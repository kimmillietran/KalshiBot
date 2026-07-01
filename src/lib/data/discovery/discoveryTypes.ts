import type { HistoricalImportProvenance } from "@/lib/data/importers/kalshi/kalshiHistoricalTypes";

export const DEFAULT_KXBTC15M_SERIES_TICKER = "KXBTC15M" as const;

export const MarketDiscoveryErrorCode = {
  EMPTY_RESULTS: "empty-results",
  MISSING_MARKET_TICKER: "missing-market-ticker",
  MALFORMED_TIMESTAMP: "malformed-timestamp",
  DUPLICATE_MARKET_TICKER: "duplicate-market-ticker",
  UNSUPPORTED_STATUS: "unsupported-status",
} as const;

export type MarketDiscoveryErrorCode =
  (typeof MarketDiscoveryErrorCode)[keyof typeof MarketDiscoveryErrorCode];

export type MarketDiscoveryValidationSeverity = "error" | "warning";

export type MarketDiscoveryValidationIssue = {
  errorCode: MarketDiscoveryErrorCode;
  severity: MarketDiscoveryValidationSeverity;
  message: string;
  marketTicker?: string;
};

export type MarketDiscoveryProvenance = HistoricalImportProvenance;

export type DiscoveredMarket = {
  marketTicker: string;
  eventTicker: string;
  seriesTicker: string;
  title: string | null;
  subtitle: string | null;
  status: string;
  openTime: string | null;
  closeTime: string | null;
  settlementTime: string | null;
  expirationValue: string | null;
  provenance: MarketDiscoveryProvenance;
};

export type MarketDiscoveryMetadata = {
  seriesTicker: string;
  discoveredAt: string;
  marketCount: number;
  pageCount: number;
};

export type MarketDiscoveryValidationResult = {
  valid: boolean;
  errors: readonly MarketDiscoveryValidationIssue[];
  warnings: readonly MarketDiscoveryValidationIssue[];
};

export type MarketDiscoveryResult = {
  metadata: MarketDiscoveryMetadata;
  markets: readonly DiscoveredMarket[];
  validation: MarketDiscoveryValidationResult;
  provenance: {
    pages: readonly MarketDiscoveryProvenance[];
  };
};

export class MarketDiscoveryError extends Error {
  readonly code: string;

  constructor(message: string, code = "market-discovery-error") {
    super(message);
    this.name = "MarketDiscoveryError";
    this.code = code;
  }
}
