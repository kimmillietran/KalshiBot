import { describe, expect, it } from "vitest";

import {
  discoverResearchOutputPaths,
  inspectResearchOutputDocument,
  serializeResearchOutputInspectionSummary,
} from "./index";

const MARKET_TICKER = "KXBTC15M-26APR281945-45";
const STRATEGY_ID = "buy-first-ask";

function createRunnerOutputWithFills(): string {
  const fill = {
    fillId: "sim-fill-000001",
    intentId: "intent-000001",
    ticker: MARKET_TICKER,
    side: "yes",
    action: "buy",
    priceCents: 52,
    quantity: 1,
    feeCents: 1,
    spreadSlippageCents: 0,
    occurredAt: "2026-06-27T01:00:05.000Z",
    sourceStepIndex: 0,
    reason: "accepted",
  };

  const rejection = {
    intentId: "intent-000002",
    intent: {
      ticker: MARKET_TICKER,
      side: "yes",
      action: "buy",
      quantity: 10,
      limitPriceCents: 99,
      reason: "too expensive",
    },
    code: "insufficient-cash",
    reason: "not enough cash",
  };

  const backtestResult = {
    replayResult: {
      results: [{ stepIndex: 0 }, { stepIndex: 1 }],
    },
    strategyRun: {
      strategyId: STRATEGY_ID,
      steps: [
        {
          stepIndex: 0,
          intents: [],
          acceptedFills: [fill],
          rejectedIntents: [rejection],
        },
      ],
    },
    metrics: {
      totalPnlCents: 250,
      netPnlCents: 240,
      grossPnlCents: 250,
      tradeCount: 1,
      totalReturnPct: 0.25,
      maxDrawdownPct: 1.5,
      sharpeRatio: 1.2,
      winRatePct: 100,
      lossRatePct: 0,
      winningTradeCount: 1,
      losingTradeCount: 0,
    },
    metadata: {
      strategyId: STRATEGY_ID,
      snapshotCount: 1,
    },
  };

  return JSON.stringify({
    dataset: JSON.stringify({
      metadata: { marketTickers: [MARKET_TICKER] },
      snapshots: [{ ticker: MARKET_TICKER }],
    }),
    researchRun: JSON.stringify({
      config: { runId: "run-001", strategyId: STRATEGY_ID },
      durationMs: 1_500,
      backtestResult: JSON.stringify(backtestResult),
    }),
    metadata: {
      runId: "run-001",
      strategyId: STRATEGY_ID,
      durationMs: 1_500,
    },
    diagnostics: {
      decisionCount: 2,
      zeroPriceDecisionCount: 0,
      nonZeroPriceDecisionCount: 2,
      percentZeroPriceDecisions: 0,
      warnings: [],
    },
  });
}

