import { describe, expect, it } from "vitest";

import type { ReplayStepResult } from "@/lib/data/replay/replaySessionTypes";

import { buildStrategyDecisionTraceEntry } from "./buildStrategyDecisionTraceEntry";
import { buildStrategySweepDecisionTracePath } from "./buildStrategySweepDecisionTracePath";
import { serializeStrategyDecisionTrace } from "./serializeStrategyDecisionTrace";
import type { StrategyDecisionTraceDocument } from "./strategyDecisionTraceTypes";

const T0 = "2026-06-26T23:15:00.000Z";
const TICKER = "KXBTC15M-TRACE-A";

function createStep(stepIndex: number): ReplayStepResult {
  return {
    stepIndex,
    sourceTicker: TICKER,
    temporal: {
      eventTime: T0,
      collectionTime: T0,
      observedAt: T0,
    },
    provenance: {
      source: "kalshi-rest",
      collectionTime: T0,
      observedAt: T0,
      fetchId: `fetch-${stepIndex}`,
    },
    engineInput: {
      evaluatedAt: T0,
      market: {
        strikePrice: 60_000,
        timeRemainingMs: 900_000,
        closeTime: T0,
      },
      btc: {
        price: 61_000,
        change24hPercent: null,
        feedStatus: "live",
        providerSource: "upstream",
        candles: [],
      },
      pricing: {
        yesBidCents: 48,
        yesAskCents: 52,
        yesMidCents: 50,
        noBidCents: 47,
        noAskCents: 51,
        noMidCents: 49,
        liquidityQuality: "Fair",
        volumeDollars: null,
      },
    },
    engineOutput: {
      action: "hold",
      engineVersion: "test",
      configHash: "cfg-test",
      reasoning: { steps: [], summary: "hold" },
      evaluatedAt: T0,
      features: null,
      probability: {
        probabilityUp: 0.55,
        probabilityDown: 0.45,
        confidence: 0.8,
        modelVersion: "test",
        logOdds: 0.2,
        drivers: [],
      },
      expectedValue: null,
      positionSize: null,
    },
    sourceSnapshot: {} as ReplayStepResult["sourceSnapshot"],
  };
}

function createDocument(
  entries: StrategyDecisionTraceDocument["entries"],
): StrategyDecisionTraceDocument {
  return {
    runId: "trace-run",
    strategyId: "noop",
    marketTicker: TICKER,
    entries,
  };
}

describe("buildStrategyDecisionTraceEntry", () => {
  it("maps replay context and plugin metadata into a trace entry", () => {
    const entry = buildStrategyDecisionTraceEntry({
      step: createStep(2),
      strategyId: "fair-value-diffusion",
      pluginTrace: {
        action: "hold",
        reason: "edge-below-threshold",
        metadata: {
          volatility: 0.42,
          fairProbability: 0.51,
          edge: 1,
          threshold: 5,
        },
      },
    });

    expect(entry).toMatchObject({
      timestamp: T0,
      candleIndex: 2,
      strategyId: "fair-value-diffusion",
      marketTicker: TICKER,
      btcPrice: 61_000,
      yesBid: 48,
      yesAsk: 52,
      yesMid: 50,
      probabilityUp: 0.51,
      action: "hold",
      reason: "edge-below-threshold",
      metadata: {
        volatility: 0.42,
        fairProbability: 0.51,
        edge: 1,
        threshold: 5,
      },
    });
  });
});

describe("serializeStrategyDecisionTrace", () => {
  it("serializes empty traces deterministically", () => {
    const document = createDocument([]);

    expect(serializeStrategyDecisionTrace(document)).toBe(
      serializeStrategyDecisionTrace(document),
    );
    expect(JSON.parse(serializeStrategyDecisionTrace(document))).toEqual({
      runId: "trace-run",
      strategyId: "noop",
      marketTicker: TICKER,
      entries: [],
    });
  });

  it("preserves deterministic ordering for multiple entries", () => {
    const entries = [0, 1, 2].map((candleIndex) =>
      buildStrategyDecisionTraceEntry({
        step: createStep(candleIndex),
        strategyId: "buy-below-probability",
        pluginTrace: {
          action: "hold",
          reason: "above-threshold",
          metadata: { threshold: 50 },
        },
      }),
    );

    const serialized = serializeStrategyDecisionTrace(createDocument(entries));
    const parsed = JSON.parse(serialized) as {
      entries: Array<{ candleIndex: number }>;
    };

    expect(parsed.entries.map((entry) => entry.candleIndex)).toEqual([0, 1, 2]);
    expect(serialized).toContain('"threshold":50');
  });

  it("omits probabilityUp when unavailable", () => {
    const entry = buildStrategyDecisionTraceEntry({
      step: {
        ...createStep(0),
        engineOutput: {
          ...createStep(0).engineOutput,
          probability: null,
        },
      },
      strategyId: "noop",
      pluginTrace: {
        action: "hold",
        reason: "noop",
        metadata: {},
      },
    });

    const serialized = serializeStrategyDecisionTrace(createDocument([entry]));
    expect(serialized).not.toContain("probabilityUp");
  });
});

describe("buildStrategySweepDecisionTracePath", () => {
  it("writes decision-trace.json beside research-output.json", () => {
    expect(
      buildStrategySweepDecisionTracePath(
        "data/research-results/noop/KXBTC15M/KXBTC15M-MARKET-A/research-output.json",
      ),
    ).toBe(
      "data/research-results/noop/KXBTC15M/KXBTC15M-MARKET-A/decision-trace.json",
    );
  });
});
