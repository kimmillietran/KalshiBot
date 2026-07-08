import { describe, expect, it } from "vitest";

import { buildMispricingAtlas } from "@/lib/data/research/mispricingAtlas/buildMispricingAtlas";
import { extractMispricingObservationsFromResearchOutput } from "@/lib/data/research/mispricingAtlas/parseMispricingObservations";

import {
  createCostAwareAtlasAccumulatorState,
  finalizeCostAwareBucketEntries,
  ingestCostAwareMarketExtraction,
} from "./costAwareAtlasAccumulator";
import { createCostAwareAtlasConfig } from "./costAwareAtlasConfig";
import { buildCostAwareAtlasReport } from "./buildCostAwareAtlasReport";
import { extractCostAwareObservationsFromResearchOutput } from "./parseCostAwareObservations";

const FIXTURE_RESEARCH_OUTPUT = JSON.stringify({
  metadata: { strategyId: "fade-calibration" },
  dataset: {
    snapshots: [
      {
        ticker: "KXBTC-TEST",
        marketWindow: {
          ticker: "KXBTC-TEST",
          seriesTicker: "KXBTC",
          strikePriceUsd: 100_000,
          closeTime: "2026-01-02T00:00:00.000Z",
        },
        btcBars: [
          {
            openUsd: 99_500,
            highUsd: 100_100,
            lowUsd: 99_400,
            closeUsd: 99_900,
            closeTime: "2026-01-01T23:45:00.000Z",
          },
        ],
        kalshiCandles: [
          {
            yesBidCents: 58,
            yesAskCents: 62,
            closeTime: "2026-01-01T23:45:00.000Z",
          },
          {
            yesBidCents: 52,
            yesAskCents: 56,
            closeTime: "2026-01-01T23:50:00.000Z",
          },
        ],
        settlement: {
          result: "no",
          qualityFlags: ["derived-expiration-value"],
        },
      },
    ],
  },
  researchRun: {
    config: { strategyId: "fade-calibration" },
    backtestResult: JSON.stringify({ replayResult: { results: [] } }),
  },
});

describe("cost-aware atlas integration", () => {
  it("preserves atlas calibration metrics for valid-quote observations", () => {
    const mispricing = extractMispricingObservationsFromResearchOutput(
      FIXTURE_RESEARCH_OUTPUT,
      "fixture/research-output.json",
    );
    const costAware = extractCostAwareObservationsFromResearchOutput(
      FIXTURE_RESEARCH_OUTPUT,
      "fixture/research-output.json",
    );

    expect(mispricing.observations).toHaveLength(2);
    expect(costAware.observations).toHaveLength(2);
    expect(costAware.observations.every((observation) => observation.quoteStatus === "valid")).toBe(
      true,
    );

    const config = createCostAwareAtlasConfig({ minSampleThreshold: 1 });
    const state = createCostAwareAtlasAccumulatorState();
    ingestCostAwareMarketExtraction(state, costAware.observations, config);

    const buckets = finalizeCostAwareBucketEntries({
      config,
      atlasBucketReferences: [],
      state,
    });
    const probabilityBucket = buckets.find(
      (bucket) =>
        bucket.dimension === "probability"
        && bucket.primaryCohort.observations > 0,
    );

    expect(probabilityBucket?.primaryCohort.rawCalibrationGap).not.toBeNull();
    expect(probabilityBucket?.primaryCohort.grossExpectedValueCents).not.toBeNull();
  });

  it("builds deterministic report rankings and warnings", () => {
    const config = createCostAwareAtlasConfig({ minSampleThreshold: 1 });
    const state = createCostAwareAtlasAccumulatorState();
    const extracted = extractCostAwareObservationsFromResearchOutput(
      FIXTURE_RESEARCH_OUTPUT,
      "fixture/research-output.json",
    );
    ingestCostAwareMarketExtraction(state, extracted.observations, config);

    const buckets = finalizeCostAwareBucketEntries({
      config,
      atlasBucketReferences: [],
      state,
    });
    const report = buildCostAwareAtlasReport({
      generatedAt: "2026-01-01T00:00:00.000Z",
      inputRoot: "fixture",
      outputPath: "out.json",
      htmlOutputPath: "out.html",
      mispricingAtlasPath: null,
      config,
      buckets,
      totalObservations: state.totalObservations,
      derivedObservations: state.derivedObservations,
      officialObservations: state.officialObservations,
    });

    expect(report.summary.totalBuckets).toBeGreaterThan(0);
    expect(report.rankings.topGrossEdges.length).toBeGreaterThan(0);
    expect(report.buckets.map((bucket) => `${bucket.dimension}:${bucket.bucketId}`)).toEqual(
      [...report.buckets]
        .sort((left, right) => {
          const dimensionCompare = left.dimension.localeCompare(right.dimension);
          return dimensionCompare !== 0
            ? dimensionCompare
            : left.bucketId.localeCompare(right.bucketId);
        })
        .map((bucket) => `${bucket.dimension}:${bucket.bucketId}`),
    );
  });
});

describe("mispricing atlas regression guard", () => {
  it("does not change existing atlas build output when cost-aware parser is added", () => {
    const scanned = [
      {
        strategyId: "fade-calibration",
        seriesTicker: "KXBTC",
        marketTicker: "KXBTC-TEST",
        outputPath: "fixture/research-output.json",
        outputJson: FIXTURE_RESEARCH_OUTPUT,
      },
    ];

    const atlas = buildMispricingAtlas({
      inputRoot: "fixture",
      outputPath: "data/research-results/mispricing-atlas.json",
      generatedAt: "2026-01-01T00:00:00.000Z",
      scanned,
    });

    expect(atlas.sampleCounts.totalObservations).toBe(2);
    expect(atlas.probabilityBuckets.some((bucket) => bucket.observations > 0)).toBe(true);
    expect(atlas.warnings).toEqual([]);
  });
});
