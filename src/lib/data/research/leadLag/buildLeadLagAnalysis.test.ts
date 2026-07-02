import { describe, expect, it } from "vitest";

import {
  buildLeadLagAnalysis,
  computeLeadLagMetricsForCandles,
  extractLeadLagCandlesFromResearchOutput,
  serializeLeadLagAnalysis,
} from "./index";

const GENERATED_AT = "2026-06-27T20:00:00.000Z";
const INPUT_ROOT = "data/research-results";
const OUTPUT_PATH = "data/research-results/lead-lag-analysis.json";
const STRATEGY_ID = "noop";
const SERIES_TICKER = "KXBTC15M";
const MARKET_A = `${SERIES_TICKER}-MARKET-A`;

function createReplayResearchOutputJson(options: {
  marketTicker?: string;
  steps: Array<{
    yesBidCents: number;
    yesAskCents: number;
    spotPrice: number;
    evaluatedAt?: string;
    omitBtc?: boolean;
  }>;
}): string {
  const marketTicker = options.marketTicker ?? MARKET_A;
  const replayResults = options.steps.map((step, stepIndex) => ({
    stepIndex,
    engineInput: {
      evaluatedAt: step.evaluatedAt ?? `2026-06-27T12:${String(stepIndex).padStart(2, "0")}:00.000Z`,
      pricing: {
        yesBidCents: step.yesBidCents,
        yesAskCents: step.yesAskCents,
      },
      btc: step.omitBtc
        ? {}
        : {
            price: step.spotPrice,
          },
    },
  }));

  return JSON.stringify({
    dataset: JSON.stringify({
      snapshots: [
        {
          ticker: marketTicker,
          marketWindow: {
            ticker: marketTicker,
            seriesTicker: SERIES_TICKER,
          },
          kalshiCandles: options.steps.map((_, index) => ({
            yesBidCents: 40,
            yesAskCents: 60,
            closeTime: `2026-06-27T12:${String(index).padStart(2, "0")}:00.000Z`,
          })),
        },
      ],
    }),
    researchRun: JSON.stringify({
      config: { strategyId: STRATEGY_ID },
      backtestResult: JSON.stringify({
        replayResult: { results: replayResults },
      }),
    }),
    metadata: { strategyId: STRATEGY_ID },
  });
}

function createScanned(marketTicker: string, outputJson: string) {
  return {
    strategyId: STRATEGY_ID,
    seriesTicker: SERIES_TICKER,
    marketTicker,
    outputPath: `${INPUT_ROOT}/${STRATEGY_ID}/${SERIES_TICKER}/${marketTicker}/research-output.json`,
    outputJson,
  };
}

describe("computeLeadLagMetricsForCandles", () => {
  it("detects a known BTC-leading lag in synthetic candles", () => {
    const candles = [
      { stepIndex: 0, timestampMs: 0, btcPrice: 100, impliedProbability: 0.4 },
      { stepIndex: 1, timestampMs: 60_000, btcPrice: 110, impliedProbability: 0.4 },
      { stepIndex: 2, timestampMs: 120_000, btcPrice: 110, impliedProbability: 0.5 },
      { stepIndex: 3, timestampMs: 180_000, btcPrice: 120, impliedProbability: 0.5 },
      { stepIndex: 4, timestampMs: 240_000, btcPrice: 120, impliedProbability: 0.6 },
    ];

    const metrics = computeLeadLagMetricsForCandles(candles, 3);
    const lagOne = metrics.find((metric) => metric.lag === 1);
    const lagZero = metrics.find((metric) => metric.lag === 0);

    expect(lagOne?.direction).toBe("btc-leads-kalshi");
    expect(lagOne?.correlation).toBeGreaterThan(0.99);
    expect((lagOne?.correlation ?? 0) > (lagZero?.correlation ?? -1)).toBe(true);
  });
});

