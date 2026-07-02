import { describe, expect, it } from "vitest";

import { DataSource } from "@/lib/data/provenance";
import { SILVER_BRONZE_CONTENT_TYPE } from "@/lib/data/silver";
import type { RawHistoricalRecord } from "@/lib/data/types";
import { DEFAULT_ENGINE_CONFIG } from "@/lib/trading/config/defaults";
import { DEFAULT_BACKTEST_FILL_SIMULATION_CONFIG } from "@/lib/data/backtesting/strategyTypes";

import { buildBidAskFidelityReport, scanBidAskAuditDatasets } from "./buildBidAskFidelityReport";
import {
  BID_ASK_FIDELITY_WARNING_CODE,
  type BidAskFidelityAuditIo,
} from "./bidAskFidelityTypes";
import {
  buildBidAskFidelityWarnings,
  computeBidAskSpreadStatistics,
} from "./computeBidAskFidelityMetrics";
import { extractBidAskCandleQuote } from "./extractBidAskCandleQuote";
import { serializeBidAskFidelityReport } from "./serializeBidAskFidelityReport";

const SERIES_TICKER = "KXBTC15M";
const MARKET_TICKER = "KXBTC15M-MARKET-A";
const GENERATED_AT = "2026-06-27T12:00:00.000Z";

function createCandle(
  payload: Record<string, unknown>,
  options?: { recordId?: string },
): RawHistoricalRecord {
  return {
    recordId: options?.recordId ?? "candle-1",
    ticker: MARKET_TICKER,
    contentType: SILVER_BRONZE_CONTENT_TYPE.CANDLESTICK,
    eventTime: "2026-06-26T23:15:00.000Z",
    collectionTime: "2026-06-27T01:00:00.000Z",
    observedAt: "2026-06-27T01:00:05.000Z",
    payload,
    provenance: {
      source: DataSource.KALSHI_CANDLES,
      collectionTime: "2026-06-27T01:00:00.000Z",
      observedAt: "2026-06-27T01:00:05.000Z",
      fetchId: "candle-fetch",
    },
  };
}

function createFixtureJson(candles: RawHistoricalRecord[]): string {
  return JSON.stringify({
    runId: "fixture-run",
    durationMs: 1_000,
    initialCashCents: 10_000,
    strategyId: "noop",
    engineConfig: DEFAULT_ENGINE_CONFIG,
    fillConfig: DEFAULT_BACKTEST_FILL_SIMULATION_CONFIG,
    bronzeRecords: candles,
  });
}

function createAuditIo(
  files: Record<string, string>,
  directories: Set<string>,
): BidAskFidelityAuditIo {
  return {
    readdir: (path) =>
      [...directories]
        .filter((entry) => entry.slice(0, entry.lastIndexOf("/")) === path)
        .map((entry) => entry.slice(entry.lastIndexOf("/") + 1))
        .sort((left, right) => left.localeCompare(right)),
    readFile: (path) => {
      const content = files[path];
      if (content === undefined) {
        throw new Error(`Missing file: ${path}`);
      }
      return content;
    },
    fileExists: (path) => files[path] !== undefined,
    isDirectory: (path) => directories.has(path),
  };
}

describe("extractBidAskCandleQuote", () => {
  it("reads legacy bid/ask cents from bronze payloads", () => {
    expect(
      extractBidAskCandleQuote(
        createCandle({
          yes_bid_cents: 48,
          yes_ask_cents: 52,
        }),
      ),
    ).toEqual({
      source: "legacy-bid-ask",
      yesBidCents: 48,
      yesAskCents: 52,
    });
  });

  it("detects live close-only payloads as synthesized zero-spread quotes", () => {
    expect(
      extractBidAskCandleQuote(
        createCandle({
          end_period_ts: 1_777_419_060,
          price: { close: "0.5600" },
        }),
      ),
    ).toEqual({
      source: "live-close-only",
      yesBidCents: 56,
      yesAskCents: 56,
    });
  });

  it("marks missing bid/ask fields", () => {
    expect(extractBidAskCandleQuote(createCandle({}))).toEqual({
      source: "missing",
      yesBidCents: null,
      yesAskCents: null,
    });
  });
});

