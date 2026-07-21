/**
 * M12.1F Part B/C: eight-hour restart gate command.
 *
 * Two modes:
 *
 *   --assert-no-active-capture [--capture-root <dir>]
 *     Exits nonzero when any capture run directory carries a strictly valid
 *     active/finalizing status. Used by run-capture-restart-smoke.ps1 before
 *     starting the smoke capture.
 *
 *   --capture-run-dir <dir> [--expected-duration-minutes N]
 *     Evaluates the frozen restart acceptance criteria for that EXACT run
 *     directory (never "latest") and prints one machine-readable readiness
 *     summary. Exits 0 only when restartEightHourCaptures is true.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  evaluateCaptureRestartGate,
  findActiveCaptureRuns,
  parseCaptureRunStatus,
  serializeCaptureRestartGateSummary,
  type CaptureRestartGateThresholds,
  type CaptureRunStatusArtifact,
  type CaptureRunStatusIntegrity,
} from "@/lib/data/live/forwardQuoteCapture";
import {
  parseCaptureHealthAuditReport,
  verifyCaptureHealthAuditFreshness,
  type SelectedRunCaptureHealthIo,
} from "@/lib/data/research/selectedRunCaptureHealth";

import { loadCaptureRunSelectionEntries } from "../live/selectAuditableCaptureRun";

const DEFAULT_CAPTURE_ROOT = "data/live-capture/forward-quotes";

export type CaptureRestartGateCommandIo = {
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
};

function readFlagValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index === -1) {
    return undefined;
  }
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag} <value>`);
  }
  return value;
}

function readNumberFlag(argv: readonly string[], flag: string): number | null {
  const raw = readFlagValue(argv, flag);
  if (raw === undefined) {
    return null;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${flag} must be a non-negative finite number`);
  }
  return parsed;
}

function readJsonRecord(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function createFilesystemFreshnessIo(): SelectedRunCaptureHealthIo {
  return {
    readFile: (path) => readFileSync(path, "utf8"),
    fileExists: (path) => existsSync(path),
    isDirectory: (path) => {
      try {
        return statSync(path).isDirectory();
      } catch {
        return false;
      }
    },
    fileSizeBytes: (path) => {
      try {
        return statSync(path).size;
      } catch {
        return null;
      }
    },
    fileMtimeMs: (path) => {
      try {
        return statSync(path).mtimeMs;
      } catch {
        return null;
      }
    },
  };
}

function runAssertNoActiveCapture(
  captureRoot: string,
  io: CaptureRestartGateCommandIo,
): number {
  const activeRuns = findActiveCaptureRuns(loadCaptureRunSelectionEntries(captureRoot));
  io.writeStdout(`${JSON.stringify({ captureRoot, activeRuns })}\n`);
  if (activeRuns.length > 0) {
    io.writeStderr(
      `Refusing to start: ${activeRuns.length} capture run(s) are still active/finalizing: `
        + `${activeRuns.map((run) => `${run.runId} (${run.state})`).join(", ")}\n`,
    );
    return 1;
  }
  return 0;
}

export async function runCaptureRestartGateCommand(
  argv: readonly string[],
  io: CaptureRestartGateCommandIo,
  options?: { generatedAt?: string },
): Promise<number> {
  try {
    if (argv.includes("--assert-no-active-capture")) {
      const captureRoot =
        readFlagValue(argv, "--capture-root") ?? DEFAULT_CAPTURE_ROOT;
      return runAssertNoActiveCapture(captureRoot, io);
    }

    const runDir = readFlagValue(argv, "--capture-run-dir");
    if (!runDir) {
      throw new Error(
        "Usage: --capture-run-dir <dir> [--expected-duration-minutes N] | --assert-no-active-capture [--capture-root <dir>]",
      );
    }
    if (!existsSync(runDir) || !statSync(runDir).isDirectory()) {
      throw new Error(`Capture run directory not found: ${runDir}`);
    }

    const expectedDurationMinutes = readNumberFlag(argv, "--expected-duration-minutes");
    const thresholds: Partial<CaptureRestartGateThresholds> = {};
    const durationToleranceShare = readNumberFlag(argv, "--duration-tolerance-share");
    if (durationToleranceShare !== null) {
      thresholds.durationToleranceShare = durationToleranceShare;
    }
    const minValidBookShare = readNumberFlag(argv, "--min-valid-book-share");
    if (minValidBookShare !== null) {
      thresholds.minValidBookShare = minValidBookShare;
    }
    const minBtcJoinCoverageShare = readNumberFlag(
      argv,
      "--min-btc-join-coverage-share",
    );
    if (minBtcJoinCoverageShare !== null) {
      thresholds.minBtcJoinCoverageShare = minBtcJoinCoverageShare;
    }

    const dirRunId = runDir.replaceAll("\\", "/").replace(/\/+$/, "").split("/").at(-1)!;

    // Strict status integrity (mirrors the auditable-run selector policy).
    const statusPath = join(runDir, "capture-run-status.json");
    let runStatus: CaptureRunStatusArtifact | null = null;
    let runStatusIntegrity: CaptureRunStatusIntegrity = "absent";
    if (existsSync(statusPath)) {
      const parsed = parseCaptureRunStatus(readFileSync(statusPath, "utf8"));
      if (parsed === null) {
        runStatusIntegrity = "invalid";
      } else if (parsed.runId !== dirRunId) {
        runStatusIntegrity = "identity-mismatched";
      } else {
        runStatus = parsed;
        runStatusIntegrity = "valid";
      }
    }

    const nativeHealth = readJsonRecord(join(runDir, "capture-health.json"));

    const auditRecord = readJsonRecord(join(runDir, "capture-health-audit.json"));
    const { report: audit, errors: auditErrors } =
      parseCaptureHealthAuditReport(auditRecord);

    let auditFingerprintsVerified = false;
    let auditFreshnessWarnings: string[] = [];
    if (auditRecord !== null) {
      try {
        const freshness = verifyCaptureHealthAuditFreshness({
          auditRecord,
          io: createFilesystemFreshnessIo(),
          sourceLabel: "run-scoped capture health audit",
        });
        auditFingerprintsVerified = freshness.fingerprintsVerified;
        auditFreshnessWarnings = freshness.warnings;
      } catch (error) {
        auditFreshnessWarnings = [
          error instanceof Error ? error.message : String(error),
        ];
      }
    } else {
      auditFreshnessWarnings = ["run-scoped capture-health-audit.json is missing"];
    }

    const summary = evaluateCaptureRestartGate({
      generatedAt: options?.generatedAt ?? new Date().toISOString(),
      runDir,
      runStatus,
      runStatusIntegrity,
      nativeHealth,
      audit,
      auditErrors,
      auditFingerprintsVerified,
      auditFreshnessWarnings,
      expectedDurationMinutes,
      thresholds,
    });

    io.writeStdout(serializeCaptureRestartGateSummary(summary));

    if (!summary.restartEightHourCaptures) {
      io.writeStderr(
        `Restart gate FAILED (${summary.failureReasons.length} reason(s)):\n`,
      );
      for (const reason of summary.failureReasons) {
        io.writeStderr(`  - ${reason}\n`);
      }
      return 1;
    }

    io.writeStderr("Restart gate passed: eight-hour captures may be restarted.\n");
    return 0;
  } catch (error) {
    io.writeStderr(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 1;
  }
}

async function main(): Promise<void> {
  const exitCode = await runCaptureRestartGateCommand(process.argv.slice(2), {
    writeStdout: (text) => {
      process.stdout.write(text);
    },
    writeStderr: (text) => {
      process.stderr.write(text);
    },
  });
  process.exitCode = exitCode;
}

if (process.env.VITEST !== "true") {
  void main();
}
