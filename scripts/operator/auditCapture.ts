/**
 * M12.1I: cross-platform capture audit wrapper (ports audit-latest-capture.ps1).
 *
 * Prefer explicit selectors: --run-id, --run-dir, --latest.
 */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  assertNoForbiddenFlags,
  collectUnknownFlags,
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
import { DEFAULT_CAPTURE_ROOT, FORBIDDEN_SKIP_GATE_FLAGS } from "./shared/constants";

const KNOWN_FLAGS = new Set([
  "--run-id",
  "--run-dir",
  "--latest",
  "--full",
  "--allow-non-completed",
  "--dry-run-plan",
  "--capture-root",
]);

export type AuditCaptureDeps = {
  runner: OperatorCommandRunner;
  io: CommandIo;
};

type SelectionResult = {
  outcome: string;
  runId?: string;
  runDir?: string;
  runState?: string;
  warnings?: string[];
  reason?: string;
};

function parseSelectionJson(stdout: string): SelectionResult {
  const line = stdout
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .at(-1);
  if (!line) {
    throw new OperatorCliError("No auditable capture run selected: empty selector output");
  }
  try {
    return JSON.parse(line) as SelectionResult;
  } catch {
    throw new OperatorCliError(
      `No auditable capture run selected: malformed selector JSON`,
    );
  }
}

