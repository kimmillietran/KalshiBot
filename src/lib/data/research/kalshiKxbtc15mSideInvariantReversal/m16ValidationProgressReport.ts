/**
 * M16.2 operator progress text — structural counts only, no economics.
 */
import {
  M16_COLLECTION_COMPLETE_SEALED_MESSAGE,
  type M16ValidationProgress,
} from "./m16ValidationCohortTypes";
import {
  M16_FIXED_UTC_WINDOW_END_HHMM,
  M16_FIXED_UTC_WINDOW_START_HHMM,
} from "./m16ProspectiveCohortPlan";

/**
 * Format operator-facing progress (§19 / M16.2a).
 * Never includes P&L, target/stop, win-rate, or profitability language.
 */
export function formatOperatorProgressText(
  progress: M16ValidationProgress,
  opts?: { schedulerEnabled?: boolean },
): string {
  const scheduler =
    opts?.schedulerEnabled === true
      ? "ENABLED"
      : opts?.schedulerEnabled === false
        ? "DISABLED"
        : "UNKNOWN";
  const lines = [
    "M16 prospective validation",
    "",
    "Protocol:",
    progress.authority.scientificProtocolIdentity,
    "",
    "Window:",
    `${M16_FIXED_UTC_WINDOW_START_HHMM}–${M16_FIXED_UTC_WINDOW_END_HHMM} UTC`,
    "",
    "Scheduler:",
    scheduler,
    "",
    "Accepted hours:",
    `${progress.acceptedHours} / ${progress.maxAcceptedHours}`,
    "",
    "Eligible reversals:",
    `${progress.eligibleTradeCount} / ${progress.requiredTradeN}`,
    "",
    "Eligible UTC-day clusters:",
    `${progress.distinctEligibleUtcDayClusters} / ${progress.minimumUtcDayClusters}`,
    "",
    "Disposition:",
    progress.disposition,
    "",
    "Outcomes:",
    "SEALED",
    "",
    "No economics.",
  ];
  if (progress.disposition === "ready-for-outcome-open") {
    lines.push("", M16_COLLECTION_COMPLETE_SEALED_MESSAGE);
  }
  return `${lines.join("\n")}\n`;
}
