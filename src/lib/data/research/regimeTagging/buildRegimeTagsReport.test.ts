import { describe, expect, it } from "vitest";

import {
  buildRegimeTagsReport,
  classifyMarketState,
  classifyTrendRegime,
  classifyVolatilityRegime,
  computeRegimeMarketEntry,
  extractRegimeStepsFromResearchOutput,
  serializeRegimeTagsReport,
  VOLATILITY_REGIME_THRESHOLDS,
} from "./index";

const GENERATED_AT = "2026-06-27T22:00:00.000Z";
const INPUT_ROOT = "data/research-results";
const OUTPUT_PATH = "data/research-results/regime-tags.json";
const STRATEGY_ID = "noop";
const SERIES_TICKER = "KXBTC15M";
const MARKET_A = `${SERIES_TICKER}-MARKET-A`;

function createReplayResearchOutputJson(options: {
  marketTicker?: string;
  steps: Array<{
    yesBidCents: number;
    yesAskCents: number;
    noBidCents?: number;
    noAskCents?: number;
    spotPrice: number;
    timeRemainingMs?: number;
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
        noBidCents: step.noBidCents ?? 100 - step.yesAskCents,
        noAskCents: step.noAskCents ?? 100 - step.yesBidCents,
      },
      market: {
        timeRemainingMs: step.timeRemainingMs ?? (900_000 - stepIndex * 60_000),
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

function createUptrendSteps(count: number, startPrice = 100) {
  return Array.from({ length: count }, (_, index) => ({
    yesBidCents: 45 + index,
    yesAskCents: 55 + index,
    spotPrice: startPrice + index * 5,
    timeRemainingMs: 900_000 - index * 60_000,
  }));
}

describe("classifyVolatilityRegime", () => {
  it("classifies annualized volatility thresholds correctly", () => {
    expect(
      classifyVolatilityRegime({
        realizedVolatilityAnnualized: VOLATILITY_REGIME_THRESHOLDS.lowMaxExclusive - 0.01,
        rangePercent: null,
      }),
    ).toBe("low");
    expect(
      classifyVolatilityRegime({
        realizedVolatilityAnnualized: 0.45,
        rangePercent: null,
      }),
    ).toBe("medium");
    expect(
      classifyVolatilityRegime({
        realizedVolatilityAnnualized: 0.7,
        rangePercent: null,
      }),
    ).toBe("high");
  });

  it("falls back to range percent when annualized volatility is unavailable", () => {
    expect(
      classifyVolatilityRegime({
        realizedVolatilityAnnualized: null,
        rangePercent: 0.2,
      }),
    ).toBe("low");
    expect(
      classifyVolatilityRegime({
        realizedVolatilityAnnualized: null,
        rangePercent: 3,
      }),
    ).toBe("high");
  });
});

describe("classifyTrendRegime", () => {
  it("maps trend strength score to uptrend, downtrend, and sideways", () => {
    expect(classifyTrendRegime(0.2)).toBe("uptrend");
    expect(classifyTrendRegime(-0.2)).toBe("downtrend");
    expect(classifyTrendRegime(0)).toBe("sideways");
  });
});

describe("classifyMarketState", () => {
  it("detects reversal when half-market returns flip sign", () => {
    const tag = classifyMarketState({
      metrics: {
        realizedVolatilityAnnualized: 0.2,
        trendStrengthScore: 0,
        trendSlopePerBar: 0,
        btcReturnPercent: 0,
        rangePercent: 1,
        timeRemainingProfile: null,
        averageSpreadPercent: 2,
        averageImpliedProbability: 0.5,
        stepCount: 6,
      },
      volatilityTag: "low",
      trendTag: "sideways",
      btcReturnFirstHalfPercent: 1,
      btcReturnSecondHalfPercent: -1,
    });

    expect(tag).toBe("reversal");
  });
});

describe("computeRegimeMarketEntry", () => {
  it("assigns synthetic uptrend and trending tags for rising BTC steps", () => {
    const extracted = extractRegimeStepsFromResearchOutput(
      createReplayResearchOutputJson({
        steps: createUptrendSteps(12, 100),
      }),
      `${INPUT_ROOT}/research-output.json`,
    );

    const entry = computeRegimeMarketEntry({
      strategyId: extracted.strategyId,
      seriesTicker: extracted.seriesTicker,
      marketTicker: extracted.marketTicker,
      outputPath: `${INPUT_ROOT}/research-output.json`,
      steps: extracted.steps,
    });

    expect(entry.tags.trend).toBe("uptrend");
    expect(entry.metrics.btcReturnPercent).toBeGreaterThan(0);
    expect(entry.metrics.averageImpliedProbability).not.toBeNull();
    expect(entry.joinKey).toBe(`${STRATEGY_ID}/${SERIES_TICKER}/${MARKET_A}`);
  });
});

describe("buildRegimeTagsReport", () => {
  it("returns deterministic ordering for markets", () => {
    const marketB = `${SERIES_TICKER}-MARKET-B`;
    const report = buildRegimeTagsReport({
      inputRoot: INPUT_ROOT,
      outputPath: OUTPUT_PATH,
      generatedAt: GENERATED_AT,
      scanned: [
        createScanned(
          marketB,
          createReplayResearchOutputJson({
            marketTicker: marketB,
            steps: createUptrendSteps(8),
          }),
        ),
        createScanned(
          MARKET_A,
          createReplayResearchOutputJson({
            steps: createUptrendSteps(8),
          }),
        ),
      ],
    });

    expect(report.markets.map((market) => market.marketTicker)).toEqual([
      MARKET_A,
      marketB,
    ]);

    const first = serializeRegimeTagsReport(report);
    const second = serializeRegimeTagsReport(report);
    expect(first).toBe(second);
  });

  it("handles an empty dataset", () => {
    const report = buildRegimeTagsReport({
      inputRoot: INPUT_ROOT,
      outputPath: OUTPUT_PATH,
      generatedAt: GENERATED_AT,
      scanned: [],
    });

    expect(report.sampleCounts.marketCount).toBe(0);
    expect(report.markets).toEqual([]);
    expect(report.warnings[0]?.code).toBe("empty-dataset");
    expect(report.summaryCounts.volatility.low).toBe(0);
  });

  it("includes summary counts for classified markets", () => {
    const report = buildRegimeTagsReport({
      inputRoot: INPUT_ROOT,
      outputPath: OUTPUT_PATH,
      generatedAt: GENERATED_AT,
      scanned: [
        createScanned(
          MARKET_A,
          createReplayResearchOutputJson({
            steps: createUptrendSteps(12),
          }),
        ),
      ],
    });

    expect(report.sampleCounts.marketCount).toBe(1);
    expect(report.summaryCounts.trend.uptrend).toBe(1);
    expect(report.markets[0]?.metrics.stepCount).toBe(12);
  });
});

describe("serializeRegimeTagsReport", () => {
  it("produces stable JSON output", () => {
    const report = buildRegimeTagsReport({
      inputRoot: INPUT_ROOT,
      outputPath: OUTPUT_PATH,
      generatedAt: GENERATED_AT,
      scanned: [
        createScanned(
          MARKET_A,
          createReplayResearchOutputJson({
            steps: createUptrendSteps(6),
          }),
        ),
      ],
    });

    const serialized = serializeRegimeTagsReport(report);
    const parsed = JSON.parse(serialized);

    expect(parsed.generatedAt).toBe(GENERATED_AT);
    expect(parsed.markets[0].joinKey).toContain(MARKET_A);
    expect(parsed.markets[0].metrics).toBeDefined();
    expect(parsed.markets[0].tags).toBeDefined();
  });
});
