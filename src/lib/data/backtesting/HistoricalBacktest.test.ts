import { describe, expect, it, vi } from "vitest";

import { DataSource } from "@/lib/data/provenance";
import { assembleHistoricalTradingSnapshot } from "@/lib/data/snapshots";
import type {
  HistoricalTradingSnapshot,
  SilverRecordEnvelope,
  SnapshotAssemblyInput,
} from "@/lib/data/snapshots/types";
import { serializeHistoricalTradingSnapshot } from "@/lib/data/snapshots/HistoricalSnapshotAssembler";
import { ReplaySession } from "@/lib/data/replay/ReplaySession";
import { DATA_CONTRACT_VERSION } from "@/lib/data/versioning";
import { DEFAULT_ENGINE_CONFIG } from "@/lib/trading/config/defaults";

import * as BacktestMetricsModule from "./BacktestMetrics";
import { BacktestStrategyRunner } from "./BacktestStrategyRunner";
import {
  HistoricalBacktestError,
  HistoricalBacktestErrorCode,
  runHistoricalBacktest,
  serializeHistoricalBacktestResult,
} from "./HistoricalBacktest";
import type { BacktestStrategy, TradeIntent } from "./strategyTypes";
import { DEFAULT_BACKTEST_FILL_SIMULATION_CONFIG } from "./strategyTypes";

const EVENT_TIME_A = "2026-06-26T23:15:00.000Z";
const EVENT_TIME_B = "2026-06-26T23:30:00.000Z";
const COLLECTION_TIME = "2026-06-27T01:00:00.000Z";
const OBSERVED_AT_A = "2026-06-27T01:00:05.000Z";
const OBSERVED_AT_B = "2026-06-27T01:30:05.000Z";
const OPEN_TIME = "2026-06-26T23:15:00.000Z";
const CLOSE_TIME = "2026-06-26T23:16:00.000Z";
const WINDOW_CLOSE = "2026-06-26T23:30:00.000Z";
const SERIES = "KXBTC15M";
const TICKER_A = "KXBTC15M-STEP-A";
const TICKER_B = "KXBTC15M-STEP-B";

const FILL_CONFIG = {
  ...DEFAULT_BACKTEST_FILL_SIMULATION_CONFIG,
  feeCentsPerContract: 1,
};

function envelope<T>(
  record: T,
  provenance: SilverRecordEnvelope<T>["provenance"],
): SilverRecordEnvelope<T> {
  return { record, provenance };
}

function createSnapshot(options: {
  ticker: string;
  eventTime: string;
  observedAt: string;
}): HistoricalTradingSnapshot {
  const temporalFields = {
    eventTime: options.eventTime,
    collectionTime: COLLECTION_TIME,
    observedAt: options.observedAt,
  };

  const marketWindow = {
    ...temporalFields,
    ticker: options.ticker,
    seriesTicker: SERIES,
    openTime: OPEN_TIME,
    closeTime: WINDOW_CLOSE,
    strikePriceUsd: 59_990.31,
    status: "open" as const,
    qualityFlags: [],
    datasetVersion: DATA_CONTRACT_VERSION,
  };

  const kalshiCandle = {
    ...temporalFields,
    ticker: options.ticker,
    openTime: OPEN_TIME,
    closeTime: CLOSE_TIME,
    yesBidCents: 48,
    yesAskCents: 52,
    noBidCents: 47,
    noAskCents: 51,
    volumeContracts: 120,
    qualityFlags: [],
    datasetVersion: DATA_CONTRACT_VERSION,
  };

  const btcBar = {
    ...temporalFields,
    openTime: OPEN_TIME,
    closeTime: CLOSE_TIME,
    openUsd: 59_980.5,
    highUsd: 60_010.25,
    lowUsd: 59_960.0,
    closeUsd: 59_995.75,
    volumeBtc: 12.5,
    qualityFlags: [],
    datasetVersion: DATA_CONTRACT_VERSION,
  };

  const provenance = {
    source: DataSource.KALSHI_REST,
    collectionTime: COLLECTION_TIME,
    observedAt: options.observedAt,
    fetchId: `fetch-${options.ticker}`,
  };

  const input: SnapshotAssemblyInput = {
    marketWindow: envelope(marketWindow, provenance),
    kalshiCandles: [envelope(kalshiCandle, provenance)],
    btcBars: [envelope(btcBar, provenance)],
  };

  return assembleHistoricalTradingSnapshot(input);
}

const snapshotA = createSnapshot({
  ticker: TICKER_A,
  eventTime: EVENT_TIME_A,
  observedAt: OBSERVED_AT_A,
});

const snapshotB = createSnapshot({
  ticker: TICKER_B,
  eventTime: EVENT_TIME_B,
  observedAt: OBSERVED_AT_B,
});

function noopStrategy(): BacktestStrategy {
  return {
    strategyId: "noop",
    decide: () => [],
  };
}

