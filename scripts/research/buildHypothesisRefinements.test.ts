import { describe, expect, it, vi } from "vitest";

import { runHypothesisRefinementsCommand } from "./buildHypothesisRefinements";

const nearPromisingFailureAnalysis = {
  analyses: [
    {
      hypothesisId: "atlas-volatilityProbabilityTime-vol-high-coarse-prob-1-coarse-time-early-over",
      hypothesis:
        "High (>=60% annualized) × [0.3, 0.7) × < 15 minutes remaining appears overconfident; test NO fade against implied probability.",
      passes: false,
      robustnessScore: 59,
      passThreshold: 70,
      scoreGap: 11,
      observationCount: 457,
      uniqueTradingDays: 63,
      priorityRank: 1,
      priorityCategory: "near-promising",
      priorityScore: 125.52,
      recommendedNextAction: "inspect-month-breakdown",
      failureReasons: [
        {
          category: "poor-month-stability",
          summary: "Month-level edge persistence is weak (60%).",
          detail: null,
        },
        {
          category: "weak-calibration-gap",
          summary: "Calibration edge is unstable or reverses across time buckets.",
          detail: null,
        },
      ],
      stabilityDiagnostics: {
        strongestMonths: [
          {
            month: "2026-02",
            observations: 201,
            edgeMatchesDirection: true,
            signedCalibrationError: 0.095,
            observationShare: 0.44,
          },
        ],
        weakestMonths: [
          {
            month: "2026-03",
            observations: 146,
            edgeMatchesDirection: false,
            signedCalibrationError: -0.047,
            observationShare: 0.32,
          },
        ],
        missingOrThinMonths: [],
        highConcentrationDays: [],
        signalBreadth: "mixed",
        monthPersistenceRate: 0.6,
        quarterPersistenceRate: 0.33,
        uniqueTradingDays: 63,
        monthCount: 6,
        leaveOnePeriodOutStdDev: 0.024,
        regimesWithData: 0,
        regimesWithEdge: 0,
      },
      marginalEvidenceNeeds: [],
      notes: [],
      suggestedStrategyFamily: "calibration-no-fade",
      coverageClassification: "inconclusive-regime-sparse",
      crossValidationPasses: false,
    },
  ],
};

describe("runHypothesisRefinementsCommand", () => {
  it("writes refinement artifacts from failure analysis input", () => {
    const writes = new Map<string, string>();
    let stdout = "";

    const exitCode = runHypothesisRefinementsCommand(
      [],
      {
        readFile: (path) => {
          if (path.endsWith("hypothesis-failure-analysis.json")) {
            return JSON.stringify(nearPromisingFailureAnalysis);
          }
          return "";
        },
        writeStdout: (text) => {
          stdout += text;
        },
        writeStderr: vi.fn(),
        writeFile: (path, data) => {
          writes.set(path, data);
        },
        mkdirSync: vi.fn(),
        fileExists: (path) => path.endsWith("hypothesis-failure-analysis.json"),
      },
      { generatedAt: "2026-07-07T00:00:00.000Z" },
    );

    expect(exitCode).toBe(0);
    expect(writes.has("data/research-results/hypothesis-refinements.json")).toBe(true);
    expect(writes.has("data/reports/hypothesis-refinements.html")).toBe(true);

    const json = JSON.parse(
      writes.get("data/research-results/hypothesis-refinements.json") ?? "{}",
    );
    expect(json.summary.totalRefinements).toBeGreaterThan(0);
    expect(json.refinements[0]?.status).toBe("candidate-refinement");
    expect(stdout).toContain('"totalRefinements"');

    const html = writes.get("data/reports/hypothesis-refinements.html") ?? "";
    expect(html).toContain("Parent:");
    expect(html).toContain("Child refinements");
  });

  it("handles missing optional atlas and cross-validation inputs", () => {
    const writes = new Map<string, string>();

    const exitCode = runHypothesisRefinementsCommand(
      [],
      {
        readFile: (path) => {
          if (path.endsWith("hypothesis-failure-analysis.json")) {
            return JSON.stringify(nearPromisingFailureAnalysis);
          }
          return "";
        },
        writeStdout: vi.fn(),
        writeStderr: vi.fn(),
        writeFile: (path, data) => {
          writes.set(path, data);
        },
        mkdirSync: vi.fn(),
        fileExists: (path) => path.endsWith("hypothesis-failure-analysis.json"),
      },
      { generatedAt: "2026-07-07T00:00:00.000Z" },
    );

    expect(exitCode).toBe(0);
    const json = JSON.parse(
      writes.get("data/research-results/hypothesis-refinements.json") ?? "{}",
    );
    expect(json.inputStatus.mispricingAtlasPresent).toBe(false);
    expect(json.inputStatus.crossValidationPresent).toBe(false);
  });
});
