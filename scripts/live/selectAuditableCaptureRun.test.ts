import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { serializeCaptureRunStatus } from "@/lib/data/live/forwardQuoteCapture/captureRunStatus";
import { selectAuditableCaptureRun } from "@/lib/data/live/forwardQuoteCapture/selectAuditableCaptureRun";

import { loadCaptureRunSelectionEntries } from "./selectAuditableCaptureRun";

function writeRun(
  root: string,
  runId: string,
  options: {
    state?: "active" | "finalizing" | "completed" | "failed" | "user-cancelled";
    health?: boolean;
    endedAt?: string;
    statusRunId?: string;
    rawStatusText?: string;
  },
): void {
  const runDir = join(root, runId);
  mkdirSync(runDir, { recursive: true });
  if (options.rawStatusText !== undefined) {
    writeFileSync(join(runDir, "capture-run-status.json"), options.rawStatusText, "utf8");
  } else if (options.state) {
    const terminal = ["completed", "failed", "user-cancelled"].includes(options.state);
    writeFileSync(
      join(runDir, "capture-run-status.json"),
      serializeCaptureRunStatus({
        schemaVersion: 1,
        runId: options.statusRunId ?? runId,
        state: options.state,
        startedAt: "2026-07-21T00:00:00.000Z",
        updatedAt: "2026-07-21T00:00:00.000Z",
        endedAt: terminal ? options.endedAt ?? "2026-07-21T01:00:00.000Z" : null,
        captureEndReason: null,
        failureReason: null,
      }),
      "utf8",
    );
  }
  if (options.health) {
    writeFileSync(join(runDir, "capture-health.json"), "{}", "utf8");
  }
}

describe("loadCaptureRunSelectionEntries + selectAuditableCaptureRun (filesystem)", () => {
  let root: string | null = null;

  afterEach(() => {
    if (root) {
      rmSync(root, { recursive: true, force: true });
      root = null;
    }
  });

  it("audit-latest ignores an active run and selects the newest completed run", () => {
    root = mkdtempSync(join(tmpdir(), "capture-select-"));
    writeRun(root, "run-completed", { state: "completed", health: true });
    writeRun(root, "run-active", { state: "active" });

    const entries = loadCaptureRunSelectionEntries(root);
    expect(entries).toHaveLength(2);

    const result = selectAuditableCaptureRun({ entries });
    expect(result).toMatchObject({ outcome: "selected", runId: "run-completed" });
  });

  it("audit-latest accepts an explicit run dir for a user-cancelled run", () => {
    root = mkdtempSync(join(tmpdir(), "capture-select-"));
    writeRun(root, "run-cancelled", { state: "user-cancelled", health: true });

    const noDefault = selectAuditableCaptureRun({
      entries: loadCaptureRunSelectionEntries(root),
    });
    expect(noDefault.outcome).toBe("no-auditable-run");

    const explicit = selectAuditableCaptureRun({
      entries: loadCaptureRunSelectionEntries(root),
      explicitRunDir: join(root, "run-cancelled"),
    });
    expect(explicit).toMatchObject({ outcome: "selected", runId: "run-cancelled" });
  });

  it("classifies an existing-but-corrupt status file as invalid, not legacy", () => {
    root = mkdtempSync(join(tmpdir(), "capture-select-"));
    writeRun(root, "run-corrupt", { rawStatusText: "{ not json", health: true });

    const entries = loadCaptureRunSelectionEntries(root);
    expect(entries[0]).toMatchObject({
      statusIntegrity: "invalid",
      status: null,
      hasCaptureHealth: true,
    });

    // With health present, a corrupt status must NOT fall back to legacy audit.
    const byDefault = selectAuditableCaptureRun({ entries });
    expect(byDefault.outcome).toBe("no-auditable-run");

    const explicit = selectAuditableCaptureRun({
      entries,
      explicitRunDir: "run-corrupt",
    });
    expect(explicit).toMatchObject({ outcome: "rejected" });
  });

  it("classifies a schema-invalid status file (terminal without endedAt) as invalid", () => {
    root = mkdtempSync(join(tmpdir(), "capture-select-"));
    writeRun(root, "run-incoherent", {
      rawStatusText: JSON.stringify({
        schemaVersion: 1,
        runId: "run-incoherent",
        state: "completed",
        startedAt: "2026-07-21T00:00:00.000Z",
        updatedAt: "2026-07-21T00:00:00.000Z",
        endedAt: null,
        captureEndReason: null,
        failureReason: null,
      }),
      health: true,
    });

    const entries = loadCaptureRunSelectionEntries(root);
    expect(entries[0].statusIntegrity).toBe("invalid");
    expect(selectAuditableCaptureRun({ entries }).outcome).toBe("no-auditable-run");
  });

  it("rejects a status file whose runId does not match the directory name", () => {
    root = mkdtempSync(join(tmpdir(), "capture-select-"));
    writeRun(root, "run-dir-name", {
      state: "completed",
      statusRunId: "some-other-run",
      health: true,
    });

    const entries = loadCaptureRunSelectionEntries(root);
    expect(entries[0].statusIntegrity).toBe("identity-mismatched");

    expect(selectAuditableCaptureRun({ entries }).outcome).toBe("no-auditable-run");
    expect(
      selectAuditableCaptureRun({ entries, explicitRunDir: "run-dir-name" }),
    ).toMatchObject({ outcome: "rejected" });
  });

  it("selects the newest completed run by completion time even when an older run directory was modified more recently", () => {
    root = mkdtempSync(join(tmpdir(), "capture-select-"));
    writeRun(root, "run-old", {
      state: "completed",
      endedAt: "2026-07-20T01:00:00.000Z",
      health: true,
    });
    writeRun(root, "run-new", {
      state: "completed",
      endedAt: "2026-07-21T01:00:00.000Z",
      health: true,
    });
    // A later audit artifact bumps the OLD run's directory mtime; the newer
    // capture must still be selected.
    writeFileSync(join(root, "run-old", "capture-health-audit.json"), "{}", "utf8");

    const entries = loadCaptureRunSelectionEntries(root);
    const oldEntry = entries.find((entry) => entry.runId === "run-old");
    const newEntry = entries.find((entry) => entry.runId === "run-new");
    expect(oldEntry?.completedAtMs).toBe(Date.parse("2026-07-20T01:00:00.000Z"));
    expect(newEntry?.completedAtMs).toBe(Date.parse("2026-07-21T01:00:00.000Z"));

    const result = selectAuditableCaptureRun({ entries });
    expect(result).toMatchObject({ outcome: "selected", runId: "run-new" });
  });

  it("returns no entries for a missing capture root", () => {
    expect(loadCaptureRunSelectionEntries(join(tmpdir(), "does-not-exist-xyz"))).toEqual([]);
  });
});
