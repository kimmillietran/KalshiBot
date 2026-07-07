import { describe, expect, it } from "vitest";

import type { HypothesisCandidate } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import type { HypothesisRefinementCandidate } from "@/lib/data/research/hypothesisRefinementGenerator/hypothesisRefinementTypes";

import { buildRefinementHypothesisCandidatesReport } from "./buildRefinementHypothesisCandidatesReport";
import { registerRefinementHypothesisCandidates } from "./registerRefinementHypothesisCandidates";
import { serializeRefinementHypothesisCandidatesHtml } from "./serializeRefinementHypothesisCandidatesHtml";

function createParentCandidate(): HypothesisCandidate {
  return {
    candidateId: "atlas-volatilityProbabilityTime-vol-high-coarse-prob-1-coarse-time-early-over",
    sourceArtifact: "mispricing-atlas.json",
    hypothesis:
      "High (>=60% annualized) × [0.3, 0.7) × < 15 minutes remaining appears overconfident; test NO fade against implied probability.",
    rationale: "Parent rationale",
    marketCondition: "High vol mid-probability early time",
    suggestedStrategyFamily: "calibration-no-fade",
    requiredData: ["Kalshi implied probability (bid/ask midpoint)"],
    proposedEntryCondition: "Enter NO when bucket matches",
    proposedExitSettlementAssumption: "Hold through settlement",
    expectedFailureMode: "Regime shift",
    killCriterion: "Edge disappears",
    confidence: "medium",
    warnings: [],
  };
}

function createRefinement(
  overrides?: Partial<HypothesisRefinementCandidate>,
): HypothesisRefinementCandidate {
  return {
    refinementId:
      "refine-atlas-volatilityProbabilityTime-vol-high-coarse-prob-1-coarse-time-early-over--probability-bucket-split-prob-30-50",
    parentHypothesisId: "atlas-volatilityProbabilityTime-vol-high-coarse-prob-1-coarse-time-early-over",
    parentHypothesis: createParentCandidate().hypothesis,
    refinementType: "probability-bucket-split",
    refinedHypothesis:
      "High (>=60% annualized) × [0.3, 0.5) × < 15 minutes remaining appears overconfident; test NO fade against implied probability.",
    rationale: "Split mid-probability band",
    expectedBenefit: "Better month stability",
    expectedRisk: "Smaller sample",
    overfittingRisk: "medium",
    priorityRank: 1,
    priorityScore: 160,
    status: "candidate-refinement",
    parentPriorityCategory: "near-promising",
    parentRobustnessScore: 59,
    parentScoreGap: 11,
    suggestedFilters: {
      probabilityRangeLabel: "[0.3, 0.5)",
    },
    atlasSupportObservations: 100,
    ...overrides,
  };
}

describe("registerRefinementHypothesisCandidates", () => {
  it("registers child hypotheses from M9.42 refinements", () => {
    const result = registerRefinementHypothesisCandidates(
      [createRefinement()],
      [createParentCandidate()],
      { generatedFromFailureAnalysis: true },
    );

    expect(result.candidates).toHaveLength(1);
    const candidate = result.candidates[0];
    expect(candidate?.candidateId).toBe(
      "refine-atlas-volatilityProbabilityTime-vol-high-coarse-prob-1-coarse-time-early-over--probability-bucket-split-prob-30-50",
    );
    expect(candidate?.refinementRegistration.parentHypothesisId).toBe(
      "atlas-volatilityProbabilityTime-vol-high-coarse-prob-1-coarse-time-early-over",
    );
    expect(candidate?.refinementRegistration.status).toBe("candidate-refinement");
    expect(candidate?.refinementRegistration.generatedFromFailureAnalysis).toBe(true);
    expect(candidate?.refinementRegistration.generationReason).toBe("Split mid-probability band");
  });

  it("suppresses duplicate refinement ids deterministically", () => {
    const duplicate = createRefinement();
    const result = registerRefinementHypothesisCandidates(
      [duplicate, duplicate],
      [createParentCandidate()],
      { generatedFromFailureAnalysis: true },
    );

    expect(result.candidates).toHaveLength(1);
    expect(result.duplicateSuppressedCount).toBe(1);
  });

  it("skips malformed refinements", () => {
    const result = registerRefinementHypothesisCandidates(
      [
        createRefinement({ refinementType: "invalid-type" as HypothesisRefinementCandidate["refinementType"] }),
        createRefinement({ status: "validated" as HypothesisRefinementCandidate["status"] }),
      ],
      [createParentCandidate()],
      { generatedFromFailureAnalysis: false },
    );

    expect(result.candidates).toHaveLength(0);
    expect(result.skippedEntries).toHaveLength(2);
  });

  it("produces deterministic candidate ids", () => {
    const first = registerRefinementHypothesisCandidates(
      [createRefinement()],
      [createParentCandidate()],
      { generatedFromFailureAnalysis: true },
    );
    const second = registerRefinementHypothesisCandidates(
      [createRefinement()],
      [createParentCandidate()],
      { generatedFromFailureAnalysis: true },
    );

    expect(first.candidates[0]?.candidateId).toBe(second.candidates[0]?.candidateId);
  });
});

describe("buildRefinementHypothesisCandidatesReport", () => {
  it("builds an empty report when no refinements are present", () => {
    const report = buildRefinementHypothesisCandidatesReport({
      generatedAt: "2026-07-07T00:00:00.000Z",
      outputPath: "data/research-results/refinement-hypothesis-candidates.json",
      htmlOutputPath: "data/reports/refinement-hypothesis-candidates.html",
      inputPaths: {
        hypothesisRefinementsPath: "data/research-results/hypothesis-refinements.json",
        hypothesisCandidatesPath: "data/research-results/hypothesis-candidates.json",
        hypothesisFailureAnalysisPath: "data/research-results/hypothesis-failure-analysis.json",
      },
      inputStatus: {
        hypothesisRefinementsPresent: true,
        hypothesisCandidatesPresent: true,
        hypothesisFailureAnalysisPresent: true,
      },
      refinements: [],
      parentCandidates: [],
      generatedFromFailureAnalysis: true,
    });

    expect(report.summary.registeredCount).toBe(0);
    expect(report.candidates).toEqual([]);
  });

  it("serializes HTML with parent and child relationships", () => {
    const report = buildRefinementHypothesisCandidatesReport({
      generatedAt: "2026-07-07T00:00:00.000Z",
      outputPath: "data/research-results/refinement-hypothesis-candidates.json",
      htmlOutputPath: "data/reports/refinement-hypothesis-candidates.html",
      inputPaths: {
        hypothesisRefinementsPath: "data/research-results/hypothesis-refinements.json",
        hypothesisCandidatesPath: "data/research-results/hypothesis-candidates.json",
        hypothesisFailureAnalysisPath: "data/research-results/hypothesis-failure-analysis.json",
      },
      inputStatus: {
        hypothesisRefinementsPresent: true,
        hypothesisCandidatesPresent: true,
        hypothesisFailureAnalysisPresent: true,
      },
      refinements: [createRefinement()],
      parentCandidates: [createParentCandidate()],
      generatedFromFailureAnalysis: true,
    });

    const html = serializeRefinementHypothesisCandidatesHtml(report);
    expect(html).toContain("Refinement Hypothesis Candidates");
    expect(html).toContain("Registered child hypotheses");
    expect(html).toContain("candidate-refinement");
    expect(html).toContain(createParentCandidate().candidateId);
  });
});
