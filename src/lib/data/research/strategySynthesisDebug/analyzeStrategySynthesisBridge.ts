import type { HypothesisCandidate } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import { DEFAULT_HYPOTHESIS_VALIDATION_PASS_SCORE } from "@/lib/data/research/hypothesisRobustness/hypothesisRobustnessTypes";
import {
  DEFAULT_CANDIDATE_PROMOTION_SCORE_THRESHOLD,
} from "@/lib/data/research/strategySynthesis/strategySynthesisTypes";
import type {
  ParsedHypothesisValidationEntry,
  StrategySynthesisConfig,
} from "@/lib/data/research/strategySynthesis/strategySynthesisTypes";
import type { RawSynthesizedStrategySpec } from "@/lib/data/research/strategyHarness/normalizeSynthesizedStrategySpec";
import type { ParsedStrategyHarnessSummary } from "@/lib/data/research/harnessResults/harnessResultsTypes";

import { diagnoseHarnessStrategyEligibility } from "./diagnoseHarnessStrategyEligibility";
import type {
  StrategySynthesisDiagnosis,
  StrategySynthesisFunnelCounts,
  StrategySynthesisFunnelStage,
  StrategySynthesisHypothesisTrace,
  StrategySynthesisRejectionCategory,
} from "./strategySynthesisDebugTypes";

const DEFAULT_NEAR_PROMISING_SCORE_FLOOR = 45;

function addUniqueCategory(
  categories: StrategySynthesisRejectionCategory[],
  category: StrategySynthesisRejectionCategory,
): void {
  if (!categories.includes(category)) {
    categories.push(category);
  }
}

function explainSynthesisPromotionRejection(input: {
  candidate: HypothesisCandidate | null;
  validation: ParsedHypothesisValidationEntry | null;
  config: StrategySynthesisConfig;
}): {
  reasons: string[];
  categories: StrategySynthesisRejectionCategory[];
} {
  const reasons: string[] = [];
  const categories: StrategySynthesisRejectionCategory[] = [];

  if (!input.validation) {
    reasons.push("No validation record found for this hypothesis.");
    categories.push("missing-validation");
    return { reasons, categories };
  }

  if (!input.validation.passes) {
    reasons.push(
      `Hypothesis validation failed (robustness score ${input.validation.robustnessScore}/100; pass threshold ${DEFAULT_HYPOTHESIS_VALIDATION_PASS_SCORE}).`,
    );
    categories.push("validation-failed", "insufficient-validation-score");
    if (input.validation.reasons.length > 0) {
      reasons.push(...input.validation.reasons);
    }
    return { reasons, categories };
  }

  if (
    input.validation.robustnessScore
      < input.config.candidatePromotionScoreThreshold
  ) {
    reasons.push(
      `Robustness score ${input.validation.robustnessScore} is below candidate promotion threshold ${input.config.candidatePromotionScoreThreshold}.`,
    );
    categories.push("threshold-mismatch");
  }

  if (input.candidate && input.candidate.confidence !== "high") {
    reasons.push(
      `Candidate confidence "${input.candidate.confidence}" is below required "high" for candidate promotion.`,
    );
    categories.push("threshold-mismatch");
  }

  return { reasons, categories };
}

function countHarnessRunsForStrategy(
  harnessSummary: ParsedStrategyHarnessSummary | null,
  strategyId: string,
): number {
  if (!harnessSummary) {
    return 0;
  }

  return harnessSummary.results.filter(
    (result) => result.synthesizedStrategyId === strategyId,
  ).length;
}

function isHarnessEvaluated(
  harnessSummary: ParsedStrategyHarnessSummary | null,
  strategyId: string,
): boolean {
  return countHarnessRunsForStrategy(harnessSummary, strategyId) > 0;
}

