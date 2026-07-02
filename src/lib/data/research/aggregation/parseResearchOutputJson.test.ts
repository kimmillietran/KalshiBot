import { describe, expect, it } from "vitest";

import { parseResearchOutputJson } from "./parseResearchOutputJson";

const MARKET_TICKER = "KXBTC15M-26APR301900-00";

function createRunnerOutput(metrics: Record<string, unknown>): string {
  return JSON.stringify({
    dataset: {
      metadata: {
        marketTickers: [MARKET_TICKER],
      },
    },
    metadata: {
      durationMs: 1_500,
    },
    researchRun: {
      durationMs: 1_500,
      backtestResult: {
        metrics: {
          totalPnlCents: 250,
          totalReturnPct: 2.5,
          maxDrawdownPct: 1.1,
          sharpeRatio: 1.2,
          winRatePct: 100,
          lossRatePct: 0,
          tradeCount: 1,
          winningTradeCount: 1,
          losingTradeCount: 0,
          ...metrics,
        },
        strategyRun: {
          strategyId: "buy-first-ask",
          steps: [
            {
              acceptedFills: [
                {
                  fillId: "sim-fill-000001",
                  priceCents: 52,
                  quantity: 1,
                },
              ],
              rejectedIntents: [],
            },
          ],
        },
        ledger: {
          fills: [
            {
              fillId: "sim-fill-000001",
              quantity: 1,
            },
          ],
        },
      },
    },
  });
}

describe("parseResearchOutputJson", () => {
  it("reads top-level fillCount and contractsFilled from runner metrics", () => {
    const parsed = parseResearchOutputJson(
      createRunnerOutput({
        fillCount: 4,
        contractsFilled: 7,
      }),
      MARKET_TICKER,
    );

    expect(parsed.metrics).toMatchObject({
      tradeCount: 1,
      fillCount: 4,
      contractsFilled: 7,
      totalPnlCents: 250,
    });
  });

  it("falls back to executionCostSummary.fillCount for older outputs", () => {
    const parsed = parseResearchOutputJson(
      createRunnerOutput({
        executionCostSummary: {
          modelKind: "kalshi-taker",
          fillCount: 3,
          totalFeeCents: 3,
          averageFeeCentsPerFill: 1,
        },
      }),
      MARKET_TICKER,
    );

    expect(parsed.metrics?.fillCount).toBe(3);
    expect(parsed.metrics?.contractsFilled).toBe(0);
  });

  it("parses batch-format metrics with optional fill fields", () => {
    const parsed = parseResearchOutputJson(
      JSON.stringify({
        marketTicker: MARKET_TICKER,
        status: "completed",
        durationMs: 900,
        metrics: {
          totalPnlCents: 100,
          totalReturnPct: 1,
          maxDrawdownPct: 0.5,
          sharpeRatio: null,
          winRatePct: 0,
          lossRatePct: 0,
          tradeCount: 0,
          fillCount: 2,
          contractsFilled: 2,
        },
      }),
      MARKET_TICKER,
    );

    expect(parsed.metrics).toMatchObject({
      fillCount: 2,
      contractsFilled: 2,
      tradeCount: 0,
    });
  });
});
