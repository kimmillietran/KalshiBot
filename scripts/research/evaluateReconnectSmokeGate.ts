/**
 * M12.1G corrective: evaluate controlled reconnect smoke artifacts fail-closed.
 *
 * Reads exact-run status/health/audit/lifecycle JSON from disk (UTF-8) and
 * combines orchestration exit codes supplied by run-capture-reconnect-smoke.ps1.
 * Never selects "latest". Does not contact Kalshi.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  evaluateReconnectSmokeAcceptance,
  parseReconnectSmokeJsonRecord,
} from "./reconnectSmokeAcceptance/evaluateReconnectSmokeAcceptance";
import type {
  ReconnectSmokeAcceptanceInput,
  ReconnectSmokeAuditObserved,
  ReconnectSmokeHealthObserved,
  ReconnectSmokeStatusObserved,
} from "./reconnectSmokeAcceptance/reconnectSmokeAcceptanceTypes";
import { RECONNECT_SMOKE_ACCEPTANCE_SCHEMA_VERSION } from "./reconnectSmokeAcceptance/reconnectSmokeAcceptanceTypes";

const ALLOWED_FLAGS = new Set([
  "--run-id",
  "--run-dir",
  "--duration-minutes",
  "--capture-exit-code",
  "--audit-exit-code",
  "--restart-gate-exit-code",
  "--post-run-preflight-exit-code",
  "--lock-present",
]);

function validateArgv(argv: readonly string[]): void {
  if (argv.length === 0) {
    throw new Error("Missing required flags");
  }
  const seen = new Set<string>();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]!;
    if (!token.startsWith("--")) {
      throw new Error(`Unexpected positional argument: ${token}`);
    }
    if (!ALLOWED_FLAGS.has(token)) {
      throw new Error(`Unknown flag: ${token}`);
    }
    if (seen.has(token)) {
      throw new Error(`Duplicate flag: ${token}`);
    }
    seen.add(token);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Missing value for flag ${token}`);
    }
    index += 1;
  }
  for (const required of ALLOWED_FLAGS) {
    if (!seen.has(required)) {
      throw new Error(`Missing required flag ${required}`);
    }
  }
}

function readFlag(argv: readonly string[], name: string): string {
  const index = argv.indexOf(name);
  return argv[index + 1]!;
}

function requireIntFlag(argv: readonly string[], name: string): number {
  const raw = readFlag(argv, name);
  const value = Number(raw);
  if (!Number.isInteger(value)) {
    throw new Error(`${name} must be an integer (got ${raw})`);
  }
  return value;
}

function requireBoolFlag(argv: readonly string[], name: string): boolean {
  const raw = readFlag(argv, name).toLowerCase();
  if (raw === "true") {
    return true;
  }
  if (raw === "false") {
    return false;
  }
  throw new Error(`${name} must be true or false (got ${raw})`);
}

function readUtf8Json(path: string, label: string): Record<string, unknown> {
  if (!existsSync(path)) {
    throw new Error(`${label} missing at ${path}`);
  }
  return parseReconnectSmokeJsonRecord(readFileSync(path, "utf8"), label);
}

function readUtf8Text(path: string, label: string): string {
  if (!existsSync(path)) {
    throw new Error(`${label} missing at ${path}`);
  }
  return readFileSync(path, "utf8").replace(/^\uFEFF/, "");
}

export function runEvaluateReconnectSmokeGateCommand(
  argv: readonly string[],
  io: {
    writeStdout: (text: string) => void;
    writeStderr: (text: string) => void;
  } = {
    writeStdout: (text) => {
      process.stdout.write(text);
    },
    writeStderr: (text) => {
      process.stderr.write(text);
    },
  },
): number {
  try {
    validateArgv(argv);
    const runId = readFlag(argv, "--run-id");
    const runDir = readFlag(argv, "--run-dir");
    const durationMinutes = Number(readFlag(argv, "--duration-minutes"));
    if (!Number.isFinite(durationMinutes)) {
      throw new Error("--duration-minutes must be a number");
    }

    const statusPath = join(runDir, "capture-run-status.json");
    const healthPath = join(runDir, "capture-health.json");
    const auditPath = join(runDir, "capture-health-audit.json");
    const lifecyclePath = join(runDir, "capture-lifecycle.jsonl");

    const statusRecord = readUtf8Json(statusPath, "capture-run-status.json");
    const healthRecord = readUtf8Json(healthPath, "capture-health.json");
    const auditRecord = readUtf8Json(auditPath, "capture-health-audit.json");
    const lifecycleJsonl = readUtf8Text(lifecyclePath, "capture-lifecycle.jsonl");

    const input: ReconnectSmokeAcceptanceInput = {
      schemaVersion: RECONNECT_SMOKE_ACCEPTANCE_SCHEMA_VERSION,
      mode: "reconnect-smoke",
      runId,
      runDir,
      durationMinutes,
      captureExitCode: requireIntFlag(argv, "--capture-exit-code"),
      auditExitCode: requireIntFlag(argv, "--audit-exit-code"),
      restartGateExitCode: requireIntFlag(argv, "--restart-gate-exit-code"),
      postRunPreflightExitCode: requireIntFlag(
        argv,
        "--post-run-preflight-exit-code",
      ),
      lockPresent: requireBoolFlag(argv, "--lock-present"),
      status: statusRecord as ReconnectSmokeStatusObserved,
      health: {
        runId: healthRecord.runId,
        verdict: healthRecord.verdict,
        errors: healthRecord.errors,
        connection: (healthRecord.connection as ReconnectSmokeHealthObserved["connection"])
          ?? null,
        watchdog: (healthRecord.watchdog as ReconnectSmokeHealthObserved["watchdog"])
          ?? null,
        writer: (healthRecord.writer as ReconnectSmokeHealthObserved["writer"]) ?? null,
      },
      audit: auditRecord as ReconnectSmokeAuditObserved,
      lifecycleJsonl,
    };

    const summary = evaluateReconnectSmokeAcceptance(input);
    io.writeStdout(`${JSON.stringify(summary)}\n`);
    return summary.passed ? 0 : 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    io.writeStderr(`${message}\n`);
    return 1;
  }
}

if (process.env.VITEST !== "true") {
  process.exitCode = runEvaluateReconnectSmokeGateCommand(process.argv.slice(2));
}
