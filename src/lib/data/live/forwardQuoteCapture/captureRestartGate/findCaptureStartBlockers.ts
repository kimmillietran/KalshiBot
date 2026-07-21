import type { CaptureRunSelectionEntry } from "../selectAuditableCaptureRun";

export type CaptureStartBlockerReason =
  | "active"
  | "finalizing"
  | "invalid-status"
  | "identity-mismatched-status";

export type CaptureStartBlocker = {
  runId: string;
  runDir: string;
  reason: CaptureStartBlockerReason;
};

/**
 * Finds capture runs that block starting a new capture. This fails closed:
 *
 * - a strictly valid active/finalizing status means a capture is running;
 * - a present-but-invalid or identity-mismatched status means the process
 *   state is UNKNOWN, not terminal, so starting a new capture is unsafe
 *   until the operator reconciles the directory.
 *
 * Only truly absent status files (legacy pre-status runs) and verified
 * terminal states are non-blocking.
 */
export function findCaptureStartBlockers(
  entries: readonly CaptureRunSelectionEntry[],
): CaptureStartBlocker[] {
  const blockers: CaptureStartBlocker[] = [];
  for (const entry of entries) {
    if (entry.statusIntegrity === "invalid") {
      blockers.push({
        runId: entry.runId,
        runDir: entry.runDir,
        reason: "invalid-status",
      });
      continue;
    }
    if (entry.statusIntegrity === "identity-mismatched") {
      blockers.push({
        runId: entry.runId,
        runDir: entry.runDir,
        reason: "identity-mismatched-status",
      });
      continue;
    }
    if (
      entry.statusIntegrity === "valid"
      && entry.status !== null
      && (entry.status.state === "active" || entry.status.state === "finalizing")
    ) {
      blockers.push({
        runId: entry.runId,
        runDir: entry.runDir,
        reason: entry.status.state,
      });
    }
  }
  return blockers;
}
