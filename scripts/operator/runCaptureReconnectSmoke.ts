/**
 * M12.1I: cross-platform controlled reconnect smoke (ports PR #41 / M12.1H).
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  assertNoForbiddenFlags,
  collectUnknownFlags,
  hasFlag,
  OperatorCliError,
  readNumberFlag,
} from "./shared/argv";
import {
  buildCanonicalCaptureArgv,
  loadCanonicalCaptureProfile,
} from "./shared/canonicalProfile";
import {
  createDefaultCommandRunner,
  createPlanOnlyRunner,
  type CommandIo,
  type OperatorCommandRunner,
} from "./shared/commandRunner";
import {
  DEFAULT_CAPTURE_ROOT,
  FORBIDDEN_SKIP_GATE_FLAGS,
  RECONNECT_SMOKE_DURATION_MAX,
  RECONNECT_SMOKE_DURATION_MIN,
} from "./shared/constants";
import { requireKalshiEnv } from "./shared/kalshiEnv";
import { parseExactRunIdentityFromOutput } from "./shared/runIdentity";

const KNOWN_FLAGS = new Set([
  "--duration-minutes",
  "--dry-run-plan",
  "--capture-root",
]);

export type ReconnectSmokeDeps = {
  runner: OperatorCommandRunner;
  io: CommandIo;
  requireCredentials?: boolean;
  lockExists?: (lockPath: string) => boolean;
  readUtf8?: (path: string) => string;
};

export async function runCaptureReconnectSmokeCommand(
  argv: readonly string[],
  deps: ReconnectSmokeDeps,
): Promise<number> {
  const lockExists = deps.lockExists ?? existsSync;
  const readUtf8 = deps.readUtf8 ?? ((path: string) => readFileSync(path, "utf8"));

  let captureAttempted = false;
  let runIdentified = false;
  let runId: string | null = null;
  let runDir: string | null = null;
  let captureExitCode = 1;
  let auditExitCode = 1;
  let restartGateExitCode = 1;
  let postRunPreflightExitCode = 1;
  let lockPresent = true;
  let primaryFailure: Error | null = null;
  let gateExitCode = 1;
  let captureRoot = DEFAULT_CAPTURE_ROOT;
  let durationMinutes = 20;

  try {
    assertNoForbiddenFlags(argv, FORBIDDEN_SKIP_GATE_FLAGS);
    const unknown = collectUnknownFlags(argv, KNOWN_FLAGS);
    if (unknown.length > 0) {
      throw new OperatorCliError(`Unknown argument(s): ${unknown.join(", ")}`);
    }

    const dryRunPlan = hasFlag(argv, "--dry-run-plan");
    durationMinutes = readNumberFlag(argv, "--duration-minutes") ?? 20;
    captureRoot =
      argv.includes("--capture-root")
        ? argv[argv.indexOf("--capture-root") + 1]!
        : DEFAULT_CAPTURE_ROOT;

    if (
      durationMinutes < RECONNECT_SMOKE_DURATION_MIN
      || durationMinutes > RECONNECT_SMOKE_DURATION_MAX
    ) {
      throw new OperatorCliError(
        `DurationMinutes must be between ${RECONNECT_SMOKE_DURATION_MIN} and `
          + `${RECONNECT_SMOKE_DURATION_MAX} (got ${durationMinutes}). `
          + "This is a reconnect smoke gate, not an eight-hour capture.",
      );
    }
    if (durationMinutes >= 480) {
      throw new OperatorCliError(
        `Refusing to start an eight-hour capture from reconnect smoke `
          + `(DurationMinutes=${durationMinutes}).`,
      );
    }

    const profile = loadCanonicalCaptureProfile();
    if (profile.wsWatchdogEnabled !== true) {
      throw new OperatorCliError(
        "Canonical capture profile must have wsWatchdogEnabled=true for reconnect validation.",
      );
    }
    if (!profile.captureBtcSpot) {
      throw new OperatorCliError(
        "Canonical reconnect smoke requires captureBtcSpot=true.",
      );
    }

    if (dryRunPlan) {
      deps.io.writeStdout("DRY-RUN-PLAN: capture-reconnect-smoke\n");
      deps.io.writeStdout(
        `  durationMinutes=${durationMinutes} (15-20 reconnect window)\n`,
      );
      deps.io.writeStdout(
        `  profile: series=${profile.series} maxMarkets=${profile.maxMarkets} `
          + `throttleMs=${profile.topOfBookThrottleMs}\n`,
      );
      deps.io.writeStdout("  gate sequence:\n");
      deps.io.writeStdout("    1) assert-no-active-capture preflight\n");
      deps.io.writeStdout(
        "    2) runReconnectValidationCapture (forceReconnectAfterFirstValidTopOfBook)\n",
      );
      deps.io.writeStdout("    3) buildCaptureHealthAudit (exact run)\n");
      deps.io.writeStdout("    4) status/health/lifecycle identity checks\n");
      deps.io.writeStdout("    5) evaluateCaptureRestartGate (named flags)\n");
      deps.io.writeStdout(
        "    6) post-run preflight + evaluateReconnectSmokeGate (always)\n",
      );
      deps.io.writeStdout(
        "  note: dry-run-plan does not prove controlledReconnectProven.\n",
      );
      await deps.runner.runTsx(
        "scripts/research/evaluateCaptureRestartGate.ts",
        ["--assert-no-active-capture", "--capture-root", captureRoot],
      );
      await deps.runner.runTsx(
        "scripts/live/runReconnectValidationCapture.ts",
        buildCanonicalCaptureArgv(profile, durationMinutes),
      );
      return 0;
    }

    if (deps.requireCredentials !== false) {
      requireKalshiEnv();
    }

    deps.io.writeStdout("Step 1/6: verifying it is safe to start a capture...\n");
    const preflight = await deps.runner.runTsx(
      "scripts/research/evaluateCaptureRestartGate.ts",
      ["--assert-no-active-capture", "--capture-root", captureRoot],
    );
    if (preflight.exitCode !== 0) {
      throw new OperatorCliError(
        "Capture-start preflight failed; refusing to start the reconnect smoke capture.",
      );
    }

    try {
      deps.io.writeStdout(
        `Step 2/6: running ${durationMinutes}-minute reconnect validation capture `
          + `(series ${profile.series}, ${profile.maxMarkets} markets, throttle `
          + `${profile.topOfBookThrottleMs}ms, forceReconnectAfterFirstValidTopOfBook)...\n`,
      );
      captureAttempted = true;
      const capture = await deps.runner.runTsx(
        "scripts/live/runReconnectValidationCapture.ts",
        buildCanonicalCaptureArgv(profile, durationMinutes),
      );
      captureExitCode = capture.exitCode;

      const identity = parseExactRunIdentityFromOutput(capture.stdout);
      // Never fall back to newest-directory / mtime selection.
      if (!existsSync(identity.runDir)) {
        throw new OperatorCliError(
          `Capture run directory not found for runId '${identity.runId}' (expected ${identity.runDir}).`,
        );
      }
      runId = identity.runId;
      runDir = identity.runDir;
      runIdentified = true;

      deps.io.writeStdout("\nReconnect smoke capture run:\n");
      deps.io.writeStdout(`  runId:   ${runId}\n`);
      deps.io.writeStdout(`  runDir:  ${runDir}\n`);
      deps.io.writeStdout(`  capture exit code: ${captureExitCode}\n`);
      if (captureExitCode !== 0) {
        deps.io.writeStdout(
          "  capture failed; continuing exact-run diagnostics (reconnect gate will be denied).\n",
        );
      }
      deps.io.writeStdout("\n");

      deps.io.writeStdout("Step 3/6: running capture health audit on the exact run...\n");
      const audit = await deps.runner.runTsx(
        "scripts/research/buildCaptureHealthAudit.ts",
        ["--capture-run-dir", runDir],
      );
      auditExitCode = audit.exitCode;
      deps.io.writeStdout(`  capture-health-audit exit code: ${auditExitCode}\n`);

      const auditPath = join(runDir, "capture-health-audit.json");
      if (!existsSync(auditPath)) {
        throw new OperatorCliError(
          `capture-health-audit.json missing for exact run ${runDir}`,
        );
      }

      deps.io.writeStdout(
        "Step 4/6: verifying exact-run status, health, and lifecycle artifacts...\n",
      );
      const statusPath = join(runDir, "capture-run-status.json");
      const healthPath = join(runDir, "capture-health.json");
      const lifecyclePath = join(runDir, "capture-lifecycle.jsonl");
      if (!existsSync(statusPath)) {
        throw new OperatorCliError(
          `capture-run-status.json missing for exact run ${runDir}`,
        );
      }
      if (!existsSync(healthPath)) {
        throw new OperatorCliError(
          `capture-health.json missing for exact run ${runDir}`,
        );
      }
      if (!existsSync(lifecyclePath)) {
        throw new OperatorCliError(
          `capture-lifecycle.jsonl missing for exact run ${runDir}`,
        );
      }

      const status = JSON.parse(readUtf8(statusPath)) as Record<string, unknown>;
      const health = JSON.parse(readUtf8(healthPath)) as Record<string, unknown>;
      const auditJson = JSON.parse(readUtf8(auditPath)) as Record<string, unknown>;
      const auditSummary = auditJson.summary as Record<string, unknown> | undefined;
      deps.io.writeStdout(
        `  status.state=${String(status.state)} health.verdict=${String(health.verdict)} `
          + `audit.verdict=${String(auditSummary?.verdict)} `
          + `audit.selectedRunId=${String(auditJson.selectedRunId)}\n`,
      );

      deps.io.writeStdout("Step 5/6: evaluating exact-run restart gate...\n");
      const restartGate = await deps.runner.runTsx(
        "scripts/research/evaluateCaptureRestartGate.ts",
        [
          "--capture-run-dir",
          runDir,
          "--expected-duration-minutes",
          String(durationMinutes),
        ],
      );
      restartGateExitCode = restartGate.exitCode;
      deps.io.writeStdout(`  restart-gate exit code: ${restartGateExitCode}\n`);
    } catch (error) {
      primaryFailure =
        error instanceof Error ? error : new Error(String(error));
      deps.io.writeStdout(
        `Primary reconnect-smoke step failed: ${primaryFailure.message}\n`,
      );
    } finally {
      if (captureAttempted) {
        deps.io.writeStdout(
          "Step 6/6: verifying post-run lock absence (finally) and evaluating reconnect gate...\n",
        );
        const postRun = await deps.runner.runTsx(
          "scripts/research/evaluateCaptureRestartGate.ts",
          ["--assert-no-active-capture", "--capture-root", captureRoot],
        );
        postRunPreflightExitCode = postRun.exitCode;
        deps.io.writeStdout(
          `  post-run preflight exit code: ${postRunPreflightExitCode}\n`,
        );

        const lockPath = join(captureRoot, "capture.lock");
        lockPresent = lockExists(lockPath);
        if (lockPresent) {
          deps.io.writeStdout(
            `  capture.lock is still present at ${lockPath} (fail closed; lock not deleted).\n`,
          );
        }

        if (runIdentified && runId && runDir) {
          const reconnectGate = await deps.runner.runTsx(
            "scripts/research/evaluateReconnectSmokeGate.ts",
            [
              "--run-id",
              runId,
              "--run-dir",
              runDir,
              "--duration-minutes",
              String(durationMinutes),
              "--capture-exit-code",
              String(captureExitCode),
              "--audit-exit-code",
              String(auditExitCode),
              "--restart-gate-exit-code",
              String(restartGateExitCode),
              "--post-run-preflight-exit-code",
              String(postRunPreflightExitCode),
              "--lock-present",
              lockPresent ? "true" : "false",
            ],
          );
          gateExitCode = reconnectGate.exitCode;
        } else {
          deps.io.writeStdout(
            "  exact run was not identified; skipping lifecycle evaluator (still fail closed).\n",
          );
          gateExitCode = 1;
        }
      }
    }

    if (primaryFailure !== null) {
      deps.io.writeStdout("\n");
      deps.io.writeStdout(
        `RECONNECT GATE FAILED: primary step error (run ${runId}).\n`,
      );
      deps.io.writeStdout(`  ${primaryFailure.message}\n`);
      return 1;
    }

    if (
      gateExitCode === 0
      && postRunPreflightExitCode === 0
      && !lockPresent
    ) {
      deps.io.writeStdout("\n");
      deps.io.writeStdout(
        `RECONNECT GATE PASSED: reconnect auth finalization validated (run ${runId}).\n`,
      );
      return 0;
    }

    deps.io.writeStdout("\n");
    deps.io.writeStdout(
      `RECONNECT GATE FAILED: do NOT treat reconnect as proven (run ${runId}).\n`,
    );
    return 1;
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
  const exitCode = await runCaptureReconnectSmokeCommand(argv, {
    runner,
    io,
    requireCredentials: !dryRunPlan,
  });
  process.exitCode = exitCode;
}

const isDirectInvocation =
  process.argv[1] !== undefined
  && pathToFileURL(resolve(process.argv[1])).href.toLowerCase()
    === import.meta.url.toLowerCase();

if (process.env.VITEST !== "true" && isDirectInvocation) {
  void main();
}
