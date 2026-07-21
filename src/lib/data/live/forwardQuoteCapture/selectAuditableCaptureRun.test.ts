import { describe, expect, it } from "vitest";

import type { CaptureRunStatusArtifact } from "./captureRunStatus";
import {
  parseRunIdTimestampMs,
  selectAuditableCaptureRun,
  type CaptureRunSelectionEntry,
  type CaptureRunStatusIntegrity,
} from "./selectAuditableCaptureRun";

function entry(input: {
  runId: string;
  state?: CaptureRunStatusArtifact["state"];
  statusIntegrity?: CaptureRunStatusIntegrity;
  hasCaptureHealth?: boolean;
  completedAtMs?: number | null;
  endedAt?: string | null;
}): CaptureRunSelectionEntry {
  const statusIntegrity =
    input.statusIntegrity ?? (input.state ? "valid" : "absent");
  return {
    runDir: `data/live-capture/forward-quotes/${input.runId}`,
    runId: input.runId,
    status:
      input.state && statusIntegrity === "valid"
        ? {
          schemaVersion: 1,
          runId: input.runId,
          state: input.state,
          startedAt: "2026-07-21T00:00:00.000Z",
          updatedAt: "2026-07-21T00:00:00.000Z",
          endedAt:
            input.endedAt
            ?? (input.state === "active" || input.state === "finalizing"
              ? null
              : "2026-07-21T01:00:00.000Z"),
          captureEndReason: null,
          failureReason: null,
        }
        : null,
    statusIntegrity,
    hasCaptureHealth: input.hasCaptureHealth ?? true,
    completedAtMs: input.completedAtMs ?? null,
  };
}

