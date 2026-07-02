import { describe, expect, it } from "vitest";

import { buildDecisionTraceAttribution } from "./buildDecisionTraceAttribution";
import { serializeDecisionTraceAttributionReport } from "./buildDecisionTraceAttribution";
import type { ScannedDecisionTrace } from "./decisionTraceAttributionTypes";

const GENERATED_AT = "2026-07-02T14:00:00.000Z";
const STRATEGY_ID = "buy-first-ask";
const MARKET_TICKER = "KXBTC15M-MARKET-A";
const TRACE_PATH = `data/research-results/${STRATEGY_ID}/KXBTC15M/${MARKET_TICKER}/decision-trace.json`;
const RESEARCH_OUTPUT_PATH = `data/research-results/${STRATEGY_ID}/KXBTC15M/${MARKET_TICKER}/research-output.json`;

function createResearchOutputWithRoundTrip(): string {
  const buyFill = {
    fillId: "sim-fill-000001",
    ticker: MARKET_TICKER,
    side: "yes",
    action: "buy",
    priceCents: 50,
    quantity: 1,
    feeCents: 1,
    spreadSlippageCents: 0,
    occurredAt: "2026-06-27T01:00:05.000Z",
    sourceStepIndex: 0,
  };
  const sellFill = {
    fillId: "sim-fill-000002",
    ticker: MARKET_TICKER,
    side: "yes",
    action: "sell",
    priceCents: 70,
    quantity: 1,
    feeCents: 1,
    spreadSlippageCents: 0,
    occurredAt: "2026-06-27T01:15:05.000Z",
    sourceStepIndex: 1,
  };

  const backtestResult = {
    replayResult: {
      results: [
        {
          stepIndex: 0,
          engineInput: {
            evaluatedAt: "2026-06-27T01:00:05.000Z",
            market: { timeRemainingMs: 10 * 60_000 },
            btc: { price: 60_000 },
            pricing: { yesBidCents: 48, yesAskCents: 52, yesMidCents: 50 },
          },
        },
        {
          stepIndex: 1,
          engineInput: {
            evaluatedAt: "2026-06-27T01:15:05.000Z",
            market: { timeRemainingMs: 5 * 60_000 },
            btc: { price: 60_600 },
            pricing: { yesBidCents: 68, yesAskCents: 72, yesMidCents: 70 },
          },
        },
      ],
    },
    strategyRun: {
      strategyId: STRATEGY_ID,
      steps: [
        { stepIndex: 0, acceptedFills: [buyFill], rejectedIntents: [] },
        { stepIndex: 1, acceptedFills: [sellFill], rejectedIntents: [] },
      ],
    },
    metrics: {
      totalPnlCents: 18,
      tradeCount: 1,
    },
  };

  return JSON.stringify({
    researchRun: JSON.stringify({
      config: { strategyId: STRATEGY_ID },
      backtestResult: JSON.stringify(backtestResult),
    }),
  });
}

function createTraceDocument(): string {
  return JSON.stringify({
    runId: "trace-run",
    strategyId: STRATEGY_ID,
    marketTicker: MARKET_TICKER,
    entries: [
      {
        timestamp: "2026-06-27T01:00:05.000Z",
        candleIndex: 0,
        strategyId: STRATEGY_ID,
        marketTicker: MARKET_TICKER,
        btcPrice: 60_000,
        yesBid: 48,
        yesAsk: 52,
        yesMid: 50,
        action: "buy_yes",
        reason: "edge",
        metadata: { momentumPct: 1.2, regimeTag: "trend-up" },
      },
      {
        timestamp: "2026-06-27T01:15:05.000Z",
        candleIndex: 1,
        strategyId: STRATEGY_ID,
        marketTicker: MARKET_TICKER,
        btcPrice: 60_600,
        yesBid: 68,
        yesAsk: 72,
        yesMid: 70,
        action: "sell_yes",
        reason: "take-profit",
        metadata: {},
      },
    ],
  });
}

function createScanned(researchOutputJson: string | null): ScannedDecisionTrace {
  return {
    strategyId: STRATEGY_ID,
    seriesTicker: "KXBTC15M",
    marketTicker: MARKET_TICKER,
    tracePath: TRACE_PATH,
    researchOutputPath: RESEARCH_OUTPUT_PATH,
    traceJson: createTraceDocument(),
    researchOutputJson,
  };
}

describe("buildDecisionTraceAttribution", () => {
  it("returns an empty report when no traces are discovered", () => {
    const report = buildDecisionTraceAttribution({
      inputRoot: "data/research-results",
      outputPath: "data/research-results/decision-trace-attribution.json",
      generatedAt: GENERATED_AT,
      scanned: [],
    });

    expect(report.sampleCounts.totalObservations).toBe(0);
    expect(report.actionBuckets).toEqual([]);
    expect(report.warnings).toEqual([]);
  });

  it("produces deterministic serialized output for attribution buckets", () => {
    const report = buildDecisionTraceAttribution({
      inputRoot: "data/research-results",
      outputPath: "data/research-results/decision-trace-attribution.json",
      generatedAt: GENERATED_AT,
      scanned: [createScanned(createResearchOutputWithRoundTrip())],
    });

    const first = serializeDecisionTraceAttributionReport(report);
    const second = serializeDecisionTraceAttributionReport(report);

    expect(first).toBe(second);
    expect(report.sampleCounts.totalObservations).toBe(1);
    expect(report.actionBuckets[0]?.bucketId).toBe("buy_yes");
    expect(report.regimeTagBuckets[0]?.bucketId).toBe("trend-up");
    expect(report.btcReturnBuckets[0]?.bucketId).toBe("btc-return-up");
    expect(report.actionBuckets[0]?.warnings[0]).toContain("Sparse sample");
  });

  it("warns when research output is missing", () => {
    const report = buildDecisionTraceAttribution({
      inputRoot: "data/research-results",
      outputPath: "data/research-results/decision-trace-attribution.json",
      generatedAt: GENERATED_AT,
      scanned: [createScanned(null)],
    });

    expect(report.sampleCounts.skippedMissingResearchOutput).toBe(1);
    expect(report.warnings[0]?.code).toBe("missing-research-output");
  });
});
