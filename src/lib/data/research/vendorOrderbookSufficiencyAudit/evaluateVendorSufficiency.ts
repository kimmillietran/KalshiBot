import type {
  VendorOrderbookAuditThresholds,
  VendorOrderbookSourceMetadata,
  VendorSampleAudit,
  VendorSufficiencyAssessment,
  VendorSufficiencyVerdict,
} from "./vendorOrderbookSufficiencyAuditTypes";
import {
  sampleHasKxbtc15mCoverage,
  sampleHasKxbtcdCoverage,
} from "./auditVendorSample";

function hasExecutableBook(audit: VendorSampleAudit): boolean {
  return (
    (audit.hasYesBids && audit.hasYesAsks)
    || (audit.hasNoBids && audit.hasNoAsks)
    || (audit.hasYesBids && audit.hasNoAsks)
    || (audit.hasYesAsks && audit.hasNoBids)
  );
}

function evaluateKxbtc15mLeadLag(
  audit: VendorSampleAudit | null,
  thresholds: VendorOrderbookAuditThresholds,
): VendorSufficiencyVerdict {
  if (!audit || audit.sampleStatus === "missing-samples") {
    return "unknown-no-sample";
  }

  if (audit.sampleStatus !== "present") {
    return "unknown-no-sample";
  }

  if (!sampleHasKxbtc15mCoverage(audit)) {
    return "insufficient-no-kxbtc15m";
  }

  if (!audit.hasSizes) {
    return "insufficient-no-sizes";
  }

  if (
    audit.nonZeroSpreadShare !== null
    && audit.nonZeroSpreadShare < thresholds.nonZeroSpreadShareMin
  ) {
    return "insufficient-zero-spread";
  }

  if (
    audit.medianSnapshotGapMs !== null
    && audit.medianSnapshotGapMs > thresholds.medianSnapshotGapMsMax
  ) {
    return "insufficient-sparse-snapshots";
  }

  if (
    audit.p90SnapshotGapMs !== null
    && audit.p90SnapshotGapMs > thresholds.p90SnapshotGapMsMax
  ) {
    return "insufficient-sparse-snapshots";
  }

  if (!hasExecutableBook(audit)) {
    return "insufficient-zero-spread";
  }

  if (audit.distinctMarkets < thresholds.minDistinctMarkets) {
    return "promising-needs-more-sample";
  }

  if (audit.rowCount < 10) {
    return "promising-needs-more-sample";
  }

  return "sufficient";
}

function evaluateKxbtc15mParity(
  audit: VendorSampleAudit | null,
  thresholds: VendorOrderbookAuditThresholds,
): VendorSufficiencyVerdict {
  if (!audit || audit.sampleStatus === "missing-samples") {
    return "unknown-no-sample";
  }

  if (audit.sampleStatus !== "present") {
    return "unknown-no-sample";
  }

  if (!sampleHasKxbtc15mCoverage(audit)) {
    return "insufficient-no-kxbtc15m";
  }

  if (!hasExecutableBook(audit) || !audit.hasSizes) {
    return "insufficient-no-sizes";
  }

  if (
    audit.nonZeroSpreadShare !== null
    && audit.nonZeroSpreadShare < thresholds.nonZeroSpreadShareMin
  ) {
    return "insufficient-zero-spread";
  }

  if (audit.earliestTimestamp === null) {
    return "promising-needs-more-sample";
  }

  return evaluateKxbtc15mLeadLag(audit, thresholds);
}

function evaluateKxbtc15mLadder(audit: VendorSampleAudit | null): VendorSufficiencyVerdict {
  if (!audit || audit.sampleStatus === "missing-samples") {
    return "product-blocked-no-ladder";
  }

  if (!sampleHasKxbtc15mCoverage(audit)) {
    return "product-blocked-no-ladder";
  }

  if (audit.eventsWith2PlusStrikes === 0) {
    return "product-blocked-no-ladder";
  }

  if (audit.maxStrikesPerEvent < 2) {
    return "product-blocked-no-ladder";
  }

  return "promising-needs-more-sample";
}

