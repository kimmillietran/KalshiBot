import type { CaptureHealthAuditReport } from "../captureHealthAudit/captureHealthAuditTypes";
import {
  GLOBAL_CAPTURE_HEALTH_AUDIT_PATH,
  RESEARCH_READY_CAPTURE_VERDICT,
  type ResolvedSelectedRunCaptureHealth,
  type SelectedRunCaptureHealthIo,
  type SelectedRunCaptureHealthSource,
  SelectedRunCaptureHealthError,
} from "./selectedRunCaptureHealthTypes";
import {
  assertCaptureHealthAuditNotStale,
  captureHealthAuditMatchesSelectedRun,
  computeValidBookShareFromNativeHealth,
  joinCapturePath,
  normalizeCapturePath,
  parseCaptureHealthAuditReport,
  readJsonRecord,
  readNumber,
  readString,
  resolveConfiguredDurationSecondsFromNative,
  resolveReconnectCountFromNative,
  resolveRunScopedCaptureHealthAuditPath,
  resolveSelectedRunId,
} from "./selectedRunCaptureHealthUtils";

function isResearchReadyAudit(audit: CaptureHealthAuditReport | null): boolean {
  return audit?.summary.verdict === RESEARCH_READY_CAPTURE_VERDICT;
}

function normalizeFromAudit(
  audit: CaptureHealthAuditReport,
  healthSource: SelectedRunCaptureHealthSource,
  captureRunDir: string,
  selectedRunId: string,
): ResolvedSelectedRunCaptureHealth {
  return {
    selectedRunId,
    captureRunDir,
    healthSource,
    captureVerdict: audit.summary.verdict,
    recommendedNextAction: audit.summary.recommendedNextAction,
    runDurationSeconds: audit.summary.runDurationSeconds,
    topOfBookCount: audit.summary.topOfBookCount,
    btcSpotCount: audit.summary.btcSpotCount,
    validBookShare: audit.summary.bookState.validBookShare,
    btcJoinCoverageShare: audit.summary.btcJoin.joinCoverageShare,
    p90TopOfBookGapMs: audit.summary.continuity.p90TopOfBookGapMs,
    reconnectCount: audit.summary.bookState.reconnectCount,
    sequenceGapCount: audit.summary.bookState.sequenceGapCount,
    suspectedSystemSleepSeconds: null,
    completedNormally: null,
    nativeHealthPath: null,
    runScopedAuditPath:
      healthSource === "run-scoped-capture-health-audit"
        ? resolveRunScopedCaptureHealthAuditPath(captureRunDir)
        : null,
    globalAuditPath:
      healthSource === "matching-global-capture-health-audit"
        ? GLOBAL_CAPTURE_HEALTH_AUDIT_PATH
        : null,
    warnings: [],
  };
}

function normalizeFromNative(
  nativeHealth: Record<string, unknown>,
  captureRunDir: string,
  selectedRunId: string,
  audit: CaptureHealthAuditReport | null,
): ResolvedSelectedRunCaptureHealth {
  const orderbook =
    nativeHealth.orderbook && typeof nativeHealth.orderbook === "object"
      ? (nativeHealth.orderbook as Record<string, unknown>)
      : null;
  const capture =
    nativeHealth.capture && typeof nativeHealth.capture === "object"
      ? (nativeHealth.capture as Record<string, unknown>)
      : null;

  return {
    selectedRunId,
    captureRunDir,
    healthSource: "native-capture-health",
    captureVerdict: audit?.summary.verdict ?? null,
    recommendedNextAction: audit?.summary.recommendedNextAction ?? null,
    runDurationSeconds:
      audit?.summary.runDurationSeconds
      ?? resolveConfiguredDurationSecondsFromNative(nativeHealth),
    topOfBookCount:
      audit?.summary.topOfBookCount ?? readNumber(capture?.topOfBookRecordCount),
    btcSpotCount: audit?.summary.btcSpotCount ?? null,
    validBookShare:
      audit?.summary.bookState?.validBookShare
      ?? computeValidBookShareFromNativeHealth(nativeHealth),
    btcJoinCoverageShare: audit?.summary.btcJoin?.joinCoverageShare ?? null,
    p90TopOfBookGapMs: audit?.summary.continuity?.p90TopOfBookGapMs ?? null,
    reconnectCount:
      audit?.summary.bookState?.reconnectCount ?? resolveReconnectCountFromNative(nativeHealth),
    sequenceGapCount:
      audit?.summary.bookState?.sequenceGapCount ?? readNumber(orderbook?.sequenceGapCount),
    suspectedSystemSleepSeconds: null,
    completedNormally: readString(nativeHealth.endReason) === "duration-complete" ? true : null,
    nativeHealthPath: joinCapturePath(captureRunDir, "capture-health.json"),
    runScopedAuditPath: null,
    globalAuditPath: null,
    warnings: [],
  };
}

function requireParsedAudit(
  record: Record<string, unknown>,
  label: string,
): CaptureHealthAuditReport {
  const parsed = parseCaptureHealthAuditReport(record);
  if (!parsed) {
    throw new SelectedRunCaptureHealthError(`Malformed ${label}: missing summary object.`);
  }
  return parsed;
}

