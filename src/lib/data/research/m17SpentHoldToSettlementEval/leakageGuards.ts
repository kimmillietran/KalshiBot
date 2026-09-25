/**
 * Leakage guards for M17 exploratory evaluation.
 * Pre-entry decisions must not consume post-settlement labels or post-close fields.
 */

export type LeakageRejectionReason =
  | "expiration-value-used-as-pre-entry-input"
  | "post-close-message-used-pre-entry"
  | "completed-settlement-used-to-build-pre-entry-estimate"
  | "ambiguous-market-identity"
  | "ambiguous-timestamp"
  | "entry-after-close";

export type LeakageCheckInput = {
  marketTicker: string;
  entryTimestampMs: number;
  closeTimeMs: number | null;
  /**
   * True when the caller attempted to feed official expiration_value into the
   * pre-entry settlement-state / decision feature vector.
   */
  usedExpirationValueAsPreEntryInput: boolean;
  /** True when any message with local/provider time after close was used pre-entry. */
  usedPostCloseMessagePreEntry: boolean;
  /**
   * True when completed-window settlement averages / official result were used
   * to construct a pre-entry estimate.
   */
  usedCompletedSettlementToBuildPreEntryEstimate: boolean;
};

export type LeakageCheckResult =
  | { ok: true }
  | { ok: false; reasons: LeakageRejectionReason[] };

export function assertNoSettlementLabelLeakage(
  input: LeakageCheckInput,
): LeakageCheckResult {
  const reasons: LeakageRejectionReason[] = [];

  if (!input.marketTicker || input.marketTicker.trim().length === 0) {
    reasons.push("ambiguous-market-identity");
  }
  if (!Number.isFinite(input.entryTimestampMs)) {
    reasons.push("ambiguous-timestamp");
  }
  if (input.usedExpirationValueAsPreEntryInput) {
    reasons.push("expiration-value-used-as-pre-entry-input");
  }
  if (input.usedPostCloseMessagePreEntry) {
    reasons.push("post-close-message-used-pre-entry");
  }
  if (input.usedCompletedSettlementToBuildPreEntryEstimate) {
    reasons.push("completed-settlement-used-to-build-pre-entry-estimate");
  }
  if (
    input.closeTimeMs != null
    && Number.isFinite(input.closeTimeMs)
    && Number.isFinite(input.entryTimestampMs)
    && input.entryTimestampMs >= input.closeTimeMs
  ) {
    reasons.push("entry-after-close");
  }

  return reasons.length === 0 ? { ok: true } : { ok: false, reasons };
}

export const M17_LEAKAGE_CONTROL_STATEMENTS = [
  "Use only information available at or before entryTimestampMs.",
  "Do not use expiration_value as a pre-entry input.",
  "Do not use post-close messages for pre-entry features.",
  "Do not use completed settlement data to construct a pre-entry estimate.",
  "Reject ambiguous market identity or timestamp joins.",
  "Exclude known incomplete ticker and non-numeric expiration outcomes.",
  "Official settlement is outcome-label / post-entry evaluation only.",
] as const;
