import type {
  HistoricalLineageContext,
  LoroAssessment,
  RecommendedResearchAction,
  StoppingRuleAssessment,
} from "./calibrationFadeV2EvidenceStrengthTypes";
import type { LoadedHypothesisThresholds } from "./loadEvidenceStrengthInputs";

export function assessStoppingRule(
  thresholds: LoadedHypothesisThresholds,
): StoppingRuleAssessment {
  if (thresholds.hasExplicitFixedN) {
    return {
      stoppingRuleStatus: "explicit-fixed-n",
      minimumIndependentCandidateMarkets: thresholds.minimumIndependentCandidateMarkets,
      optionalStoppingRiskFlag: false,
      rationale:
        "Hypothesis config declares an explicit fixed final N / stopping N beyond the minimum floor.",
    };
  }
  if (thresholds.hasExplicitHorizon) {
    return {
      stoppingRuleStatus: "explicit-horizon",
      minimumIndependentCandidateMarkets: thresholds.minimumIndependentCandidateMarkets,
      optionalStoppingRiskFlag: false,
      rationale:
        "Hypothesis config declares an explicit capture horizon / stopping horizon beyond the minimum floor.",
    };
  }
  if (thresholds.hasSequentialCorrection) {
    return {
      stoppingRuleStatus: "unknown",
      minimumIndependentCandidateMarkets: thresholds.minimumIndependentCandidateMarkets,
      optionalStoppingRiskFlag: true,
      rationale:
        "Hypothesis config mentions a sequential-testing field but does not declare a fixed final N "
        + "or capture horizon; treat optional-stopping risk as present until the contract is clarified.",
    };
  }
  return {
    stoppingRuleStatus: "minimum-floor-only",
    minimumIndependentCandidateMarkets: thresholds.minimumIndependentCandidateMarkets,
    optionalStoppingRiskFlag: true,
    rationale:
      "Frozen contract specifies minimumIndependentCandidateMarkets as a sample floor only. "
      + "No fixed final N, fixed capture horizon, or sequential-testing correction is declared. "
      + "Optional-stopping risk is a methodological concern for future interpretation; "
      + "this does not invalidate the sealed governed artifact.",
  };
}

export function assessLoroInformativeness(input: {
  selectedRunIds: readonly string[];
  candidateCountByRun: ReadonlyMap<string, number>;
  frozenMinimumCandidateCount: number;
}): LoroAssessment {
  const selectedRunCount = input.selectedRunIds.length;
  const contributing = [...input.candidateCountByRun.entries()].filter(([, count]) => count > 0);
  const candidateContributingRunCount = contributing.length;
  const foldSizes: number[] = [];

  if (candidateContributingRunCount >= 2) {
    const total = contributing.reduce((sum, [, count]) => sum + count, 0);
    for (const [, count] of contributing) {
      foldSizes.push(total - count);
    }
  }

  const minimumCandidatesInLeaveOneOutFold =
    foldSizes.length > 0 ? Math.min(...foldSizes) : null;
  const maximumCandidatesInLeaveOneOutFold =
    foldSizes.length > 0 ? Math.max(...foldSizes) : null;

  if (candidateContributingRunCount < 2) {
    return {
      loroCurrentlyInformative: false,
      selectedRunCount,
      candidateContributingRunCount,
      minimumCandidatesInLeaveOneOutFold,
      maximumCandidatesInLeaveOneOutFold,
      frozenMinimumCandidateCount: input.frozenMinimumCandidateCount,
      reason:
        "Fewer than two candidate-contributing runs; leave-one-run-out folds are not defined.",
    };
  }

  if (
    minimumCandidatesInLeaveOneOutFold !== null
    && minimumCandidatesInLeaveOneOutFold < input.frozenMinimumCandidateCount
  ) {
    return {
      loroCurrentlyInformative: false,
      selectedRunCount,
      candidateContributingRunCount,
      minimumCandidatesInLeaveOneOutFold,
      maximumCandidatesInLeaveOneOutFold,
      frozenMinimumCandidateCount: input.frozenMinimumCandidateCount,
      reason:
        "leave-one-run-out folds would be below the frozen minimum candidate count",
    };
  }

  return {
    loroCurrentlyInformative: true,
    selectedRunCount,
    candidateContributingRunCount,
    minimumCandidatesInLeaveOneOutFold,
    maximumCandidatesInLeaveOneOutFold,
    frozenMinimumCandidateCount: input.frozenMinimumCandidateCount,
    reason:
      "Leave-one-run-out folds meet the frozen minimum candidate count, but folds are not "
      + "independent replications and LORO is not implemented in this audit.",
  };
}

