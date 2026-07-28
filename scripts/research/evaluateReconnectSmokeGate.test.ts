import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { reconnectSmokeAuthorizationPath } from "../operator/shared/reconnectSmokeAuthorization";
import { runEvaluateReconnectSmokeGateCommand } from "./evaluateReconnectSmokeGate";

function writeMinimalArtifacts(runDir: string, runId: string): void {
  mkdirSync(runDir, { recursive: true });
  writeFileSync(
    join(runDir, "capture-run-status.json"),
    JSON.stringify({
      schemaVersion: 1,
      runId,
      state: "completed",
      startedAt: "2026-07-22T00:00:00.000Z",
      endedAt: "2026-07-22T00:20:00.000Z",
      captureEndReason: "duration-complete",
      failureReason: null,
    }),
    "utf8",
  );
  writeFileSync(
    join(runDir, "capture-health.json"),
    JSON.stringify({
      runId,
      verdict: "capture-mvp-success",
      errors: [],
      connection: {
        completedNormally: true,
        liveConnectionSucceeded: true,
        captureEndReason: "duration-complete",
        terminalFailureReason: null,
        reconnectCount: 1,
        connectionAttemptCount: 2,
        authHeaderGenerationCount: 2,
      },
      watchdog: {
        wsRecoverySuccessCount: 1,
        wsRecoveryFailureCount: 0,
        terminalWebSocketFailure: false,
      },
      writer: { allStreamsDrained: true, failure: null },
    }),
    "utf8",
  );
  writeFileSync(
    join(runDir, "capture-health-audit.json"),
    JSON.stringify({
      selectedRunId: runId,
      summary: { verdict: "capture-research-ready" },
    }),
    "utf8",
  );
  writeFileSync(
    join(runDir, "capture-lifecycle.jsonl"),
    [
      JSON.stringify({
        runId,
        type: "controlledReconnectRequested",
        detectedAt: "2026-07-22T00:00:10.000Z",
        recoveryCycleId: 1,
        recoveryReason: "controlled-reconnect-validation",
        requestDisposition: "started",
      }),
      JSON.stringify({
        runId,
        type: "wsRecoveryAttempted",
        detectedAt: "2026-07-22T00:00:11.000Z",
        recoveryCycleId: 1,
        recoveryReason: "controlled-reconnect-validation",
      }),
      JSON.stringify({
        runId,
        type: "wsRecoverySucceeded",
        detectedAt: "2026-07-22T00:00:12.000Z",
        recoveryCycleId: 1,
        recoveryReason: "controlled-reconnect-validation",
      }),
    ].join("\n") + "\n",
    "utf8",
  );
}

describe("evaluateReconnectSmokeGate CLI flags", () => {
  it("rejects unknown flags", () => {
    const stderr: string[] = [];
    const exitCode = runEvaluateReconnectSmokeGateCommand(
      ["--run-id", "x", "--unknown", "1"],
      {
        writeStdout: () => {},
        writeStderr: (text) => stderr.push(text),
      },
    );
    expect(exitCode).toBe(1);
    expect(stderr.join("")).toMatch(/Unknown flag/);
  });

  it("rejects --write-authorization as unknown", () => {
    const root = mkdtempSync(join(tmpdir(), "gate-flag-"));
    const runId = "reconnect-run";
    const runDir = join(root, runId);
    writeMinimalArtifacts(runDir, runId);
    const stderr: string[] = [];
    const exitCode = runEvaluateReconnectSmokeGateCommand(
      [
        "--run-id",
        runId,
        "--run-dir",
        runDir,
        "--duration-minutes",
        "20",
        "--capture-exit-code",
        "0",
        "--audit-exit-code",
        "0",
        "--restart-gate-exit-code",
        "0",
        "--post-run-preflight-exit-code",
        "0",
        "--lock-present",
        "false",
        "--write-authorization",
      ],
      {
        writeStdout: () => {},
        writeStderr: (text) => stderr.push(text),
      },
    );
    expect(exitCode).toBe(1);
    expect(stderr.join("")).toMatch(/Unknown flag: --write-authorization/);
    expect(existsSync(reconnectSmokeAuthorizationPath(runDir))).toBe(false);
  });

  it("rejects duplicate flags", () => {
    const stderr: string[] = [];
    const exitCode = runEvaluateReconnectSmokeGateCommand(
      [
        "--run-id",
        "a",
        "--run-dir",
        "a",
        "--duration-minutes",
        "20",
        "--capture-exit-code",
        "0",
        "--audit-exit-code",
        "0",
        "--restart-gate-exit-code",
        "0",
        "--post-run-preflight-exit-code",
        "0",
        "--lock-present",
        "false",
        "--run-id",
        "b",
      ],
      {
        writeStdout: () => {},
        writeStderr: (text) => stderr.push(text),
      },
    );
    expect(exitCode).toBe(1);
    expect(stderr.join("")).toMatch(/Duplicate flag/);
  });

  it("rejects missing flag values", () => {
    const stderr: string[] = [];
    const exitCode = runEvaluateReconnectSmokeGateCommand(["--run-id"], {
      writeStdout: () => {},
      writeStderr: (text) => stderr.push(text),
    });
    expect(exitCode).toBe(1);
    expect(stderr.join("")).toMatch(/Missing value|Missing required/);
  });
});