describe("inspectResearchOutputDocument", () => {
  it("inspects nested runner-format research output", () => {
    const summary = inspectResearchOutputDocument(createRunnerOutputWithFills(), {
      inputPath:
        `data/research-results/${STRATEGY_ID}/KXBTC15M/${MARKET_TICKER}/research-output.json`,
    });

    expect(summary.format).toBe("runner");
    expect(summary.runId).toBe("run-001");
    expect(summary.strategyId).toBe(STRATEGY_ID);
    expect(summary.marketTicker).toBe(MARKET_TICKER);
    expect(summary.totalPnlCents).toBe(250);
    expect(summary.netPnlCents).toBe(240);
    expect(summary.grossPnlCents).toBe(250);
    expect(summary.acceptedFillCount).toBe(1);
    expect(summary.rejectedIntentCount).toBe(1);
    expect(summary.replayStepCount).toBe(2);
    expect(summary.diagnostics?.decisionCount).toBe(2);
    expect(summary.diagnosticsWarnings).toEqual([]);
    expect(summary.firstFill?.fillId).toBe("sim-fill-000001");
    expect(summary.lastRejectedIntent?.code).toBe("insufficient-cash");
    expect(summary.decisionTracePath).toBe(
      `data/research-results/${STRATEGY_ID}/KXBTC15M/${MARKET_TICKER}/decision-trace.json`,
    );
    expect(summary.missingFields).toEqual([]);
  });

  it("handles missing nested fields clearly", () => {
    const summary = inspectResearchOutputDocument(
      JSON.stringify({
        dataset: JSON.stringify({ metadata: { marketTickers: [MARKET_TICKER] } }),
        researchRun: JSON.stringify({ config: { strategyId: STRATEGY_ID } }),
        metadata: { strategyId: STRATEGY_ID },
      }),
    );

    expect(summary.strategyId).toBe(STRATEGY_ID);
    expect(summary.marketTicker).toBe(MARKET_TICKER);
    expect(summary.totalPnlCents).toBeNull();
    expect(summary.acceptedFillCount).toBe(0);
    expect(summary.missingFields).toContain("backtestResult.metrics");
    expect(summary.missingFields).toContain("backtestResult.strategyRun.steps");
    expect(summary.missingFields).toContain("backtestResult.replayResult.results");
  });

  it("inspects flat batch-format research output", () => {
    const summary = inspectResearchOutputDocument(
      JSON.stringify({
        marketTicker: MARKET_TICKER,
        status: "completed",
        durationMs: 1_500,
        metrics: {
          totalPnlCents: 250,
          totalReturnPct: 0.25,
          maxDrawdownPct: 1.5,
          sharpeRatio: 1.2,
          winRatePct: 66.67,
          lossRatePct: 33.33,
          tradeCount: 3,
        },
      }),
    );

    expect(summary.format).toBe("flat");
    expect(summary.marketTicker).toBe(MARKET_TICKER);
    expect(summary.totalPnlCents).toBe(250);
    expect(summary.tradeCount).toBe(3);
    expect(summary.missingFields).toEqual([]);
  });

  it("fails clearly on invalid JSON", () => {
    expect(() => inspectResearchOutputDocument("{not-json")).toThrow(
      "research-output.json contains invalid JSON",
    );
  });

  it("serializes inspection summaries deterministically", () => {
    const summary = inspectResearchOutputDocument(createRunnerOutputWithFills());
    const first = serializeResearchOutputInspectionSummary(summary);
    const second = serializeResearchOutputInspectionSummary(summary);
    expect(first).toBe(second);
  });
});

describe("discoverResearchOutputPaths", () => {
  it("discovers research outputs with strategy filter and limit", () => {
    const inputRoot = "data/research-results";
    const paths = [
      `${inputRoot}/${STRATEGY_ID}/KXBTC15M/${MARKET_TICKER}/research-output.json`,
      `${inputRoot}/${STRATEGY_ID}/KXBTC15M/KXBTC15M-MARKET-B/research-output.json`,
      `${inputRoot}/noop/KXBTC15M/${MARKET_TICKER}/research-output.json`,
    ];

    const discovered = discoverResearchOutputPaths(
      inputRoot,
      {
        readdir: (path) => {
          if (path === inputRoot) {
            return [STRATEGY_ID, "noop"];
          }
          if (path === `${inputRoot}/${STRATEGY_ID}`) {
            return ["KXBTC15M"];
          }
          if (path === `${inputRoot}/${STRATEGY_ID}/KXBTC15M`) {
            return [MARKET_TICKER, "KXBTC15M-MARKET-B"];
          }
          if (
            path === `${inputRoot}/${STRATEGY_ID}/KXBTC15M/${MARKET_TICKER}`
            || path === `${inputRoot}/${STRATEGY_ID}/KXBTC15M/KXBTC15M-MARKET-B`
          ) {
            return ["research-output.json"];
          }
          return [];
        },
        fileExists: (path) => paths.includes(path),
        isDirectory: (path) => !path.endsWith("research-output.json"),
      },
      { strategyId: STRATEGY_ID, limit: 1 },
    );

    expect(discovered).toEqual([paths[0]]);
  });
});
