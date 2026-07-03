import { describe, expect, it } from "vitest";

import { serializeHarnessResultsHtml } from "./serializeHarnessResultsHtml";
import type { HarnessResultsReport } from "./harnessResultsTypes";

const GENERATED_AT = "2026-07-03T15:00:00.000Z";

function createReport(): HarnessResultsReport {
  return {
    generatedAt: GENERATED_AT,
    outputPath: "data/research-results/harness-results.json",
    htmlOutputPath: "data/reports/research-harness-results.html",
    inputPaths: {
      synthesisPath: "data/research-results/strategy-synthesis-candidates.json",
      harnessSummaryPath: "data/research-results/harness/strategy-harness-summary.json",
      harnessOutputDir: "data/research-results/harness",
      hypothesisValidationPath: null,
      strategyLeaderboardPath: null,
    },
    config: {
      minCompletedMarketsForCandidate: 3,
      minWinRateForCandidate: 45,
      minRobustnessScoreForCandidate: 70,
    },
    summary: {
      totalStrategies: 1,
      evaluatedCount: 1,
      recommendationCounts: { reject: 0, needsMoreData: 0, candidate: 1 },
    },
    strategies: [
      {
        strategyId: "synth-atlas-volatility-vol-high-over",
        hypothesisId: "atlas-volatility-vol-high-over",
        strategyFamily: "calibration-no-fade",
        direction: "fade-yes",
        runStatus: "completed",
        tradeCount: 4,
        totalPnlCents: 500,
        averagePnlCents: 125,
        winRatePct: 55,
        maxDrawdownPct: 2.5,
        calibrationContext: {
          atlasGroupId: "volatility",
          bucketId: "vol-high",
          calibrationDirection: "over",
          marketCondition: "High volatility",
        },
        robustnessScore: 85,
        warnings: [],
        promotionRecommendation: "candidate",
        harnessRuns: { total: 3, successful: 3, failed: 0, skipped: 0 },
      },
    ],
  };
}

describe("serializeHarnessResultsHtml", () => {
  it("renders harness results table and cards", () => {
    const html = serializeHarnessResultsHtml(createReport());

    expect(html).toContain("Harness Results Report");
    expect(html).toContain("synth-atlas-volatility-vol-high-over");
    expect(html).toContain("Candidate");
    expect(html).toContain("Strategy metrics");
  });
});
