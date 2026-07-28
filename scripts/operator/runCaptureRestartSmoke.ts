/**
 * M12.1I: cross-platform normal restart smoke (ports PR #41 / M12.1F behavior).
 *
 * Canonical workload from TypeScript profile; duration is the only documented
 * smoke exception. Exact-run identity from capture stdout JSON — never newest dir.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
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
} from "./shared/constants";
import { requireKalshiEnv } from "./shared/kalshiEnv";
import { parseExactRunIdentityFromOutput } from "./shared/runIdentity";

const KNOWN_FLAGS = new Set([
  "--duration-minutes",
  "--dry-run-plan",
  "--capture-root",
]);

export type RestartSmokeDeps = {
  runner: OperatorCommandRunner;
  io: CommandIo;
  requireCredentials?: boolean;
  now?: () => Date;
};

export async function runCaptureRestartSmokeCommand(
  argv: readonly string[],
  deps: RestartSmokeDeps,
): Promise<number> {
  try {
    assertNoForbiddenFlags(argv, FORBIDDEN_SKIP_GATE_FLAGS);
    const unknown = collectUnknownFlags(argv, KNOWN_FLAGS);
    if (unknown.length > 0) {
      throw new OperatorCliError(`Unknown argument(s): ${unknown.join(", ")}`);
    }

    const dryRunPlan = hasFlag(argv, "--dry-run-plan");
    const durationMinutes = readNumberFlag(argv, "--duration-minutes") ?? 20;
    const captureRoot =
      argv.includes("--capture-root")
        ? argv[argv.indexOf("--capture-root") + 1]!
        : DEFAULT_CAPTURE_ROOT;

    const profile = loadCanonicalCaptureProfile();

    if (
      durationMinutes < profile.smokeDurationMinutesMin
      || durationMinutes > profile.smokeDurationMinutesMax
    ) {
      throw new OperatorCliError(
        `DurationMinutes must be between ${profile.smokeDurationMinutesMin} and `
          + `${profile.smokeDurationMinutesMax} (got ${durationMinutes}). `
          + "This is a smoke gate, not an eight-hour capture.",
      );
    }

    if (dryRunPlan) {
      deps.io.writeStdout("DRY-RUN-PLAN: capture-restart-smoke\n");
      deps.io.writeStdout(
        `  durationMinutes=${durationMinutes} (smoke exception; not eight-hour readiness claim)\n`,
      );
      deps.io.writeStdout(
        `  profile: series=${profile.series} maxMarkets=${profile.maxMarkets} `
          + `throttleMs=${profile.topOfBookThrottleMs} captureBtcSpot=${profile.captureBtcSpot}\n`,
      );
      deps.io.writeStdout("  gate sequence:\n");
      deps.io.writeStdout("    1) assert-no-active-capture preflight\n");
      deps.io.writeStdout("    2) runForwardQuoteCapture (canonical workload)\n");
      deps.io.writeStdout("    3) buildCaptureHealthAudit (exact run)\n");
      deps.io.writeStdout("    4) bid-size + health reconciliation (exact run)\n");
      deps.io.writeStdout("    5) evaluateCaptureRestartGate (exact run)\n");
      deps.io.writeStdout(
        "  note: dry-run-plan does not authorize eight-hour restart.\n",
      );
      await deps.runner.runTsx(
        "scripts/research/evaluateCaptureRestartGate.ts",
        ["--assert-no-active-capture", "--capture-root", captureRoot],
      );
      await deps.runner.runTsx(
        "scripts/live/runForwardQuoteCapture.ts",
        buildCanonicalCaptureArgv(profile, durationMinutes),
      );
      return 0;
    }

    if (deps.requireCredentials !== false) {
      requireKalshiEnv();
    }

    deps.io.writeStdout("Step 1/5: verifying it is safe to start a capture...\n");
    const preflight = await deps.runner.runTsx(
      "scripts/research/evaluateCaptureRestartGate.ts",
      ["--assert-no-active-capture", "--capture-root", captureRoot],
    );
    if (preflight.exitCode !== 0) {
      throw new OperatorCliError(
        "Capture-start preflight failed; refusing to start the smoke capture.",
      );
    }

    deps.io.writeStdout(
      `Step 2/5: running ${durationMinutes}-minute authenticated live capture `
        + `(series ${profile.series}, throttle ${profile.topOfBookThrottleMs}ms, `
        + `${profile.maxMarkets} markets)...\n`,
    );
    const capture = await deps.runner.runTsx(
      "scripts/live/runForwardQuoteCapture.ts",
      buildCanonicalCaptureArgv(profile, durationMinutes),
    );
    const captureExitCode = capture.exitCode;

    const identity = parseExactRunIdentityFromOutput(capture.stdout);
    // Never fall back to newest-directory / mtime selection.
    if (!existsSync(identity.runDir)) {
      throw new OperatorCliError(
        `Capture run directory not found for runId '${identity.runId}' (expected ${identity.runDir}).`,
      );
    }

    deps.io.writeStdout("\nSmoke capture run:\n");
    deps.io.writeStdout(`  runId:   ${identity.runId}\n`);
    deps.io.writeStdout(`  runDir:  ${identity.runDir}\n`);
    deps.io.writeStdout(`  capture exit code: ${captureExitCode}\n`);
    if (captureExitCode !== 0) {
      deps.io.writeStdout(
        "  capture failed; continuing exact-run diagnostics and restart gate (restart will be denied).\n",
      );
    }
    deps.io.writeStdout("\n");

    deps.io.writeStdout("Step 3/5: running capture health audit on the exact run...\n");
    const audit = await deps.runner.runTsx(
      "scripts/research/buildCaptureHealthAudit.ts",
      ["--capture-run-dir", identity.runDir],
    );
    deps.io.writeStdout(`  capture-health-audit exit code: ${audit.exitCode}\n`);

    deps.io.writeStdout(
      "Step 4/5: running bid-size coverage audit and health reconciliation...\n",
    );
    const bidSize = await deps.runner.runTsx(
      "scripts/research/buildBidSizeCoverageAudit.ts",
      ["--capture-run-dir", identity.runDir],
    );
    deps.io.writeStdout(
      `  bid-size-coverage-audit exit code: ${bidSize.exitCode}\n`,
    );
    const reconciliation = await deps.runner.runTsx(
      "scripts/research/buildCaptureHealthReconciliation.ts",
      ["--capture-run-dir", identity.runDir],
    );
    deps.io.writeStdout(
      `  capture-health-reconciliation exit code: ${reconciliation.exitCode}\n`,
    );

    deps.io.writeStdout("Step 5/5: evaluating eight-hour restart gate...\n");
    const gate = await deps.runner.runTsx(
      "scripts/research/evaluateCaptureRestartGate.ts",
      [
        "--capture-run-dir",
        identity.runDir,
        "--expected-duration-minutes",
        String(durationMinutes),
      ],
    );

    const failedSteps: string[] = [];
    if (gate.exitCode !== 0) {
      failedSteps.push(`restart-gate (${gate.exitCode})`);
    }
    if (captureExitCode !== 0) {
      failedSteps.push(`capture (${captureExitCode})`);
    }
    if (audit.exitCode !== 0) {
      failedSteps.push(`capture-health-audit (${audit.exitCode})`);
    }
    if (bidSize.exitCode !== 0) {
      failedSteps.push(`bid-size-coverage-audit (${bidSize.exitCode})`);
    }
    if (reconciliation.exitCode !== 0) {
      failedSteps.push(`capture-health-reconciliation (${reconciliation.exitCode})`);
    }

    if (failedSteps.length === 0) {
      deps.io.writeStdout("\n");
      deps.io.writeStdout(
        `RESTART GATE PASSED: eight-hour captures may be restarted (run ${identity.runId}).\n`,
      );
      return 0;
    }

    deps.io.writeStdout("\n");
    deps.io.writeStdout(
      `RESTART GATE FAILED: do NOT restart eight-hour captures (run ${identity.runId}).\n`,
    );
    deps.io.writeStdout(`  failed steps: ${failedSteps.join(", ")}\n`);
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
  const exitCode = await runCaptureRestartSmokeCommand(argv, {
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
