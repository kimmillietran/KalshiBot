import type {
  CausalFeatureEquivalenceRecommendedNextAction,
  CausalFeatureEquivalenceVerdict,
  ContractComparisonResult,
  ReconstructabilityAssessment,
  ReferenceComparisonSummary,
} from "./causalFeatureEquivalenceAuditTypes";

export type ClassificationInput = {
  contractComparison: ContractComparisonResult;
  reconstructability: ReconstructabilityAssessment;
  referenceComparison: ReferenceComparisonSummary;
  /** Explicitly ignored for verdict — must not drive classification. */
  candidateMarketCount?: number;
  highVolatilityCount?: number;
  settlementCoverageShare?: number | null;
  volatilityAvailableCount?: number;
};

export type ClassificationResult = {
  verdict: CausalFeatureEquivalenceVerdict;
  recommendedNextAction: CausalFeatureEquivalenceRecommendedNextAction;
};

/**
 * Verdict precedence:
 * 1. historical-feature-definition-ambiguous
 * 2. forward-validator-semantics-mismatch
 * 3. frozen-feature-not-reconstructable-from-current-capture
 *    (only when ≥1 feature-evaluable reconstruction failure)
 * 4. exactly-equivalent-and-reconstructable
 *    (includes equivalent contracts with only structural warm-up exclusions /
 *     insufficient-evaluable-forward-duration — not a capture redesign claim)
 *
 * Candidate counts / settlements / high-vol counts do not drive verdict.
 */
export function classifyCausalFeatureEquivalence(
  input: ClassificationInput,
): ClassificationResult {
  void input.candidateMarketCount;
  void input.highVolatilityCount;
  void input.settlementCoverageShare;
  void input.volatilityAvailableCount;
  void input.referenceComparison;

  if (
    input.contractComparison.historicalEvidenceStatus === "ambiguous"
    || input.contractComparison.historicalEvidenceStatus === "insufficient"
    || input.contractComparison.hasAmbiguousMissingHistorical
  ) {
    return {
      verdict: "historical-feature-definition-ambiguous",
      recommendedNextAction: "resolve-historical-feature-definition",
    };
  }

  if (input.contractComparison.hasSemanticMismatch || !input.contractComparison.equivalent) {
    return {
      verdict: "forward-validator-semantics-mismatch",
      recommendedNextAction: "correct-forward-validator-to-frozen-semantics",
    };
  }

  // Do not claim frozen-feature-not-reconstructable unless the feature was
  // evaluable and failed. Pure warm-up / zero-evaluable runs keep the equivalent
  // verdict with a truthful reconstructability.reason.
  if (input.reconstructability.reconstructionFailureCount > 0) {
    return {
      verdict: "frozen-feature-not-reconstructable-from-current-capture",
      recommendedNextAction: "design-equivalent-forward-capture",
    };
  }

  return {
    verdict: "exactly-equivalent-and-reconstructable",
    recommendedNextAction: "resume-calibration-fade-forward-event-evaluation",
  };
}
