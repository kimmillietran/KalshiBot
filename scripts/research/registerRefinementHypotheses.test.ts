import { describe, expect, it, vi } from "vitest";

import { runRegisterRefinementHypothesesCommand } from "./registerRefinementHypotheses";

const refinementsFixture = {
  refinements: [
    {
      refinementId:
        "refine-atlas-volatilityProbabilityTime-vol-high-coarse-prob-1-coarse-time-early-over--probability-bucket-split-prob-30-50",
      parentHypothesisId: "atlas-volatilityProbabilityTime-vol-high-coarse-prob-1-coarse-time-early-over",
      parentHypothesis: "Parent hypothesis",
      refinementType: "probability-bucket-split",
      refinedHypothesis: "Refined hypothesis",
      rationale: "Split probability band",
      expectedBenefit: "Stability",
      expectedRisk: "Sample size",
      overfittingRisk: "medium",
      priorityRank: 1,
      priorityScore: 160,
      status: "candidate-refinement",
      parentPriorityCategory: "near-promising",
      parentRobustnessScore: 59,
      parentScoreGap: 11,
      suggestedFilters: { probabilityRangeLabel: "[0.3, 0.5)" },
      atlasSupportObservations: null,
    },
  ],
};

const parentCandidatesFixture = {
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
      candidateId: "atlas-volatilityProbabilityTime-vol-high-coarse-prob-1-coarse-time-early-over",
      sourceArtifact: "mispricing-atlas.json",
      hypothesis: "Parent hypothesis",
      rationale: "Parent rationale",
      marketCondition: "Parent condition",
      suggestedStrategyFamily: "calibration-no-fade",
      requiredData: ["Kalshi implied probability (bid/ask midpoint)"],
      proposedEntryCondition: "Enter NO",
      proposedExitSettlementAssumption: "Hold through settlement",
      expectedFailureMode: "Regime shift",
      killCriterion: "Edge disappears",
      confidence: "medium",
      warnings: [],
    },
  ],
  summary: { candidateCount: 1, noCandidateReasons: [] },
};

describe("runRegisterRefinementHypothesesCommand", () => {
  it("writes registered refinement hypothesis candidates", () => {
    const writes = new Map<string, string>();

    const exitCode = runRegisterRefinementHypothesesCommand(
      [],
      {
        readFile: (path) => {
          if (path.endsWith("hypothesis-refinements.json")) {
            return JSON.stringify(refinementsFixture);
          }
          if (path.endsWith("hypothesis-candidates.json")) {
            return JSON.stringify(parentCandidatesFixture);
          }
          return "";
        },
        writeStdout: vi.fn(),
        writeStderr: vi.fn(),
        writeFile: (path, data) => {
          writes.set(path, data);
        },
        mkdirSync: vi.fn(),
        fileExists: (path) =>
          path.endsWith("hypothesis-refinements.json")
          || path.endsWith("hypothesis-candidates.json")
          || path.endsWith("hypothesis-failure-analysis.json"),
      },
      { generatedAt: "2026-07-07T00:00:00.000Z" },
    );

    expect(exitCode).toBe(0);
    const json = JSON.parse(
      writes.get("data/research-results/refinement-hypothesis-candidates.json") ?? "{}",
    );
    expect(json.summary.registeredCount).toBe(1);
    expect(json.candidates[0]?.refinementRegistration.status).toBe("candidate-refinement");
    expect(writes.get("data/reports/refinement-hypothesis-candidates.html")).toContain(
      "Registered child hypotheses",
    );
  });
});
