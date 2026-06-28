import { describe, expect, it } from "vitest";

import { DataSource } from "@/lib/data/provenance";
import { assembleHistoricalTradingSnapshot } from "@/lib/data/snapshots";
import type {
  HistoricalTradingSnapshot,
  SilverRecordEnvelope,
  SnapshotAssemblyInput,
} from "@/lib/data/snapshots/types";
import { serializeReplayStepResult } from "@/lib/data/replay/ReplaySession";
import { ReplaySession } from "@/lib/data/replay/ReplaySession";
import type { ReplayStepResult } from "@/lib/data/replay/replaySessionTypes";
import { DATA_CONTRACT_VERSION } from "@/lib/data/versioning";
import { DEFAULT_ENGINE_CONFIG } from "@/lib/trading/config/defaults";
import { MarketLifecycle } from "@/types/domain/trading";
import type { EvaluationSnapshot, TradeDecision } from "@/types/domain/trading";

import { BacktestIntentRejectionCode } from "./errors";
import { BacktestStrategyRunner } from "./BacktestStrategyRunner";
import type {
  BacktestFillSimulationConfig,
  BacktestStrategy,
  BacktestStrategyContext,
  TradeIntent,
} from "./strategyTypes";

const EVENT_TIME = "2026-06-26T23:15:00.000Z";
const EVENT_TIME_B = "2026-06-26T23:30:00.000Z";
const COLLECTION_TIME = "2026-06-27T01:00:00.000Z";
const OBSERVED_AT = "2026-06-27T01:00:05.000Z";
const OBSERVED_AT_B = "2026-06-27T01:30:05.000Z";
const OPEN_TIME = "2026-06-26T23:15:00.000Z";
const CLOSE_TIME = "2026-06-26T23:16:00.000Z";
const WINDOW_CLOSE = "2026-06-26T23:30:00.000Z";
const SERIES = "KXBTC15M";
const TICKER_A = "KXBTC15M-STEP-A";
const TICKER_B = "KXBTC15M-STEP-B";

