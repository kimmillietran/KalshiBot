import { describe, expect, it } from "vitest";

import { DataSource } from "@/lib/data/provenance";
import { SILVER_BRONZE_CONTENT_TYPE } from "@/lib/data/silver";
import type { ReplayStepResult } from "@/lib/data/replay/replaySessionTypes";
import type { HistoricalTradingSnapshot } from "@/lib/data/snapshots/types";
import type { RawHistoricalRecord } from "@/lib/data/types";

import {
  computeReplayPricingDiagnostics,
  serializeReplayPricingDiagnostics,
} from "./computeReplayPricingDiagnostics";
import { ReplayPricingDiagnosticWarningCode } from "./replayPricingDiagnosticsTypes";

function baseBronzeCandle(
  payload: Record<string, unknown>,
  recordId: string,
): RawHistoricalRecord {
  return {
    recordId,
    ticker: "KXBTC15M-MARKET-A",
    contentType: SILVER_BRONZE_CONTENT_TYPE.CANDLESTICK,
    eventTime: "2026-06-26T23:15:00.000Z",
    collectionTime: "2026-06-27T01:00:00.000Z",
    observedAt: "2026-06-27T01:00:05.000Z",
    payload,
    provenance: {
      source: DataSource.KALSHI_CANDLES,
      collectionTime: "2026-06-27T01:00:00.000Z",
      observedAt: "2026-06-27T01:00:05.000Z",
      fetchId: recordId,
    },
  };
}

function createSnapshot(kalshiCandleCount: number): HistoricalTradingSnapshot {
  return {
    ticker: "KXBTC15M-MARKET-A",
    temporal: {
      eventTime: "2026-06-26T23:15:00.000Z",
      collectionTime: "2026-06-27T01:00:00.000Z",
      observedAt: "2026-06-27T01:00:05.000Z",
    },
    marketWindow: {
      eventTime: "2026-06-26T23:15:00.000Z",
      collectionTime: "2026-06-27T01:00:00.000Z",
      observedAt: "2026-06-27T01:00:05.000Z",
      ticker: "KXBTC15M-MARKET-A",
      seriesTicker: "KXBTC15M",
      openTime: "2026-06-26T23:15:00.000Z",
      closeTime: "2026-06-26T23:30:00.000Z",
      strikePriceUsd: 59_990.31,
      status: "open",
      qualityFlags: [],
      datasetVersion: "1.0.0",
    },
    kalshiCandles: Array.from({ length: kalshiCandleCount }, (_, index) => ({
      eventTime: "2026-06-26T23:15:00.000Z",
      collectionTime: "2026-06-27T01:00:00.000Z",
      observedAt: "2026-06-27T01:00:05.000Z",
      ticker: "KXBTC15M-MARKET-A",
      openTime: "2026-06-26T23:15:00.000Z",
      closeTime: "2026-06-26T23:16:00.000Z",
      yesBidCents: 48 + index,
      yesAskCents: 52 + index,
      noBidCents: 47,
      noAskCents: 51,
      volumeContracts: 100,
      qualityFlags: [],
      datasetVersion: "1.0.0",
    })),
    btcBars: [],
    settlement: null,
    provenance: {
      marketWindow: {
        source: DataSource.KALSHI_REST,
        collectionTime: "2026-06-27T01:00:00.000Z",
        observedAt: "2026-06-27T01:00:05.000Z",
        fetchId: "market",
      },
      kalshiCandles: [],
      btcBars: [],
      settlement: null,
    },
  };
}

