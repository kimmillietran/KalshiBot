import { describe, expect, it } from "vitest";

import { DataSource } from "@/lib/data/provenance";
import { assembleHistoricalTradingSnapshot } from "@/lib/data/snapshots";
import type {
  HistoricalTradingSnapshot,
  SilverRecordEnvelope,
  SnapshotAssemblyInput,
} from "@/lib/data/snapshots/types";
import { serializeHistoricalTradingSnapshot } from "@/lib/data/snapshots/HistoricalSnapshotAssembler";
import { DATA_CONTRACT_VERSION } from "@/lib/data/versioning";

import type { BacktestStrategy, TradeIntent } from "../backtesting";
import {
  runResearchExperiment,
  serializeResearchExperimentResult,
} from "./ResearchExperiment";
import {
  ResearchExperimentError,
  ResearchExperimentErrorCode,
} from "./experimentTypes";
import type {
  ResearchExperimentConfig,
  ResearchStrategyConfig,
} from "./experimentTypes";

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
  feeCentsPerContract: 1,
  allowPartialFills: false as const,
  priceSource: "engine-input-pricing" as const,
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
  yesBidCents?: number;
  yesAskCents?: number;
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
    yesBidCents: options.yesBidCents ?? 48,
    yesAskCents: options.yesAskCents ?? 52,
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

function buyIntent(ticker: string): TradeIntent {
  return {
    ticker,
    side: "yes",
    action: "buy",
    quantity: 5,
    limitPriceCents: 52,
    reason: "experiment-buy",
  };
}

function createConfig(
  strategy: BacktestStrategy,
  overrides: Partial<ResearchExperimentConfig> = {},
): ResearchExperimentConfig {
  return {
    experimentId: "exp-001",
    strategy,
    strategyConfig: { mode: "test" } satisfies ResearchStrategyConfig,
    initialCashCents: 10_000,
    fillConfig: FILL_CONFIG,
    ...overrides,
  };
}

describe("runResearchExperiment", () => {
  it("rejects empty snapshot experiments", () => {
    expect(() =>
      runResearchExperiment({
        config: createConfig({ strategyId: "noop", decide: () => [] }),
        input: { snapshots: [] },
      }),
    ).toThrow(ResearchExperimentError);

    try {
      runResearchExperiment({
        config: createConfig({ strategyId: "noop", decide: () => [] }),
        input: { snapshots: [] },
      });
    } catch (error) {
      expect((error as ResearchExperimentError).code).toBe(
        ResearchExperimentErrorCode.EMPTY_SNAPSHOTS,
      );
    }
  });

  it("runs a successful experiment end to end", () => {
    const result = runResearchExperiment({
      config: createConfig({
        strategyId: "buy-each-step",
        decide: (step) => [buyIntent(step.sourceTicker)],
      }),
      input: { snapshots: [snapshotA, snapshotB] },
    });

    expect(result.experimentId).toBe("exp-001");
    expect(result.strategyId).toBe("buy-each-step");
    expect(result.replayResults).toHaveLength(2);
    expect(result.ledger.snapshot().fills).toHaveLength(2);
    expect(result.metrics.tradeCount).toBe(0);
    expect(result.metrics.endEquityCents).toBeGreaterThan(0);
  });

  it("produces deterministic results for repeated execution", () => {
    const params = {
      config: createConfig({
        strategyId: "noop",
        decide: () => [],
      }),
      input: { snapshots: [snapshotA, snapshotB] },
    };

    const first = serializeResearchExperimentResult(runResearchExperiment(params));
    const second = serializeResearchExperimentResult(runResearchExperiment(params));

    expect(first).toBe(second);
  });

  it("preserves configuration on the result", () => {
    const result = runResearchExperiment({
      config: createConfig(
        { strategyId: "noop", decide: () => [] },
        {
          experimentId: "exp-preserve",
          strategyConfig: { threshold: 0.42, label: "baseline" },
          initialCashCents: 25_000,
        },
      ),
      input: { snapshots: [snapshotA] },
    });

    expect(result.configuration).toEqual({
      experimentId: "exp-preserve",
      strategyId: "noop",
      strategyConfig: { threshold: 0.42, label: "baseline" },
      initialCashCents: 25_000,
      fillConfig: FILL_CONFIG,
    });
  });

  it("preserves replay step ordering in results", () => {
    const result = runResearchExperiment({
      config: createConfig({ strategyId: "noop", decide: () => [] }),
      input: { snapshots: [snapshotA, snapshotB] },
    });

    expect(result.replayResults.map((step) => step.stepIndex)).toEqual([0, 1]);
    expect(result.replayResults.map((step) => step.sourceTicker)).toEqual([
      TICKER_A,
      TICKER_B,
    ]);
  });

  it("attaches metrics to the experiment result", () => {
    const result = runResearchExperiment({
      config: createConfig({ strategyId: "noop", decide: () => [] }),
      input: { snapshots: [snapshotA, snapshotB] },
    });

    expect(result.metrics.endEquityCents).toBe(10_000);
    expect(result.metrics.totalReturnPct).toBe(0);
    expect(result.metrics.tradeCount).toBe(0);
  });

  it("attaches the ledger to the experiment result", () => {
    const result = runResearchExperiment({
      config: createConfig({
        strategyId: "buy-once",
        decide: (step) =>
          step.stepIndex === 0 ? [buyIntent(step.sourceTicker)] : [],
      }),
      input: { snapshots: [snapshotA, snapshotB] },
    });

    expect(result.ledger.snapshot().openPositions).toHaveLength(1);
    expect(result.ledger.snapshot().cashCents).toBeLessThan(10_000);
  });

  it("attaches replay results to the experiment result", () => {
    const result = runResearchExperiment({
      config: createConfig({ strategyId: "noop", decide: () => [] }),
      input: { snapshots: [snapshotA] },
    });

    expect(result.replayResults).toHaveLength(1);
    expect(result.replayResults[0]!.sourceTicker).toBe(TICKER_A);
    expect(result.completedAtStep).toBe(0);
  });

  it("serializes experiment results deterministically", () => {
    const result = runResearchExperiment({
      config: createConfig({
        strategyId: "buy-once",
        decide: (step) =>
          step.stepIndex === 0 ? [buyIntent(step.sourceTicker)] : [],
      }),
      input: { snapshots: [snapshotA] },
    });

    expect(serializeResearchExperimentResult(result)).toBe(
      serializeResearchExperimentResult(result),
    );
  });

  it("does not mutate input snapshots", () => {
    const snapshots = [snapshotA, snapshotB];
    const before = snapshots.map((snapshot) =>
      serializeHistoricalTradingSnapshot(snapshot),
    );

    runResearchExperiment({
      config: createConfig({ strategyId: "noop", decide: () => [] }),
      input: { snapshots },
    });

    const after = snapshots.map((snapshot) =>
      serializeHistoricalTradingSnapshot(snapshot),
    );
    expect(after).toEqual(before);
  });

  it("invokes the strategy once per replay step", () => {
    let decideCalls = 0;

    runResearchExperiment({
      config: createConfig({
        strategyId: "counter",
        decide: () => {
          decideCalls += 1;
          return [];
        },
      }),
      input: { snapshots: [snapshotA, snapshotB] },
    });

    expect(decideCalls).toBe(2);
  });
});
