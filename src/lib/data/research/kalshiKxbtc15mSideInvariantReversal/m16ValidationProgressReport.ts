/**
 * M16.2 operator progress text — structural counts only, no economics.
 */
import {
  M16_COLLECTION_COMPLETE_SEALED_MESSAGE,
  type M16ValidationProgress,
} from "./m16ValidationCohortTypes";

/**
 * Format operator-facing progress (§22).
 * Never includes P&L, target/stop, win-rate, or profitability language.
 */
export function formatOperatorProgressText(progress: M16ValidationProgress): string {
  const lines = [
    "M16.2 prospective validation collection — blind progress",
    `protocol: ${progress.protocolVersion}`,
    `scientificProtocolIdentity: ${progress.authority.scientificProtocolIdentity}`,
    `registryIdentity: ${progress.registryIdentity}`,
    `physicalAttempts: ${progress.physicalAttempts}`,
    `acceptedSegments: ${progress.acceptedSegments}`,
    `failedExcludedAttempts: ${progress.failedExcludedAttempts}`,
    `acceptedHours: ${progress.acceptedHours} / ${progress.maxAcceptedHours}`,
    `eligibleTrades: ${progress.eligibleTradeCount} / ${progress.requiredTradeN}`
      + ` (remaining ${progress.remainingTradeCount})`,
    `utcDayClusters: ${progress.distinctEligibleUtcDayClusters} / `
      + `${progress.minimumUtcDayClusters}`
      + ` (remaining ${progress.remainingUtcDayClusterCount})`,
    `disposition: ${progress.disposition}`,
    `rationale: ${progress.dispositionRationale}`,
    "outcomesOpened: false",
    "economicPeeking: sealed",
  ];
  if (progress.disposition === "ready-for-outcome-open") {
    lines.push(M16_COLLECTION_COMPLETE_SEALED_MESSAGE);
  }
  return `${lines.join("\n")}\n`;
}
