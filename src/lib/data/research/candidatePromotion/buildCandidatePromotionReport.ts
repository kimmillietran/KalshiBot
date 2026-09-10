import { stableStringify } from "@/lib/trading/config/hashConfig";

import {
  classifyAllCandidatePromotions,
  resolveCandidatePromotionConfig,
} from "./classifyCandidatePromotion";
import {
  indexHarnessStrategies,
  indexValidationEntries,
} from "./loadCandidatePromotionInputs";
import type {
  BuildCandidatePromotionReportInput,
  CandidatePromotionDecision,
  CandidatePromotionInputArtifactHashes,
  CandidatePromotionReport,
  CandidatePromotionSummary,
} from "./candidatePromotionTypes";
import { CANDIDATE_PROMOTION_EVIDENCE_ANALYSIS_VERSION } from "./candidatePromotionTypes";

const EMPTY_INPUT_HASHES: CandidatePromotionInputArtifactHashes = {
  hypothesisValidation: null,
  strategySynthesis: null,
  harnessResults: null,
  statisticalSignificance: null,
  oosPowerCorrection: null,
};

function emptyOosContext(): import("./candidatePromotionTypes").ParsedOosPromotionContext {
  return {
    present: false,
    artifactContentHash: null,
    discoveryIsolation: null,
    prospectiveDesign: null,
    testedHypothesisCount: null,
    alpha: null,
    targetPower: null,
    holdoutMonthsHash: null,
    entriesByHypothesisId: new Map(),
  };
}
function buildSummary(
  promotions: readonly { decision: CandidatePromotionDecision }[],
): CandidatePromotionSummary {
  const decisionCounts: CandidatePromotionSummary["decisionCounts"] = {
    rejected: 0,
    exploratory: 0,
    "needs-more-data": 0,
    candidate: 0,
    "production-watchlist": 0,
  };

  for (const promotion of promotions) {
    decisionCounts[promotion.decision] += 1;
  }

  return {
    totalStrategies: promotions.length,
    decisionCounts,
    rejectedCount: decisionCounts.rejected,
    watchlistCount: decisionCounts["production-watchlist"],
  };
}

/** Builds the candidate promotion report with M12.7c OOS/FDR/power binding. */
export function buildCandidatePromotionReport(
  input: BuildCandidatePromotionReportInput,
): CandidatePromotionReport {
  const config = resolveCandidatePromotionConfig(input.config);
  const strategies = input.inputs.synthesis?.strategies ?? [];

  const promotions = classifyAllCandidatePromotions({
    strategies,
    validationByHypothesisId: indexValidationEntries(
      input.inputs.validation?.validations ?? [],
    ),
    harnessByStrategyId: indexHarnessStrategies(input.inputs.harnessStrategies),
    significanceByFamily: input.inputs.significanceByFamily,
    oos: input.inputs.oos ?? emptyOosContext(),
    config,
  });

  return {
    generatedAt: input.generatedAt,
    outputPath: input.outputPath,
    htmlOutputPath: input.htmlOutputPath,
    inputPaths: input.inputPaths,
    config,
    summary: buildSummary(promotions),
    promotions,
    evidenceAnalysisVersion: CANDIDATE_PROMOTION_EVIDENCE_ANALYSIS_VERSION,
    inputArtifactContentHashes:
      input.inputs.inputArtifactContentHashes ?? EMPTY_INPUT_HASHES,
  };
}

export function serializeCandidatePromotionReport(
  report: CandidatePromotionReport,
): string {
  return stableStringify(report);
}
