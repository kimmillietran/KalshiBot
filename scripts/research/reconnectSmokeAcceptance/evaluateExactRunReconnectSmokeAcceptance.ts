/**
 * Load exact-run reconnect-smoke artifacts and evaluate acceptance.
 * Pure evaluation — never writes authorization artifacts.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  evaluateReconnectSmokeAcceptance,
  parseReconnectSmokeJsonRecord,
} from "./evaluateReconnectSmokeAcceptance";
import type {
  ReconnectSmokeAcceptanceInput,
  ReconnectSmokeAcceptanceSummary,
  ReconnectSmokeAuditObserved,
  ReconnectSmokeHealthObserved,
  ReconnectSmokeStatusObserved,
} from "./reconnectSmokeAcceptanceTypes";
import { RECONNECT_SMOKE_ACCEPTANCE_SCHEMA_VERSION } from "./reconnectSmokeAcceptanceTypes";

export function evaluateExactRunReconnectSmokeAcceptance(options: {
  runId: string;
  runDir: string;
  durationMinutes: number;
  captureExitCode: number;
  auditExitCode: number;
  restartGateExitCode: number;
  postRunPreflightExitCode: number;
  lockPresent: boolean;
  readUtf8?: (path: string) => string;
}): ReconnectSmokeAcceptanceSummary {
  const readUtf8 =
    options.readUtf8 ?? ((path: string) => readFileSync(path, "utf8"));
  const statusPath = join(options.runDir, "capture-run-status.json");
  const healthPath = join(options.runDir, "capture-health.json");
  const auditPath = join(options.runDir, "capture-health-audit.json");
  const lifecyclePath = join(options.runDir, "capture-lifecycle.jsonl");

  const statusRecord = parseReconnectSmokeJsonRecord(
    readUtf8(statusPath),
    "capture-run-status.json",
  );
  const healthRecord = parseReconnectSmokeJsonRecord(
    readUtf8(healthPath),
    "capture-health.json",
  );
  const auditRecord = parseReconnectSmokeJsonRecord(
    readUtf8(auditPath),
    "capture-health-audit.json",
  );
  const lifecycleJsonl = readUtf8(lifecyclePath).replace(/^\uFEFF/, "");

  const input: ReconnectSmokeAcceptanceInput = {
    schemaVersion: RECONNECT_SMOKE_ACCEPTANCE_SCHEMA_VERSION,
    mode: "reconnect-smoke",
    runId: options.runId,
    runDir: options.runDir,
    durationMinutes: options.durationMinutes,
    captureExitCode: options.captureExitCode,
    auditExitCode: options.auditExitCode,
    restartGateExitCode: options.restartGateExitCode,
    postRunPreflightExitCode: options.postRunPreflightExitCode,
    lockPresent: options.lockPresent,
    status: statusRecord as ReconnectSmokeStatusObserved,
    health: {
      runId: healthRecord.runId,
      verdict: healthRecord.verdict,
      errors: healthRecord.errors,
      connection:
        (healthRecord.connection as ReconnectSmokeHealthObserved["connection"])
        ?? null,
      watchdog:
        (healthRecord.watchdog as ReconnectSmokeHealthObserved["watchdog"])
        ?? null,
      writer:
        (healthRecord.writer as ReconnectSmokeHealthObserved["writer"]) ?? null,
    },
    audit: auditRecord as ReconnectSmokeAuditObserved,
    lifecycleJsonl,
  };

  return evaluateReconnectSmokeAcceptance(input);
}