function createReplayStep(
  pricing: { yesBidCents: number; yesAskCents: number; yesMidCents: number },
  kalshiCandleCount = 1,
): ReplayStepResult {
  return {
    stepIndex: 0,
    sourceTicker: "KXBTC15M-MARKET-A",
    temporal: {
      eventTime: "2026-06-26T23:15:00.000Z",
      collectionTime: "2026-06-27T01:00:00.000Z",
      observedAt: "2026-06-27T01:00:05.000Z",
    },
    provenance: {
      marketWindow: {
        source: DataSource.KALSHI_REST,
        collectionTime: "2026-06-27T01:00:00.000Z",
        observedAt: "2026-06-27T01:00:05.000Z",
        fetchId: "market",
      },
      kalshiCandles: [],
      btcBars: [],
      settlement: null,
    },
    engineInput: {
      evaluatedAt: "2026-06-27T01:00:05.000Z",
      market: {
        ticker: "KXBTC15M-MARKET-A",
        lifecycle: "Active",
        strikePrice: 59_990.31,
        timeRemainingMs: 60_000,
        closeTime: "2026-06-26T23:30:00.000Z",
      },
      btc: {
        price: 60_000,
        change24hPercent: null,
        feedStatus: "healthy",
        providerSource: "coinbase",
        candles: [],
      },
      pricing: {
        ...pricing,
        noBidCents: 47,
        noAskCents: 51,
        noMidCents: 49,
        liquidityQuality: "Good",
        volumeDollars: null,
      },
    },
    engineOutput: {
      action: "NO TRADE",
      engineVersion: "test",
      configHash: "cfg-test",
      reasoning: { steps: [], summary: "noop" },
      evaluatedAt: "2026-06-27T01:00:05.000Z",
      features: null,
      probability: null,
      expectedValue: null,
      positionSize: null,
      guards: [],
    },
    sourceSnapshot: createSnapshot(kalshiCandleCount),
  };
}

