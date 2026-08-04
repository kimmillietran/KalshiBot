/**
 * M12.1I: cross-platform long capture runner with exact-run progress.
 *
 * Modes:
 *   --preset 6h | 8h
 *   --duration-minutes <n> (must match preset when preset is set)
 *
 * Eight-hour mode is gated: preflight + restart/reconnect authorization required.
 * Six-hour mode is supported for operator workflows but never claims eight-hour
 * restart readiness (duration is non-canonical vs production 480).
 */
import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  assertNoForbiddenFlags,
  collectUnknownFlags,
  hasFlag,
  OperatorCliError,
  readFlagValue,
  readNumberFlag,
} from "./shared/argv";
import {
  buildCanonicalCaptureArgv,
  loadCanonicalCaptureProfile,
  type ValidatedCanonicalProfile,
} from "./shared/canonicalProfile";
import {
  buildTsxArgs,
  resolveNpxCommand,
  spawnWithTee,
} from "./shared/childProcess";
import {
  createDefaultCommandRunner,
  createPlanOnlyRunner,
  type CommandIo,
  type OperatorCommandRunner,
} from "./shared/commandRunner";
import {
  DEFAULT_CAPTURE_ROOT,
  DEFAULT_LOG_ROOT,
  EIGHT_HOUR_DURATION_MINUTES,
  FORBIDDEN_SKIP_GATE_FLAGS,
  PROGRESS_INTERVAL_MS,
  SIX_HOUR_DURATION_MINUTES,
} from "./shared/constants";
import { requireKalshiEnv } from "./shared/kalshiEnv";
import { startCaptureProgressMonitor, type ProgressMonitorHandle } from "./shared/progress";
import {
  exactCaptureIdentitiesMatch,
  parseExactRunIdentityFromOutput,
  tryParseExactRunIdentityFromChunk,
  type ExactCaptureRunIdentity,
} from "./shared/runIdentity";

const KNOWN_FLAGS = new Set([
  "--preset",
  "--duration-minutes",
  "--dry-run-plan",
  "--capture-root",
  "--log-root",
  "--authorized-by-restart-smoke-run-dir",
  "--authorized-by-reconnect-smoke-run-dir",
  "--progress-interval-ms",
]);

export type CaptureWithProgressDeps = {
  runner: OperatorCommandRunner;
  io: CommandIo;
  requireCredentials?: boolean;
  spawnCapture?: typeof spawnWithTee;
  exists?: (path: string) => boolean;
  mkdirp?: (path: string) => void;
  now?: () => Date;
};

function formatStamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    + `T${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`
  );
}

function parsePreflightPayload(stdout: string): {
  blockers: unknown[];
  lockPresent: boolean;
} {
  const line = stdout
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.startsWith("{") && entry.includes("lockPresent"))
    .at(-1);
  if (!line) {
    return { blockers: ["unparsed-preflight"], lockPresent: true };
  }
  try {
    const parsed = JSON.parse(line) as {
      blockers?: unknown[];
      lockPresent?: boolean;
    };
    return {
      blockers: Array.isArray(parsed.blockers) ? parsed.blockers : ["invalid-blockers"],
      lockPresent: parsed.lockPresent === true,
    };
  } catch {
    return { blockers: ["malformed-preflight"], lockPresent: true };
  }
}

async function assertRestartAuthorization(
  deps: CaptureWithProgressDeps,
  restartSmokeRunDir: string,
  reconnectSmokeRunDir: string,
): Promise<void> {
  const exists = deps.exists ?? existsSync;
  if (!exists(restartSmokeRunDir)) {
    throw new OperatorCliError(
      `Restart-smoke authorization run directory not found: ${restartSmokeRunDir}`,
    );
  }
  if (!exists(reconnectSmokeRunDir)) {
    throw new OperatorCliError(
      `Reconnect-smoke authorization run directory not found: ${reconnectSmokeRunDir}`,
    );
  }

  const restartGate = await deps.runner.runTsx(
    "scripts/research/evaluateCaptureRestartGate.ts",
    ["--capture-run-dir", restartSmokeRunDir],
  );
  if (restartGate.exitCode !== 0) {
    throw new OperatorCliError(
      "Eight-hour capture denied: restart smoke authorization failed "
        + `(restartEightHourCaptures must be true for ${restartSmokeRunDir}).`,
    );
  }

  // Authoritative reconnect proof comes from the persisted exact-run
  // reconnect-smoke-authorization.json written by the real reconnect smoke.
  // Never fabricate orchestration exit codes here.
  const reconnectAuth = await deps.runner.runTsx(
    "scripts/operator/verifyReconnectSmokeAuthorization.ts",
    ["--run-dir", reconnectSmokeRunDir],
  );
  if (reconnectAuth.exitCode !== 0) {
    throw new OperatorCliError(
      "Eight-hour capture denied: controlled reconnect authorization failed "
        + `for ${reconnectSmokeRunDir}.`,
    );
  }
}

