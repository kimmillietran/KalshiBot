import { describe, expect, it } from "vitest";

import type { StrategySynthesisCandidate } from "@/lib/data/research/strategySynthesis/strategySynthesisTypes";

import { buildHarnessResultsReport } from "./buildHarnessResultsReport";

const GENERATED_AT = "2026-07-03T15:00:00.000Z";

function createHarnessSummary(
  overrides: Partial<NonNullable<Parameters<typeof buildHarnessResultsReport>[0]["harnessSummary"]>> = {},
): NonNullable<Parameters<typeof buildHarnessResultsReport>[0]["harnessSummary"]> {
  return {
    synthesisPath: "data/research-results/strategy-synthesis-candidates.json",
    outputDir: "data/research-results/harness",
    summaryPath: "data/research-results/harness/strategy-harness-summary.json",
    evaluatedStrategies: 1,
    totalRuns: 1,
    successfulRuns: 1,
    failedRuns: 0,
    skippedRuns: 0,
    runMode: "production",
    researchOnlyBacktest: false,
    includedRejectedStrategies: false,
    promotionEligible: true,
    skippedRejectedStrategyCount: 0,
    strategySelection: [],
    results: [],
    ...overrides,
  };
}

function createResearchOutputJson(): string {
  return JSON.stringify({
    dataset: JSON.stringify({
      snapshots: [
        {
          ticker: "KXBTC15M-MARKET-A",
          settlement: { result: "yes", ticker: "KXBTC15M-MARKET-A" },
        },
      ],
    }),
    researchRun: JSON.stringify({
      config: { strategyId: "calibration-fade" },
      backtestResult: JSON.stringify({
        replayResult: {
          results: [
            {
              stepIndex: 0,
              engineInput: {
                pricing: { yesBidCents: 40, yesAskCents: 60 },
                market: { strikePrice: 60000, timeRemainingMs: 600000 },
                btc: {
                  price: 59500,
                  candles: [{ timestamp: 0, open: 59500, high: 59500, low: 59500, close: 59500 }],
                },
              },
            },
          ],
        },
        metrics: {
          totalPnlCents: 250,
          totalReturnPct: 2.5,
          maxDrawdownPct: 1.2,
          sharpeRatio: 0.8,
          winRatePct: 60,
          lossRatePct: 40,
          tradeCount: 2,
          winningTradeCount: 1,
          losingTradeCount: 1,
          fillCount: 2,
          contractsFilled: 2,
        },
      }),
    }),
    metadata: { strategyId: "calibration-fade" },
  });
}

function createStrategy(): StrategySynthesisCandidate {
  return {
    strategyId: "synth-atlas-volatility-vol-high-over",
    hypothesisId: "atlas-volatility-vol-high-over",
    strategyFamily: "calibration-no-fade",
    direction: "fade-yes",
    entryConditions: {
      summary: "Enter NO",
      marketCondition: "High volatility",
      atlasGroupId: "volatility",
      bucketId: "vol-high",
      calibrationDirection: "over",
      minCalibrationError: 0.05,
      leadLagCandles: null,
    },
    exitAssumption: "Hold through settlement",
    requiredData: ["Kalshi implied probability"],
    riskNotes: [],
    validationSummary: {
      robustnessScore: 85,
      passes: true,
      observationCount: 60,
      reasons: [],
      summary: "Passed",
    },
    promotionStatus: "candidate",
  };
}

describe("buildHarnessResultsReport", () => {
  it("aggregates harness research outputs into per-strategy metrics", () => {
    const outputPath = "data/research-results/harness/synth-atlas-volatility-vol-high-over/KXBTC15M/KXBTC15M-MARKET-A/research-output.json";
    const files = new Map<string, string>([[outputPath, createResearchOutputJson()]]);

    const report = buildHarnessResultsReport({
      generatedAt: GENERATED_AT,
      outputPath: "data/research-results/harness-results.json",
      htmlOutputPath: "data/reports/research-harness-results.html",
      inputPaths: {
        synthesisPath: "data/research-results/strategy-synthesis-candidates.json",
        harnessSummaryPath: "data/research-results/harness/strategy-harness-summary.json",
        harnessOutputDir: "data/research-results/harness",
        hypothesisValidationPath: "data/research-results/hypothesis-validation.json",
        strategyLeaderboardPath: null,
      },
      synthesisStrategies: [createStrategy()],
      harnessSummary: createHarnessSummary({
        results: [
          {
            synthesizedStrategyId: "synth-atlas-volatility-vol-high-over",
            hypothesisId: "atlas-volatility-vol-high-over",
            strategyFamily: "calibration-no-fade",
            seriesTicker: "KXBTC15M",
            marketTicker: "KXBTC15M-MARKET-A",
            outputPath,
            status: "success",
            errorMessage: null,
          },
        ],
      }),
      validationByHypothesisId: new Map([
        [
          "atlas-volatility-vol-high-over",
          {
            hypothesisId: "atlas-volatility-vol-high-over",
            robustnessScore: 85,
            passes: true,
            reasons: [],
          },
        ],
      ]),
      leaderboardStrategyIds: new Set(),
      readFile: (path) => files.get(path) ?? "",
      config: { minCompletedMarketsForCandidate: 1 },
    });

    expect(report.strategies).toHaveLength(1);
    const strategy = report.strategies[0]!;
    expect(strategy.runStatus).toBe("completed");
    expect(strategy.tradeCount).toBeGreaterThan(0);
    expect(strategy.calibrationContext?.bucketId).toBe("vol-high");
    expect(strategy.promotionRecommendation).toBe("candidate");
    expect(report.summary.recommendationCounts.candidate).toBe(1);
  });

  it("marks harness results as research-only and not promotion eligible", () => {
    const report = buildHarnessResultsReport({
      generatedAt: GENERATED_AT,
      outputPath: "data/research-results/harness-results.json",
      htmlOutputPath: "data/reports/research-harness-results.html",
      inputPaths: {
        synthesisPath: "data/research-results/strategy-synthesis-candidates.json",
        harnessSummaryPath:
          "data/research-results/harness-research-only/strategy-harness-summary.json",
        harnessOutputDir: "data/research-results/harness-research-only",
        hypothesisValidationPath: null,
        strategyLeaderboardPath: null,
      },
      synthesisStrategies: [createStrategy({ promotionStatus: "rejected" })],
      harnessSummary: createHarnessSummary({
        outputDir: "data/research-results/harness-research-only",
        summaryPath:
          "data/research-results/harness-research-only/strategy-harness-summary.json",
        runMode: "research-only",
        researchOnlyBacktest: true,
        includedRejectedStrategies: true,
        promotionEligible: false,
        skippedRejectedStrategyCount: 2,
        strategySelection: [
          {
            strategyId: "synth-atlas-volatility-vol-high-over",
            hypothesisId: "atlas-volatility-vol-high-over",
            promotionStatus: "rejected",
            decision: "included",
            reason: "Near-promising rejected strategy eligible for research-only backtest.",
          },
        ],
      }),
      validationByHypothesisId: new Map(),
      leaderboardStrategyIds: new Set(),
      readFile: () => "",
    });

    expect(report.summary.runMode).toBe("research-only");
    expect(report.summary.promotionEligible).toBe(false);
    expect(report.strategies[0]?.promotionRecommendation).toBe("reject");
    expect(report.strategies[0]?.warnings).toContain(
      "Research-only backtest: results are diagnostic and not promotion-eligible.",
    );
  });
});
