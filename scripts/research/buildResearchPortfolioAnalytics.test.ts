import { describe, expect, it } from "vitest";

import { runResearchPortfolioAnalyticsCommand } from "./buildResearchPortfolioAnalytics";

describe("runResearchPortfolioAnalyticsCommand", () => {
  it("writes portfolio analytics artifacts from fixture inputs", () => {
    const files = new Map<string, string>([
      [
        "data/research-results/hypothesis-candidates.json",
        JSON.stringify({
          generatedAt: "2026-07-07T00:00:00.000Z",
          outputPath: "data/research-results/hypothesis-candidates.json",
          config: {
            minSampleSize: 30,
            minCalibrationError: 0.05,
            minLeadLagCorrelation: 0.2,
          },
          inputs: {},
          candidates: [
            {
              candidateId: "atlas-moneyness-moneyness-near-below-over",
              sourceArtifact: "mispricing-atlas.json",
              hypothesis: "moneyness hypothesis",
              rationale: "rationale",
              marketCondition: "condition",
              suggestedStrategyFamily: "calibration-no-fade",
              requiredData: ["mispricing-atlas"],
              proposedEntryCondition: "entry",
              proposedExitSettlementAssumption: "exit",
              expectedFailureMode: "mode",
              killCriterion: "kill",
              confidence: "medium",
              warnings: [],
            },
          ],
          summary: { candidateCount: 1, noCandidateReasons: [] },
        }),
      ],
      [
        "data/research-results/hypothesis-validation.json",
        JSON.stringify({
          generatedAt: "2026-07-07T00:00:00.000Z",
          config: { passScoreThreshold: 70 },
          validations: [
            {
              hypothesisId: "atlas-moneyness-moneyness-near-below-over",
              hypothesis: "moneyness hypothesis",
              sourceArtifact: "mispricing-atlas.json",
              robustnessScore: 72,
              passes: true,
              reasons: [],
              observationCount: 200,
              timeStability: {
                monthPeriods: [],
                quarterPeriods: [],
                monthPersistenceRate: 0.8,
                quarterPersistenceRate: 0.75,
              },
              regimeStability: {
                regimes: [],
                regimesWithEdge: 2,
                regimesWithData: 3,
              },
              sampleConcentration: {
                uniqueTradingDays: 40,
                largestContributingDay: "2026-01-01",
                largestDayObservations: 10,
                largestDayPercent: 5,
                singleDayDominated: false,
              },
              leaveOnePeriodOut: {
                errorStdDev: 0.01,
                folds: [],
              },
            },
          ],
        }),
      ],
      [
        "data/research-results/hypothesis-failure-analysis.json",
        JSON.stringify({
          generatedAt: "2026-07-07T00:00:00.000Z",
          passThreshold: 70,
          analyses: [],
        }),
      ],
    ]);

    const written = new Map<string, string>();
    let stdout = "";

    const exitCode = runResearchPortfolioAnalyticsCommand(
      [
        "--output",
        "data/research-results/research-portfolio-analytics.json",
        "--html-output",
        "data/reports/research-portfolio-analytics.html",
      ],
      {
        readFile: (path) => files.get(path) ?? "",
        fileExists: (path) => files.has(path),
        writeStdout: (text) => {
          stdout = text;
        },
        writeStderr: () => {},
        writeFile: (path, data) => {
          written.set(path, data);
        },
        mkdirSync: () => {},
      },
      { generatedAt: "2026-07-07T12:00:00.000Z" },
    );

    expect(exitCode).toBe(0);
    expect(written.has("data/research-results/research-portfolio-analytics.json")).toBe(true);
    expect(written.has("data/reports/research-portfolio-analytics.html")).toBe(true);
    expect(stdout).toContain("research-portfolio-analytics.json");
    expect(written.get("data/research-results/research-portfolio-analytics.json")).toContain(
      '"totalCandidates":1',
    );
  });
});