function buyStrategy(): BacktestStrategy {
  return {
    strategyId: "buy-each-step",
    decide: (step): TradeIntent[] => [
      {
        ticker: step.sourceTicker,
        side: "yes",
        action: "buy",
        quantity: 2,
        limitPriceCents: 52,
        reason: "backtest-buy",
      },
    ],
  };
}

describe("runHistoricalBacktest", () => {
  it("rejects empty snapshot input", () => {
    expect(() =>
      runHistoricalBacktest({
        snapshots: [],
        strategy: noopStrategy(),
        engineConfig: DEFAULT_ENGINE_CONFIG,
        initialCashCents: 10_000,
      }),
    ).toThrow(HistoricalBacktestError);

    try {
      runHistoricalBacktest({
        snapshots: [],
        strategy: noopStrategy(),
        engineConfig: DEFAULT_ENGINE_CONFIG,
        initialCashCents: 10_000,
      });
    } catch (error) {
      expect((error as HistoricalBacktestError).code).toBe(
        HistoricalBacktestErrorCode.EMPTY_SNAPSHOTS,
      );
    }
  });

  it("runs a complete historical backtest happy path", () => {
    const result = runHistoricalBacktest({
      snapshots: [snapshotA, snapshotB],
      strategy: buyStrategy(),
      engineConfig: DEFAULT_ENGINE_CONFIG,
      initialCashCents: 10_000,
      fillConfig: FILL_CONFIG,
    });

    expect(result.replayResult.results).toHaveLength(2);
    expect(result.strategyRun.strategyId).toBe("buy-each-step");
    expect(result.ledger.snapshot().fills).toHaveLength(2);
    expect(result.metrics.fillCount).toBe(2);
    expect(result.metrics.contractsFilled).toBe(4);
    expect(result.metrics.endEquityCents).toBeGreaterThan(0);
    expect(result.metadata.snapshotCount).toBe(2);
    expect(result.metadata.completedAtStep).toBe(1);
  });

  it("produces deterministic output for repeated runs", () => {
    const input = {
      snapshots: [snapshotA],
      strategy: noopStrategy(),
      engineConfig: DEFAULT_ENGINE_CONFIG,
      initialCashCents: 10_000,
      fillConfig: FILL_CONFIG,
    };

    const first = serializeHistoricalBacktestResult(runHistoricalBacktest(input));
    const second = serializeHistoricalBacktestResult(runHistoricalBacktest(input));

    expect(first).toBe(second);
  });

  it("returns an immutable result object", () => {
    const result = runHistoricalBacktest({
      snapshots: [snapshotA],
      strategy: noopStrategy(),
      engineConfig: DEFAULT_ENGINE_CONFIG,
      initialCashCents: 10_000,
    });

    expect(Object.isFrozen(result)).toBe(true);
    expect(() => {
      (result as { metadata: unknown }).metadata = {};
    }).toThrow();
  });

  it("serializes results deterministically", () => {
    const result = runHistoricalBacktest({
      snapshots: [snapshotA],
      strategy: buyStrategy(),
      engineConfig: DEFAULT_ENGINE_CONFIG,
      initialCashCents: 10_000,
      fillConfig: FILL_CONFIG,
    });

    expect(serializeHistoricalBacktestResult(result)).toBe(
      serializeHistoricalBacktestResult(result),
    );
  });

  it("does not mutate input snapshots", () => {
    const snapshots = [snapshotA, snapshotB];
    const before = snapshots.map((snapshot) =>
      serializeHistoricalTradingSnapshot(snapshot),
    );

    runHistoricalBacktest({
      snapshots,
      strategy: noopStrategy(),
      engineConfig: DEFAULT_ENGINE_CONFIG,
      initialCashCents: 10_000,
    });

    const after = snapshots.map((snapshot) =>
      serializeHistoricalTradingSnapshot(snapshot),
    );
    expect(after).toEqual(before);
  });

  it("invokes replay, strategy runner, and metrics once each", () => {
    const createSpy = vi.spyOn(ReplaySession, "create");
    const stepAllSpy = vi.spyOn(ReplaySession.prototype, "stepAll");
    const runnerSpy = vi.spyOn(BacktestStrategyRunner, "run");
    const metricsSpy = vi.spyOn(BacktestMetricsModule, "computeBacktestMetrics");

    runHistoricalBacktest({
      snapshots: [snapshotA],
      strategy: noopStrategy(),
      engineConfig: DEFAULT_ENGINE_CONFIG,
      initialCashCents: 10_000,
    });

    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(stepAllSpy).toHaveBeenCalledTimes(1);
    expect(runnerSpy).toHaveBeenCalledTimes(1);
    expect(metricsSpy).toHaveBeenCalledTimes(1);

    createSpy.mockRestore();
    stepAllSpy.mockRestore();
    runnerSpy.mockRestore();
    metricsSpy.mockRestore();
  });
});