export function analyzeStrategySynthesisHypothesisTrace(input: {
  hypothesisId: string;
  candidate: HypothesisCandidate | null;
  validation: ParsedHypothesisValidationEntry | null;
  rawStrategy: RawSynthesizedStrategySpec | null;
  synthesisConfig: StrategySynthesisConfig;
  harnessSummary: ParsedStrategyHarnessSummary | null;
  nearPromisingScoreFloor: number;
}): StrategySynthesisHypothesisTrace {
  const rejectionReasons: string[] = [];
  const rejectionCategories: StrategySynthesisRejectionCategory[] = [];
  const missingFields: string[] = [];
  const validationReasons = input.validation?.reasons ?? [];

  if (!input.candidate) {
    rejectionReasons.push("No hypothesis candidate was generated for this hypothesis ID.");
    rejectionCategories.push("not-synthesized");
  }

  if (!input.rawStrategy) {
    if (input.candidate) {
      rejectionReasons.push(
        "Hypothesis candidate exists but no synthesized strategy row was found in strategy-synthesis-candidates.json.",
      );
      rejectionCategories.push("not-synthesized");
    }

    return {
      hypothesisId: input.hypothesisId,
      hypothesisCandidatePresent: input.candidate !== null,
      synthesisCandidatePresent: false,
      strategyId: null,
      strategyFamily: input.candidate?.suggestedStrategyFamily ?? null,
      promotionStatus: null,
      validationPasses: input.validation?.passes ?? null,
      robustnessScore: input.validation?.robustnessScore ?? null,
      confidence: input.candidate?.confidence ?? null,
      harnessEligible: false,
      harnessEvaluated: false,
      harnessRunCount: 0,
      funnelStageReached: input.candidate ? "hypothesis-candidate" : "blocked",
      rejectionReasons,
      rejectionCategories,
      missingFields,
      validationReasons,
    };
  }

  if (input.rawStrategy.promotionStatus === "rejected") {
    const promotionRejection = explainSynthesisPromotionRejection({
      candidate: input.candidate,
      validation: input.validation,
      config: input.synthesisConfig,
    });
    rejectionReasons.push(...promotionRejection.reasons);
    rejectionCategories.push(...promotionRejection.categories);
    addUniqueCategory(rejectionCategories, "promotion-rejected");
    addUniqueCategory(rejectionCategories, "harness-filter-excluded");
  }

  const harnessDiagnosis =
    input.rawStrategy.promotionStatus === "rejected"
      ? {
        eligible: false,
        rejectionReasons: [
          "Harness filters exclude promotionStatus=rejected unless --include-rejected is set.",
        ],
        rejectionCategories: ["harness-filter-excluded"] as StrategySynthesisRejectionCategory[],
        missingFields: [],
      }
      : diagnoseHarnessStrategyEligibility(input.rawStrategy);
  if (!harnessDiagnosis.eligible) {
    rejectionReasons.push(...harnessDiagnosis.rejectionReasons);
    rejectionCategories.push(...harnessDiagnosis.rejectionCategories);
    missingFields.push(...harnessDiagnosis.missingFields);
  }

  const harnessRunCount = countHarnessRunsForStrategy(
    input.harnessSummary,
    input.rawStrategy.strategyId,
  );
  const harnessEvaluated = isHarnessEvaluated(
    input.harnessSummary,
    input.rawStrategy.strategyId,
  );

  let funnelStageReached: StrategySynthesisFunnelStage | "blocked" = "synthesis-candidate";
  if (harnessEvaluated) {
    funnelStageReached = "harness-evaluated";
  } else if (harnessDiagnosis.eligible) {
    funnelStageReached = "harness-eligible";
  } else if (input.candidate) {
    funnelStageReached = "synthesis-candidate";
  } else {
    funnelStageReached = "blocked";
  }

  return {
    hypothesisId: input.hypothesisId,
    hypothesisCandidatePresent: input.candidate !== null,
    synthesisCandidatePresent: true,
    strategyId: input.rawStrategy.strategyId,
    strategyFamily: input.rawStrategy.strategyFamily,
    promotionStatus: input.rawStrategy.promotionStatus,
    validationPasses: input.validation?.passes ?? input.rawStrategy.validationSummary.passes,
    robustnessScore:
      input.validation?.robustnessScore
      ?? input.rawStrategy.validationSummary.robustnessScore,
    confidence: input.candidate?.confidence ?? null,
    harnessEligible: harnessDiagnosis.eligible,
    harnessEvaluated,
    harnessRunCount,
    funnelStageReached,
    rejectionReasons: [...new Set(rejectionReasons)],
    rejectionCategories: [...new Set(rejectionCategories)],
    missingFields: [...new Set(missingFields)],
    validationReasons,
  };
}

function emptyCategoryCounts(): Record<StrategySynthesisRejectionCategory, number> {
  return {
    "not-synthesized": 0,
    "empty-candidate-file": 0,
    "missing-validation": 0,
    "insufficient-validation-score": 0,
    "validation-failed": 0,
    "promotion-rejected": 0,
    "unsupported-strategy-family": 0,
    "missing-entry-threshold": 0,
    "unsupported-entry-exit-condition": 0,
    "harness-schema-mismatch": 0,
    "threshold-mismatch": 0,
    "harness-filter-excluded": 0,
  };
}

export function buildStrategySynthesisFunnelCounts(input: {
  traces: readonly StrategySynthesisHypothesisTrace[];
  harnessSummary: ParsedStrategyHarnessSummary | null;
  hypothesisCandidateCount: number;
  synthesisCandidateCount: number;
}): StrategySynthesisFunnelCounts {
  return {
    hypothesisCandidates: input.hypothesisCandidateCount,
    synthesisCandidates: input.synthesisCandidateCount,
    harnessEligible: input.traces.filter((trace) => trace.harnessEligible).length,
    harnessEvaluated: input.traces.filter((trace) => trace.harnessEvaluated).length,
    evaluatedStrategies: input.harnessSummary?.evaluatedStrategies ?? 0,
  };
}

