import {
  isTerminalCaptureRunState,
  type CaptureRunStatusArtifact,
} from "./captureRunStatus";

/**
 * Integrity classification for the run's capture-run-status.json:
 * - "absent": no status file exists (legacy pre-M12.1E run);
 * - "valid": present, strictly parsed, identity matches the directory;
 * - "invalid": present but unparseable or schema-invalid;
 * - "identity-mismatched": present and parseable but its runId does not
 *   match the directory name.
 *
 * Only truly absent status files may use the legacy capture-health fallback.
 * Present-but-invalid or mismatched status files fail closed.
 */
export type CaptureRunStatusIntegrity =
  | "absent"
  | "valid"
  | "invalid"
  | "identity-mismatched";

export type CaptureRunSelectionEntry = {
  /** Absolute or root-relative path to the run directory. */
  runDir: string;
  /** Directory name (run id). */
  runId: string;
  /** Strictly parsed capture-run-status.json; non-null only when integrity is "valid". */
  status: CaptureRunStatusArtifact | null;
  statusIntegrity: CaptureRunStatusIntegrity;
  /** Whether capture-health.json exists in the run directory. */
  hasCaptureHealth: boolean;
  /**
   * Stable completion time used for "newest run" selection: validated
   * status.endedAt, else the run-id timestamp, else the legacy health
   * artifact timestamp. Never the mutable directory modification time,
   * which changes whenever an audit or reconciliation artifact is added.
   */
  completedAtMs: number | null;
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

const RUN_ID_TIMESTAMP_PATTERN =
  /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/;

/** Parses the completion-stable timestamp embedded in generated run ids. */
export function parseRunIdTimestampMs(runId: string): number | null {
  const match = RUN_ID_TIMESTAMP_PATTERN.exec(runId);
  if (!match) {
    return null;
  }
  const parsed = Date.parse(
    `${match[1]}T${match[2]}:${match[3]}:${match[4]}.${match[5]}Z`,
  );
  return Number.isFinite(parsed) ? parsed : null;
}

function describeState(
  entry: CaptureRunSelectionEntry,
): CaptureRunStatusArtifact["state"] | "legacy-no-status" | "invalid-status" | "mismatched-status" {
  if (entry.statusIntegrity === "invalid") {
    return "invalid-status";
  }
  if (entry.statusIntegrity === "identity-mismatched") {
    return "mismatched-status";
  }
  return entry.status ? entry.status.state : "legacy-no-status";
}

/**
 * Selects a capture run that is safe to audit.
 *
 * Default selection picks the completed run with the newest stable completion
 * time (status endedAt) — never an active/finalizing run, never a run whose
 * status file is present but invalid or identity-mismatched, and never merely
 * the most recently modified directory. Failed or user-cancelled runs are
 * selectable only via an explicit runDir request. Runs that predate
 * run-status markers (legacy) are auditable only when a published
 * capture-health.json exists.
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
    if (entry.statusIntegrity === "invalid") {
      return {
        outcome: "rejected",
        reason:
          `Run ${entry.runId} has a capture-run-status.json that exists but cannot be `
          + "validated; a corrupt status marker fails closed and cannot fall back to legacy auditing.",
      };
    }
    if (entry.statusIntegrity === "identity-mismatched") {
      return {
        outcome: "rejected",
        reason:
          `Run ${entry.runId} has a capture-run-status.json whose runId does not match `
          + "the run directory; a mismatched status marker fails closed.",
      };
    }
    if (entry.status && !isTerminalCaptureRunState(entry.status.state)) {
      return {
        outcome: "rejected",
        reason: `Run ${entry.runId} is ${entry.status.state}; auditing a non-terminal run is not allowed.`,
      };
    }
    if (entry.status?.state === "completed" && !entry.hasCaptureHealth) {
      return {
        outcome: "rejected",
        reason:
          `Run ${entry.runId} is marked completed but has no capture-health.json; `
          + "the artifacts are inconsistent and cannot be audited safely.",
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
      runState: entry.status ? entry.status.state : "legacy-no-status",
      legacy: entry.status === null,
      warnings,
    };
  }

  if (input.entries.length === 0) {
    return { outcome: "no-auditable-run", reason: "No capture runs found." };
  }

  const newestFirst = [...input.entries].sort(
    (a, b) =>
      (b.completedAtMs ?? Number.NEGATIVE_INFINITY)
      - (a.completedAtMs ?? Number.NEGATIVE_INFINITY),
  );

  const completed = newestFirst.find(
    (entry) =>
      entry.statusIntegrity === "valid"
      && entry.status?.state === "completed"
      && entry.hasCaptureHealth,
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
    (entry) => entry.statusIntegrity === "absent" && entry.hasCaptureHealth,
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
