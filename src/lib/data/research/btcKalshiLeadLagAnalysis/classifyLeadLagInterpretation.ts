import type {
  BtcKalshiLeadLagAnalysisSummary,
  BtcKalshiLeadLagSelectedRunQuality,
  LeadLagInterpretationClassification,
  LeadLagRecommendedNextAction,
} from "./btcKalshiLeadLagAnalysisTypes";

export function classifyLeadLagInterpretation(input: {
  eligibleTriggerCount: number;
  triggerCount: number;
  excludedTriggerCount: number;
  minimumTriggersForClassification: number;
  minimumEligibleTriggersForStrongClassification: number;
  selectedRunQuality: BtcKalshiLeadLagSelectedRunQuality;
  directionalResponseShare: number | null;
  consistentDirectionAcrossBins: boolean;
  executableSideVisible: boolean;
  thresholdCrossingEventShare: number | null;
  medianSignedResponseAt5Seconds: number | null;
}): BtcKalshiLeadLagAnalysisSummary {
  const triggerCount = input.triggerCount;
  const eligibleTriggerCount = input.eligibleTriggerCount;
  const excludedTriggerCount = input.excludedTriggerCount;

  if (triggerCount < input.minimumTriggersForClassification) {
    return buildSummary(
      "insufficient-data",
      "collect-additional-clean-captures",
      "Usable BTC trigger count is below the minimum required for lead-lag characterization.",
      triggerCount,
      eligibleTriggerCount,
      excludedTriggerCount,
      input.thresholdCrossingEventShare,
    );
  }

  const observationQualityWeak =
    (input.selectedRunQuality.validBookShare !== null
      && input.selectedRunQuality.validBookShare < 0.9)
    || (input.selectedRunQuality.btcJoinCoverageShare !== null
      && input.selectedRunQuality.btcJoinCoverageShare < 0.9)
    || (input.selectedRunQuality.bidSizeCoverageShare !== null
      && input.selectedRunQuality.bidSizeCoverageShare < 0.9);

  if (observationQualityWeak) {
    return buildSummary(
      "observation-quality-inconclusive",
      "fix-observation-integrity",
      "Selected-run quality metrics indicate the capture may not support reliable lead-lag diagnostics.",
      triggerCount,
      eligibleTriggerCount,
      excludedTriggerCount,
      input.thresholdCrossingEventShare,
    );
  }

  if (
    input.thresholdCrossingEventShare !== null
    && input.thresholdCrossingEventShare >= 0.8
    && (input.directionalResponseShare === null || input.directionalResponseShare < 0.55)
  ) {
    return buildSummary(
      "threshold-crossing-only-response",
      "separate-threshold-crossing-hypothesis",
      "Most apparent Kalshi movement appears concentrated around BTC threshold crossings rather than non-crossing impulses.",
      triggerCount,
      eligibleTriggerCount,
      excludedTriggerCount,
      input.thresholdCrossingEventShare,
    );
  }

  if (
    input.directionalResponseShare === null
    || input.directionalResponseShare < 0.52
    || (input.medianSignedResponseAt5Seconds !== null
      && Math.abs(input.medianSignedResponseAt5Seconds) < 0.25)
  ) {
    return buildSummary(
      "no-directional-response",
      "deprioritize-btc-lead-lag-family",
      "Directional Kalshi response to BTC impulses is near random or negligible in magnitude.",
      triggerCount,
      eligibleTriggerCount,
      excludedTriggerCount,
      input.thresholdCrossingEventShare,
    );
  }

  if (
    !input.consistentDirectionAcrossBins
    || input.directionalResponseShare < 0.58
    || eligibleTriggerCount < input.minimumEligibleTriggersForStrongClassification
  ) {
    return buildSummary(
      "weak-or-inconsistent-response",
      "continue-frozen-characterization",
      "Some directional response exists but is unstable across predeclared bins or lag windows.",
      triggerCount,
      eligibleTriggerCount,
      excludedTriggerCount,
      input.thresholdCrossingEventShare,
    );
  }

  if (
    input.directionalResponseShare >= 0.65
    && input.consistentDirectionAcrossBins
    && input.executableSideVisible
    && eligibleTriggerCount >= input.minimumEligibleTriggersForStrongClassification
  ) {
    return buildSummary(
      "strong-lead-lag-candidate",
      "build-executable-lead-lag-candidate-dataset",
      "Directional Kalshi response is consistently delayed, visible on executable-side quotes, and sufficiently frequent.",
      triggerCount,
      eligibleTriggerCount,
      excludedTriggerCount,
      input.thresholdCrossingEventShare,
    );
  }

  return buildSummary(
    "measurable-lead-lag-response",
    "build-frozen-lead-lag-entry-rule",
    "Directional Kalshi response is consistently measurable across multiple predeclared bins and lag windows.",
    triggerCount,
    eligibleTriggerCount,
    excludedTriggerCount,
    input.thresholdCrossingEventShare,
  );
}

function buildSummary(
  interpretationClassification: LeadLagInterpretationClassification,
  recommendedNextAction: LeadLagRecommendedNextAction,
  classificationRationale: string,
  triggerCount: number,
  eligibleTriggerCount: number,
  excludedTriggerCount: number,
  thresholdCrossingEventShare: number | null,
): BtcKalshiLeadLagAnalysisSummary {
  return {
    interpretationClassification,
    recommendedNextAction,
    classificationRationale,
    triggerCount,
    eligibleTriggerCount,
    excludedTriggerCount,
    thresholdCrossingEventShare,
    nonThresholdCrossingEventShare:
      thresholdCrossingEventShare === null ? null : 1 - thresholdCrossingEventShare,
  };
}
