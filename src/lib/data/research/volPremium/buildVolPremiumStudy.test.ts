import { describe, expect, it } from "vitest";

import {
  buildVolPremiumStudy,
  computeMoneynessVolPremiumBuckets,
  computeVolPremiumAxisBuckets,
  computeVolPremiumBucketSummary,
  extractVolPremiumObservationsFromResearchOutput,
  serializeVolPremiumStudy,
} from "./index";
import { ImpliedVolatilityInversionCode } from "./volPremiumTypes";

const GENERATED_AT = "2026-06-28T12:00:00.000Z";
const INPUT_ROOT = "data/research-results";
const OUTPUT_PATH = "data/research-results/vol-premium-study.json";
const STRATEGY_ID = "noop";
const SERIES_TICKER = "KXBTC15M";
const MARKET_A = `${SERIES_TICKER}-MARKET-A`;

function buildOscillatingCandles(
  startPrice: number,
  count: number,
  startTimestamp = 1_700_000_000_000,
  intervalMs = 60_000,
) {
  return Array.from({ length: count }, (_, index) => {
    const close = startPrice * (1 + 0.01 * Math.sin(index / 2));
    return {
      timestamp: startTimestamp + index * intervalMs,
      open: close,
      high: close * 1.001,
      low: close * 0.999,
      close,
    };
  });
}

