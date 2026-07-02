type ResearchOutputOptions = {
  strategyId?: string;
  seriesTicker?: string;
  marketTicker?: string;
  settlementResult?: "yes" | "no" | null;
  kalshiCandles?: readonly {
    yesBidCents: number;
    yesAskCents: number;
  }[];
  strategyProbabilityUp?: number | null;
};

export function createRunnerResearchOutputJson(
  options: ResearchOutputOptions = {},
): string {
  const strategyId = options.strategyId ?? "noop";
  const seriesTicker = options.seriesTicker ?? "KXBTC15M";
  const marketTicker = options.marketTicker ?? `${seriesTicker}-MARKET-A`;
  const settlementResult =
    options.settlementResult === undefined ? "yes" : options.settlementResult;
  const kalshiCandles = options.kalshiCandles ?? [
    { yesBidCents: 40, yesAskCents: 60 },
    { yesBidCents: 70, yesAskCents: 80 },
  ];
  const strategyProbabilityUp = options.strategyProbabilityUp ?? null;

  const snapshot = {
    ticker: marketTicker,
    marketWindow: {
      ticker: marketTicker,
      seriesTicker,
    },
    settlement:
      settlementResult === null
        ? undefined
        : {
            result: settlementResult,
            ticker: marketTicker,
          },
    kalshiCandles: kalshiCandles.map((candle) => ({
      yesBidCents: candle.yesBidCents,
      yesAskCents: candle.yesAskCents,
      ticker: marketTicker,
    })),
  };

  const replayResults = [
    {
      engineOutput: {
        probability:
          strategyProbabilityUp === null
            ? null
            : { probabilityUp: strategyProbabilityUp },
      },
    },
  ];

  const researchRun = {
    config: { strategyId },
    backtestResult: JSON.stringify({
      replayResult: {
        results: replayResults,
      },
    }),
  };

  return JSON.stringify({
    dataset: JSON.stringify({
      snapshots: [snapshot],
    }),
    researchRun: JSON.stringify(researchRun),
    metadata: {
      strategyId,
      runId: "test-run",
      durationMs: 0,
    },
  });
}
