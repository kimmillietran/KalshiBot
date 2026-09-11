import { MomentumEvidenceContractError } from "./momentumEvidenceContractTypes";

/**
 * Frozen before outcome access:
 * median signed gross executable one-contract P&L > 0
 * for continuation consistency. Zero is not positive. Mean cannot replace median post hoc.
 */
export function buildMomentumDirectionConsistencyRule(): {
  rule: "median-signed-gross-executable-pnl-cents-strictly-greater-than-zero";
  boundBeforeOutcomeAccess: true;
  zeroIsNotConsistent: true;
  meanCannotReplaceMedian: true;
  statistic: "median";
  primaryEstimandReferenced: "signed-one-contract-executable-horizon-pnl-cents-gross";
} {
  return {
    rule: "median-signed-gross-executable-pnl-cents-strictly-greater-than-zero",
    boundBeforeOutcomeAccess: true,
    zeroIsNotConsistent: true,
    meanCannotReplaceMedian: true,
    statistic: "median",
    primaryEstimandReferenced: "signed-one-contract-executable-horizon-pnl-cents-gross",
  };
}

export function classifyContinuationDirectionConsistency(
  medianSignedGrossExecutablePnlCents: number | null,
): "continuation-consistent" | "not-continuation-consistent" | "undefined" {
  if (medianSignedGrossExecutablePnlCents == null || !Number.isFinite(medianSignedGrossExecutablePnlCents)) {
    return "undefined";
  }
  if (medianSignedGrossExecutablePnlCents > 0) {
    return "continuation-consistent";
  }
  return "not-continuation-consistent";
}

export function assertMeanCannotReplaceMedianPostHoc(attemptedStatistic: string): void {
  if (attemptedStatistic !== "median") {
    throw new MomentumEvidenceContractError(
      `Direction-consistency statistic is frozen as median; cannot replace with ${attemptedStatistic}.`,
    );
  }
}
