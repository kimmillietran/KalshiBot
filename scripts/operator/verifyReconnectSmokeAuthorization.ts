/**
 * Verify a persisted reconnect-smoke authorization summary for eight-hour starts.
 *
 * Fail-closed. Never fabricates orchestration exit codes. Never selects "latest".
 * Revalidates exact-run artifacts and re-runs the capture restart gate.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  hasFlag,
  OperatorCliError,
  readFlagValue,
} from "./shared/argv";
import {
  createDefaultCommandRunner,
  createPlanOnlyRunner,
  type CommandIo,
  type OperatorCommandRunner,
} from "./shared/commandRunner";
import {
  normalizeRunDir,
  readReconnectSmokeAuthorizationSummary,
  verifyPersistedReconnectSmokeAuthorization,
} from "./shared/reconnectSmokeAuthorization";

export type VerifyReconnectSmokeAuthorizationDeps = {
  runner: OperatorCommandRunner;
  io: CommandIo;
  exists?: (path: string) => boolean;
  readUtf8?: (path: string) => string;
};

function assertExactRunArtifactsPresent(
  runDir: string,
  exists: (path: string) => boolean,
  readUtf8: (path: string) => string,
): void {
  const required = [
    "capture-run-status.json",
    "capture-health.json",
    "capture-health-audit.json",
    "capture-lifecycle.jsonl",
  ] as const;
  for (const name of required) {
    const path = join(runDir, name);
    if (!exists(path)) {
      throw new OperatorCliError(
        `Exact-run artifact missing during reconnect authorization revalidation: ${path}`,
      );
    }
    // Touch-read to fail closed on unreadable files.
    readUtf8(path);
  }
}

export async function runVerifyReconnectSmokeAuthorizationCommand(
  argv: readonly string[],
  deps: VerifyReconnectSmokeAuthorizationDeps,
): Promise<number> {
  try {
    const dryRunPlan = hasFlag(argv, "--dry-run-plan");
    const runDir = readFlagValue(argv, "--run-dir");
    if (!runDir) {
      throw new OperatorCliError(
        "Usage: --run-dir <exact-reconnect-smoke-run-dir> [--dry-run-plan]",
      );
    }

    if (dryRunPlan) {
      deps.io.writeStdout(
        "DRY-RUN-PLAN: verify-reconnect-smoke-authorization\n",
      );
      deps.io.writeStdout(`  runDir=${runDir}\n`);
      deps.io.writeStdout(
        "  sequence: read authorization summary → fail-closed field checks → "
          + "revalidate exact-run artifacts → re-run capture restart gate\n",
      );
      deps.io.writeStdout(
        "  note: dry-run-plan does not authorize eight-hour capture.\n",
      );
      return 0;
    }

    const exists = deps.exists ?? existsSync;
    const readUtf8 =
      deps.readUtf8 ?? ((path: string) => readFileSync(path, "utf8"));

    if (!exists(runDir)) {
      throw new OperatorCliError(
        `Reconnect-smoke authorization run directory not found: ${runDir}`,
      );
    }

    const summary = readReconnectSmokeAuthorizationSummary(runDir);
    const verified = verifyPersistedReconnectSmokeAuthorization({
      expectedRunDir: runDir,
      summary,
    });
    if (!verified.ok) {
      throw new OperatorCliError(
        "Eight-hour capture denied: reconnect-smoke authorization failed: "
          + verified.reasons.join("; "),
      );
    }

    assertExactRunArtifactsPresent(runDir, exists, readUtf8);

    const restartGate = await deps.runner.runTsx(
      "scripts/research/evaluateCaptureRestartGate.ts",
      ["--capture-run-dir", runDir],
    );
    if (restartGate.exitCode !== 0) {
      throw new OperatorCliError(
        "Eight-hour capture denied: reconnect-smoke run failed exact restart-gate "
          + `revalidation (exit=${restartGate.exitCode}, runDir=${normalizeRunDir(runDir)}).`,
      );
    }

    deps.io.writeStdout(
      `Reconnect-smoke authorization verified for run ${summary.runId} `
        + `(controlledReconnectProven=true, passed=true).\n`,
    );
    return 0;
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
  process.exitCode = await runVerifyReconnectSmokeAuthorizationCommand(argv, {
    runner,
    io,
  });
}

const isDirectInvocation =
  process.argv[1] !== undefined
  && pathToFileURL(resolve(process.argv[1])).href.toLowerCase()
    === import.meta.url.toLowerCase();

if (process.env.VITEST !== "true" && isDirectInvocation) {
  void main();
}
