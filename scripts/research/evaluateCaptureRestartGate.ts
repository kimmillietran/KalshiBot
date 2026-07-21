/**
 * M12.1F Part B/C: eight-hour restart gate command.
 *
 * Four modes (exactly one per invocation):
 *
 *   --write-canonical-profile <path>
 *     Writes the canonical eight-hour capture profile as UTF-8 JSON (with a
 *     trailing newline) to the given file. run-capture-restart-smoke.ps1
 *     reads its capture parameters from this file: transporting the JSON
 *     through captured native stdout broke on Windows PowerShell 5.1, which
 *     mangled the payload before ConvertFrom-Json.
 *
 *   --print-canonical-profile
 *     Prints the canonical eight-hour capture profile as JSON to stdout.
 *     Kept for humans and tests; shell wrappers must use the file mode.
 *
 *   --assert-no-active-capture [--capture-root <dir>]
 *     Exits nonzero when starting a capture would be unsafe: a strictly
 *     valid active/finalizing status, a present-but-invalid or
 *     identity-mismatched status marker (process state UNKNOWN), or an
 *     unreleased capture lock all block. Used by
 *     run-capture-restart-smoke.ps1 before starting the smoke capture.
 *
 *   --capture-run-dir <dir> [--expected-duration-minutes N]
 *     Evaluates the frozen restart acceptance criteria for that EXACT run
 *     directory (never "latest") and prints one machine-readable readiness
 *     summary. The thresholds are immutable: no operator flag can weaken
 *     them. An operator-declared expected duration must exactly match the
 *     capture's own recorded config, which is always validated regardless.
 *     Exits 0 only when restartEightHourCaptures is true.
 */
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  CANONICAL_EIGHT_HOUR_CAPTURE_PROFILE,
  evaluateCaptureRestartGate,
  findCaptureStartBlockers,
  parseCaptureRunStatus,
  resolveCaptureLockPath,
  serializeCaptureRestartGateSummary,
  type CaptureRunStatusArtifact,
  type CaptureRunStatusIntegrity,
} from "@/lib/data/live/forwardQuoteCapture";
import {
  parseCaptureHealthAuditReport,
  verifyCaptureHealthAuditFreshness,
  type SelectedRunCaptureHealthIo,
} from "@/lib/data/research/selectedRunCaptureHealth";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import { loadCaptureRunSelectionEntries } from "../live/selectAuditableCaptureRun";

const DEFAULT_CAPTURE_ROOT = "data/live-capture/forward-quotes";

/** Flags that could weaken the frozen gate; they are rejected explicitly. */
const FORBIDDEN_THRESHOLD_FLAGS = [
  "--duration-tolerance-share",
  "--min-valid-book-share",
  "--min-btc-join-coverage-share",
] as const;

/** Mutually exclusive mode flags: exactly one per invocation. */
const MODE_FLAGS = [
  "--write-canonical-profile",
  "--print-canonical-profile",
  "--assert-no-active-capture",
  "--capture-run-dir",
] as const;

/** Every flag this command accepts; anything else fails closed. */
const KNOWN_FLAGS = new Set<string>([
  ...MODE_FLAGS,
  "--capture-root",
  "--expected-duration-minutes",
]);

const USAGE =
  "Usage: --write-canonical-profile <path> | --print-canonical-profile | "
  + "--assert-no-active-capture [--capture-root <dir>] | "
  + "--capture-run-dir <dir> [--expected-duration-minutes N]";

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
  const blockers = findCaptureStartBlockers(loadCaptureRunSelectionEntries(captureRoot));

  // The global capture lock blocks too: an unreleased lock means either a
  // capture is running right now or a previous one crashed without reaching
  // terminal status. Both require operator attention before starting.
  const lockPath = resolveCaptureLockPath(captureRoot);
  const lockPresent = existsSync(lockPath);

  io.writeStdout(`${JSON.stringify({ captureRoot, blockers, lockPresent, lockPath })}\n`);

  if (lockPresent) {
    io.writeStderr(
      `Refusing to start: capture lock is present at ${lockPath}. `
        + "A capture is running, or a previous run crashed without releasing the lock; "
        + "reconcile and remove it manually before starting.\n",
    );
    return 1;
  }
  if (blockers.length > 0) {
    io.writeStderr(
      `Refusing to start: ${blockers.length} capture run(s) block a new capture: `
        + `${blockers.map((run) => `${run.runId} (${run.reason})`).join(", ")}\n`,
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
    for (const flag of FORBIDDEN_THRESHOLD_FLAGS) {
      if (argv.includes(flag)) {
        throw new Error(
          `${flag} is not supported: the restart gate thresholds are frozen and cannot be weakened from the command line.`,
        );
      }
    }

    const unknownFlags = argv.filter(
      (arg) => arg.startsWith("--") && !KNOWN_FLAGS.has(arg),
    );
    if (unknownFlags.length > 0) {
      throw new Error(`Unknown argument(s): ${unknownFlags.join(", ")}. ${USAGE}`);
    }

    const activeModes = MODE_FLAGS.filter((flag) => argv.includes(flag));
    if (activeModes.length > 1) {
      throw new Error(
        `Conflicting mode flags: ${activeModes.join(", ")}. Use exactly one mode. ${USAGE}`,
      );
    }

    if (argv.includes("--write-canonical-profile")) {
      const pathIndex = argv.indexOf("--write-canonical-profile") + 1;
      const outputPath = argv[pathIndex];
      if (!outputPath || outputPath.startsWith("--")) {
        throw new Error(
          "Missing output path: --write-canonical-profile <path> requires a file path to write the canonical profile JSON to.",
        );
      }
      // UTF-8 JSON with a trailing newline and nothing else: shell wrappers
      // parse this file instead of captured native stdout, which Windows
      // PowerShell 5.1 mangles.
      writeFileSync(
        outputPath,
        `${stableStringify(CANONICAL_EIGHT_HOUR_CAPTURE_PROFILE)}\n`,
        "utf8",
      );
      return 0;
    }

    if (argv.includes("--print-canonical-profile")) {
      io.writeStdout(`${stableStringify(CANONICAL_EIGHT_HOUR_CAPTURE_PROFILE)}\n`);
      return 0;
    }

    if (argv.includes("--assert-no-active-capture")) {
      const captureRoot =
        readFlagValue(argv, "--capture-root") ?? DEFAULT_CAPTURE_ROOT;
      return runAssertNoActiveCapture(captureRoot, io);
    }

    const runDir = readFlagValue(argv, "--capture-run-dir");
    if (!runDir) {
      throw new Error(USAGE);
    }
    if (!existsSync(runDir) || !statSync(runDir).isDirectory()) {
      throw new Error(`Capture run directory not found: ${runDir}`);
    }

    const expectedDurationMinutes = readNumberFlag(argv, "--expected-duration-minutes");

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
