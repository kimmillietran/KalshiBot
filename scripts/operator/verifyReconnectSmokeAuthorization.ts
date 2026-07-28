/**
 * Verify a persisted reconnect-smoke authorization summary for eight-hour starts.
 *
 * Fail-closed. Never fabricates orchestration exit codes. Never selects "latest".
 * Re-reads current exact-run status/health/audit/lifecycle and re-evaluates
 * reconnect acceptance using the persisted summary's orchestration evidence.
 * Also re-runs the capture restart gate.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { evaluateReconnectSmokeAcceptance } from "../research/reconnectSmokeAcceptance/evaluateReconnectSmokeAcceptance";
import type {
  ReconnectSmokeAuditObserved,
  ReconnectSmokeHealthObserved,
  ReconnectSmokeStatusObserved,
} from "../research/reconnectSmokeAcceptance/reconnectSmokeAcceptanceTypes";
import { RECONNECT_SMOKE_ACCEPTANCE_SCHEMA_VERSION } from "../research/reconnectSmokeAcceptance/reconnectSmokeAcceptanceTypes";
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
  RECONNECT_SMOKE_DURATION_MAX,
  RECONNECT_SMOKE_DURATION_MIN,
} from "./shared/constants";
import {
  normalizeRunDir,
  readReconnectSmokeAuthorizationSummary,
  revalidateReconnectAuthorizationAgainstCurrentArtifacts,
  verifyPersistedReconnectSmokeAuthorization,
} from "./shared/reconnectSmokeAuthorization";

export type VerifyReconnectSmokeAuthorizationDeps = {
  runner: OperatorCommandRunner;
  io: CommandIo;
  exists?: (path: string) => boolean;
  readUtf8?: (path: string) => string;
};

function readExactRunArtifacts(
  runDir: string,
  exists: (path: string) => boolean,
  readUtf8: (path: string) => string,
): {
  statusRecord: Record<string, unknown>;
  healthRecord: Record<string, unknown>;
  auditRecord: Record<string, unknown>;
  lifecycleJsonl: string;
} {
  const required = [
    "capture-run-status.json",
    "capture-health.json",
    "capture-health-audit.json",
    "capture-lifecycle.jsonl",
  ] as const;

  const contents: Record<(typeof required)[number], string> = {
    "capture-run-status.json": "",
    "capture-health.json": "",
    "capture-health-audit.json": "",
    "capture-lifecycle.jsonl": "",
  };

  for (const name of required) {
    const path = join(runDir, name);
    if (!exists(path)) {
      throw new OperatorCliError(
        `Exact-run artifact missing during reconnect authorization revalidation: ${path}`,
      );
    }
    contents[name] = readUtf8(path);
  }

  function parseObject(raw: string, label: string): Record<string, unknown> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      throw new OperatorCliError(
        `Exact-run artifact malformed during reconnect authorization revalidation: ${label}`,
      );
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new OperatorCliError(
        `Exact-run artifact must be a JSON object: ${label}`,
      );
    }
    return parsed as Record<string, unknown>;
  }

  return {
    statusRecord: parseObject(
      contents["capture-run-status.json"],
      "capture-run-status.json",
    ),
    healthRecord: parseObject(
      contents["capture-health.json"],
      "capture-health.json",
    ),
    auditRecord: parseObject(
      contents["capture-health-audit.json"],
      "capture-health-audit.json",
    ),
    lifecycleJsonl: contents["capture-lifecycle.jsonl"].replace(/^\uFEFF/, ""),
  };
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
          + "re-evaluate current status/health/audit/lifecycle → "
          + "re-run capture restart gate\n",
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
    const fieldVerified = verifyPersistedReconnectSmokeAuthorization({
      expectedRunDir: runDir,
      summary,
      smokeDurationMinutesMin: RECONNECT_SMOKE_DURATION_MIN,
      smokeDurationMinutesMax: RECONNECT_SMOKE_DURATION_MAX,
    });
    if (!fieldVerified.ok) {
      throw new OperatorCliError(
        "Eight-hour capture denied: reconnect-smoke authorization failed: "
          + fieldVerified.reasons.join("; "),
      );
    }

    const artifacts = readExactRunArtifacts(runDir, exists, readUtf8);
    const revalidated = revalidateReconnectAuthorizationAgainstCurrentArtifacts({
      expectedRunDir: runDir,
      summary,
      statusRecord: artifacts.statusRecord,
      healthRecord: artifacts.healthRecord,
      auditRecord: artifacts.auditRecord,
      lifecycleJsonl: artifacts.lifecycleJsonl,
      evaluateAcceptance: (input) =>
        evaluateReconnectSmokeAcceptance({
          schemaVersion: RECONNECT_SMOKE_ACCEPTANCE_SCHEMA_VERSION,
          mode: "reconnect-smoke",
          runId: input.runId,
          runDir: input.runDir,
          durationMinutes: input.durationMinutes,
          captureExitCode: input.captureExitCode,
          auditExitCode: input.auditExitCode,
          restartGateExitCode: input.restartGateExitCode,
          postRunPreflightExitCode: input.postRunPreflightExitCode,
          lockPresent: input.lockPresent,
          status: input.status as ReconnectSmokeStatusObserved,
          health: input.health as ReconnectSmokeHealthObserved,
          audit: input.audit as ReconnectSmokeAuditObserved,
          lifecycleJsonl: input.lifecycleJsonl,
        }),
    });
    if (!revalidated.ok) {
      throw new OperatorCliError(
        "Eight-hour capture denied: reconnect-smoke current-artifact revalidation failed: "
          + revalidated.reasons.join("; "),
      );
    }

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
        + `(controlledReconnectProven=true, passed=true, artifacts-reevaluated).\n`,
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