describe("computeReplayPricingDiagnostics", () => {
  it("warns when all decision prices are zero", () => {
    const diagnostics = computeReplayPricingDiagnostics({
      replaySteps: [
        createReplayStep({ yesBidCents: 0, yesAskCents: 0, yesMidCents: 0 }),
        createReplayStep({ yesBidCents: 0, yesAskCents: 0, yesMidCents: 0 }),
      ],
      bronzeRecords: [
        baseBronzeCandle(
          {
            yes_bid_cents: 48,
            yes_ask_cents: 52,
          },
          "candle-1",
        ),
      ],
    });

    expect(diagnostics.decisionCount).toBe(2);
    expect(diagnostics.zeroPriceDecisionCount).toBe(2);
    expect(diagnostics.nonZeroPriceDecisionCount).toBe(0);
    expect(diagnostics.percentZeroPriceDecisions).toBe(100);
    expect(diagnostics.warnings.map((warning) => warning.code)).toContain(
      ReplayPricingDiagnosticWarningCode.ALL_ZERO_DECISION_PRICES,
    );
    expect(diagnostics.warnings.map((warning) => warning.code)).toContain(
      ReplayPricingDiagnosticWarningCode.SOURCE_NONZERO_DECISIONS_ZERO,
    );
  });

  it("tracks mixed zero and nonzero decision prices", () => {
    const diagnostics = computeReplayPricingDiagnostics({
      replaySteps: [
        createReplayStep({ yesBidCents: 0, yesAskCents: 0, yesMidCents: 0 }),
        createReplayStep({ yesBidCents: 48, yesAskCents: 52, yesMidCents: 50 }),
      ],
      bronzeRecords: [],
    });

    expect(diagnostics.zeroPriceDecisionCount).toBe(1);
    expect(diagnostics.nonZeroPriceDecisionCount).toBe(1);
    expect(diagnostics.percentZeroPriceDecisions).toBe(50);
    expect(diagnostics.firstDecisionPrice).toEqual({
      yesBidCents: 0,
      yesAskCents: 0,
      yesMidCents: 0,
    });
    expect(diagnostics.lastDecisionPrice).toEqual({
      yesBidCents: 48,
      yesAskCents: 52,
      yesMidCents: 50,
    });
    expect(diagnostics.warnings).toEqual([]);
  });

  it("warns when source candles are nonzero but replay decisions are all zero", () => {
    const diagnostics = computeReplayPricingDiagnostics({
      replaySteps: [
        createReplayStep({ yesBidCents: 0, yesAskCents: 0, yesMidCents: 0 }),
      ],
      bronzeRecords: [
        baseBronzeCandle({ yes_bid_cents: 40, yes_ask_cents: 44 }, "candle-a"),
        baseBronzeCandle({ yes_bid_cents: 46, yes_ask_cents: 50 }, "candle-b"),
      ],
    });

    expect(diagnostics.sourceKalshiCandleCount).toBe(2);
    expect(diagnostics.sourceKalshiCandleClassification.nonZeroPriceCandleCount).toBe(2);
    expect(diagnostics.warnings.map((warning) => warning.code)).toContain(
      ReplayPricingDiagnosticWarningCode.SOURCE_NONZERO_DECISIONS_ZERO,
    );
    expect(diagnostics.warnings.map((warning) => warning.code)).toContain(
      ReplayPricingDiagnosticWarningCode.SINGLE_DECISION_MULTIPLE_SOURCE_CANDLES,
    );
  });

  it("warns when only one decision is made despite multiple source candles", () => {
    const diagnostics = computeReplayPricingDiagnostics({
      replaySteps: [
        createReplayStep({ yesBidCents: 48, yesAskCents: 52, yesMidCents: 50 }, 3),
      ],
      bronzeRecords: [
        baseBronzeCandle({ yes_bid_cents: 40, yes_ask_cents: 44 }, "candle-a"),
        baseBronzeCandle({ yes_bid_cents: 46, yes_ask_cents: 50 }, "candle-b"),
        baseBronzeCandle({ yes_bid_cents: 48, yes_ask_cents: 52 }, "candle-c"),
      ],
    });

    expect(diagnostics.currentCandleCount).toBe(3);
    expect(diagnostics.warnings.map((warning) => warning.code)).toContain(
      ReplayPricingDiagnosticWarningCode.SINGLE_DECISION_MULTIPLE_SOURCE_CANDLES,
    );
  });

  it("does not warn for valid candle-aligned replay pricing", () => {
    const diagnostics = computeReplayPricingDiagnostics({
      replaySteps: [
        createReplayStep({ yesBidCents: 48, yesAskCents: 52, yesMidCents: 50 }),
        createReplayStep({ yesBidCents: 50, yesAskCents: 50, yesMidCents: 50 }),
      ],
      bronzeRecords: [
        baseBronzeCandle({ yes_bid_cents: 48, yes_ask_cents: 52 }, "candle-a"),
      ],
    });

    expect(diagnostics.warnings).toEqual([]);
    expect(diagnostics.observedYesPriceRange.minYesBidCents).toBe(48);
    expect(diagnostics.observedYesPriceRange.maxYesAskCents).toBe(52);
  });

  it("does not treat equal nonzero bid and ask as invalid", () => {
    const diagnostics = computeReplayPricingDiagnostics({
      replaySteps: [
        createReplayStep({ yesBidCents: 50, yesAskCents: 50, yesMidCents: 50 }),
      ],
      bronzeRecords: [
        baseBronzeCandle({ yes_bid_cents: 50, yes_ask_cents: 50 }, "candle-a"),
      ],
    });

    expect(diagnostics.nonZeroPriceDecisionCount).toBe(1);
    expect(diagnostics.warnings).toEqual([]);
  });

  it("serializes diagnostics deterministically", () => {
    const diagnostics = computeReplayPricingDiagnostics({
      replaySteps: [
        createReplayStep({ yesBidCents: 48, yesAskCents: 52, yesMidCents: 50 }),
      ],
      bronzeRecords: [
        baseBronzeCandle({ yes_bid_cents: 48, yes_ask_cents: 52 }, "candle-a"),
      ],
    });

    const first = JSON.stringify(serializeReplayPricingDiagnostics(diagnostics));
    const second = JSON.stringify(serializeReplayPricingDiagnostics(diagnostics));

    expect(first).toBe(second);
  });
});