const DEFAULT_FILL_CONFIG: BacktestFillSimulationConfig = {
  feeCentsPerContract: 2,
  allowPartialFills: false,
  priceSource: "engine-input-pricing",
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

function minimalEngineOutput(evaluatedAt: string): TradeDecision {
  return {
    action: "NO TRADE",
    engineVersion: "test",
    configHash: "test-hash",
    reasoning: { steps: [], summary: "test" },
    evaluatedAt,
    features: null,
    probability: null,
    expectedValue: null,
    positionSize: null,
  };
}

function createReplayStep(options: {
  stepIndex: number;
  ticker?: string;
  observedAt?: string;
  yesBidCents?: number;
  yesAskCents?: number;
  pricing?: EvaluationSnapshot["pricing"];
}): ReplayStepResult {
  const ticker = options.ticker ?? TICKER_A;
  const observedAt = options.observedAt ?? OBSERVED_AT;
  const snapshot = createSnapshot({
    ticker,
    eventTime: options.stepIndex === 0 ? EVENT_TIME : EVENT_TIME_B,
    observedAt,
    yesBidCents: options.yesBidCents,
    yesAskCents: options.yesAskCents,
  });

  return {
    stepIndex: options.stepIndex,
    sourceTicker: ticker,
    temporal: snapshot.temporal,
    provenance: snapshot.provenance,
    engineInput: {
      evaluatedAt: observedAt,
      market: {
        ticker,
        lifecycle: MarketLifecycle.ACTIVE,
        strikePrice: 59_990.31,
        timeRemainingMs: 60_000,
        closeTime: WINDOW_CLOSE,
      },
      btc: null,
      pricing:
        options.pricing ??
        ({
          yesBidCents: options.yesBidCents ?? 48,
          yesAskCents: options.yesAskCents ?? 52,
          yesMidCents: 50,
          noBidCents: 47,
          noAskCents: 51,
          noMidCents: 49,
          liquidityQuality: "Good",
          volumeDollars: null,
        } satisfies NonNullable<EvaluationSnapshot["pricing"]>),
    },
    engineOutput: minimalEngineOutput(observedAt),
    sourceSnapshot: snapshot,
  };
}

function buyIntent(
  overrides: Partial<TradeIntent> = {},
): TradeIntent {
  return {
    ticker: TICKER_A,
    side: "yes",
    action: "buy",
    quantity: 5,
    limitPriceCents: 52,
    reason: "test-buy",
    ...overrides,
  };
}

function sellIntent(
  overrides: Partial<TradeIntent> = {},
): TradeIntent {
  return buyIntent({ action: "sell", limitPriceCents: 48, reason: "test-sell", ...overrides });
}

function strategy(
  strategyId: string,
  decide: (
    step: ReplayStepResult,
    context: BacktestStrategyContext,
  ) => TradeIntent[],
): BacktestStrategy {
  return { strategyId, decide };
}

describe("BacktestStrategyRunner", () => {
  it("runs a no-op strategy without fills", () => {
    const steps = [createReplayStep({ stepIndex: 0 }), createReplayStep({ stepIndex: 1 })];

    const result = BacktestStrategyRunner.run({
      initialCashCents: 10_000,
      steps,
      strategy: strategy("noop", () => []),
      fillConfig: DEFAULT_FILL_CONFIG,
    });

    expect(result.steps).toHaveLength(2);
    expect(result.steps.every((step) => step.acceptedFills.length === 0)).toBe(true);
    expect(result.ledger.snapshot().fills).toHaveLength(0);
    expect(result.ledger.snapshot().cashCents).toBe(10_000);
  });

  it("records a simple buy strategy fill and updates the ledger", () => {
    const result = BacktestStrategyRunner.run({
      initialCashCents: 10_000,
      steps: [createReplayStep({ stepIndex: 0 })],
      strategy: strategy("buy-yes", () => [buyIntent()]),
      fillConfig: DEFAULT_FILL_CONFIG,
    });

    const fill = result.steps[0]!.acceptedFills[0]!;
    expect(fill).toMatchObject({
      fillId: "sim-fill-000001",
      intentId: "intent-000001",
      priceCents: 52,
      quantity: 5,
      feeCents: 10,
      reason: "test-buy",
    });
    expect(result.ledger.snapshot().openPositions).toEqual([
      {
        ticker: TICKER_A,
        side: "yes",
        quantity: 5,
        averageCostCents: 52,
      },
    ]);
    expect(result.ledger.snapshot().cashCents).toBe(10_000 - 5 * 52 - 10);
  });

  it("realizes P/L when a buy-then-sell strategy closes a position", () => {
    const steps = [
      createReplayStep({ stepIndex: 0, yesAskCents: 50, yesBidCents: 48 }),
      createReplayStep({
        stepIndex: 1,
        ticker: TICKER_A,
        observedAt: OBSERVED_AT_B,
        yesAskCents: 55,
        yesBidCents: 54,
      }),
    ];

    const result = BacktestStrategyRunner.run({
      initialCashCents: 10_000,
      steps,
      strategy: strategy("buy-sell", (step) =>
        step.stepIndex === 0
          ? [buyIntent({ limitPriceCents: 50 })]
          : [sellIntent({ quantity: 5, limitPriceCents: 54 })],
      ),
      fillConfig: DEFAULT_FILL_CONFIG,
    });

    expect(result.ledger.snapshot().openPositions).toEqual([]);
    expect(result.ledger.snapshot().realizedPnLCents).toBe((54 - 50) * 5 - 10);
  });

  it("rejects buy intents when cash is insufficient", () => {
    const result = BacktestStrategyRunner.run({
      initialCashCents: 100,
      steps: [createReplayStep({ stepIndex: 0 })],
      strategy: strategy("buy-yes", () => [buyIntent({ quantity: 10 })]),
      fillConfig: DEFAULT_FILL_CONFIG,
    });

    expect(result.steps[0]!.acceptedFills).toEqual([]);
    expect(result.steps[0]!.rejectedIntents[0]).toMatchObject({
      code: BacktestIntentRejectionCode.INSUFFICIENT_CASH,
    });
  });

  it("rejects sell intents without an open position", () => {
    const result = BacktestStrategyRunner.run({
      initialCashCents: 10_000,
      steps: [createReplayStep({ stepIndex: 0 })],
      strategy: strategy("sell-yes", () => [sellIntent()]),
      fillConfig: DEFAULT_FILL_CONFIG,
    });

    expect(result.steps[0]!.rejectedIntents[0]).toMatchObject({
      code: BacktestIntentRejectionCode.INSUFFICIENT_POSITION,
    });
  });

  it("rejects invalid quantity intents", () => {
    const result = BacktestStrategyRunner.run({
      initialCashCents: 10_000,
      steps: [createReplayStep({ stepIndex: 0 })],
      strategy: strategy("bad-qty", () => [buyIntent({ quantity: 0 })]),
      fillConfig: DEFAULT_FILL_CONFIG,
    });

    expect(result.steps[0]!.rejectedIntents[0]).toMatchObject({
      code: BacktestIntentRejectionCode.INVALID_QUANTITY,
    });
  });

  it("produces deterministic results for repeated runs", () => {
    const input = {
      initialCashCents: 10_000,
      steps: [
        createReplayStep({ stepIndex: 0 }),
        createReplayStep({ stepIndex: 1, ticker: TICKER_B, observedAt: OBSERVED_AT_B }),
      ],
      strategy: strategy("buy-yes", (step) => [
        buyIntent({ ticker: step.sourceTicker, quantity: 2 }),
      ]),
      fillConfig: DEFAULT_FILL_CONFIG,
    };

    const first = BacktestStrategyRunner.run(input);
    const second = BacktestStrategyRunner.run(input);

    expect(first).toEqual(second);
  });

  it("preserves caller-supplied replay step order", () => {
    const stepB = createReplayStep({ stepIndex: 1, ticker: TICKER_B, observedAt: OBSERVED_AT_B });
    const stepA = createReplayStep({ stepIndex: 0 });

    const result = BacktestStrategyRunner.run({
      initialCashCents: 10_000,
      steps: [stepB, stepA],
      strategy: strategy("trace-order", (step) => [
        buyIntent({ ticker: step.sourceTicker, quantity: 1, reason: `step-${step.stepIndex}` }),
      ]),
      fillConfig: DEFAULT_FILL_CONFIG,
    });

    expect(result.steps.map((step) => step.stepIndex)).toEqual([1, 0]);
    expect(result.steps[0]!.acceptedFills[0]!.ticker).toBe(TICKER_B);
    expect(result.steps[1]!.acceptedFills[0]!.ticker).toBe(TICKER_A);
  });

  it("builds strategy context from prior fills", () => {
    const cashByStep: number[] = [];

    BacktestStrategyRunner.run({
      initialCashCents: 10_000,
      steps: [
        createReplayStep({ stepIndex: 0 }),
        createReplayStep({ stepIndex: 1, observedAt: OBSERVED_AT_B }),
      ],
      strategy: strategy("context-check", (_step, context) => {
        cashByStep.push(context.cashCents);
        return context.stepIndex === 0 ? [buyIntent({ quantity: 4 })] : [];
      }),
      fillConfig: { ...DEFAULT_FILL_CONFIG, feeCentsPerContract: 0 },
    });

    expect(cashByStep[0]).toBe(10_000);
    expect(cashByStep[1]).toBe(10_000 - 4 * 52);
  });

  it("applies fee config to simulated fills", () => {
    const result = BacktestStrategyRunner.run({
      initialCashCents: 10_000,
      steps: [createReplayStep({ stepIndex: 0 })],
      strategy: strategy("buy-yes", () => [buyIntent({ quantity: 3 })]),
      fillConfig: { ...DEFAULT_FILL_CONFIG, feeCentsPerContract: 4 },
    });

    expect(result.steps[0]!.acceptedFills[0]!.feeCents).toBe(12);
    expect(result.ledger.snapshot().cashCents).toBe(10_000 - 3 * 52 - 12);
  });

  it("does not mutate replay step inputs", () => {
    const session = ReplaySession.create(
      [
        createSnapshot({ ticker: TICKER_A, eventTime: EVENT_TIME, observedAt: OBSERVED_AT }),
        createSnapshot({
          ticker: TICKER_B,
          eventTime: EVENT_TIME_B,
          observedAt: OBSERVED_AT_B,
        }),
      ],
      DEFAULT_ENGINE_CONFIG,
    );
    const { results } = session.stepAll();
    const before = results.map((step) => serializeReplayStepResult(step));

    BacktestStrategyRunner.run({
      initialCashCents: 10_000,
      steps: results,
      strategy: strategy("noop", () => []),
      fillConfig: DEFAULT_FILL_CONFIG,
    });

    const after = results.map((step) => serializeReplayStepResult(step));
    expect(after).toEqual(before);
  });

  it("does not return metrics fields", () => {
    const result = BacktestStrategyRunner.run({
      initialCashCents: 10_000,
      steps: [createReplayStep({ stepIndex: 0 })],
      strategy: strategy("buy-yes", () => [buyIntent()]),
      fillConfig: DEFAULT_FILL_CONFIG,
    });

    expect(result).not.toHaveProperty("metrics");
    expect(result).not.toHaveProperty("sharpe");
    expect(result).not.toHaveProperty("drawdown");
    expect(Object.keys(result).sort()).toEqual(["ledger", "steps", "strategyId"]);
  });
});
