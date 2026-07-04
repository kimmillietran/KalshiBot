import {
  buildResearchExperimentId,
  buildResearchExperimentRecordPath,
} from "./generateExperimentId";
import { computeRuntimeFromInputs } from "./loadExperimentInputs";
import type {
  ParsedExperimentInputs,
  RegisterResearchExperimentInput,
  ResearchExperimentRecord,
  ResearchExperimentTopCandidate,
} from "./experimentManagerTypes";

const PROMOTION_DECISION_RANK: Record<string, number> = {
  "production-watchlist": 5,
  candidate: 4,
  "needs-more-data": 3,
  exploratory: 2,
  rejected: 1,
  unknown: 0,
};

function selectTopCandidate(
  promotions: ParsedExperimentInputs["promotions"],
): ResearchExperimentTopCandidate | null {
  if (promotions.length === 0) {
    return null;
  }

  const sorted = [...promotions].sort((left, right) => {
    const rankDelta =
      (PROMOTION_DECISION_RANK[right.decision] ?? 0) -
      (PROMOTION_DECISION_RANK[left.decision] ?? 0);

    if (rankDelta !== 0) {
      return rankDelta;
    }

    const robustnessDelta =
      (right.robustnessScore ?? -1) - (left.robustnessScore ?? -1);

    if (robustnessDelta !== 0) {
      return robustnessDelta;
    }

    return left.strategyId.localeCompare(right.strategyId);
  });

  const top = sorted[0];

  return {
    strategyId: top.strategyId,
    hypothesisId: top.hypothesisId,
    strategyFamily: top.strategyFamily,
    decision: top.decision,
    robustnessScore: top.robustnessScore,
  };
}

export function buildExperimentRecord(
  input: RegisterResearchExperimentInput,
  inputs: ParsedExperimentInputs,
): ResearchExperimentRecord {
  const gitCommit =
    input.gitCommit ??
    input.io.resolveGitCommit?.() ??
    null;
  const experimentId = buildResearchExperimentId(input.generatedAt, gitCommit);
  const recordPath = buildResearchExperimentRecordPath(
    input.experimentsDir,
    experimentId,
  );

  return {
    experimentId,
    timestamp: input.generatedAt,
    gitCommit,
    pipelineConfiguration: {
      pipeline: inputs.pipelineSummary?.config ?? null,
      fullResearch: inputs.fullResearchSummary?.config ?? null,
    },
    hypothesisCount: inputs.hypothesisCount,
    validationSummary: inputs.validationSummary,
    synthesizedStrategyCount: inputs.synthesizedStrategyCount,
    harnessSummary: inputs.harnessSummary,
    candidatePromotionSummary: inputs.promotionSummary,
    promotionSnapshot: inputs.promotions.map((promotion) => ({
      strategyId: promotion.strategyId,
      hypothesisId: promotion.hypothesisId,
      decision: promotion.decision,
      robustnessScore: promotion.robustnessScore,
    })),
    topCandidate: selectTopCandidate(inputs.promotions),
    warnings: inputs.warnings,
    runtime: computeRuntimeFromInputs(inputs),
    artifactSnapshot: inputs.artifactSnapshot,
    inputPaths: input.inputPaths,
    recordPath,
  };
}

export { PROMOTION_DECISION_RANK };
