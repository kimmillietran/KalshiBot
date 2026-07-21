import { describe, expect, it } from "vitest";

import type { CaptureRunStatusArtifact } from "./captureRunStatus";
import {
  selectAuditableCaptureRun,
  type CaptureRunSelectionEntry,
} from "./selectAuditableCaptureRun";

function entry(input: {
  runId: string;
  state?: CaptureRunStatusArtifact["state"];
  hasCaptureHealth?: boolean;
  lastModifiedMs: number;
}): CaptureRunSelectionEntry {
  return {
    runDir: `data/live-capture/forward-quotes/${input.runId}`,
    runId: input.runId,
    status: input.state
      ? {
        schemaVersion: 1,
        runId: input.runId,
        state: input.state,
        startedAt: "2026-07-21T00:00:00.000Z",
        updatedAt: "2026-07-21T00:00:00.000Z",
        endedAt: null,
        captureEndReason: null,
        failureReason: null,
      }
      : null,
    hasCaptureHealth: input.hasCaptureHealth ?? true,
    lastModifiedMs: input.lastModifiedMs,
  };
}

describe("selectAuditableCaptureRun", () => {
  it("ignores active and finalizing runs and picks the newest completed run", () => {
    const result = selectAuditableCaptureRun({
      entries: [
        entry({ runId: "run-active", state: "active", lastModifiedMs: 300 }),
        entry({ runId: "run-finalizing", state: "finalizing", lastModifiedMs: 250 }),
        entry({ runId: "run-completed-new", state: "completed", lastModifiedMs: 200 }),
        entry({ runId: "run-completed-old", state: "completed", lastModifiedMs: 100 }),
      ],
    });

    expect(result).toMatchObject({
      outcome: "selected",
      runId: "run-completed-new",
      runState: "completed",
      legacy: false,
    });
  });

  it("does not select failed or user-cancelled runs by default", () => {
    const result = selectAuditableCaptureRun({
      entries: [
        entry({ runId: "run-failed", state: "failed", lastModifiedMs: 300, hasCaptureHealth: true }),
        entry({ runId: "run-cancelled", state: "user-cancelled", lastModifiedMs: 200, hasCaptureHealth: true }),
      ],
    });

    expect(result.outcome).toBe("no-auditable-run");
  });

  it("selects a failed run only when explicitly requested, with a warning", () => {
    const result = selectAuditableCaptureRun({
      entries: [
        entry({ runId: "run-failed", state: "failed", lastModifiedMs: 300 }),
        entry({ runId: "run-completed", state: "completed", lastModifiedMs: 200 }),
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
        entries: [entry({ runId: "run-live", state, lastModifiedMs: 100 })],
        explicitRunDir: "data/live-capture/forward-quotes/run-live",
      });
      expect(result).toMatchObject({ outcome: "rejected" });
      expect(result.outcome === "rejected" && result.reason).toContain(state);
    }
  });

  it("accepts an explicit run directory by runId as well as by path", () => {
    const result = selectAuditableCaptureRun({
      entries: [entry({ runId: "run-completed", state: "completed", lastModifiedMs: 100 })],
      explicitRunDir: "run-completed",
    });

    expect(result).toMatchObject({ outcome: "selected", runId: "run-completed" });
  });

  it("rejects an explicit run directory that does not exist", () => {
    const result = selectAuditableCaptureRun({
      entries: [entry({ runId: "run-completed", state: "completed", lastModifiedMs: 100 })],
      explicitRunDir: "run-missing",
    });

    expect(result).toMatchObject({ outcome: "rejected" });
  });

  it("falls back to the newest legacy run with published health when no status markers exist", () => {
    const result = selectAuditableCaptureRun({
      entries: [
        entry({ runId: "run-legacy-no-health", lastModifiedMs: 300, hasCaptureHealth: false }),
        entry({ runId: "run-legacy-with-health", lastModifiedMs: 200, hasCaptureHealth: true }),
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
      entries: [entry({ runId: "run-legacy", lastModifiedMs: 100, hasCaptureHealth: false })],
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
