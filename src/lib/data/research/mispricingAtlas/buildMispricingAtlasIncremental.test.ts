import { describe, expect, it } from "vitest";

import { buildMispricingAtlas, buildMispricingAtlasFromDirectories, serializeMispricingAtlas } from "./buildMispricingAtlas";
import { buildMispricingAtlasFromScannedLegacy } from "./buildMispricingAtlasLegacy";
import {
  addObservationToMispricingBucket,
  createMispricingBucketAccumulator,
  finalizeMispricingBucketAccumulator,
} from "./mispricingAtlasIncrementalAccumulator";
import { computeMispricingBucketSummary } from "./computeMispricingBucketMetrics";

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

function stripMemoryDiagnostics(value: { memoryDiagnostics?: unknown }) {
  const rest = { ...value };
  delete rest.memoryDiagnostics;
  return rest;
}

function stripMomentumAtlasFields(atlas: ReturnType<typeof buildMispricingAtlas>) {
  const { momentumBuckets: _momentumBuckets, coarseBuckets, ...rest } = atlas;
  if (!coarseBuckets) {
    return rest;
  }

  const {
    probabilityMomentum: _probabilityMomentum,
    momentumTime: _momentumTime,
    momentumVolatility: _momentumVolatility,
    probabilityMomentumTime: _probabilityMomentumTime,
    ...legacyCoarseBuckets
  } = coarseBuckets;

  return {
    ...rest,
    coarseBuckets: legacyCoarseBuckets,
  };
}

function stripTemporalAtlasFields<T extends {
  hourUtcBuckets?: unknown;
  dayOfWeekUtcBuckets?: unknown;
  sessionBucketBuckets?: unknown;
  weekendFlagBuckets?: unknown;
  coarseBuckets?: Record<string, unknown>;
  coverageDiagnostics?: unknown;
}>(value: T) {
  const rest = stripMemoryDiagnostics(value) as T & {
    coarseBuckets?: Record<string, unknown>;
  };
  delete rest.hourUtcBuckets;
  delete rest.dayOfWeekUtcBuckets;
  delete rest.sessionBucketBuckets;
  delete rest.weekendFlagBuckets;
  delete rest.coverageDiagnostics;

  if (rest.coarseBuckets) {
    rest.coarseBuckets = {
      probabilityOnly: rest.coarseBuckets.probabilityOnly ?? [],
      probabilityTime: rest.coarseBuckets.probabilityTime ?? [],
      probabilityRegime: rest.coarseBuckets.probabilityRegime ?? [],
      probabilityMoneyness: rest.coarseBuckets.probabilityMoneyness ?? [],
      moneynessTime: rest.coarseBuckets.moneynessTime ?? [],
      volatilityMoneyness: rest.coarseBuckets.volatilityMoneyness ?? [],
      volatilityProbabilityTime: rest.coarseBuckets.volatilityProbabilityTime ?? [],
    };
  }

  return rest;
}

describe("mispricing atlas incremental accumulator", () => {
  it("matches legacy bucket summary metrics", () => {
    const observations = [
      {
        strategyId: STRATEGY_ID,
        seriesTicker: SERIES_TICKER,
        marketTicker: MARKET_A,
        outputPath: "path",
        stepIndex: 0,
        predictedProbability: 0.7,
        observedOutcome: 1 as const,
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
        observedOutcome: 0 as const,
        timeRemainingMs: 600_000,
        moneynessPercent: -1,
        annualizedVolatility: 0.4,
      },
    ];

    const legacy = computeMispricingBucketSummary("test", "Test bucket", observations);
    const accumulator = createMispricingBucketAccumulator("test", "Test bucket");
    for (const observation of observations) {
      addObservationToMispricingBucket(accumulator, observation);
    }

    expect(finalizeMispricingBucketAccumulator(accumulator)).toEqual(legacy);
  });
});

describe("buildMispricingAtlas incremental parity", () => {
  const scanned = [
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
  ];

  const baseInput = {
    inputRoot: INPUT_ROOT,
    outputPath: `${INPUT_ROOT}/mispricing-atlas.json`,
    generatedAt: GENERATED_AT,
    scanned,
  };

  it("matches legacy atlas output for the same scanned fixture dataset", () => {
    const incremental = buildMispricingAtlas(baseInput);
    const legacy = buildMispricingAtlasFromScannedLegacy(baseInput);

    const stripForLegacyParity = (
      atlas: ReturnType<typeof buildMispricingAtlas>,
    ) => stripMomentumAtlasFields(stripTemporalAtlasFields(atlas));

    expect(
      serializeMispricingAtlas(stripForLegacyParity(incremental)),
    ).toBe(serializeMispricingAtlas(stripForLegacyParity(legacy)));
  });

  it("records memory diagnostics when memoryReport is enabled", () => {
    const atlas = buildMispricingAtlas({
      ...baseInput,
      memoryReport: true,
    });

    expect(atlas.memoryDiagnostics?.filesProcessed).toBe(2);
    expect(atlas.memoryDiagnostics?.totalObservations).toBe(3);
    expect(atlas.memoryDiagnostics?.largestFileBytes).toBeGreaterThan(0);
  });
});

describe("buildMispricingAtlas incremental file processing", () => {
  it("reads one research output at a time from directories", () => {
    const marketTickers = Array.from({ length: 25 }, (_, index) => `MARKET-${index}`);
    let inFlightReads = 0;
    let maxInFlightReads = 0;

    const io = {
      readdir: (path: string) => {
        if (path === INPUT_ROOT) {
          return [STRATEGY_ID];
        }

        if (path === `${INPUT_ROOT}/${STRATEGY_ID}`) {
          return [SERIES_TICKER];
        }

        if (path === `${INPUT_ROOT}/${STRATEGY_ID}/${SERIES_TICKER}`) {
          return marketTickers;
        }

        return [];
      },
      readFile: (path: string) => {
        inFlightReads += 1;
        maxInFlightReads = Math.max(maxInFlightReads, inFlightReads);
        const ticker = path.split("/").at(-2) ?? MARKET_A;
        const json = createReplayResearchOutputJson({
          marketTicker: ticker,
          steps: [
            {
              yesBidCents: 40,
              yesAskCents: 60,
              strikePrice: 60_000,
              spotPrice: 59_500,
              timeRemainingMs: 12 * 60_000,
            },
          ],
        });
        inFlightReads -= 1;
        return json;
      },
      fileExists: (path: string) => path.endsWith("research-output.json"),
      isDirectory: (path: string) => !path.endsWith("research-output.json"),
    };

    const atlas = buildMispricingAtlasFromDirectories(
      INPUT_ROOT,
      `${INPUT_ROOT}/mispricing-atlas.json`,
      io,
      { generatedAt: GENERATED_AT, memoryReport: true },
    );

    expect(atlas.sampleCounts.marketCount).toBe(25);
    expect(atlas.sampleCounts.totalObservations).toBe(25);
    expect(maxInFlightReads).toBe(1);
    expect(atlas.memoryDiagnostics?.filesProcessed).toBe(25);
  });
});
