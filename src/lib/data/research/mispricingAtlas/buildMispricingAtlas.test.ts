import { describe, expect, it } from "vitest";

import {
  buildMispricingAtlas,
  computeMispricingBucketSummary,
  extractMispricingObservationsFromResearchOutput,
  serializeMispricingAtlas,
} from "./index";

const GENERATED_AT = "2026-06-27T18:00:00.000Z";
const INPUT_ROOT = "data/research-results";
const STRATEGY_ID = "noop";
const SERIES_TICKER = "KXBTC15M";
const MARKET_A = `${SERIES_TICKER}-MARKET-A`;
const MARKET_B = `${SERIES_TICKER}-MARKET-B`;

function createReplayResearchOutputJson(options: {
  marketTicker?: string;
  settlementResult?: "yes" | "no";
  steps: Array<{
    yesBidCents: number;
    yesAskCents: number;
    strikePrice: number;
    spotPrice: number;
    timeRemainingMs: number;
    candles?: Array<{ timestamp: number; close: number }>;
  }>;
}): string {
  const marketTicker = options.marketTicker ?? MARKET_A;
  const replayResults = options.steps.map((step, stepIndex) => ({
    stepIndex,
    engineInput: {
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
        candles: (step.candles ?? [{ timestamp: stepIndex * 60_000, close: step.spotPrice }]).map(
          (candle) => ({
            timestamp: candle.timestamp,
            open: candle.close,
            high: candle.close,
            low: candle.close,
            close: candle.close,
          }),
        ),
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
          },
          settlement: {
            result: options.settlementResult ?? "yes",
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

describe("extractMispricingObservationsFromResearchOutput", () => {
  it("extracts replay-step observations with context fields", () => {
    const extracted = extractMispricingObservationsFromResearchOutput(
      createReplayResearchOutputJson({
        steps: [
          {
            yesBidCents: 40,
            yesAskCents: 60,
            strikePrice: 60_000,
            spotPrice: 59_500,
            timeRemainingMs: 12 * 60_000,
          },
        ],
      }),
      `${INPUT_ROOT}/${STRATEGY_ID}/${SERIES_TICKER}/${MARKET_A}/research-output.json`,
    );

    expect(extracted.observations).toHaveLength(1);
    expect(extracted.observations[0]?.predictedProbability).toBe(0.5);
    expect(extracted.observations[0]?.timeRemainingMs).toBe(12 * 60_000);
    expect(extracted.observations[0]?.moneynessPercent).toBeCloseTo(-0.8333, 3);
  });
});

describe("computeMispricingBucketSummary", () => {
  it("computes calibration metrics for a bucket", () => {
    const summary = computeMispricingBucketSummary("test", "Test bucket", [
      {
        strategyId: STRATEGY_ID,
        seriesTicker: SERIES_TICKER,
        marketTicker: MARKET_A,
        outputPath: "path",
        stepIndex: 0,
        predictedProbability: 0.7,
        observedOutcome: 1,
        timeRemainingMs: 600_000,
        moneynessPercent: 1,
        annualizedVolatility: 0.4,
      },
      {
        strategyId: STRATEGY_ID,
        seriesTicker: SERIES_TICKER,
        marketTicker: MARKET_B,
        outputPath: "path",
        stepIndex: 0,
        predictedProbability: 0.3,
        observedOutcome: 0,
        timeRemainingMs: 600_000,
        moneynessPercent: -1,
        annualizedVolatility: 0.4,
      },
    ]);

    expect(summary.observations).toBe(2);
    expect(summary.averageImpliedProbability).toBe(0.5);
    expect(summary.realizedFrequency).toBe(0.5);
    expect(summary.calibrationError).toBe(0);
    expect(summary.brierScore).toBe(0.09);
    expect(summary.averageAbsoluteError).toBe(0.3);
  });

  it("handles sparse buckets with null metrics", () => {
    const summary = computeMispricingBucketSummary("empty", "Empty bucket", []);

    expect(summary.observations).toBe(0);
    expect(summary.averageImpliedProbability).toBeNull();
    expect(summary.realizedFrequency).toBeNull();
    expect(summary.calibrationError).toBeNull();
    expect(summary.brierScore).toBeNull();
    expect(summary.averageAbsoluteError).toBeNull();
  });
});

describe("buildMispricingAtlas", () => {
  it("builds deterministic bucket ordering and overall calibration", () => {
    const atlas = buildMispricingAtlas({
      inputRoot: INPUT_ROOT,
      outputPath: `${INPUT_ROOT}/mispricing-atlas.json`,
      generatedAt: GENERATED_AT,
      scanned: [
        createScanned(
          MARKET_A,
          createReplayResearchOutputJson({
            settlementResult: "yes",
            steps: [
              {
                yesBidCents: 70,
                yesAskCents: 80,
                strikePrice: 60_000,
                spotPrice: 60_500,
                timeRemainingMs: 4 * 60_000,
              },
              {
                yesBidCents: 20,
                yesAskCents: 30,
                strikePrice: 60_000,
                spotPrice: 59_000,
                timeRemainingMs: 20 * 60_000,
              },
            ],
          }),
        ),
        createScanned(
          MARKET_B,
          createReplayResearchOutputJson({
            marketTicker: MARKET_B,
            settlementResult: "no",
            steps: [
              {
                yesBidCents: 60,
                yesAskCents: 70,
                strikePrice: 60_000,
                spotPrice: 60_100,
                timeRemainingMs: 8 * 60_000,
              },
            ],
          }),
        ),
      ],
    });

    expect(atlas.sampleCounts.totalObservations).toBe(3);
    expect(atlas.sampleCounts.marketCount).toBe(2);
    expect(atlas.overallCalibration.observations).toBe(3);
    expect(atlas.probabilityBuckets).toHaveLength(10);
    expect(atlas.timeRemainingBuckets.map((bucket) => bucket.bucketId)).toEqual([
      "time-0-5m",
      "time-5-15m",
      "time-15-30m",
      "time-30m-plus",
    ]);
    expect(atlas.moneynessBuckets).toHaveLength(4);
    expect(atlas.volatilityBuckets).toHaveLength(3);
    expect(atlas.probabilityBuckets[0]?.bucketId).toBe("prob-0");
    expect(serializeMispricingAtlas(atlas)).toBe(serializeMispricingAtlas(atlas));
  });

  it("handles empty datasets with sparse bucket shells", () => {
    const atlas = buildMispricingAtlas({
      inputRoot: INPUT_ROOT,
      outputPath: `${INPUT_ROOT}/mispricing-atlas.json`,
      generatedAt: GENERATED_AT,
      scanned: [],
    });

    expect(atlas.sampleCounts.totalObservations).toBe(0);
    expect(atlas.overallCalibration.observations).toBe(0);
    expect(atlas.probabilityBuckets.every((bucket) => bucket.observations === 0)).toBe(
      true,
    );
    expect(atlas.timeRemainingBuckets.every((bucket) => bucket.brierScore === null)).toBe(
      true,
    );
  });

  it("records warnings for missing settlement", () => {
    const missingSettlementJson = JSON.stringify({
      dataset: JSON.stringify({
        snapshots: [
          {
            ticker: MARKET_A,
            marketWindow: { ticker: MARKET_A, seriesTicker: SERIES_TICKER },
          },
        ],
      }),
      researchRun: JSON.stringify({
        config: { strategyId: STRATEGY_ID },
        backtestResult: JSON.stringify({ replayResult: { results: [] } }),
      }),
      metadata: { strategyId: STRATEGY_ID },
    });

    const atlas = buildMispricingAtlas({
      inputRoot: INPUT_ROOT,
      outputPath: `${INPUT_ROOT}/mispricing-atlas.json`,
      generatedAt: GENERATED_AT,
      scanned: [createScanned(MARKET_A, missingSettlementJson)],
    });

    expect(atlas.sampleCounts.totalObservations).toBe(0);
    expect(atlas.warnings.some((warning) => warning.code === "missing-settlement")).toBe(
      true,
    );
  });
});