export function deriveStrategySynthesisDiagnosis(input: {
  funnel: StrategySynthesisFunnelCounts;
  traces: readonly StrategySynthesisHypothesisTrace[];
  emptyCandidateFileReasons: readonly string[];
  harnessWarnings: readonly string[];
}): {
  diagnosis: StrategySynthesisDiagnosis;
  diagnosisRationale: string;
  recommendedNextTask: string;
} {
  const categoryCounts = emptyCategoryCounts();
  for (const trace of input.traces) {
    for (const category of trace.rejectionCategories) {
      categoryCounts[category] += 1;
    }
  }

  if (input.funnel.hypothesisCandidates === 0) {
    return {
      diagnosis: "empty-inputs",
      diagnosisRationale:
        "No hypothesis candidates were produced upstream; strategy synthesis had nothing to convert.",
      recommendedNextTask:
        "Run research:hypotheses after confirming mispricing-atlas and lead-lag inputs cover the target replay horizon.",
    };
  }

  if (input.funnel.synthesisCandidates === 0) {
    return {
      diagnosis: "schema-mismatch",
      diagnosisRationale:
        "Hypothesis candidates exist but strategy-synthesis-candidates.json is empty or missing strategy rows.",
      recommendedNextTask:
        "Re-run research:strategy-synthesis and inspect strategy-synthesis-candidates.json schema integrity.",
    };
  }

  const allRejectedAtHarness =
    input.funnel.harnessEligible === 0
    && categoryCounts["harness-filter-excluded"] > 0
    && categoryCounts["unsupported-strategy-family"] === 0
    && categoryCounts["harness-schema-mismatch"] === 0
    && categoryCounts["missing-entry-threshold"] === 0;

  if (allRejectedAtHarness && categoryCounts["validation-failed"] > 0) {
    const nearPromising = input.traces.filter(
      (trace) =>
        trace.robustnessScore !== null
        && trace.robustnessScore >= DEFAULT_NEAR_PROMISING_SCORE_FLOOR
        && trace.validationPasses === false,
    );

    return {
      diagnosis: "expected-validation-failure",
      diagnosisRationale:
        "Synthesis produced strategies, but every row failed validation or promotion gates before harness selection. This is expected behavior, not a synthesis-bridge bug.",
      recommendedNextTask: nearPromising.length > 0
        ? "Add a research-only harness mode (e.g. --include-rejected or --research-only-backtest) to evaluate near-promising hypotheses without relaxing promotion thresholds."
        : "Collect more replay coverage and re-run hypothesis-validation before expecting harness candidates.",
    };
  }

  if (categoryCounts["unsupported-strategy-family"] > 0 && input.funnel.harnessEligible === 0) {
    return {
      diagnosis: "unsupported-family-bridge-gap",
      diagnosisRationale:
        "Validated strategies exist, but their strategy families are not translated by the harness bridge (only calibration-fade is runnable today).",
      recommendedNextTask:
        "Implement harness support for delayed-reaction (or map families to calibration-fade) before expecting executable harness candidates.",
    };
  }

  if (
    categoryCounts["harness-schema-mismatch"] > 0
    || categoryCounts["missing-entry-threshold"] > 0
  ) {
    return {
      diagnosis: "schema-mismatch",
      diagnosisRationale:
        "Synthesis rows exist but harness normalization rejects them due to schema or entry-condition translation gaps.",
      recommendedNextTask:
        "Fix synthesis → harness field mapping (yesMidThresholdCents / marketCondition) for affected strategy rows.",
    };
  }

  if (input.funnel.harnessEligible > 0 && input.funnel.harnessEvaluated === 0) {
    return {
      diagnosis: "mixed",
      diagnosisRationale:
        "Harness-eligible strategies exist but no harness runs were recorded; the harness step may not have executed.",
      recommendedNextTask: "Run research:harness against the current strategy-synthesis-candidates.json.",
    };
  }

  if (input.funnel.harnessEvaluated > 0) {
    return {
      diagnosis: "healthy",
      diagnosisRationale: "At least one synthesized strategy passed harness filters and was evaluated.",
      recommendedNextTask: "Review harness-results.json for promotion recommendations.",
    };
  }

  return {
    diagnosis: "mixed",
    diagnosisRationale:
      "Multiple rejection categories are present; inspect per-hypothesis traces for the dominant blocker.",
    recommendedNextTask:
      "Use this report's per-hypothesis rejection reasons to choose between validation work, harness bridge fixes, or research-only backtests.",
  };
}

export function resolveStrategySynthesisDebugConfig(
  partial?: Partial<StrategySynthesisConfig>,
): StrategySynthesisConfig {
  return {
    candidatePromotionScoreThreshold:
      partial?.candidatePromotionScoreThreshold
      ?? DEFAULT_CANDIDATE_PROMOTION_SCORE_THRESHOLD,
  };
}