describe("selectAuditableCaptureRun", () => {
  it("ignores active and finalizing runs and picks the newest completed run", () => {
    const result = selectAuditableCaptureRun({
      entries: [
        entry({ runId: "run-active", state: "active", completedAtMs: null }),
        entry({ runId: "run-finalizing", state: "finalizing", completedAtMs: null }),
        entry({ runId: "run-completed-new", state: "completed", completedAtMs: 200 }),
        entry({ runId: "run-completed-old", state: "completed", completedAtMs: 100 }),
      ],
    });

    expect(result).toMatchObject({
      outcome: "selected",
      runId: "run-completed-new",
      runState: "completed",
      legacy: false,
    });
  });

  it("selects by stable completion time, not by any directory modification order", () => {
    // The older run appears first (as if its directory were touched most
    // recently by an audit artifact); completion time must still win.
    const result = selectAuditableCaptureRun({
      entries: [
        entry({ runId: "run-older-but-touched", state: "completed", completedAtMs: 100 }),
        entry({ runId: "run-newest-completion", state: "completed", completedAtMs: 900 }),
      ],
    });

    expect(result).toMatchObject({
      outcome: "selected",
      runId: "run-newest-completion",
    });
  });

  it("does not select failed or user-cancelled runs by default", () => {
    const result = selectAuditableCaptureRun({
      entries: [
        entry({ runId: "run-failed", state: "failed", completedAtMs: 300, hasCaptureHealth: true }),
        entry({ runId: "run-cancelled", state: "user-cancelled", completedAtMs: 200, hasCaptureHealth: true }),
      ],
    });

    expect(result.outcome).toBe("no-auditable-run");
  });

  it("never uses the legacy fallback for a present-but-invalid status file", () => {
    const result = selectAuditableCaptureRun({
      entries: [
        entry({
          runId: "run-corrupt-status",
          statusIntegrity: "invalid",
          hasCaptureHealth: true,
          completedAtMs: 500,
        }),
      ],
    });

    expect(result.outcome).toBe("no-auditable-run");
    expect(result.outcome === "no-auditable-run" && result.reason).toContain(
      "invalid-status",
    );
  });

  it("never uses the legacy fallback for an identity-mismatched status file", () => {
    const result = selectAuditableCaptureRun({
      entries: [
        entry({
          runId: "run-mismatched",
          statusIntegrity: "identity-mismatched",
          hasCaptureHealth: true,
          completedAtMs: 500,
        }),
      ],
    });

    expect(result.outcome).toBe("no-auditable-run");
    expect(result.outcome === "no-auditable-run" && result.reason).toContain(
      "mismatched-status",
    );
  });

  it("rejects an explicit request for a run with an invalid status file", () => {
    const result = selectAuditableCaptureRun({
      entries: [
        entry({
          runId: "run-corrupt-status",
          statusIntegrity: "invalid",
          hasCaptureHealth: true,
        }),
      ],
      explicitRunDir: "run-corrupt-status",
    });

    expect(result).toMatchObject({ outcome: "rejected" });
    expect(result.outcome === "rejected" && result.reason).toContain("fails closed");
  });

  it("rejects an explicit request for a run whose status runId is mismatched", () => {
    const result = selectAuditableCaptureRun({
      entries: [
        entry({
          runId: "run-mismatched",
          statusIntegrity: "identity-mismatched",
          hasCaptureHealth: true,
        }),
      ],
      explicitRunDir: "run-mismatched",
    });

    expect(result).toMatchObject({ outcome: "rejected" });
    expect(result.outcome === "rejected" && result.reason).toContain("does not match");
  });

  it("does not select a completed run whose capture-health.json is missing", () => {
    const defaultResult = selectAuditableCaptureRun({
      entries: [
        entry({
          runId: "run-completed-no-health",
          state: "completed",
          hasCaptureHealth: false,
          completedAtMs: 100,
        }),
      ],
    });
    expect(defaultResult.outcome).toBe("no-auditable-run");

    const explicitResult = selectAuditableCaptureRun({
      entries: [
        entry({
          runId: "run-completed-no-health",
          state: "completed",
          hasCaptureHealth: false,
        }),
      ],
      explicitRunDir: "run-completed-no-health",
    });
    expect(explicitResult).toMatchObject({ outcome: "rejected" });
    expect(explicitResult.outcome === "rejected" && explicitResult.reason).toContain(
      "no capture-health.json",
    );
  });

  it("selects a failed run only when explicitly requested, with a warning", () => {
    const result = selectAuditableCaptureRun({
      entries: [
        entry({ runId: "run-failed", state: "failed", completedAtMs: 300 }),
        entry({ runId: "run-completed", state: "completed", completedAtMs: 200 }),
      ],
      explicitRunDir: "data/live-capture/forward-quotes/run-failed",
    });

    expect(result).toMatchObject({
      outcome: "selected",
      runId: "run-failed",
      runState: "failed",
    });
    expect(result.outcome === "selected" && result.warnings[0]).toContain("failed");
  });

  it("rejects an explicit run directory that is still active or finalizing", () => {
    for (const state of ["active", "finalizing"] as const) {
      const result = selectAuditableCaptureRun({
        entries: [entry({ runId: "run-live", state, completedAtMs: null })],
        explicitRunDir: "data/live-capture/forward-quotes/run-live",
      });
      expect(result).toMatchObject({ outcome: "rejected" });
      expect(result.outcome === "rejected" && result.reason).toContain(state);
    }
  });

  it("accepts an explicit run directory by runId as well as by path", () => {
    const result = selectAuditableCaptureRun({
      entries: [entry({ runId: "run-completed", state: "completed", completedAtMs: 100 })],
      explicitRunDir: "run-completed",
    });

    expect(result).toMatchObject({ outcome: "selected", runId: "run-completed" });
  });

  it("rejects an explicit run directory that does not exist", () => {
    const result = selectAuditableCaptureRun({
      entries: [entry({ runId: "run-completed", state: "completed", completedAtMs: 100 })],
      explicitRunDir: "run-missing",
    });

    expect(result).toMatchObject({ outcome: "rejected" });
  });

  it("falls back to the newest legacy run with published health when no status markers exist", () => {
    const result = selectAuditableCaptureRun({
      entries: [
        entry({ runId: "run-legacy-no-health", completedAtMs: 300, hasCaptureHealth: false }),
        entry({ runId: "run-legacy-with-health", completedAtMs: 200, hasCaptureHealth: true }),
      ],
    });

    expect(result).toMatchObject({
      outcome: "selected",
      runId: "run-legacy-with-health",
      runState: "legacy-no-status",
      legacy: true,
    });
  });

  it("rejects an explicit legacy run without published capture health", () => {
    const result = selectAuditableCaptureRun({
      entries: [entry({ runId: "run-legacy", completedAtMs: 100, hasCaptureHealth: false })],
      explicitRunDir: "run-legacy",
    });

    expect(result).toMatchObject({ outcome: "rejected" });
  });

  it("returns no-auditable-run when the capture root is empty", () => {
    expect(selectAuditableCaptureRun({ entries: [] })).toMatchObject({
      outcome: "no-auditable-run",
    });
  });
});

describe("parseRunIdTimestampMs", () => {
  it("parses the timestamp embedded in generated run ids", () => {
    expect(parseRunIdTimestampMs("2026-07-21T10-30-45-123Z")).toBe(
      Date.parse("2026-07-21T10:30:45.123Z"),
    );
  });

  it("returns null for non-timestamp run ids", () => {
    expect(parseRunIdTimestampMs("run-legacy")).toBeNull();
    expect(parseRunIdTimestampMs("2026-07-21")).toBeNull();
    expect(parseRunIdTimestampMs("")).toBeNull();
  });
});
