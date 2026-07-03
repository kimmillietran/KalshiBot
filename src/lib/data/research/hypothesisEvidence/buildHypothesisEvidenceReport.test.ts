import { describe, expect, it } from "vitest";

import {
  buildHypothesisCandidates,
} from "@/lib/data/research/hypothesisCandidates";
import { createEmptyMispricingAtlasCoarseBuckets } from "@/lib/data/research/hypothesisCandidates/normalizeMispricingAtlas";

import { buildHypothesisEvidenceReport } from "./buildHypothesisEvidenceReport";

const GENERATED_AT = "2026-07-02T12:00:00.000Z";
const INPUT_ROOT = "data/research-results";
const STRATEGY_ID = "noop";
const SERIES_TICKER = "KXBTC15M";
const MARKET_A = `${SERIES_TICKER}-MARKET-A`;

function createReplayResearchOutputJson(): string {
  return JSON.stringify({
    dataset: JSON.stringify({
      snapshots: [
        {
          ticker: MARKET_A,
          marketWindow: {
            ticker: MARKET_A,
            seriesTicker: SERIES_TICKER,
            strikePriceUsd: 60_000,
            closeTime: "2026-06-02T12:00:00.000Z",
          },
          settlement: {
            result: "yes",
            ticker: MARKET_A,
          },
        },
      ],
    }),
    researchRun: JSON.stringify({
      config: { strategyId: STRATEGY_ID },
      backtestResult: JSON.stringify({
        replayResult: {
          results: [
            {
              stepIndex: 0,
              engineInput: {
                pricing: { yesBidCents: 65, yesAskCents: 75 },
                market: {
                  strikePrice: 60_000,
                  timeRemainingMs: 12 * 60_000,
                },
                btc: {
                  price: 59_500,
                  candles: [
                    {
                      timestamp: 0,
                      open: 59_500,
                      high: 59_500,
                      low: 59_500,
                      close: 59_500,
                    },
                  ],
                },
              },
            },
          ],
        },
      }),
    }),
    metadata: { strategyId: STRATEGY_ID },
  });
}

function createAtlasWithProbabilityBucket() {
  const bucket = {
    bucketId: "coarse-prob-3",
    bucketLabel: "[0.6, 0.8)",
    observations: 40,
    averageImpliedProbability: 0.7,
    realizedFrequency: 0.55,
    calibrationError: 0.15,
    brierScore: 0.2,
    averageAbsoluteError: 0.15,
  };

  return {
    generatedAt: GENERATED_AT,
    inputRoot: INPUT_ROOT,
    outputPath: "data/research-results/mispricing-atlas.json",
    sampleCounts: {
      totalObservations: 40,
      marketCount: 1,
      skippedMissingSettlement: 0,
      skippedMissingProbability: 0,
      skippedMissingContext: 0,
    },
    overallCalibration: { ...bucket, bucketId: "overall", bucketLabel: "Overall" },
    probabilityBuckets: [],
    timeRemainingBuckets: [],
    moneynessBuckets: [],
    volatilityBuckets: [],
    coarseBuckets: {
      ...createEmptyMispricingAtlasCoarseBuckets(),
      probabilityOnly: [bucket],
    },
    warnings: [],
  };
}

describe("buildHypothesisEvidenceReport", () => {
  it("builds evidence cards with example markets from research outputs", () => {
    const atlas = createAtlasWithProbabilityBucket();
    const candidatesReport = buildHypothesisCandidates({
      generatedAt: GENERATED_AT,
      outputPath: "data/research-results/hypothesis-candidates.json",
      inputs: {
        mispricingAtlas: atlas,
        leadLagAnalysis: null,
        statisticalSignificance: null,
        regimeTags: null,
        strategyLeaderboard: null,
      },
      inputStatus: {
        mispricingAtlasPath: atlas.outputPath,
        leadLagAnalysisPath: "data/research-results/lead-lag-analysis.json",
        statisticalSignificancePath: "data/research-results/statistical-significance.json",
        regimeTagsPath: "data/research-results/regime-tags.json",
        strategyLeaderboardPath: "data/leaderboards/strategy-leaderboard.json",
        mispricingAtlasPresent: true,
        leadLagAnalysisPresent: false,
        statisticalSignificancePresent: false,
        regimeTagsPresent: false,
        strategyLeaderboardPresent: false,
      },
      config: { minSampleSize: 30 },
    });

    const outputPath = `${INPUT_ROOT}/${STRATEGY_ID}/${SERIES_TICKER}/${MARKET_A}/research-output.json`;
    const files = new Map<string, string>([
      [outputPath, createReplayResearchOutputJson()],
    ]);

    const report = buildHypothesisEvidenceReport({
      generatedAt: GENERATED_AT,
      htmlOutputPath: "data/reports/research-hypotheses.html",
      candidatesReport,
      mispricingAtlas: atlas,
      leadLagAnalysis: null,
      statisticalSignificance: null,
      researchInputRoot: INPUT_ROOT,
      readFile: (path) => files.get(path) ?? "",
      listResearchOutputPaths: () => [outputPath],
    });

    expect(report.cards).toHaveLength(1);
    const card = report.cards[0]!;
    expect(card.sampleSize).toBe(40);
    expect(card.calibrationError).toBe(0.15);
    expect(card.exampleMarkets).toHaveLength(1);
    expect(card.exampleMarkets[0]?.ticker).toBe(MARKET_A);
    expect(card.exampleMarkets[0]?.settlement).toBe("yes");
    expect(card.confidenceSummary).toContain("40 historical observations");
  });
});