describe("computeBidAskSpreadStatistics", () => {
  it("computes spread statistics for normal candles", () => {
    const statistics = computeBidAskSpreadStatistics([
      createCandle({ yes_bid_cents: 48, yes_ask_cents: 52 }),
      createCandle({ yes_bid_cents: 40, yes_ask_cents: 45, recordId: "candle-2" }),
    ]);

    expect(statistics).toMatchObject({
      candleCount: 2,
      equalBidAskCount: 0,
      bidLessThanAskCount: 2,
      bidGreaterThanAskCount: 0,
      missingBidAskCount: 0,
      minSpreadCents: 4,
      maxSpreadCents: 5,
      averageSpreadCents: 4.5,
      percentZeroSpread: 0,
      percentInvertedSpread: 0,
    });
  });

  it("detects all zero-spread candles", () => {
    const statistics = computeBidAskSpreadStatistics([
      createCandle({ yes_bid_cents: 50, yes_ask_cents: 50 }),
      createCandle({ yes_bid_cents: 42, yes_ask_cents: 42, recordId: "candle-2" }),
    ]);

    expect(statistics.equalBidAskCount).toBe(2);
    expect(statistics.percentZeroSpread).toBe(100);
    expect(buildBidAskFidelityWarnings(statistics).map((warning) => warning.code)).toContain(
      BID_ASK_FIDELITY_WARNING_CODE.ALL_CANDLES_ZERO_SPREAD,
    );
  });

  it("detects inverted spreads", () => {
    const statistics = computeBidAskSpreadStatistics([
      createCandle({ yes_bid_cents: 55, yes_ask_cents: 50 }),
    ]);

    expect(statistics.bidGreaterThanAskCount).toBe(1);
    expect(buildBidAskFidelityWarnings(statistics).map((warning) => warning.code)).toContain(
      BID_ASK_FIDELITY_WARNING_CODE.INVERTED_SPREADS,
    );
  });

  it("counts missing bid/ask fields", () => {
    const statistics = computeBidAskSpreadStatistics([createCandle({})]);

    expect(statistics.missingBidAskCount).toBe(1);
    expect(buildBidAskFidelityWarnings(statistics).map((warning) => warning.code)).toContain(
      BID_ASK_FIDELITY_WARNING_CODE.MISSING_BID_ASK_FIELDS,
    );
  });
});

describe("buildBidAskFidelityReport", () => {
  it("builds per-market and per-series summaries", () => {
    const fixturePath = `data/fixtures/${SERIES_TICKER}/${MARKET_TICKER}/fixture.json`;
    const report = buildBidAskFidelityReport({
      inputDir: "data/imports",
      outputPath: "data/audits/bid-ask-fidelity.json",
      generatedAt: GENERATED_AT,
      datasets: [
        {
          seriesTicker: SERIES_TICKER,
          marketTicker: MARKET_TICKER,
          sourcePath: fixturePath,
          bronzeRecords: [
            createCandle({ yes_bid_cents: 48, yes_ask_cents: 52 }),
          ],
        },
      ],
    });

    expect(report.series).toHaveLength(1);
    expect(report.series[0]?.markets[0]).toMatchObject({
      marketTicker: MARKET_TICKER,
      sourcePath: fixturePath,
      suspiciousZeroSpread: false,
    });
    expect(report.summary.marketCount).toBe(1);
    expect(report.summary.statistics.bidLessThanAskCount).toBe(1);
  });

  it("flags suspicious zero-spread datasets", () => {
    const report = buildBidAskFidelityReport({
      inputDir: "data/imports",
      outputPath: "data/audits/bid-ask-fidelity.json",
      generatedAt: GENERATED_AT,
      datasets: [
        {
          seriesTicker: SERIES_TICKER,
          marketTicker: MARKET_TICKER,
          sourcePath: "fixture.json",
          bronzeRecords: [
            createCandle({ yes_bid_cents: 50, yes_ask_cents: 50 }),
          ],
        },
      ],
    });

    expect(report.summary.suspiciousZeroSpreadMarketCount).toBe(1);
    expect(report.series[0]?.suspiciousZeroSpreadMarketCount).toBe(1);
  });

  it("serializes deterministically", () => {
    const report = buildBidAskFidelityReport({
      inputDir: "data/imports",
      outputPath: "data/audits/bid-ask-fidelity.json",
      generatedAt: GENERATED_AT,
      datasets: [
        {
          seriesTicker: SERIES_TICKER,
          marketTicker: MARKET_TICKER,
          sourcePath: "fixture.json",
          bronzeRecords: [
            createCandle({ yes_bid_cents: 48, yes_ask_cents: 52 }),
          ],
        },
      ],
    });

    expect(serializeBidAskFidelityReport(report)).toBe(
      serializeBidAskFidelityReport(report),
    );
  });
});

describe("scanBidAskAuditDatasets", () => {
  it("pairs imports market directories with fixtures under data/fixtures", () => {
    const importsRoot = "data/imports";
    const fixturesRoot = "data/fixtures";
    const fixturePath = `${fixturesRoot}/${SERIES_TICKER}/${MARKET_TICKER}/fixture.json`;
    const directories = new Set([
      importsRoot,
      `${importsRoot}/${SERIES_TICKER}`,
      `${importsRoot}/${SERIES_TICKER}/${MARKET_TICKER}`,
      fixturesRoot,
      `${fixturesRoot}/${SERIES_TICKER}`,
      `${fixturesRoot}/${SERIES_TICKER}/${MARKET_TICKER}`,
    ]);

    const datasets = scanBidAskAuditDatasets(
      importsRoot,
      createAuditIo(
        {
          [`${importsRoot}/${SERIES_TICKER}/${MARKET_TICKER}/metadata.json`]:
            JSON.stringify({ marketTicker: MARKET_TICKER }),
          [fixturePath]: createFixtureJson([
            createCandle({ yes_bid_cents: 48, yes_ask_cents: 52 }),
          ]),
        },
        directories,
      ),
    );

    expect(datasets).toEqual([
      {
        seriesTicker: SERIES_TICKER,
        marketTicker: MARKET_TICKER,
        sourcePath: fixturePath,
        bronzeRecords: expect.any(Array),
      },
    ]);
  });
});