export async function runAuditCaptureCommand(
  argv: readonly string[],
  deps: AuditCaptureDeps,
): Promise<number> {
  try {
    assertNoForbiddenFlags(argv, FORBIDDEN_SKIP_GATE_FLAGS);
    const unknown = collectUnknownFlags(argv, KNOWN_FLAGS);
    if (unknown.length > 0) {
      throw new OperatorCliError(`Unknown argument(s): ${unknown.join(", ")}`);
    }

    const dryRunPlan = hasFlag(argv, "--dry-run-plan");
    const full = hasFlag(argv, "--full");
    const latest = hasFlag(argv, "--latest");
    const allowNonCompleted = hasFlag(argv, "--allow-non-completed");
    const runIdFlag = readFlagValue(argv, "--run-id");
    const runDirFlag = readFlagValue(argv, "--run-dir");
    const captureRoot =
      readFlagValue(argv, "--capture-root") ?? DEFAULT_CAPTURE_ROOT;

    const selectorCount = [Boolean(runIdFlag), Boolean(runDirFlag), latest].filter(
      Boolean,
    ).length;
    if (selectorCount === 0) {
      throw new OperatorCliError(
        "Select a run with --run-id <id>, --run-dir <path>, or --latest.",
      );
    }
    if (selectorCount > 1) {
      throw new OperatorCliError(
        "Use exactly one of --run-id, --run-dir, or --latest.",
      );
    }

    if (dryRunPlan) {
      deps.io.writeStdout("DRY-RUN-PLAN: audit-capture\n");
      deps.io.writeStdout(
        `  selector: ${
          runIdFlag
            ? `--run-id ${runIdFlag}`
            : runDirFlag
              ? `--run-dir ${runDirFlag}`
              : "--latest"
        }\n`,
      );
      deps.io.writeStdout(`  full=${full} allowNonCompleted=${allowNonCompleted}\n`);
      deps.io.writeStdout("  sequence: select → health audit → bid-size → reconciliation");
      if (full) {
        deps.io.writeStdout(" → full research pipeline");
      }
      deps.io.writeStdout("\n");
      deps.io.writeStdout(
        "  note: dry-run-plan does not audit a live capture run.\n",
      );
      return 0;
    }

    const selectorArgs = ["--capture-root", captureRoot];
    if (runDirFlag) {
      selectorArgs.push("--run-dir", runDirFlag);
    } else if (runIdFlag) {
      selectorArgs.push("--run-dir", `${captureRoot}/${runIdFlag}`);
    }
    // --latest uses default lifecycle-aware selection (completed runs only).

    const selectionResult = await deps.runner.runTsx(
      "scripts/live/selectAuditableCaptureRun.ts",
      selectorArgs,
    );
    if (selectionResult.exitCode !== 0) {
      let reason = "unknown";
      try {
        reason = parseSelectionJson(selectionResult.stdout).reason ?? reason;
      } catch {
        // keep unknown
      }
      throw new OperatorCliError(`No auditable capture run selected: ${reason}`);
    }

    const selection = parseSelectionJson(selectionResult.stdout);
    if (selection.outcome !== "selected" || !selection.runId || !selection.runDir) {
      throw new OperatorCliError(
        `No auditable capture run selected: ${selection.reason ?? "not selected"}`,
      );
    }

    const selectedRunId = selection.runId;
    const selectedRunDir = selection.runDir;

    deps.io.writeStdout("\nSelected capture run:\n");
    deps.io.writeStdout(`  runId:    ${selectedRunId}\n`);
    deps.io.writeStdout(`  runDir:   ${selectedRunDir}\n`);
    deps.io.writeStdout(`  runState: ${selection.runState ?? "unknown"}\n`);
    for (const warning of selection.warnings ?? []) {
      deps.io.writeStdout(`  warning:  ${warning}\n`);
    }
    deps.io.writeStdout("\n");

    if (
      !allowNonCompleted
      && selection.runState
      && selection.runState !== "completed"
      && !runDirFlag
      && !runIdFlag
    ) {
      throw new OperatorCliError(
        `Selected run ${selectedRunId} is not completed (state=${selection.runState}). `
          + "Pass --allow-non-completed for diagnostics, or select an explicit --run-dir.",
      );
    }

    const assertOk = async (step: string, script: string, args: string[]) => {
      deps.io.writeStdout(`Running ${step}...\n`);
      const result = await deps.runner.runTsx(script, args);
      if (result.exitCode !== 0) {
        throw new OperatorCliError(
          `Audit step failed: ${step} (exit code ${result.exitCode})`,
        );
      }
    };

    await assertOk(
      "capture-health-audit",
      "scripts/research/buildCaptureHealthAudit.ts",
      ["--capture-run-dir", selectedRunDir],
    );
    deps.io.writeStdout("\n");
    await assertOk(
      "bid-size-coverage-audit",
      "scripts/research/buildBidSizeCoverageAudit.ts",
      ["--capture-run-dir", selectedRunDir],
    );
    deps.io.writeStdout("\n");
    await assertOk(
      "capture-health-reconciliation",
      "scripts/research/buildCaptureHealthReconciliation.ts",
      ["--capture-run-dir", selectedRunDir],
    );

    if (full) {
      deps.io.writeStdout("\nRunning downstream research pipeline...\n");
      const pipeline = [
        ["static-parity-scan", "scripts/research/buildStaticParityScan.ts"],
        ["bid-only-candidate-lifecycle", "scripts/research/buildBidOnlyCandidateLifecycle.ts"],
        ["strategy-evaluation-readiness", "scripts/research/buildStrategyEvaluationReadiness.ts"],
        ["executable-confirmation-design", "scripts/research/buildExecutableConfirmationDesign.ts"],
        ["forward-capture-readiness", "scripts/research/buildForwardCaptureReadiness.ts"],
      ] as const;
      for (const [step, script] of pipeline) {
        await assertOk(step, script, []);
      }
    }

    deps.io.writeStdout("\n");
    deps.io.writeStdout(`Done auditing capture run: ${selectedRunId}\n`);
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
  process.exitCode = await runAuditCaptureCommand(argv, { runner, io });
}

const isDirectInvocation =
  process.argv[1] !== undefined
  && pathToFileURL(resolve(process.argv[1])).href.toLowerCase()
    === import.meta.url.toLowerCase();

if (process.env.VITEST !== "true" && isDirectInvocation) {
  void main();
}
