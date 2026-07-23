/**
 * M12.1G corrective: evaluate controlled reconnect smoke artifacts fail-closed.
 *
 * Reads exact-run status/health/audit JSON from disk (UTF-8) and combines
 * orchestration exit codes supplied by run-capture-reconnect-smoke.ps1.
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

function readFlag(argv: readonly string[], name: string): string | null {
  const index = argv.indexOf(name);
  if (index < 0) {
    return null;
  }
  return argv[index + 1] ?? null;
}

function requireFlag(argv: readonly string[], name: string): string {
  const value = readFlag(argv, name);
  if (value === null || value.length === 0) {
    throw new Error(`Missing required flag ${name}`);
  }
  return value;
}

function requireIntFlag(argv: readonly string[], name: string): number {
  const raw = requireFlag(argv, name);
  const value = Number(raw);
  if (!Number.isInteger(value)) {
    throw new Error(`${name} must be an integer (got ${raw})`);
  }
  return value;
}

function requireBoolFlag(argv: readonly string[], name: string): boolean {
  const raw = requireFlag(argv, name).toLowerCase();
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
    const runId = requireFlag(argv, "--run-id");
    const runDir = requireFlag(argv, "--run-dir");
    const durationMinutes = Number(requireFlag(argv, "--duration-minutes"));
    if (!Number.isFinite(durationMinutes)) {
      throw new Error("--duration-minutes must be a number");
    }

    const statusPath = join(runDir, "capture-run-status.json");
    const healthPath = join(runDir, "capture-health.json");
    const auditPath = join(runDir, "capture-health-audit.json");

    const statusRecord = readUtf8Json(statusPath, "capture-run-status.json");
    const healthRecord = readUtf8Json(healthPath, "capture-health.json");
    const auditRecord = readUtf8Json(auditPath, "capture-health-audit.json");

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
