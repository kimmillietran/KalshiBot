import { describe, expect, it, vi } from "vitest";

import fixture from "@/lib/data/importers/kalshi/fixtures/KXBTC15M-25DEC311900-00-market-responses.json";
import {
  HistoricalBronzeImportBtcInterval,
  HistoricalBronzeImportBtcProvider,
  HistoricalBronzeImportKalshiSource,
  HistoricalBronzeImportOutputFormat,
} from "@/lib/data/importJobs/config";
import { runHistoricalImportFromConfig } from "@/lib/data/importJobs/bootstrap/HistoricalImportBootstrap";
import type { HistoricalImportFetchLike } from "@/lib/data/importJobs/bootstrap/historicalImportBootstrapTypes";
import { buildExpansionMarketImportArtifacts } from "./buildExpansionMarketImportConfig";
import {
  createExpansionImportReconciliationTracer,
  traceRequiredFieldValidation,
} from "./expansionImportReconciliationTrace";
import type { ExpansionDiscoveredMarket } from "./expansionExecutorTypes";
import { KALSHI_DISCOVERY_LIST_MARKET_METADATA_KEY } from "@/lib/data/importers/kalshi/kalshiMarketSchemaReconciliation";

const GENERATED_AT = "2026-07-04T04:00:00.000Z";
const TICKER = fixture.ticker;

function createExpansionJob() {
  return {
    jobId: "expansion-KXBTC15M-20251201-20251231",
    priority: 71,
    status: "scheduled" as const,
    seriesTicker: "KXBTC15M",
    windowStart: "2025-12-01T00:00:00.000Z",
    windowEnd: "2025-12-31T23:59:59.999Z",
    estimatedMarketCount: null,
    reason: "Fill December gap",
    expectedResearchBenefit: "Adds missing markets",
    skipReason: null,
    discovery: {
      seriesTicker: "KXBTC15M",
      sampling: {
        afterDate: "2025-12-01T00:00:00.000Z",
        beforeDate: "2025-12-31T23:59:59.999Z",
      },
    },
    importDefaults: {
      kalshi: {
        marketSource: HistoricalBronzeImportKalshiSource.KALSHI_REST,
        candleSource: HistoricalBronzeImportKalshiSource.KALSHI_CANDLES,
        settlementSource: HistoricalBronzeImportKalshiSource.KALSHI_REST,
      },
      btc: {
        provider: HistoricalBronzeImportBtcProvider.COINBASE_SPOT,
        symbol: "BTC-USD",
        interval: HistoricalBronzeImportBtcInterval.ONE_MINUTE,
      },
      output: {
        format: HistoricalBronzeImportOutputFormat.JSON,
        includeValidationReport: true,
        includeFixture: false,
      },
    },
  };
}

function createDiscoveredMarket(
  overrides?: Partial<ExpansionDiscoveredMarket>,
): ExpansionDiscoveredMarket {
  return {
    marketTicker: TICKER,
    seriesTicker: "KXBTC15M",
    eventTicker: "KXBTC15M-25DEC311900",
    status: "finalized",
    openTime: fixture.listMarket.open_time,
    closeTime: fixture.listMarket.close_time,
    settlementTime: fixture.listMarket.settlement_ts ?? null,
    expirationValue: null,
    title: null,
    subtitle: null,
    listMarketWire: fixture.listMarket,
    provenance: {
      source: "kalshi-historical-api",
      fetchedAt: GENERATED_AT,
      requestPath: fixture.listEndpoint,
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

function createFixtureFetchImpl(): HistoricalImportFetchLike {
  return vi.fn(async (url: string) => {
    if (url.includes("/candlesticks")) {
      return jsonResponse({
        ticker: TICKER,
        candlesticks: [
          {
            end_period_ts: Math.floor(Date.parse(fixture.listMarket.open_time!) / 1000) + 60,
            volume: "12.00",
            open_interest: "45.00",
            price: { close: "0.5200" },
          },
        ],
      });
    }

    if (url.includes(`/historical/markets/${TICKER}`)) {
      return jsonResponse({ market: fixture.detailMarket });
    }

    if (url.includes("/products/BTC-USD/candles")) {
      return jsonResponse([
        [
          Math.floor(Date.parse(fixture.listMarket.open_time!) / 1000),
          "59900",
          "60100",
          "60000",
          "60050",
          "1.5",
        ],
      ]);
    }

    throw new Error(`Unexpected fetch URL in reconciliation test: ${url}`);
  });
}

describe("expansion import reconciliation trace", () => {
  it("prefers discovery listMarketWire over rebuilt normalized fields in import config metadata", () => {
    const artifacts = buildExpansionMarketImportArtifacts(
      createExpansionJob(),
      createDiscoveredMarket(),
      {
        importConfigsDir: "data/import-configs",
        importsDir: "data/imports",
      },
    );

    const listMarket = artifacts.config.metadata[KALSHI_DISCOVERY_LIST_MARKET_METADATA_KEY] as {
      expiration_value?: string;
      result?: string;
    };

    expect(listMarket.expiration_value).toBe("94210.55");
    expect(listMarket.result).toBe("yes");
    expect(artifacts.serializedConfig).toContain("kalshiDiscoveryListMarket");
    expect(artifacts.serializedConfig).toContain("94210.55");
  });

  it("imports KXBTC15M-25DEC311900-00 when list payload has expiration_value and detail omits it", async () => {
    const artifacts = buildExpansionMarketImportArtifacts(
      createExpansionJob(),
      createDiscoveredMarket(),
      {
        importConfigsDir: "data/import-configs",
        importsDir: "data/imports",
      },
    );

    const result = await runHistoricalImportFromConfig({
      config: artifacts.config,
      fetchImpl: createFixtureFetchImpl(),
    });

    expect(result.validationResult.valid).toBe(true);
    expect(result.metadata.marketTicker).toBe(TICKER);
  });

  it("fails with actionable diagnostics when both list and detail omit expiration_value", async () => {
    const artifacts = buildExpansionMarketImportArtifacts(
      createExpansionJob(),
      createDiscoveredMarket({
        listMarketWire: {
          ticker: TICKER,
          event_ticker: "KXBTC15M-25DEC311900",
          status: "finalized",
          open_time: fixture.listMarket.open_time,
          close_time: fixture.listMarket.close_time,
        },
      }),
      {
        importConfigsDir: "data/import-configs",
        importsDir: "data/imports",
      },
    );

    await expect(
      runHistoricalImportFromConfig({
        config: artifacts.config,
        fetchImpl: createFixtureFetchImpl(),
      }),
    ).rejects.toMatchObject({
      name: "KalshiMarketImportCompatibilityError",
      message: expect.stringContaining("missing required fields: expiration_value"),
    });
  });

  it("records end-to-end trace stages for --trace-market", () => {
    const lines: string[] = [];
    const tracer = createExpansionImportReconciliationTracer({
      traceMarket: TICKER,
      write: (message) => {
        lines.push(message);
      },
    });

    traceRequiredFieldValidation(tracer, {
      ticker: TICKER,
      wire: {
        ticker: TICKER,
        open_time: fixture.listMarket.open_time,
        close_time: fixture.listMarket.close_time,
        expiration_value: fixture.listMarket.expiration_value,
      },
    });

    tracer?.flush();

    expect(lines.join("")).toContain(TICKER);
    expect(lines.join("")).toContain("required-field-validation");
    expect(lines.join("")).toContain("expirationValuePresent");
  });
});
