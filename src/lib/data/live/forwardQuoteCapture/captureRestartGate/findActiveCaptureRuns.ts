import type { CaptureRunSelectionEntry } from "../selectAuditableCaptureRun";

export type ActiveCaptureRun = {
  runId: string;
  runDir: string;
  state: "active" | "finalizing";
};

/**
 * Finds capture runs whose strictly validated status marks them as still
 * active or finalizing. The smoke wrapper refuses to start while any exist,
 * so a restart smoke can never race a capture that is already writing.
 */
export function findActiveCaptureRuns(
  entries: readonly CaptureRunSelectionEntry[],
): ActiveCaptureRun[] {
  return entries
    .filter(
      (entry) =>
        entry.statusIntegrity === "valid"
        && entry.status !== null
        && (entry.status.state === "active" || entry.status.state === "finalizing"),
    )
    .map((entry) => ({
      runId: entry.runId,
      runDir: entry.runDir,
      state: entry.status!.state as "active" | "finalizing",
    }));
}
