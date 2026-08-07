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
 * 3. equivalent + featureEvaluableCount === 0
 *    → frozen-feature-not-reconstructable-from-current-capture
 *      with collect-sufficient-evaluable-forward-duration
 *      (insufficient evaluable forward duration — not exact reconstructability,
 *       not capture redesign; futureCaptureRequirements stay unemitted)
 * 4. equivalent + featureEvaluableCount > 0 + reconstructionFailureCount > 0
 *    → frozen-feature-not-reconstructable-from-current-capture
 *      with design-equivalent-forward-capture
 * 5. equivalent + featureEvaluableCount > 0 + failures === 0 + reconstructable
 *    → exactly-equivalent-and-reconstructable
 *      with resume-calibration-fade-forward-event-evaluation
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

  const { featureEvaluableCount, reconstructionFailureCount, reconstructable } =
    input.reconstructability;

  // Insufficient evaluable forward duration: non-success without claiming
  // capture redesign or exact reconstructability.
  if (featureEvaluableCount === 0) {
    return {
      verdict: "frozen-feature-not-reconstructable-from-current-capture",
      recommendedNextAction: "collect-sufficient-evaluable-forward-duration",
    };
  }

  if (reconstructionFailureCount > 0) {
    return {
      verdict: "frozen-feature-not-reconstructable-from-current-capture",
      recommendedNextAction: "design-equivalent-forward-capture",
    };
  }

  if (reconstructable && featureEvaluableCount > 0 && reconstructionFailureCount === 0) {
    return {
      verdict: "exactly-equivalent-and-reconstructable",
      recommendedNextAction: "resume-calibration-fade-forward-event-evaluation",
    };
  }

  // Defensive: equivalent with evaluable rows but inconsistent reconstructable flag.
  return {
    verdict: "frozen-feature-not-reconstructable-from-current-capture",
    recommendedNextAction: "design-equivalent-forward-capture",
  };
}