function evaluateKxbtcdLadder(
  audit: VendorSampleAudit | null,
  thresholds: VendorOrderbookAuditThresholds,
): VendorSufficiencyVerdict {
  if (!audit || audit.sampleStatus === "missing-samples") {
    return "unknown-no-sample";
  }

  if (audit.sampleStatus !== "present") {
    return "unknown-no-sample";
  }

  if (!sampleHasKxbtcdCoverage(audit)) {
    return "insufficient-no-kxbtcd";
  }

  if (audit.eventsWith2PlusStrikes === 0) {
    return "promising-needs-more-sample";
  }

  if (!audit.hasFloorStrike || !audit.hasEventTicker) {
    return "promising-needs-more-sample";
  }

  if (!hasExecutableBook(audit) || !audit.hasSizes) {
    return "insufficient-no-sizes";
  }

  if (
    audit.nonZeroSpreadShare !== null
    && audit.nonZeroSpreadShare < thresholds.nonZeroSpreadShareMin
  ) {
    return "insufficient-zero-spread";
  }

  if (audit.eventsWith2PlusStrikes > 0 && audit.maxStrikesPerEvent >= 2) {
    return audit.rowCount >= 20 ? "sufficient" : "promising-needs-more-sample";
  }

  return "promising-needs-more-sample";
}

export function evaluateVendorSufficiency(input: {
  metadata: VendorOrderbookSourceMetadata;
  sampleAudit: VendorSampleAudit | null;
  thresholds: VendorOrderbookAuditThresholds;
}): {
  sufficiency: VendorSufficiencyAssessment;
  unknowns: string[];
  blockers: string[];
  recommendation: string;
} {
  const { metadata, sampleAudit, thresholds } = input;
  const sufficiency: VendorSufficiencyAssessment = {
    kxbtc15mLeadLag: evaluateKxbtc15mLeadLag(sampleAudit, thresholds),
    kxbtc15mParity: evaluateKxbtc15mParity(sampleAudit, thresholds),
    kxbtc15mLadder: evaluateKxbtc15mLadder(sampleAudit),
    kxbtcdLadder: evaluateKxbtcdLadder(sampleAudit, thresholds),
  };

  const unknowns: string[] = [];
  const blockers: string[] = [];

  if (metadata.claimedHistoricalOrderbook === "unknown") {
    unknowns.push("claimedHistoricalOrderbook unknown");
  }
  if (metadata.claimedSemantics === "unknown") {
    unknowns.push("snapshot vs delta semantics unknown");
  }
  if (metadata.claimedDepth === "unknown") {
    unknowns.push("depth model unknown");
  }

  if (!sampleAudit || sampleAudit.sampleStatus === "missing-samples") {
    blockers.push("No vendor sample files present");
    return {
      sufficiency,
      unknowns,
      blockers,
      recommendation: "request-vendor-samples",
    };
  }

  if (sampleAudit.sampleStatus === "unsupported-sample-schema") {
    blockers.push("Sample schema unsupported or empty");
    return {
      sufficiency,
      unknowns,
      blockers,
      recommendation: "request-vendor-samples",
    };
  }

  if (sufficiency.kxbtc15mLeadLag === "sufficient") {
    return {
      sufficiency,
      unknowns,
      blockers,
      recommendation: "build-overlap-validation",
    };
  }

  if (sufficiency.kxbtc15mLeadLag === "promising-needs-more-sample") {
    return {
      sufficiency,
      unknowns,
      blockers,
      recommendation: "request-vendor-samples",
    };
  }

  if (metadata.vendorId === "official-kalshi") {
    blockers.push("Official historical data is close-only reference, not vendor backfill");
    return {
      sufficiency,
      unknowns,
      blockers,
      recommendation: "continue-own-forward-capture",
    };
  }

  if (
    sufficiency.kxbtc15mLeadLag.startsWith("insufficient")
    || sufficiency.kxbtc15mParity.startsWith("insufficient")
  ) {
    blockers.push(`Lead-lag/parity blocked: ${sufficiency.kxbtc15mLeadLag}`);
  }

  return {
    sufficiency,
    unknowns,
    blockers,
    recommendation: "request-vendor-samples",
  };
}

export function isSufficientVerdict(verdict: VendorSufficiencyVerdict): boolean {
  return verdict === "sufficient";
}

export function isPromisingVerdict(verdict: VendorSufficiencyVerdict): boolean {
  return verdict === "promising-needs-more-sample";
}