describe("extractLeadLagCandlesFromResearchOutput", () => {
  it("skips replay steps with missing BTC or implied probability", () => {
    const extracted = extractLeadLagCandlesFromResearchOutput(
      createReplayResearchOutputJson({
        steps: [
          { yesBidCents: 40, yesAskCents: 60, spotPrice: 100 },
          { yesBidCents: 40, yesAskCents: 60, spotPrice: 110, omitBtc: true },
          { yesBidCents: 50, yesAskCents: 70, spotPrice: 110 },
        ],
      }),
      `${INPUT_ROOT}/research-output.json`,
    );

    expect(extracted.candles).toHaveLength(2);
    expect(extracted.skippedMissingCandles).toBe(1);
    expect(extracted.warnings.some((warning) => warning.code === "partial-candles")).toBe(
      true,
    );
  });
});

describe("buildLeadLagAnalysis", () => {
  it("returns deterministic ordering for markets and lag metrics", () => {
    const marketB = `${SERIES_TICKER}-MARKET-B`;
    const analysis = buildLeadLagAnalysis({
      inputRoot: INPUT_ROOT,
      outputPath: OUTPUT_PATH,
      generatedAt: GENERATED_AT,
      scanned: [
        createScanned(
          marketB,
          createReplayResearchOutputJson({
            marketTicker: marketB,
            steps: [
              { yesBidCents: 40, yesAskCents: 60, spotPrice: 100 },
              { yesBidCents: 50, yesAskCents: 70, spotPrice: 110 },
            ],
          }),
        ),
        createScanned(
          MARKET_A,
          createReplayResearchOutputJson({
            steps: [
              { yesBidCents: 40, yesAskCents: 60, spotPrice: 100 },
              { yesBidCents: 50, yesAskCents: 70, spotPrice: 110 },
            ],
          }),
        ),
      ],
    });

    expect(analysis.markets.map((market) => market.marketTicker)).toEqual([
      MARKET_A,
      marketB,
    ]);
    expect(analysis.aggregateLagMetrics.map((metric) => metric.lag)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);

    const first = serializeLeadLagAnalysis(analysis);
    const second = serializeLeadLagAnalysis(analysis);
    expect(first).toBe(second);
  });

  it("handles an empty dataset with zeroed lag metrics", () => {
    const analysis = buildLeadLagAnalysis({
      inputRoot: INPUT_ROOT,
      outputPath: OUTPUT_PATH,
      generatedAt: GENERATED_AT,
      scanned: [],
    });

    expect(analysis.sampleCounts.marketCount).toBe(0);
    expect(analysis.aggregateLagMetrics).toHaveLength(11);
    expect(analysis.aggregateLagMetrics.every((metric) => metric.observationCount === 0)).toBe(
      true,
    );
    expect(analysis.warnings[0]?.code).toBe("empty-dataset");
  });

  it("skips markets with no usable candles while continuing analysis", () => {
    const analysis = buildLeadLagAnalysis({
      inputRoot: INPUT_ROOT,
      outputPath: OUTPUT_PATH,
      generatedAt: GENERATED_AT,
      scanned: [
        createScanned(
          MARKET_A,
          createReplayResearchOutputJson({
            steps: [{ yesBidCents: 40, yesAskCents: 60, spotPrice: 100, omitBtc: true }],
          }),
        ),
        createScanned(
          `${SERIES_TICKER}-MARKET-B`,
          createReplayResearchOutputJson({
            marketTicker: `${SERIES_TICKER}-MARKET-B`,
            steps: [
              { yesBidCents: 40, yesAskCents: 60, spotPrice: 100 },
              { yesBidCents: 50, yesAskCents: 70, spotPrice: 110 },
            ],
          }),
        ),
      ],
    });

    expect(analysis.sampleCounts.marketCount).toBe(1);
    expect(analysis.sampleCounts.skippedMarkets).toBe(1);
    expect(analysis.warnings.some((warning) => warning.code === "missing-candles")).toBe(
      true,
    );
  });
});