async function assertCurrentPreflight(
  deps: CaptureWithProgressDeps,
  captureRoot: string,
  label: string,
): Promise<void> {
  deps.io.writeStdout(`${label}\n`);
  const preflight = await deps.runner.runTsx(
    "scripts/research/evaluateCaptureRestartGate.ts",
    ["--assert-no-active-capture", "--capture-root", captureRoot],
  );
  const preflightPayload = parsePreflightPayload(preflight.stdout);
  if (
    preflight.exitCode !== 0
    || preflightPayload.lockPresent
    || preflightPayload.blockers.length > 0
  ) {
    throw new OperatorCliError(
      "Capture-start preflight failed; refusing to start capture "
        + `(exit=${preflight.exitCode}, lockPresent=${preflightPayload.lockPresent}, `
        + `blockers=${preflightPayload.blockers.length}). `
        + "Stale locks are never deleted by this launcher.",
    );
  }
}

export async function runCaptureWithProgressCommand(
  argv: readonly string[],
  deps: CaptureWithProgressDeps,
): Promise<number> {
  try {
    assertNoForbiddenFlags(argv, FORBIDDEN_SKIP_GATE_FLAGS);
    const unknown = collectUnknownFlags(argv, KNOWN_FLAGS);
    if (unknown.length > 0) {
      throw new OperatorCliError(`Unknown argument(s): ${unknown.join(", ")}`);
    }

    const dryRunPlan = hasFlag(argv, "--dry-run-plan");
    const preset = readFlagValue(argv, "--preset");
    const durationFlag = readNumberFlag(argv, "--duration-minutes");
    const captureRoot =
      readFlagValue(argv, "--capture-root") ?? DEFAULT_CAPTURE_ROOT;
    const logRoot = readFlagValue(argv, "--log-root") ?? DEFAULT_LOG_ROOT;
    const progressIntervalMs =
      readNumberFlag(argv, "--progress-interval-ms") ?? PROGRESS_INTERVAL_MS;
    const restartAuthDir = readFlagValue(
      argv,
      "--authorized-by-restart-smoke-run-dir",
    );
    const reconnectAuthDir = readFlagValue(
      argv,
      "--authorized-by-reconnect-smoke-run-dir",
    );

    let durationMinutes: number;
    let modeLabel: string;
    let isEightHour = false;

    if (preset === "6h") {
      durationMinutes = SIX_HOUR_DURATION_MINUTES;
      modeLabel = "6h";
      if (durationFlag !== undefined && durationFlag !== durationMinutes) {
        throw new OperatorCliError(
          `--preset 6h requires --duration-minutes ${SIX_HOUR_DURATION_MINUTES} (got ${durationFlag}).`,
        );
      }
    } else if (preset === "8h") {
      durationMinutes = EIGHT_HOUR_DURATION_MINUTES;
      modeLabel = "8h";
      isEightHour = true;
      if (durationFlag !== undefined && durationFlag !== durationMinutes) {
        throw new OperatorCliError(
          `--preset 8h requires --duration-minutes ${EIGHT_HOUR_DURATION_MINUTES} (got ${durationFlag}).`,
        );
      }
    } else if (durationFlag !== undefined) {
      durationMinutes = durationFlag;
      if (durationMinutes === EIGHT_HOUR_DURATION_MINUTES) {
        isEightHour = true;
        modeLabel = "8h";
      } else if (durationMinutes === SIX_HOUR_DURATION_MINUTES) {
        modeLabel = "6h";
      } else {
        modeLabel = `${durationMinutes}m`;
      }
    } else {
      throw new OperatorCliError(
        "Specify --preset 6h|8h or --duration-minutes <n>.",
      );
    }

    if (isEightHour && durationMinutes !== EIGHT_HOUR_DURATION_MINUTES) {
      throw new OperatorCliError(
        `Eight-hour capture requires duration exactly ${EIGHT_HOUR_DURATION_MINUTES} minutes.`,
      );
    }

    const profile: ValidatedCanonicalProfile = loadCanonicalCaptureProfile();
    const captureArgv = buildCanonicalCaptureArgv(profile, durationMinutes);

    if (dryRunPlan) {
      deps.io.writeStdout(`DRY-RUN-PLAN: capture-with-progress (${modeLabel})\n`);
      deps.io.writeStdout(`  durationMinutes=${durationMinutes}\n`);
      deps.io.writeStdout(
        `  profile: series=${profile.series} maxMarkets=${profile.maxMarkets} `
          + `throttleMs=${profile.topOfBookThrottleMs} captureBtcSpot=${profile.captureBtcSpot} `
          + `watchdog=${profile.wsWatchdogEnabled}\n`,
      );
      deps.io.writeStdout("  gate sequence:\n");
      deps.io.writeStdout("    1) assert-no-active-capture preflight (required)\n");
      if (isEightHour) {
        deps.io.writeStdout(
          "    2) restart authorization via --authorized-by-restart-smoke-run-dir\n",
        );
        deps.io.writeStdout(
          "    3) reconnect authorization via persisted reconnect-smoke-authorization.json "
            + "(no fabricated orchestration codes)\n",
        );
        deps.io.writeStdout(
          "    4) second current preflight immediately before spawn\n",
        );
        deps.io.writeStdout(
          "    5) spawn runForwardQuoteCapture (canonical 480m workload)\n",
        );
      } else {
        deps.io.writeStdout(
          "    2) spawn runForwardQuoteCapture (canonical workload except duration)\n",
        );
        deps.io.writeStdout(
          "  label: NONCANONICAL-DURATION — six-hour runs do NOT satisfy the eight-hour restart gate.\n",
        );
      }
      deps.io.writeStdout(
        `  planned child: npx tsx scripts/live/runForwardQuoteCapture.ts ${captureArgv.join(" ")}\n`,
      );
      deps.io.writeStdout(
        "  note: dry-run-plan does not start capture, create locks, or pass production gates.\n",
      );
      await deps.runner.runTsx(
        "scripts/research/evaluateCaptureRestartGate.ts",
        ["--assert-no-active-capture", "--capture-root", captureRoot],
      );
      return 0;
    }

    if (deps.requireCredentials !== false) {
      requireKalshiEnv();
    }

    if (isEightHour) {
      if (!restartAuthDir || !reconnectAuthDir) {
        throw new OperatorCliError(
          "Eight-hour capture requires restart authorization. Pass both "
            + "--authorized-by-restart-smoke-run-dir <dir> and "
            + "--authorized-by-reconnect-smoke-run-dir <dir> from successful smoke runs. "
            + "No --skip-gate path exists.",
        );
      }
    }

    const exists = deps.exists ?? existsSync;
    const mkdirp =
      deps.mkdirp
      ?? ((path: string) => {
        mkdirSync(path, { recursive: true });
      });

    mkdirp(captureRoot);
    mkdirp(logRoot);

    await assertCurrentPreflight(
      deps,
      captureRoot,
      "Preflight: verifying it is safe to start a capture...",
    );

    if (isEightHour) {
      await assertRestartAuthorization(
        deps,
        restartAuthDir!,
        reconnectAuthDir!,
      );
      await assertCurrentPreflight(
        deps,
        captureRoot,
        "Second preflight: re-checking lock/blockers immediately before eight-hour spawn...",
      );
    } else if (durationMinutes === SIX_HOUR_DURATION_MINUTES) {
      deps.io.writeStdout(
        "NONCANONICAL-DURATION: this six-hour capture uses the canonical workload "
          + "except duration=360. It does NOT satisfy or claim the eight-hour restart gate.\n",
      );
    }

    const startedAt = deps.now?.() ?? new Date();
    const stamp = formatStamp(startedAt);
    const logName =
      isEightHour ? `capture-8h-${stamp}.log` : `capture-${stamp}.log`;
    const logPath = join(logRoot, logName);

    deps.io.writeStdout("\n");
    deps.io.writeStdout(`Starting ${modeLabel} Kalshi capture with progress...\n`);
    deps.io.writeStdout(`  series:      ${profile.series}\n`);
    deps.io.writeStdout(`  duration:    ${durationMinutes} minutes\n`);
    deps.io.writeStdout(`  maxMarkets:  ${profile.maxMarkets}\n`);
    deps.io.writeStdout(`  throttleMs:  ${profile.topOfBookThrottleMs}\n`);
    deps.io.writeStdout(`  log:         ${logPath}\n`);
    deps.io.writeStdout("\n");

    const runState: {
      identity: ExactCaptureRunIdentity | null;
      identityConflict: string | null;
      progressHandle: ProgressMonitorHandle | null;
    } = {
      identity: null,
      identityConflict: null,
      progressHandle: null,
    };
    let stdoutBuffer = "";

    const attachProgressMonitor = (parsed: ExactCaptureRunIdentity): void => {
      if (runState.progressHandle !== null) {
        return;
      }
      runState.progressHandle = startCaptureProgressMonitor({
        runId: parsed.runId,
        runDir: parsed.runDir,
        durationMinutes,
        startedAtMs: startedAt.getTime(),
        intervalMs: progressIntervalMs,
        writeLine: (line) => {
          deps.io.writeStdout(`${line}\n`);
        },
      });
      deps.io.writeStdout("Capture progress attached:\n");
      deps.io.writeStdout(`  runId:  ${parsed.runId}\n`);
      deps.io.writeStdout(`  runDir: ${parsed.runDir}\n`);
    };

    const spawnCapture = deps.spawnCapture ?? spawnWithTee;
    const child = await spawnCapture({
      command: resolveNpxCommand(),
      args: buildTsxArgs(
        "scripts/live/runForwardQuoteCapture.ts",
        captureArgv,
      ),
      logPath,
      env: process.env,
      onStdoutChunk: (chunk) => {
        stdoutBuffer += chunk;
        if (runState.identityConflict !== null) {
          return;
        }
        try {
          const parsed = tryParseExactRunIdentityFromChunk(stdoutBuffer);
          if (!parsed) {
            return;
          }
          if (runState.identity === null) {
            if (!exists(parsed.runDir)) {
              return;
            }
            runState.identity = parsed;
            attachProgressMonitor(parsed);
            return;
          }
          if (!exactCaptureIdentitiesMatch(runState.identity, parsed)) {
            runState.identityConflict =
              "Startup/final capture identity mismatch: "
              + `startup runId=${runState.identity.runId} runDir=${runState.identity.runDir}; `
              + `observed runId=${parsed.runId} runDir=${parsed.runDir}. `
              + "Failing closed; not switching the progress monitor to a second identity.";
            runState.progressHandle?.stop();
          }
        } catch (error) {
          if (
            error instanceof OperatorCliError
            && error.message.includes("Startup/final capture identity mismatch")
          ) {
            runState.identityConflict = error.message;
            runState.progressHandle?.stop();
            return;
          }
          // Incomplete/malformed identity JSON fails closed after the child
          // exits (below). Incomplete trailing chunks are ignored by the
          // parser; complete malformed lines rethrow as Malformed.
          if (
            error instanceof OperatorCliError
            && error.message.includes("Malformed")
          ) {
            runState.identityConflict = error.message;
            runState.progressHandle?.stop();
          }
        }
      },
    });

    runState.progressHandle?.stop();

    if (runState.identityConflict !== null) {
      deps.io.writeStdout("\n");
      deps.io.writeStdout(`Capture log preserved at:\n  ${logPath}\n`);
      if (runState.identity !== null) {
        deps.io.writeStdout("Exact startup identity retained for diagnostics:\n");
        deps.io.writeStdout(`  runId:   ${runState.identity.runId}\n`);
        deps.io.writeStdout(`  runDir:  ${runState.identity.runDir}\n`);
      }
      throw new OperatorCliError(runState.identityConflict);
    }

    let finalIdentity: ExactCaptureRunIdentity | null = runState.identity;
    if (finalIdentity === null) {
      try {
        finalIdentity = parseExactRunIdentityFromOutput(child.stdout);
      } catch (error) {
        deps.io.writeStdout("\n");
        deps.io.writeStdout(`Capture log preserved at:\n  ${logPath}\n`);
        if (child.exitCode !== 0 || child.signal) {
          deps.io.writeStderr(
            `Capture exited before publishing run identity `
              + `(exit=${child.exitCode}, signal=${child.signal}). `
              + "Failing closed; not auditing an unrelated run.\n",
          );
        }
        throw error;
      }
    } else {
      // Startup identity won; still require any later identity in stdout to match.
      try {
        const fromOutput = parseExactRunIdentityFromOutput(child.stdout);
        if (!exactCaptureIdentitiesMatch(finalIdentity, fromOutput)) {
          throw new OperatorCliError(
            "Startup/final capture identity mismatch: "
              + `startup runId=${finalIdentity.runId} runDir=${finalIdentity.runDir}; `
              + `final runId=${fromOutput.runId} runDir=${fromOutput.runDir}. `
              + "Failing closed; not switching the progress monitor to a second identity.",
          );
        }
      } catch (error) {
        if (
          error instanceof OperatorCliError
          && (
            error.message.includes("Startup/final capture identity mismatch")
            || error.message.includes("Malformed run identity JSON")
          )
        ) {
          deps.io.writeStdout("\n");
          deps.io.writeStdout(`Capture log preserved at:\n  ${logPath}\n`);
          deps.io.writeStdout("Exact startup identity retained for diagnostics:\n");
          deps.io.writeStdout(`  runId:   ${finalIdentity.runId}\n`);
          deps.io.writeStdout(`  runDir:  ${finalIdentity.runDir}\n`);
          throw error;
        }
        // No additional identity in stdout (abnormal exit after startup only).
      }
    }

    if (!exists(finalIdentity.runDir)) {
      deps.io.writeStdout(`Capture log preserved at:\n  ${logPath}\n`);
      throw new OperatorCliError(
        `Capture run directory not found for runId '${finalIdentity.runId}' `
          + `(expected ${finalIdentity.runDir}).`,
      );
    }

    deps.io.writeStdout("\n");
    deps.io.writeStdout("Exact capture run:\n");
    deps.io.writeStdout(`  runId:   ${finalIdentity.runId}\n`);
    deps.io.writeStdout(`  runDir:  ${finalIdentity.runDir}\n`);
    deps.io.writeStdout(`  log:     ${logPath}\n`);
    deps.io.writeStdout("\n");
    deps.io.writeStdout("Run audit with:\n");
    deps.io.writeStdout(
      `  npm run operator:audit-capture -- --run-id ${finalIdentity.runId} --full\n`,
    );

    if (child.signal) {
      deps.io.writeStderr(`Capture terminated by signal ${child.signal}\n`);
      return 1;
    }
    if (child.exitCode === null) {
      deps.io.writeStderr("Capture exited without an exit code\n");
      return 1;
    }
    return child.exitCode;
  } catch (error) {
    deps.io.writeStderr(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 1;
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const io: CommandIo = {
    writeStdout: (text) => {
      process.stdout.write(text);
    },
    writeStderr: (text) => {
      process.stderr.write(text);
    },
  };
  const dryRunPlan = hasFlag(argv, "--dry-run-plan");
  const runner = dryRunPlan
    ? createPlanOnlyRunner(io)
    : createDefaultCommandRunner(io);
  process.exitCode = await runCaptureWithProgressCommand(argv, {
    runner,
    io,
    requireCredentials: !dryRunPlan,
  });
}

const isDirectInvocation =
  process.argv[1] !== undefined
  && pathToFileURL(resolve(process.argv[1])).href.toLowerCase()
    === import.meta.url.toLowerCase();

if (process.env.VITEST !== "true" && isDirectInvocation) {
  void main();
}
