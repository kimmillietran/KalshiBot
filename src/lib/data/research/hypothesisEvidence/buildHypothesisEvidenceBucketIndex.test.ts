import { describe, expect, it } from "vitest";

import type { HypothesisCandidate } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";

import {
  buildHypothesisEvidenceBucketIndex,
  collectAtlasBucketReferences,
} from "./buildHypothesisEvidenceBucketIndex";
import {
  collectHypothesisExampleMarkets,
  countUniqueTradingDaysForCandidate,
} from "./collectHypothesisExampleMarkets";

const INPUT_ROOT = "data/research-results";
const STRATEGY_ID = "noop";
const SERIES_TICKER = "KXBTC15M";
const MARKET_A = `${SERIES_TICKER}-MARKET-A`;
const MARKET_B = `${SERIES_TICKER}-MARKET-B`;

function createReplayResearchOutputJson(options: {
  marketTicker: string;
  closeTime: string;
  yesBidCents: number;
  yesAskCents: number;
  strikePrice: number;
  timeRemainingMs: number;
  btcPrice: number;
  settlement: "yes" | "no";
}): string {
  return JSON.stringify({
    dataset: JSON.stringify({
      snapshots: [
        {
          ticker: options.marketTicker,
          marketWindow: {
            ticker: options.marketTicker,
            seriesTicker: SERIES_TICKER,
            strikePriceUsd: options.strikePrice,
            closeTime: options.closeTime,
          },
          settlement: {
            result: options.settlement,
            ticker: options.marketTicker,
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
                pricing: {
                  yesBidCents: options.yesBidCents,
                  yesAskCents: options.yesAskCents,
                },
                market: {
                  strikePrice: options.strikePrice,
                  timeRemainingMs: options.timeRemainingMs,
                },
                btc: {
                  price: options.btcPrice,
                  candles: [
                    {
                      timestamp: 0,
                      open: options.btcPrice,
                      high: options.btcPrice,
                      low: options.btcPrice,
                      close: options.btcPrice,
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

function createAtlasCandidate(
  candidateId: string,
): HypothesisCandidate {
  return {
    candidateId,
    hypothesis: "Test hypothesis",
    rationale: "Test rationale",
    suggestedStrategyFamily: "calibration",
    marketCondition: "probability bucket",
    confidence: "low",
    warnings: [],
    sourceArtifact: "mispricing-atlas.json",
    bucketMetadata: {
      groupId: "probabilityOnly",
      bucketId: "coarse-prob-3",
      direction: "over",
    },
  };
}

describe("buildHypothesisEvidenceBucketIndex", () => {
  it("matches legacy example markets and unique trading day counts", () => {
    const outputPathA = `${INPUT_ROOT}/${STRATEGY_ID}/${SERIES_TICKER}/${MARKET_A}/research-output.json`;
    const outputPathB = `${INPUT_ROOT}/${STRATEGY_ID}/${SERIES_TICKER}/${MARKET_B}/research-output.json`;
    const files = new Map<string, string>([
      [
        outputPathA,
        createReplayResearchOutputJson({
          marketTicker: MARKET_A,
          closeTime: "2026-06-02T12:00:00.000Z",
          yesBidCents: 65,
          yesAskCents: 75,
          strikePrice: 60_000,
          timeRemainingMs: 12 * 60_000,
          btcPrice: 59_500,
          settlement: "yes",
        }),
      ],
      [
        outputPathB,
        createReplayResearchOutputJson({
          marketTicker: MARKET_B,
          closeTime: "2026-06-03T12:00:00.000Z",
          yesBidCents: 65,
          yesAskCents: 75,
          strikePrice: 60_000,
          timeRemainingMs: 12 * 60_000,
          btcPrice: 59_500,
          settlement: "no",
        }),
      ],
    ]);
    const researchOutputPaths = [outputPathA, outputPathB];
    const readFile = (path: string) => files.get(path) ?? "";

    const candidates = [
      createAtlasCandidate("atlas-probabilityOnly-coarse-prob-3-over"),
      createAtlasCandidate("atlas-probabilityOnly-coarse-prob-3-under"),
    ];
    const references = collectAtlasBucketReferences(candidates);
    const bucketIndex = buildHypothesisEvidenceBucketIndex({
      references,
      researchOutputPaths,
      readFile,
    });

    for (const candidate of candidates) {
      const legacyExamples = collectHypothesisExampleMarkets({
        candidate,
        mispricingAtlas: {} as never,
        leadLagAnalysis: null,
        researchOutputPaths,
        readFile,
      });
      const indexedExamples = collectHypothesisExampleMarkets({
        candidate,
        mispricingAtlas: {} as never,
        leadLagAnalysis: null,
        researchOutputPaths,
        readFile,
        bucketIndex,
      });
      const legacyDays = countUniqueTradingDaysForCandidate({
        candidate,
        mispricingAtlas: {} as never,
        leadLagAnalysis: null,
        researchOutputPaths,
        readFile,
      });
      const indexedDays = countUniqueTradingDaysForCandidate({
        candidate,
        mispricingAtlas: {} as never,
        leadLagAnalysis: null,
        researchOutputPaths,
        readFile,
        bucketIndex,
      });

      expect(indexedExamples).toEqual(legacyExamples);
      expect(indexedDays).toBe(legacyDays);
    }

    expect(references).toHaveLength(1);
    expect(bucketIndex.getExampleMarkets(references[0]!)).toHaveLength(2);
    expect(bucketIndex.getUniqueTradingDays(references[0]!)).toBe(2);
  });

  it("records memory diagnostics when memoryReport is enabled", () => {
    const outputPath = `${INPUT_ROOT}/${STRATEGY_ID}/${SERIES_TICKER}/${MARKET_A}/research-output.json`;
    const json = createReplayResearchOutputJson({
      marketTicker: MARKET_A,
      closeTime: "2026-06-02T12:00:00.000Z",
      yesBidCents: 65,
      yesAskCents: 75,
      strikePrice: 60_000,
      timeRemainingMs: 12 * 60_000,
      btcPrice: 59_500,
      settlement: "yes",
    });
    const references = collectAtlasBucketReferences([
      createAtlasCandidate("atlas-probabilityOnly-coarse-prob-3-over"),
    ]);

    const bucketIndex = buildHypothesisEvidenceBucketIndex({
      references,
      researchOutputPaths: [outputPath],
      readFile: () => json,
      memoryReport: true,
    });

    expect(bucketIndex.memoryDiagnostics.researchOutputFilesScanned).toBe(1);
    expect(bucketIndex.memoryDiagnostics.atlasBucketReferenceCount).toBe(1);
    expect(bucketIndex.memoryDiagnostics.observationsProcessed).toBeGreaterThan(0);
    expect(bucketIndex.memoryDiagnostics.largestFileBytes).toBe(json.length);
    expect(bucketIndex.memoryDiagnostics.largestIntermediateCollection).toBe(
      "hypothesis-evidence-bucket-index",
    );
  });

  it("scans each research output file once regardless of candidate count", () => {
    const outputPathA = `${INPUT_ROOT}/${STRATEGY_ID}/${SERIES_TICKER}/${MARKET_A}/research-output.json`;
    const outputPathB = `${INPUT_ROOT}/${STRATEGY_ID}/${SERIES_TICKER}/${MARKET_B}/research-output.json`;
    const files = new Map<string, string>([
      [
        outputPathA,
        createReplayResearchOutputJson({
          marketTicker: MARKET_A,
          closeTime: "2026-06-02T12:00:00.000Z",
          yesBidCents: 65,
          yesAskCents: 75,
          strikePrice: 60_000,
          timeRemainingMs: 12 * 60_000,
          btcPrice: 59_500,
          settlement: "yes",
        }),
      ],
      [
        outputPathB,
        createReplayResearchOutputJson({
          marketTicker: MARKET_B,
          closeTime: "2026-06-03T12:00:00.000Z",
          yesBidCents: 65,
          yesAskCents: 75,
          strikePrice: 60_000,
          timeRemainingMs: 12 * 60_000,
          btcPrice: 59_500,
          settlement: "no",
        }),
      ],
    ]);
    const readCounts = new Map<string, number>();
    const readFile = (path: string) => {
      readCounts.set(path, (readCounts.get(path) ?? 0) + 1);
      return files.get(path) ?? "";
    };

    const candidates = [
      createAtlasCandidate("atlas-probabilityOnly-coarse-prob-3-over"),
      createAtlasCandidate("atlas-probabilityOnly-coarse-prob-3-under"),
      createAtlasCandidate("atlas-probabilityOnly-coarse-prob-2-over"),
    ];
    const references = collectAtlasBucketReferences(candidates);
    const bucketIndex = buildHypothesisEvidenceBucketIndex({
      references,
      researchOutputPaths: [outputPathA, outputPathB],
      readFile,
    });

    for (const candidate of candidates) {
      collectHypothesisExampleMarkets({
        candidate,
        mispricingAtlas: {} as never,
        leadLagAnalysis: null,
        researchOutputPaths: [outputPathA, outputPathB],
        readFile,
        bucketIndex,
      });
      countUniqueTradingDaysForCandidate({
        candidate,
        mispricingAtlas: {} as never,
        leadLagAnalysis: null,
        researchOutputPaths: [outputPathA, outputPathB],
        readFile,
        bucketIndex,
      });
    }

    expect(readCounts.get(outputPathA)).toBe(1);
    expect(readCounts.get(outputPathB)).toBe(1);
  });
});
