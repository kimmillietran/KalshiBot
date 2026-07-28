/**
 * M12.1G corrective: evaluate controlled reconnect smoke artifacts fail-closed.
 *
 * Reads exact-run status/health/audit/lifecycle JSON from disk (UTF-8) and
 * combines orchestration exit codes supplied by the caller. Never selects
 * "latest". Does not contact Kalshi.
 *
 * M12.1I trust boundary: this public CLI is evaluation-only. It never writes
 * reconnect-smoke-authorization.json. Authorization is issued only by the
 * reconnect-smoke operator wrapper via issueReconnectSmokeAuthorization.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";

import { evaluateExactRunReconnectSmokeAcceptance } from "./reconnectSmokeAcceptance/evaluateExactRunReconnectSmokeAcceptance";

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

    for (const [name, label] of [
      ["capture-run-status.json", "capture-run-status.json"],
      ["capture-health.json", "capture-health.json"],
      ["capture-health-audit.json", "capture-health-audit.json"],
      ["capture-lifecycle.jsonl", "capture-lifecycle.jsonl"],
    ] as const) {
      const path = join(runDir, name);
      if (!existsSync(path)) {
        throw new Error(`${label} missing at ${path}`);
      }
    }

    const summary = evaluateExactRunReconnectSmokeAcceptance({
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
    });
    const gateExitCode = summary.passed ? 0 : 1;
    io.writeStdout(`${JSON.stringify(summary)}\n`);
    // Evaluation-only: never write reconnect-smoke-authorization.json.
    return gateExitCode;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    io.writeStderr(`${message}\n`);
    return 1;
  }
}

export { evaluateExactRunReconnectSmokeAcceptance };

if (process.env.VITEST !== "true") {
  process.exitCode = runEvaluateReconnectSmokeGateCommand(process.argv.slice(2));
}
