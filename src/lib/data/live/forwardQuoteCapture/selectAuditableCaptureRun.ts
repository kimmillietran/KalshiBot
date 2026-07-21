import {
  isTerminalCaptureRunState,
  type CaptureRunStatusArtifact,
} from "./captureRunStatus";

export type CaptureRunSelectionEntry = {
  /** Absolute or root-relative path to the run directory. */
  runDir: string;
  /** Directory name (run id). */
  runId: string;
  /** Parsed capture-run-status.json, or null when absent/unparseable (legacy run). */
  status: CaptureRunStatusArtifact | null;
  /** Whether capture-health.json exists in the run directory. */
  hasCaptureHealth: boolean;
  lastModifiedMs: number;
};

export type SelectAuditableCaptureRunResult =
  | {
    outcome: "selected";
    runDir: string;
    runId: string;
    runState: CaptureRunStatusArtifact["state"] | "legacy-no-status";
    /** True when the run predates run-status markers (selected via capture-health.json). */
    legacy: boolean;
    warnings: string[];
  }
  | { outcome: "rejected"; reason: string }
  | { outcome: "no-auditable-run"; reason: string };

function describeState(
  entry: CaptureRunSelectionEntry,
): CaptureRunStatusArtifact["state"] | "legacy-no-status" {
  return entry.status ? entry.status.state : "legacy-no-status";
}

/**
 * Selects a capture run that is safe to audit.
 *
 * Default selection picks the newest run whose status marker is terminally
 * "completed" — never an active/finalizing run and never merely the most
 * recently modified directory. Failed or user-cancelled runs are selectable
 * only via an explicit runDir request. Runs that predate run-status markers
 * (legacy) are auditable only when a published capture-health.json exists.
 */
export function selectAuditableCaptureRun(input: {
  entries: readonly CaptureRunSelectionEntry[];
  explicitRunDir?: string;
}): SelectAuditableCaptureRunResult {
  if (input.explicitRunDir) {
    const normalized = input.explicitRunDir.replaceAll("\\", "/").replace(/\/+$/, "");
    const entry = input.entries.find(
      (candidate) =>
        candidate.runDir.replaceAll("\\", "/").replace(/\/+$/, "") === normalized
        || candidate.runId === input.explicitRunDir,
    );
    if (!entry) {
      return {
        outcome: "rejected",
        reason: `Requested run directory not found: ${input.explicitRunDir}`,
      };
    }
    if (entry.status && !isTerminalCaptureRunState(entry.status.state)) {
      return {
        outcome: "rejected",
        reason: `Run ${entry.runId} is ${entry.status.state}; auditing a non-terminal run is not allowed.`,
      };
    }
    if (!entry.status && !entry.hasCaptureHealth) {
      return {
        outcome: "rejected",
        reason: `Run ${entry.runId} has no run-status marker and no capture-health.json; it cannot be audited safely.`,
      };
    }
    const warnings: string[] = [];
    if (entry.status && entry.status.state !== "completed") {
      warnings.push(
        `Run ${entry.runId} terminated as ${entry.status.state}; auditing it because it was explicitly requested.`,
      );
    }
    if (!entry.status) {
      warnings.push(
        `Run ${entry.runId} predates run-status markers; selected via published capture-health.json.`,
      );
    }
    return {
      outcome: "selected",
      runDir: entry.runDir,
      runId: entry.runId,
      runState: describeState(entry),
      legacy: entry.status === null,
      warnings,
    };
  }

  if (input.entries.length === 0) {
    return { outcome: "no-auditable-run", reason: "No capture runs found." };
  }

  const newestFirst = [...input.entries].sort(
    (a, b) => b.lastModifiedMs - a.lastModifiedMs,
  );

  const completed = newestFirst.find(
    (entry) => entry.status?.state === "completed",
  );
  if (completed) {
    return {
      outcome: "selected",
      runDir: completed.runDir,
      runId: completed.runId,
      runState: "completed",
      legacy: false,
      warnings: [],
    };
  }

  const legacyWithHealth = newestFirst.find(
    (entry) => entry.status === null && entry.hasCaptureHealth,
  );
  if (legacyWithHealth) {
    return {
      outcome: "selected",
      runDir: legacyWithHealth.runDir,
      runId: legacyWithHealth.runId,
      runState: "legacy-no-status",
      legacy: true,
      warnings: [
        `Run ${legacyWithHealth.runId} predates run-status markers; selected via published capture-health.json.`,
      ],
    };
  }

  const states = newestFirst
    .map((entry) => `${entry.runId}=${describeState(entry)}`)
    .join(", ");
  return {
    outcome: "no-auditable-run",
    reason:
      `No terminally completed capture run found (states: ${states}). `
      + "Pass an explicit -RunDir to audit a failed or user-cancelled run.",
  };
}
