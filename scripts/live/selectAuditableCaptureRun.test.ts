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
  options: { state?: "active" | "finalizing" | "completed" | "failed" | "user-cancelled"; health?: boolean },
): void {
  const runDir = join(root, runId);
  mkdirSync(runDir, { recursive: true });
  if (options.state) {
    writeFileSync(
      join(runDir, "capture-run-status.json"),
      serializeCaptureRunStatus({
        schemaVersion: 1,
        runId,
        state: options.state,
        startedAt: "2026-07-21T00:00:00.000Z",
        updatedAt: "2026-07-21T00:00:00.000Z",
        endedAt: null,
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

  it("returns no entries for a missing capture root", () => {
    expect(loadCaptureRunSelectionEntries(join(tmpdir(), "does-not-exist-xyz"))).toEqual([]);
  });
});
