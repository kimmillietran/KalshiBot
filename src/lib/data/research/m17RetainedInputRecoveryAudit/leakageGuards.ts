/**
 * Leakage proofs for retained-input recovery: pre-entry features must not
 * consume official settlement outcomes or post-close fields.
 */

export type RecoveryFeatureSource = {
  usedExpirationValue: boolean;
  usedOfficialResult: boolean;
  usedPostCloseMessage: boolean;
  usedCompletedSettlementAverage: boolean;
  entryTimestampMs: number;
  closeTimeMs: number | null;
};

export type RecoveryLeakageReason =
  | "expiration-value-in-pre-entry-feature"
  | "official-result-in-pre-entry-feature"
  | "post-close-message-in-pre-entry-feature"
  | "completed-settlement-average-in-pre-entry-feature"
  | "feature-timestamp-at-or-after-close";

export type RecoveryLeakageResult =
  | { ok: true }
  | { ok: false; reasons: RecoveryLeakageReason[] };

export function assertRecoveryFeaturesArePreEntryOnly(
  source: RecoveryFeatureSource,
): RecoveryLeakageResult {
  const reasons: RecoveryLeakageReason[] = [];
  if (source.usedExpirationValue) {
    reasons.push("expiration-value-in-pre-entry-feature");
  }
  if (source.usedOfficialResult) {
    reasons.push("official-result-in-pre-entry-feature");
  }
  if (source.usedPostCloseMessage) {
    reasons.push("post-close-message-in-pre-entry-feature");
  }
  if (source.usedCompletedSettlementAverage) {
    reasons.push("completed-settlement-average-in-pre-entry-feature");
  }
  if (
    source.closeTimeMs != null
    && Number.isFinite(source.closeTimeMs)
    && Number.isFinite(source.entryTimestampMs)
    && source.entryTimestampMs >= source.closeTimeMs
  ) {
    reasons.push("feature-timestamp-at-or-after-close");
  }
  return reasons.length === 0 ? { ok: true } : { ok: false, reasons };
}

/** Explicit: never synthesize BRTI from settlement labels. */
export function isUnsafeToDeriveBrtiFromSettlementLabel(): true {
  return true;
}
