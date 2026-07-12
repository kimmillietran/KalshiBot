import { describe, expect, it, vi } from "vitest";

import {
  buildHistoricalBronzeImportConfig,
  HistoricalBronzeImportBtcInterval,
  HistoricalBronzeImportBtcProvider,
  HistoricalBronzeImportConfigError,
  HistoricalBronzeImportKalshiSource,
  HistoricalBronzeImportMode,
  HistoricalBronzeImportOutputFormat,
} from "@/lib/data/importJobs/config";
import type {
  BuildHistoricalBronzeImportConfigInput,
  HistoricalBronzeImportConfig,
} from "@/lib/data/importJobs/config";
import * as btcImporters from "@/lib/data/importers/btc";
import {
  BtcHistoricalHttpAdapter,
  CoinbaseHistoricalHttpAdapter,
} from "@/lib/data/importers/btc";
import {
  KalshiHistoricalHttpAdapter,
  KalshiHistoricalImporter,
} from "@/lib/data/importers/kalshi";

import {
  createHistoricalImportProvidersFromConfig,
  runHistoricalImportFromConfig,
} from "./HistoricalImportBootstrap";
import {
  HistoricalImportBootstrapError,
  HistoricalImportBootstrapErrorCode,
} from "./historicalImportBootstrapTypes";
import type { HistoricalImportFetchLike } from "./historicalImportBootstrapTypes";

const START_TIME = "2026-06-26T23:15:00.000Z";
const END_TIME = "2026-06-26T23:30:00.000Z";
const COLLECTION_TIME = "2026-06-27T01:00:00.000Z";
const OBSERVED_AT = "2026-06-27T01:00:05.000Z";
const MARKET_TICKER = "KXBTC15M-26JUN262315-15";

const SAMPLE_MARKET_WIRE = {
  ticker: MARKET_TICKER,
  event_ticker: "KXBTC15M-26JUN262315",
  status: "finalized",
  result: "yes",
  open_time: "2026-06-27T01:00:00.000Z",
  close_time: "2026-06-27T01:15:00.000Z",
  settlement_ts: "2026-06-27T01:20:00.000Z",
  settlement_value_dollars: "1.0000",
  expiration_value: "60010.25",
  floor_strike: 59_990.31,
};