function createReplayResearchOutputJson(options: {
  marketTicker?: string;
  steps: Array<{
    yesBidCents: number;
    yesAskCents: number;
    strikePrice: number;
    spotPrice: number;
    timeRemainingMs: number;
    evaluatedAt?: number;
    candles?: ReturnType<typeof buildOscillatingCandles>;
  }>;
  snapshotCandles?: ReturnType<typeof buildOscillatingCandles>;
  closeTimeMs?: number;
}): string {
  const marketTicker = options.marketTicker ?? MARKET_A;
  const closeTimeMs = options.closeTimeMs ?? 1_700_001_200_000;
  const snapshotCandles =
    options.snapshotCandles ?? buildOscillatingCandles(60_000, 30);

  const replayResults = options.steps.map((step, stepIndex) => ({
    stepIndex,
    engineInput: {
      evaluatedAt: step.evaluatedAt ?? step.candles?.at(-1)?.timestamp,
      pricing: {
        yesBidCents: step.yesBidCents,
        yesAskCents: step.yesAskCents,
      },
      market: {
        strikePrice: step.strikePrice,
        timeRemainingMs: step.timeRemainingMs,
      },
      btc: {
        price: step.spotPrice,
        candles:
          step.candles
          ?? buildOscillatingCandles(step.spotPrice, 12, 1_700_000_000_000 + stepIndex * 60_000),
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
            strikePriceUsd: options.steps[0]?.strikePrice ?? 60_000,
            closeTime: new Date(closeTimeMs).toISOString(),
          },
          btcBars: snapshotCandles.map((candle) => ({
            closeUsd: candle.close,
            openUsd: candle.open,
            highUsd: candle.high,
            lowUsd: candle.low,
            closeTime: new Date(candle.timestamp).toISOString(),
          })),
          settlement: {
            result: "yes",
            ticker: marketTicker,
          },
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

describe("extractVolPremiumObservationsFromResearchOutput", () => {
  it("extracts implied probability and vol metrics from replay steps", () => {
    const extracted = extractVolPremiumObservationsFromResearchOutput(
      createReplayResearchOutputJson({
        steps: [
          {
            yesBidCents: 58,
            yesAskCents: 62,
            strikePrice: 60_000,
            spotPrice: 61_000,
            timeRemainingMs: 12 * 60_000,
          },
        ],
      }),
      `${INPUT_ROOT}/${STRATEGY_ID}/${SERIES_TICKER}/${MARKET_A}/research-output.json`,
    );

    expect(extracted.observations).toHaveLength(1);
    expect(extracted.observations[0]?.impliedProbability).toBe(0.6);
    expect(extracted.observations[0]?.inversionCode).toBe(
      ImpliedVolatilityInversionCode.OK,
    );
    expect(extracted.observations[0]?.impliedVolatilityAnnualized).not.toBeNull();
  });
});

describe("computeVolPremiumAxisBuckets", () => {
  it("buckets observations by implied minus realized vol premium", () => {
    const buckets = computeVolPremiumAxisBuckets([
      {
        strategyId: STRATEGY_ID,
        seriesTicker: SERIES_TICKER,
        marketTicker: MARKET_A,
        outputPath: "path",
        stepIndex: 0,
        impliedProbability: 0.6,
        spotPrice: 61_000,
        strikePrice: 60_000,
        timeRemainingMs: 600_000,
        moneynessPercent: 1.6,
        impliedVolatilityAnnualized: 0.5,
        inversionCode: ImpliedVolatilityInversionCode.OK,
        realizedVolatilityBackwardAnnualized: 0.35,
        realizedVolatilityForwardAnnualized: 0.4,
        volPremium: 0.25,
        regimeTags: null,
      },
      {
        strategyId: STRATEGY_ID,
        seriesTicker: SERIES_TICKER,
        marketTicker: MARKET_A,
        outputPath: "path",
        stepIndex: 1,
        impliedProbability: 0.4,
        spotPrice: 59_000,
        strikePrice: 60_000,
        timeRemainingMs: 300_000,
        moneynessPercent: -1.6,
        impliedVolatilityAnnualized: 0.3,
        inversionCode: ImpliedVolatilityInversionCode.OK,
        realizedVolatilityBackwardAnnualized: 0.25,
        realizedVolatilityForwardAnnualized: 0.35,
        volPremium: -0.05,
        regimeTags: null,
      },
    ]);

    expect(
      buckets.find((bucket) => bucket.bucketId === "premium-over-20pct")?.observations,
    ).toBe(1);
    expect(
      buckets.find((bucket) => bucket.bucketId === "premium-mild-under")?.observations,
    ).toBe(1);
  });
});

describe("computeVolPremiumBucketSummary", () => {
  it("aggregates average implied, realized, and premium per bucket", () => {
    const summary = computeVolPremiumBucketSummary("test", "Test bucket", [
      {
        strategyId: STRATEGY_ID,
        seriesTicker: SERIES_TICKER,
        marketTicker: MARKET_A,
        outputPath: "path",
        stepIndex: 0,
        impliedProbability: 0.6,
        spotPrice: 61_000,
        strikePrice: 60_000,
        timeRemainingMs: 600_000,
        moneynessPercent: 1.6,
        impliedVolatilityAnnualized: 0.5,
        inversionCode: ImpliedVolatilityInversionCode.OK,
        realizedVolatilityBackwardAnnualized: 0.35,
        realizedVolatilityForwardAnnualized: 0.4,
        volPremium: 0.1,
        regimeTags: null,
      },
      {
        strategyId: STRATEGY_ID,
        seriesTicker: SERIES_TICKER,
        marketTicker: MARKET_A,
        outputPath: "path",
        stepIndex: 1,
        impliedProbability: 0.4,
        spotPrice: 59_000,
        strikePrice: 60_000,
        timeRemainingMs: 300_000,
        moneynessPercent: -1.6,
        impliedVolatilityAnnualized: 0.3,
        inversionCode: ImpliedVolatilityInversionCode.OK,
        realizedVolatilityBackwardAnnualized: 0.25,
        realizedVolatilityForwardAnnualized: 0.2,
        volPremium: 0.1,
        regimeTags: null,
      },
    ]);

    expect(summary.observations).toBe(2);
    expect(summary.averageImpliedVolatility).toBe(0.4);
    expect(summary.averageRealizedVolatilityForward).toBe(0.3);
    expect(summary.averageVolPremium).toBe(0.1);
  });
});

describe("buildVolPremiumStudy", () => {
  it("produces deterministic serialized output", () => {
    const scanned = [
      createScanned(
        MARKET_A,
        createReplayResearchOutputJson({
          steps: [
            {
              yesBidCents: 55,
              yesAskCents: 65,
              strikePrice: 60_000,
              spotPrice: 61_000,
              timeRemainingMs: 10 * 60_000,
              candles: buildOscillatingCandles(61_000, 12),
            },
          ],
          snapshotCandles: buildOscillatingCandles(61_000, 20, 1_700_000_000_000),
        }),
      ),
    ];

    const report = buildVolPremiumStudy({
      inputRoot: INPUT_ROOT,
      outputPath: OUTPUT_PATH,
      generatedAt: GENERATED_AT,
      scanned,
    });

    const first = serializeVolPremiumStudy(report);
    const second = serializeVolPremiumStudy(report);

    expect(first).toBe(second);
    expect(report.sampleCounts.totalObservations).toBe(1);
    expect(report.overallSummary.observations).toBe(1);
    expect(report.markets).toHaveLength(1);
    expect(report.markets[0]?.marketTicker).toBe(MARKET_A);
    expect(report.moneynessBuckets.length).toBeGreaterThan(0);
    expect(report.impliedVolatilityBuckets.length).toBeGreaterThan(0);
    expect(report.realizedVolatilityBuckets.length).toBeGreaterThan(0);
    expect(report.volPremiumBuckets.length).toBe(4);
  });

  it("returns an empty dataset report without throwing", () => {
    const report = buildVolPremiumStudy({
      inputRoot: INPUT_ROOT,
      outputPath: OUTPUT_PATH,
      generatedAt: GENERATED_AT,
      scanned: [],
    });

    expect(report.warnings.some((warning) => warning.code === "empty-dataset")).toBe(
      true,
    );
    expect(report.overallSummary.observations).toBe(0);
    expect(computeMoneynessVolPremiumBuckets([]).every((bucket) => bucket.observations === 0)).toBe(
      true,
    );
  });

  it("joins regime tags when provided", () => {
    const scanned = [
      createScanned(
        MARKET_A,
        createReplayResearchOutputJson({
          steps: [
            {
              yesBidCents: 55,
              yesAskCents: 65,
              strikePrice: 60_000,
              spotPrice: 61_000,
              timeRemainingMs: 10 * 60_000,
            },
          ],
        }),
      ),
    ];

    const regimeTagsByJoinKey = new Map([
      [
        `${STRATEGY_ID}/${MARKET_A}`,
        {
          volatility: "medium" as const,
          trend: "uptrend" as const,
          marketState: "trending" as const,
        },
      ],
    ]);

    const report = buildVolPremiumStudy({
      inputRoot: INPUT_ROOT,
      outputPath: OUTPUT_PATH,
      generatedAt: GENERATED_AT,
      scanned,
      regimeTagsByJoinKey,
    });

    expect(report.sampleCounts.regimeTaggedObservations).toBe(1);
    expect(
      report.regimeVolatilityBuckets.find((bucket) => bucket.bucketId === "regime-vol-medium")
        ?.observations,
    ).toBe(1);
  });
});