export function resolveSelectedRunCaptureHealth(input: {
  io: SelectedRunCaptureHealthIo;
  captureRunDir: string;
}): ResolvedSelectedRunCaptureHealth {
  const captureRunDir = normalizeCapturePath(input.captureRunDir);
  const selectedRunId = resolveSelectedRunId(captureRunDir);
  const warnings: string[] = [];

  const nativePath = joinCapturePath(captureRunDir, "capture-health.json");
  const runScopedAuditPath = resolveRunScopedCaptureHealthAuditPath(captureRunDir);
  const nativeHealth = readJsonRecord(input.io.readFile, input.io.fileExists, nativePath);
  const runScopedAuditRecord = readJsonRecord(
    input.io.readFile,
    input.io.fileExists,
    runScopedAuditPath,
  );
  const globalAuditRecord = readJsonRecord(
    input.io.readFile,
    input.io.fileExists,
    GLOBAL_CAPTURE_HEALTH_AUDIT_PATH,
  );

  const runScopedMatches = captureHealthAuditMatchesSelectedRun(
    runScopedAuditRecord,
    selectedRunId,
    captureRunDir,
  );
  const globalMatches = captureHealthAuditMatchesSelectedRun(
    globalAuditRecord,
    selectedRunId,
    captureRunDir,
  );

  if (runScopedAuditRecord && !runScopedMatches) {
    warnings.push("Run-scoped capture-health-audit.json identity does not match selected run.");
  }
  if (globalAuditRecord && !globalMatches) {
    warnings.push("Global capture-health-audit.json identity does not match selected run.");
  }

  if (nativeHealth) {
    const healthRunId = readString(nativeHealth.runId);
    if (healthRunId !== null && healthRunId !== selectedRunId) {
      throw new SelectedRunCaptureHealthError(
        `capture-health.json runId (${healthRunId}) does not match selected run directory (${selectedRunId}).`,
      );
    }
    const matchingAuditRecord = runScopedMatches
      ? runScopedAuditRecord
      : globalMatches
        ? globalAuditRecord
        : null;
    const matchingAudit = matchingAuditRecord
      ? requireParsedAudit(
          matchingAuditRecord,
          runScopedMatches
            ? "run-scoped capture-health-audit.json"
            : "global capture-health-audit.json",
        )
      : null;
    const resolved = normalizeFromNative(nativeHealth, captureRunDir, selectedRunId, matchingAudit);
    resolved.warnings = warnings;
    return resolved;
  }

  if (runScopedAuditRecord && runScopedMatches) {
    const runScopedAudit = requireParsedAudit(
      runScopedAuditRecord,
      "run-scoped capture-health-audit.json",
    );
    if (!isResearchReadyAudit(runScopedAudit)) {
      throw new SelectedRunCaptureHealthError(
        `Run-scoped capture-health-audit verdict is ${runScopedAudit.summary.verdict}; capture-research-ready required.`,
      );
    }
    warnings.push(
      ...assertCaptureHealthAuditNotStale({
        auditRecord: runScopedAuditRecord,
        io: input.io,
        sourceLabel: "Run-scoped capture-health-audit.json",
      }),
    );
    const resolved = normalizeFromAudit(
      runScopedAudit,
      "run-scoped-capture-health-audit",
      captureRunDir,
      selectedRunId,
    );
    resolved.warnings = warnings;
    return resolved;
  }

  if (globalAuditRecord && globalMatches) {
    const globalAudit = requireParsedAudit(
      globalAuditRecord,
      "global capture-health-audit.json",
    );
    if (!isResearchReadyAudit(globalAudit)) {
      throw new SelectedRunCaptureHealthError(
        `Global capture-health-audit verdict is ${globalAudit.summary.verdict}; capture-research-ready required.`,
      );
    }
    warnings.push(
      "Using matching-global-capture-health-audit as last-resort health source; prefer native capture-health.json or run-scoped capture-health-audit.json.",
    );
    warnings.push(
      ...assertCaptureHealthAuditNotStale({
        auditRecord: globalAuditRecord,
        io: input.io,
        sourceLabel: "Global capture-health-audit.json",
      }),
    );
    const resolved = normalizeFromAudit(
      globalAudit,
      "matching-global-capture-health-audit",
      captureRunDir,
      selectedRunId,
    );
    resolved.warnings = warnings;
    resolved.globalAuditPath = GLOBAL_CAPTURE_HEALTH_AUDIT_PATH;
    return resolved;
  }

  throw new SelectedRunCaptureHealthError(
    "Missing capture health source: require capture-health.json or a matching capture-research-ready capture-health-audit.json.",
  );
}

export function validateSelectedRunCaptureDirectory(input: {
  io: SelectedRunCaptureHealthIo;
  captureRunDir: string;
  requireBtcSpot?: boolean;
}): { captureRunDir: string; health: ResolvedSelectedRunCaptureHealth } {
  const normalized = normalizeCapturePath(input.captureRunDir);
  if (!input.io.isDirectory(normalized)) {
    throw new SelectedRunCaptureHealthError(`Unknown capture run directory: ${input.captureRunDir}`);
  }

  for (const required of ["top-of-book.jsonl"]) {
    if (!input.io.fileExists(joinCapturePath(normalized, required))) {
      throw new SelectedRunCaptureHealthError(`Missing required capture artifact: ${required}`);
    }
  }

  if (input.requireBtcSpot !== false) {
    if (!input.io.fileExists(joinCapturePath(normalized, "btc-spot.jsonl"))) {
      throw new SelectedRunCaptureHealthError("Missing required capture artifact: btc-spot.jsonl");
    }
  }

  const health = resolveSelectedRunCaptureHealth({ io: input.io, captureRunDir: normalized });
  return { captureRunDir: normalized, health };
}
