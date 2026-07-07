import { describe, expect, it, vi } from "vitest";

import { runHypothesisFailureAnalysisCommand } from "./buildHypothesisFailureAnalysis";

describe("runHypothesisFailureAnalysisCommand", () => {
  it("writes failure analysis artifacts with missing optional inputs", () => {
    const writes = new Map<string, string>();
    let stdout = "";

    const exitCode = runHypothesisFailureAnalysisCommand(
      [],
      {
        readFile: () => "",
        writeStdout: (text) => {
          stdout += text;
        },
        writeStderr: vi.fn(),
        writeFile: (path, data) => {
          writes.set(path, data);
        },
        mkdirSync: vi.fn(),
        fileExists: () => false,
      },
      { generatedAt: "2026-07-07T00:00:00.000Z" },
    );

    expect(exitCode).toBe(0);
    expect(writes.has("data/research-results/hypothesis-failure-analysis.json")).toBe(true);
    expect(writes.has("data/reports/hypothesis-failure-analysis.html")).toBe(true);
    expect(stdout).toContain('"totalHypotheses":0');
    expect(writes.get("data/reports/hypothesis-failure-analysis.html")).toContain(
      "Hypothesis Failure Analysis",
    );
  });

  it("builds a report from hypothesis validation input", () => {
    const writes = new Map<string, string>();
    const validationFixture = {
      config: { passScoreThreshold: 70 },
      validations: [
        {
          hypothesisId: "atlas-probabilityMoneyness-coarse-prob-2-moneyness-near-below-over",
          hypothesis: "[0.7, 1.0] × -2% to 0% from strike appears overconfident.",
          sourceArtifact: "mispricing-atlas.json",
          robustnessScore: 58,
          passes: false,
          reasons: ["Month-level edge persistence is weak (33%)."],
          observationCount: 553,
          timeStability: {
            monthPeriods: [
              {
                periodKey: "2025-12",
                observations: 126,
                signedCalibrationError: 0.25,
                edgeMatchesDirection: true,
              },
            ],
            quarterPeriods: [],
            monthPersistenceRate: 0.33,
            quarterPersistenceRate: 0.66,
            scoreComponent: 10,
          },
          regimeStability: {
            regimes: [
              { regime: "low", observations: 96, signedCalibrationError: 0.02, edgeMatchesDirection: false },
              { regime: "medium", observations: 12, signedCalibrationError: -0.01, edgeMatchesDirection: false },
              { regime: "high", observations: 6, signedCalibrationError: 0, edgeMatchesDirection: false },
            ],
            regimesWithEdge: 0,
            regimesWithData: 3,
            scoreComponent: 0,
          },
          sampleConcentration: {
            uniqueTradingDays: 91,
            largestContributingDay: "2026-05-01",
            largestDayObservations: 42,
            largestDayPercent: 7.6,
            singleDayDominated: false,
            scoreComponent: 23,
          },
          leaveOnePeriodOut: {
            folds: [],
            errorVariance: 0.0005,
            errorStdDev: 0.023,
            scoreComponent: 23,
          },
        },
      ],
    };

    const exitCode = runHypothesisFailureAnalysisCommand(
      [],
      {
        readFile: (path) => {
          if (path.endsWith("hypothesis-validation.json")) {
            return JSON.stringify(validationFixture);
          }
          return "";
        },
        writeStdout: vi.fn(),
        writeStderr: vi.fn(),
        writeFile: (path, data) => {
          writes.set(path, data);
        },
        mkdirSync: vi.fn(),
        fileExists: (path) => path.endsWith("hypothesis-validation.json"),
      },
      { generatedAt: "2026-07-07T00:00:00.000Z" },
    );

    expect(exitCode).toBe(0);
    const json = JSON.parse(
      writes.get("data/research-results/hypothesis-failure-analysis.json") ?? "{}",
    );
    expect(json.summary.totalHypotheses).toBe(1);
    expect(json.analyses[0]?.hypothesisId).toBe(
      "atlas-probabilityMoneyness-coarse-prob-2-moneyness-near-below-over",
    );
    expect(json.analyses[0]?.scoreGap).toBe(12);
    expect(writes.get("data/reports/hypothesis-failure-analysis.html")).toContain(
      "atlas-probabilityMoneyness-coarse-prob-2-moneyness-near-below-over",
    );
  });
});
