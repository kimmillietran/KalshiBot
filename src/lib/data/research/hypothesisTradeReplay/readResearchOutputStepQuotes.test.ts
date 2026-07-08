import { describe, expect, it } from "vitest";

import { readResearchOutputStepQuotes } from "./readResearchOutputStepQuotes";

function createReplayResearchOutputJson(steps: Array<{
  yesBidCents: number;
  yesAskCents: number;
  noBidCents?: number;
  noAskCents?: number;
}>): string {
  const replayResults = steps.map((step, stepIndex) => ({
    stepIndex,
    engineInput: {
      pricing: {
        yesBidCents: step.yesBidCents,
        yesAskCents: step.yesAskCents,
        ...(step.noBidCents !== undefined ? { noBidCents: step.noBidCents } : {}),
        ...(step.noAskCents !== undefined ? { noAskCents: step.noAskCents } : {}),
      },
      market: { strikePrice: 60_000, timeRemainingMs: 900_000 },
      btc: { price: 60_000, candles: [] },
    },
  }));

  return JSON.stringify({
    dataset: JSON.stringify({ snapshots: [] }),
    researchRun: JSON.stringify({
      config: { strategyId: "noop" },
      backtestResult: JSON.stringify({
        replayResult: { results: replayResults },
      }),
    }),
    metadata: { strategyId: "noop" },
  });
}

describe("readResearchOutputStepQuotes", () => {
  it("reads step quotes and derives NO quotes when absent", () => {
    const quotes = readResearchOutputStepQuotes(
      createReplayResearchOutputJson([
        { yesBidCents: 40, yesAskCents: 60 },
      ]),
    );

    expect(quotes.get(0)).toEqual({
      yesBidCents: 40,
      yesAskCents: 60,
      noBidCents: 40,
      noAskCents: 60,
    });
  });
});