function validConfigInput(
  overrides: Partial<BuildHistoricalBronzeImportConfigInput> = {},
): BuildHistoricalBronzeImportConfigInput {
  return {
    jobId: "import-job-bootstrap",
    marketTicker: MARKET_TICKER,
    startTime: START_TIME,
    endTime: END_TIME,
    collectionTime: COLLECTION_TIME,
    observedAt: OBSERVED_AT,
    kalshi: {
      marketSource: HistoricalBronzeImportKalshiSource.KALSHI_REST,
      candleSource: HistoricalBronzeImportKalshiSource.KALSHI_CANDLES,
      settlementSource: HistoricalBronzeImportKalshiSource.KALSHI_REST,
    },
    btc: {
      provider: HistoricalBronzeImportBtcProvider.BINANCE_SPOT,
      symbol: "BTCUSDT",
      interval: HistoricalBronzeImportBtcInterval.ONE_MINUTE,
    },
    output: {
      format: HistoricalBronzeImportOutputFormat.JSON,
      includeValidationReport: true,
      includeFixture: false,
    },
    metadata: {
      label: "bootstrap-test",
    },
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function createBootstrapFetchImpl(): HistoricalImportFetchLike {
  return vi.fn(async (url: string) => {
    if (url.includes("/historical/markets?")) {
      return jsonResponse({
        markets: [SAMPLE_MARKET_WIRE],
        cursor: "",
      });
    }

    if (url.includes("/candlesticks")) {
      return jsonResponse({
        ticker: MARKET_TICKER,
        candlesticks: [
          {
            end_period_ts: Math.floor(Date.parse(START_TIME) / 1000) + 60,
            volume: "12.00",
            open_interest: "45.00",
            price: { close: "0.5200" },
          },
        ],
      });
    }

    if (url.includes(`/historical/markets/${MARKET_TICKER}`)) {
      return jsonResponse({ market: SAMPLE_MARKET_WIRE });
    }

    if (url.includes("/api/v3/klines")) {
      const openTimeMs = Date.parse(START_TIME);
      const closeTimeMs = Date.parse(START_TIME) + 59_999;
      return jsonResponse([
        [
          openTimeMs,
          "59980.50",
          "60010.25",
          "59960.00",
          "59995.75",
          "12.5",
          closeTimeMs,
        ],
      ]);
    }

    if (url.includes("/products/") && url.includes("/candles")) {
      const openTimeSec = Math.floor(Date.parse(START_TIME) / 1000);
      return jsonResponse([
        [openTimeSec, 59_960, 60_010.25, 59_980.5, 59_995.75, 12.5],
      ]);
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  });
}

describe("createHistoricalImportProvidersFromConfig", () => {
  it("constructs Kalshi HTTP adapter and importer from config", async () => {
    const fetchImpl = createBootstrapFetchImpl();
    const kalshiAdapterSpy = vi.spyOn(KalshiHistoricalHttpAdapter.prototype, "get");
    const config = buildHistoricalBronzeImportConfig(validConfigInput());

    await createHistoricalImportProvidersFromConfig({ config, fetchImpl });

    expect(kalshiAdapterSpy).toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalled();
    expect(
      (fetchImpl as ReturnType<typeof vi.fn>).mock.calls.some(([url]) =>
        String(url).includes("/historical/markets"),
      ),
    ).toBe(true);

    kalshiAdapterSpy.mockRestore();
  });

  it("constructs BTC HTTP adapter and importer from config", async () => {
    const fetchImpl = createBootstrapFetchImpl();
    const btcFetchSpy = vi.spyOn(BtcHistoricalHttpAdapter.prototype, "fetchKlines");
    const config = buildHistoricalBronzeImportConfig(validConfigInput());

    await createHistoricalImportProvidersFromConfig({ config, fetchImpl });

    expect(btcFetchSpy).toHaveBeenCalled();
    expect(
      (fetchImpl as ReturnType<typeof vi.fn>).mock.calls.some(([url]) =>
        String(url).includes("/api/v3/klines"),
      ),
    ).toBe(true);

    btcFetchSpy.mockRestore();
  });

  it("does not call BTC klines HTTP for settlement-only imports", async () => {
    const fetchImpl = createBootstrapFetchImpl();
    const btcFetchSpy = vi.spyOn(BtcHistoricalHttpAdapter.prototype, "fetchKlines");
    const coinbaseFetchSpy = vi.spyOn(CoinbaseHistoricalHttpAdapter.prototype, "fetchCandles");
    const config = buildHistoricalBronzeImportConfig(
      validConfigInput({
        importMode: HistoricalBronzeImportMode.SETTLEMENT_ONLY,
        btc: null,
      }),
    );

    const { btcProvider } = await createHistoricalImportProvidersFromConfig({
      config,
      fetchImpl,
    });
    const btcRecords = btcProvider.importBtcKlineRecords({
      marketTicker: MARKET_TICKER,
      startTime: START_TIME,
      endTime: END_TIME,
      collectionTime: COLLECTION_TIME,
      observedAt: OBSERVED_AT,
    });

    expect(btcFetchSpy).not.toHaveBeenCalled();
    expect(coinbaseFetchSpy).not.toHaveBeenCalled();
    expect(btcRecords).toEqual([]);
    expect(
      (fetchImpl as ReturnType<typeof vi.fn>).mock.calls.some(([url]) =>
        String(url).includes("/api/v3/klines"),
      ),
    ).toBe(false);

    btcFetchSpy.mockRestore();
    coinbaseFetchSpy.mockRestore();
  });

  it("selects the Binance BTC importer for BINANCE_SPOT", async () => {
    const createBinanceSpy = vi.spyOn(btcImporters, "createBtcHistoricalImporter");
    const createCoinbaseSpy = vi.spyOn(btcImporters, "createCoinbaseHistoricalImporter");
    const config = buildHistoricalBronzeImportConfig(validConfigInput());

    await createHistoricalImportProvidersFromConfig({
      config,
      fetchImpl: createBootstrapFetchImpl(),
    });

    expect(createBinanceSpy).toHaveBeenCalledOnce();
    expect(createCoinbaseSpy).not.toHaveBeenCalled();

    createBinanceSpy.mockRestore();
    createCoinbaseSpy.mockRestore();
  });

  it("selects the Coinbase BTC importer for COINBASE_SPOT", async () => {
    const createBinanceSpy = vi.spyOn(btcImporters, "createBtcHistoricalImporter");
    const createCoinbaseSpy = vi.spyOn(btcImporters, "createCoinbaseHistoricalImporter");
    const coinbaseFetchSpy = vi.spyOn(
      CoinbaseHistoricalHttpAdapter.prototype,
      "fetchCandles",
    );
    const config = buildHistoricalBronzeImportConfig(
      validConfigInput({
        btc: {
          provider: HistoricalBronzeImportBtcProvider.COINBASE_SPOT,
          symbol: "BTC-USD",
          interval: HistoricalBronzeImportBtcInterval.ONE_MINUTE,
        },
      }),
    );

    await createHistoricalImportProvidersFromConfig({
      config,
      fetchImpl: createBootstrapFetchImpl(),
    });

    expect(createCoinbaseSpy).toHaveBeenCalledOnce();
    expect(createBinanceSpy).not.toHaveBeenCalled();
    expect(coinbaseFetchSpy).toHaveBeenCalled();

    const { btcProvider } = await createHistoricalImportProvidersFromConfig({
      config,
      fetchImpl: createBootstrapFetchImpl(),
    });
    const btcRecords = btcProvider.importBtcKlineRecords({
      marketTicker: MARKET_TICKER,
      startTime: START_TIME,
      endTime: END_TIME,
      collectionTime: COLLECTION_TIME,
      observedAt: OBSERVED_AT,
    });
    expect(btcRecords).toHaveLength(1);
    expect(btcRecords[0]!.provenance.source).toBe("coinbase-spot");

    createBinanceSpy.mockRestore();
    createCoinbaseSpy.mockRestore();
    coinbaseFetchSpy.mockRestore();
  });

  it("uses injected fetchImpl and does not call global fetch", async () => {
    const fetchImpl = createBootstrapFetchImpl();
    const globalFetchSpy = vi.spyOn(globalThis, "fetch");
    const config = buildHistoricalBronzeImportConfig(validConfigInput());

    await createHistoricalImportProvidersFromConfig({ config, fetchImpl });

    expect(fetchImpl).toHaveBeenCalled();
    expect(globalFetchSpy).not.toHaveBeenCalled();
    globalFetchSpy.mockRestore();
  });

  it("returns providers that import prefetched data", async () => {
    const config = buildHistoricalBronzeImportConfig(validConfigInput());
    const { kalshiProvider, btcProvider } = await createHistoricalImportProvidersFromConfig({
      config,
      fetchImpl: createBootstrapFetchImpl(),
    });

    const providerInput = {
      marketTicker: MARKET_TICKER,
      startTime: START_TIME,
      endTime: END_TIME,
      collectionTime: COLLECTION_TIME,
      observedAt: OBSERVED_AT,
    };

    expect(kalshiProvider.importKalshiMarketRecords(providerInput)).toHaveLength(1);
    expect(kalshiProvider.importKalshiCandleRecords(providerInput)).toHaveLength(1);
    expect(kalshiProvider.importKalshiSettlementRecords(providerInput)).toHaveLength(1);
    expect(btcProvider.importBtcKlineRecords(providerInput)).toHaveLength(1);
  });

  it("does not mutate config input", async () => {
    const config = buildHistoricalBronzeImportConfig(validConfigInput());
    const snapshot = structuredClone(config);

    await createHistoricalImportProvidersFromConfig({
      config,
      fetchImpl: createBootstrapFetchImpl(),
    });

    expect(config).toEqual(snapshot);
  });

  it("propagates importer errors", async () => {
    const config = buildHistoricalBronzeImportConfig(validConfigInput());
    const fetchImpl = vi.fn(async () => jsonResponse({ code: "bad_request", message: "failed" }, 400));

    await expect(
      createHistoricalImportProvidersFromConfig({ config, fetchImpl }),
    ).rejects.toThrow(/failed|Kalshi historical API error/i);
  });
});

describe("runHistoricalImportFromConfig", () => {
  it("returns deterministic JSON-serializable job results", async () => {
    const config = buildHistoricalBronzeImportConfig(validConfigInput());
    const fetchImpl = createBootstrapFetchImpl();

    const first = await runHistoricalImportFromConfig({ config, fetchImpl });
    const second = await runHistoricalImportFromConfig({ config, fetchImpl });

    expect(JSON.parse(first.serialized)).toEqual(JSON.parse(second.serialized));
    expect(first.jobId).toBe("import-job-bootstrap");
    expect(first.bronzeRecords.length).toBeGreaterThan(0);
  });

  it("returns identical bootstrap output for repeated identical config", async () => {
    const config = buildHistoricalBronzeImportConfig(
      validConfigInput({
        btc: {
          provider: HistoricalBronzeImportBtcProvider.COINBASE_SPOT,
          symbol: "BTC-USD",
          interval: HistoricalBronzeImportBtcInterval.ONE_MINUTE,
        },
      }),
    );
    const fetchImpl = createBootstrapFetchImpl();

    const first = await runHistoricalImportFromConfig({ config, fetchImpl });
    const second = await runHistoricalImportFromConfig({ config, fetchImpl });

    expect(first.serialized).toBe(second.serialized);
  });

  it("does not call writeFile during bootstrap execution", async () => {
    const writeFile = vi.fn();
    const config = buildHistoricalBronzeImportConfig(validConfigInput());

    await runHistoricalImportFromConfig({
      config,
      fetchImpl: createBootstrapFetchImpl(),
    });

    expect(writeFile).not.toHaveBeenCalled();
  });
});

describe("unsupported provider config", () => {
  it("is rejected by the config builder before bootstrap", () => {
    expect(() =>
      buildHistoricalBronzeImportConfig(
        validConfigInput({
          btc: {
            provider: "unsupported-provider" as HistoricalBronzeImportBtcProvider,
            symbol: "BTCUSDT",
            interval: HistoricalBronzeImportBtcInterval.ONE_MINUTE,
          },
        }),
      ),
    ).toThrow(HistoricalBronzeImportConfigError);
  });

  it("is rejected by bootstrap when an unsupported provider bypasses validation", async () => {
    const validConfig = buildHistoricalBronzeImportConfig(validConfigInput());
    const unsupportedConfig = {
      ...validConfig,
      btc: {
        ...validConfig.btc,
        provider: "kraken-spot" as HistoricalBronzeImportBtcProvider,
      },
    } as HistoricalBronzeImportConfig;

    await expect(
      createHistoricalImportProvidersFromConfig({
        config: unsupportedConfig,
        fetchImpl: createBootstrapFetchImpl(),
      }),
    ).rejects.toMatchObject({
      code: HistoricalImportBootstrapErrorCode.UNSUPPORTED_BTC_PROVIDER,
    });
    await expect(
      createHistoricalImportProvidersFromConfig({
        config: unsupportedConfig,
        fetchImpl: createBootstrapFetchImpl(),
      }),
    ).rejects.toThrow(HistoricalImportBootstrapError);
  });
});

describe("KalshiHistoricalImporter wiring", () => {
  it("uses collectionTime for importer provenance timestamps", async () => {
    const fetchImpl = createBootstrapFetchImpl();
    const importerSpy = vi.spyOn(KalshiHistoricalImporter.prototype, "getHistoricalMarket");
    const config = buildHistoricalBronzeImportConfig(validConfigInput());

    await createHistoricalImportProvidersFromConfig({ config, fetchImpl });

    expect(importerSpy).toHaveBeenCalled();
    importerSpy.mockRestore();
  });
});