export function buildHistoricalLineageContext(input: {
  observationCount: number;
  uniqueTradingDays: number;
  passes: boolean;
  robustnessScore: number;
  role: string;
  notes: readonly string[];
  limitations: readonly string[];
}): HistoricalLineageContext {
  return {
    observationCount: input.observationCount,
    uniqueTradingDays: input.uniqueTradingDays,
    passes: input.passes,
    robustnessScore: input.robustnessScore,
    role: input.role,
    limitations: [...input.notes, ...input.limitations],
    distinction:
      "historicalCandidateLineage is exploratory discovery context only. "
      + "It is not prospective confirmatory evidence and must not be pooled with "
      + "the sealed forward result when interpreting the governed verdict.",
  };
}

export function buildMethodologyWarnings(input: {
  candidateMarketCount: number;
  inconclusiveBandReachable: boolean;
  stoppingRule: StoppingRuleAssessment;
  loro: LoroAssessment;
  probabilityOfReject: number;
  candidateContributingRunCount: number;
}): readonly string[] {
  const warnings: string[] = [];
  warnings.push(
    "Do not apply a new FDR correction retroactively to this frozen v2 prospective result. "
      + "Existing Benjamini–Hochberg / Benjamini–Yekutieli machinery in overfittingDiagnostics "
      + "and oosPowerCorrection should be applied in a future discovery/promotion pipeline "
      + "before preregistration of the next family, not after sealing confirmatory outcomes.",
  );
  if (input.candidateMarketCount < 30) {
    warnings.push(
      `Prospective n=${input.candidateMarketCount} is small; exact Poisson-binomial null `
        + "probabilities dominate asymptotic approximations for inferential weight.",
    );
  }
  if (!input.inconclusiveBandReachable) {
    warnings.push(
      "The frozen inconclusive band is unreachable at the current n and implied probabilities; "
        + "the classifier can only land in reject or support-calibration under binary settlements.",
    );
  }
  if (input.stoppingRule.optionalStoppingRiskFlag) {
    warnings.push(
      `Stopping-rule status is ${input.stoppingRule.stoppingRuleStatus}; optional-stopping risk `
        + "should be addressed in the next preregistration contract.",
    );
  }
  if (!input.loro.loroCurrentlyInformative) {
    warnings.push(`LORO assessment: ${input.loro.reason}`);
  }
  if (input.candidateContributingRunCount <= 2) {
    warnings.push(
      `Only ${input.candidateContributingRunCount} candidate-contributing run(s); `
        + "do not claim run-level independence or inflated effective sample size.",
    );
  }
  if (input.probabilityOfReject > 0.4 && input.probabilityOfReject < 0.6) {
    warnings.push(
      "Under the calibrated null, reject vs support-calibration probabilities are near a coin flip "
        + "at current n; the governed reject should not be treated as strong scientific evidence.",
    );
  }
  return warnings;
}

export function recommendResearchAction(input: {
  candidateMarketCount: number;
  frozenMinimum: number;
  settlementCoverageShare: number | null;
  minRequiredNAmongPowerRows: number | null;
  stoppingRule: StoppingRuleAssessment;
}): RecommendedResearchAction {
  if (
    input.settlementCoverageShare !== null
    && Number.isFinite(input.settlementCoverageShare)
    && input.settlementCoverageShare < 1
  ) {
    return "backfill-settlements-before-strength-interpretation";
  }
  if (input.stoppingRule.optionalStoppingRiskFlag) {
    return "repair-prospective-evidence-contract-before-next-family";
  }
  if (
    input.minRequiredNAmongPowerRows !== null
    && input.candidateMarketCount >= input.minRequiredNAmongPowerRows
    && input.candidateMarketCount >= input.frozenMinimum
  ) {
    return "adequately-powered-result";
  }
  return "increase-prospective-evidence-before-economic-interpretation";
}
