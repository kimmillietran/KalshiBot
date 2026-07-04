import { describe, expect, it } from "vitest";

import type { DiscoveredMarket, MarketDiscoveryResult } from "@/lib/data/discovery";
import {
  HistoricalBronzeImportBtcProvider,
  HistoricalBronzeImportKalshiSource,
} from "@/lib/data/importJobs/config";
import { parseHistoricalImportInputJson } from "../../../../../scripts/import/types";

import {
  BatchImportConfigErrorCode,
  buildBatchImportConfigs,
} from "./index";
import { deriveImportWindowFromDiscoveredMarket } from "./deriveImportWindow";
import { parseMarketDiscoveryResultJson } from "./parseMarketDiscoveryResult";

const PROVENANCE = {
  source: "kalshi-historical-api" as const,
  fetchedAt: "2026-06-27T01:00:00.000Z",
  requestPath: "/historical/markets?series_ticker=KXBTC15M",
  cursor: "",
};

function discoveredMarket(
  overrides: Partial<DiscoveredMarket> = {},
): DiscoveredMarket {
  return {
    marketTicker: "KXBTC15M-26APR281945-45",
    eventTicker: "KXBTC15M-26APR281945",
    seriesTicker: "KXBTC15M",
    title: "BTC price up in 15 minutes",
    subtitle: null,
    status: "finalized",
    openTime: "2026-04-28T23:30:00.000Z",
    closeTime: "2026-04-28T23:45:00.000Z",
    settlementTime: "2026-04-28T23:45:09.271Z",
    expirationValue: "76282.84",
    listMarketWire: {
      ticker: "KXBTC15M-26APR281945-45",
      event_ticker: "KXBTC15M-26APR281945",
      series_ticker: "KXBTC15M",
      status: "finalized",
      open_time: "2026-04-28T23:30:00.000Z",
      close_time: "2026-04-28T23:45:00.000Z",
      expiration_value: "76282.84",
    },
    provenance: PROVENANCE,
    ...overrides,
  };
}

function discoveryResult(
  markets: DiscoveredMarket[],
  overrides: Partial<MarketDiscoveryResult> = {},
): MarketDiscoveryResult {
  return {
    metadata: {
      seriesTicker: "KXBTC15M",
      discoveredAt: "2026-06-27T01:00:00.000Z",
      marketCount: markets.length,
      pageCount: 1,
    },
    markets,
    validation: {
      valid: true,
      errors: [],
      warnings: [],
    },
    provenance: {
      pages: [PROVENANCE],
    },
    ...overrides,
  };
}

function serializeDiscovery(result: MarketDiscoveryResult): string {
  return JSON.stringify({
    metadata: result.metadata,
    markets: [...result.markets],
    validation: result.validation,
    provenance: result.provenance,
  });
}

describe("deriveImportWindowFromDiscoveredMarket", () => {
  it("derives start/end from open and close and collection 10s after close", () => {
    expect(deriveImportWindowFromDiscoveredMarket(discoveredMarket())).toEqual({
      startTime: "2026-04-28T23:30:00.000Z",
      endTime: "2026-04-28T23:45:00.000Z",
      collectionTime: "2026-04-28T23:45:10.000Z",
      observedAt: "2026-04-28T23:45:10.000Z",
    });
  });

  it("rejects missing open or close timestamps", () => {
    expect(() =>
      deriveImportWindowFromDiscoveredMarket(
        discoveredMarket({ openTime: null }),
      ),
    ).toThrowError(
      expect.objectContaining({
        code: BatchImportConfigErrorCode.MISSING_IMPORT_WINDOW_TIMESTAMPS,
      }),
    );
  });
});

describe("parseMarketDiscoveryResultJson", () => {
  it("parses a valid discovery-result document", () => {
    const parsed = parseMarketDiscoveryResultJson(
      serializeDiscovery(discoveryResult([discoveredMarket()])),
    );

    expect(parsed.markets).toHaveLength(1);
    expect(parsed.metadata.seriesTicker).toBe("KXBTC15M");
  });

  it("rejects invalid discovery schema", () => {
    expect(() => parseMarketDiscoveryResultJson("{}")).toThrowError(
      expect.objectContaining({
        code: BatchImportConfigErrorCode.INVALID_DISCOVERY_SCHEMA,
      }),
    );
  });

  it("rejects discovery results that failed validation", () => {
    expect(() =>
      parseMarketDiscoveryResultJson(
        serializeDiscovery(
          discoveryResult([], {
            validation: {
              valid: false,
              errors: [
                {
                  errorCode: "empty-results",
                  severity: "error",
                  message: "Discovery returned no markets",
                },
              ],
              warnings: [],
            },
          }),
        ),
      ),
    ).toThrowError(
      expect.objectContaining({
        code: BatchImportConfigErrorCode.INVALID_DISCOVERY_RESULT,
      }),
    );
  });
});

describe("buildBatchImportConfigs", () => {
  it("generates stable per-market configs with Coinbase defaults", () => {
    const markets = [
      discoveredMarket(),
      discoveredMarket({
        marketTicker: "KXBTC15M-26APR281930-30",
        openTime: "2026-04-28T23:15:00.000Z",
        closeTime: "2026-04-28T23:30:00.000Z",
      }),
    ];

    const first = buildBatchImportConfigs({
      discovery: discoveryResult(markets),
    });
    const second = buildBatchImportConfigs({
      discovery: discoveryResult([...markets].reverse()),
    });

    expect(first).toEqual(second);
    expect(first.files).toHaveLength(2);
    expect(first.files[0]?.outputPath).toBe(
      "data/import-configs/KXBTC15M/KXBTC15M-26APR281930-30/config.json",
    );
    expect(first.files[1]?.outputPath).toBe(
      "data/import-configs/KXBTC15M/KXBTC15M-26APR281945-45/config.json",
    );

    for (const file of first.files) {
      expect(file.config.btc).toEqual({
        provider: HistoricalBronzeImportBtcProvider.COINBASE_SPOT,
        symbol: "BTC-USD",
        interval: "1m",
      });
      expect(file.config.kalshi.marketSource).toBe(
        HistoricalBronzeImportKalshiSource.KALSHI_REST,
      );
      expect(file.serialized).toBe(
        buildBatchImportConfigs({
          discovery: discoveryResult([markets.find((m) => m.marketTicker === file.marketTicker)!]),
        }).files[0]?.serialized,
      );
      expect(() => parseHistoricalImportInputJson(file.serialized)).not.toThrow();
    }
  });

  it("rejects duplicate output paths", () => {
    const duplicateTicker = discoveredMarket();
    expect(() =>
      buildBatchImportConfigs({
        discovery: discoveryResult([duplicateTicker, duplicateTicker]),
      }),
    ).toThrowError(
      expect.objectContaining({
        code: BatchImportConfigErrorCode.DUPLICATE_OUTPUT_PATH,
      }),
    );
  });

  it("rejects invalid market ticker path characters", () => {
    expect(() =>
      buildBatchImportConfigs({
        discovery: discoveryResult([
          discoveredMarket({ marketTicker: "KXBTC15M/bad" }),
        ]),
      }),
    ).toThrowError(
      expect.objectContaining({
        code: BatchImportConfigErrorCode.INVALID_MARKET_TICKER_PATH,
      }),
    );
  });
});
