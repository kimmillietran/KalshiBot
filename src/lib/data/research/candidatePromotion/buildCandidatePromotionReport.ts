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
  CandidatePromotionReport,
  CandidatePromotionSummary,
} from "./candidatePromotionTypes";

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

/** Builds the advisory candidate promotion report from parsed research inputs. */
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
  };
}

export function serializeCandidatePromotionReport(
  report: CandidatePromotionReport,
): string {
  return stableStringify(report);
}
