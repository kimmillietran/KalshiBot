import { joinPath, parseIsoTimestampMs } from "../bidOnlyCandidateLifecycle/bidOnlyCandidateLifecycleUtils";
import type {
  ParityNearMissAnalysisIo,
  ParityNearMissInputArtifactIdentities,
  ParityNearMissSelectedRunQuality,
} from "./parityNearMissAnalysisTypes";
import { ParityNearMissAnalysisError } from "./parityNearMissAnalysisTypes";

const CAPTURE_HEALTH_AUDIT_PATH = "data/research-results/capture-health-audit.json";
const CAPTURE_HEALTH_RECONCILIATION_PATH =
  "data/research-results/capture-health-reconciliation.json";
const BID_SIZE_COVERAGE_AUDIT_PATH = "data/research-results/bid-size-coverage-audit.json";

function readJsonRecord(io: ParityNearMissAnalysisIo, path: string): Record<string, unknown> | null {
  if (!io.fileExists(path)) {
    return null;
  }

  try {
    return JSON.parse(io.readFile(path).replace(/^\uFEFF/, "")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function resolveRunIdFromArtifact(
  artifact: Record<string, unknown> | null,
  summary: Record<string, unknown> | null,
): string | null {
  return (
    readString(artifact?.selectedRunId)
    ?? readString(summary?.selectedRunId)
    ?? readString(artifact?.captureRunDir)?.split("/").pop()
    ?? null
  );
}

function artifactMatchesRun(
  artifact: Record<string, unknown> | null,
  runId: string,
): boolean {
  if (!artifact) {
    return false;
  }

  const summary =
    artifact.summary && typeof artifact.summary === "object"
      ? (artifact.summary as Record<string, unknown>)
      : null;
  const artifactRunId = resolveRunIdFromArtifact(artifact, summary);
  if (artifactRunId === runId) {
    return true;
  }

  const sourceRunIds = artifact.sourceRunIds;
  return Array.isArray(sourceRunIds) && sourceRunIds.includes(runId);
}

function computeValidBookShareFromHealth(health: Record<string, unknown> | null): number | null {
  const orderbook =
    health?.orderbook && typeof health.orderbook === "object"
      ? (health.orderbook as Record<string, unknown>)
      : null;
  const capture =
    health?.capture && typeof health.capture === "object"
      ? (health.capture as Record<string, unknown>)
      : null;

  const validCount = readNumber(orderbook?.validTopOfBookRecords);
  const totalCount =
    readNumber(capture?.topOfBookRecordCount)
    ?? readNumber(orderbook?.topOfBookRecordsEmitted);

  if (validCount === null || totalCount === null || totalCount <= 0) {
    return null;
  }

  return Math.round((validCount / totalCount) * 10_000) / 10_000;
}

function resolveConfiguredDurationSeconds(health: Record<string, unknown> | null): number | null {
  const config =
    health?.config && typeof health.config === "object"
      ? (health.config as Record<string, unknown>)
      : null;
  const durationSeconds = readNumber(config?.durationSeconds);
  if (durationSeconds !== null) {
    return durationSeconds;
  }

  const durationMinutes = readNumber(config?.durationMinutes);
  if (durationMinutes !== null) {
    return Math.round(durationMinutes * 60);
  }

  const legacyDuration =
    health?.duration && typeof health.duration === "object"
      ? (health.duration as Record<string, unknown>)
      : null;
  return readNumber(legacyDuration?.runDurationSeconds);
}

function resolveReconnectCount(health: Record<string, unknown> | null): number | null {
  const watchdog =
    health?.watchdog && typeof health.watchdog === "object"
      ? (health.watchdog as Record<string, unknown>)
      : null;
  const connection =
    health?.connection && typeof health.connection === "object"
      ? (health.connection as Record<string, unknown>)
      : null;
  const orderbook =
    health?.orderbook && typeof health.orderbook === "object"
      ? (health.orderbook as Record<string, unknown>)
      : null;

  return (
    readNumber(watchdog?.recoveryAttemptCount)
    ?? readNumber(connection?.reconnectCount)
    ?? readNumber(orderbook?.reconnectCount)
  );
}

function resolveReconciledValidBookShare(
  reconciliation: Record<string, unknown> | null,
): number | null {
  const metrics = reconciliation?.validBookMetrics;
  if (!Array.isArray(metrics)) {
    return null;
  }

  for (const entry of metrics) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const metric = entry as Record<string, unknown>;
    if (metric.metricId === "rawTopOfBookValidShare") {
      return readNumber(metric.value);
    }
  }

  return null;
}

function warnMissingField(
  warnings: string[],
  artifactPath: string,
  runId: string,
  fieldName: string,
  reason: string,
): void {
  warnings.push(
    `selected-run quality field "${fieldName}" unavailable from ${artifactPath} for run ${runId}: ${reason}`,
  );
}

export function resolveSelectedRunId(captureRunDir: string): string {
  return captureRunDir.replaceAll("\\", "/").split("/").pop() ?? captureRunDir;
}

export function validateSelectedRunDirectory(
  io: ParityNearMissAnalysisIo,
  captureRunDir: string,
): string {
  const normalized = captureRunDir.replaceAll("\\", "/");
  if (!io.fileExists(normalized) || !io.isDirectory(normalized)) {
    throw new ParityNearMissAnalysisError(
      `Unknown capture run directory: ${captureRunDir}. Provide an explicit --capture-run-dir.`,
    );
  }

  const healthPath = joinPath(normalized, "capture-health.json");
  if (!io.fileExists(healthPath)) {
    throw new ParityNearMissAnalysisError(
      `Capture run directory missing capture-health.json: ${captureRunDir}`,
    );
  }

  const topOfBookPath = joinPath(normalized, "top-of-book.jsonl");
  if (!io.fileExists(topOfBookPath)) {
    throw new ParityNearMissAnalysisError(
      `Capture run directory missing top-of-book.jsonl: ${captureRunDir}`,
    );
  }

  return normalized;
}

export function loadSelectedRunContext(input: {
  io: ParityNearMissAnalysisIo;
  captureRunDir: string;
}): {
  runId: string;
  selectedRunQuality: ParityNearMissSelectedRunQuality;
  inputArtifactIdentities: ParityNearMissInputArtifactIdentities;
  marketCloseTimes: Map<string, number | null>;
  warnings: string[];
} {
  const captureRunDir = validateSelectedRunDirectory(input.io, input.captureRunDir);
  const runId = resolveSelectedRunId(captureRunDir);
  const warnings: string[] = [];

  const healthPath = joinPath(captureRunDir, "capture-health.json");
  const health = readJsonRecord(input.io, healthPath);
  const healthRunId = readString(health?.runId) ?? runId;
  if (healthRunId !== runId) {
    warnings.push(
      `capture-health.json runId (${healthRunId}) differs from directory name (${runId}).`,
    );
  }

  const audit = readJsonRecord(input.io, CAPTURE_HEALTH_AUDIT_PATH);
  const auditSummary =
    audit?.summary && typeof audit.summary === "object"
      ? (audit.summary as Record<string, unknown>)
      : null;
  const auditMatches = artifactMatchesRun(audit, healthRunId);
  if (audit && !auditMatches) {
    warnings.push(
      `capture-health-audit.json run identity does not match selected run ${healthRunId}; ignoring audit fields.`,
    );
  }

  const reconciliation = readJsonRecord(input.io, CAPTURE_HEALTH_RECONCILIATION_PATH);
  const reconciliationSummary =
    reconciliation?.summary && typeof reconciliation.summary === "object"
      ? (reconciliation.summary as Record<string, unknown>)
      : null;
  const reconciliationMatches = artifactMatchesRun(reconciliation, healthRunId);
  if (reconciliation && !reconciliationMatches) {
    warnings.push(
      `capture-health-reconciliation.json selectedRunId does not match selected run.`,
    );
  }

  const bidSize = readJsonRecord(input.io, BID_SIZE_COVERAGE_AUDIT_PATH);
  const bidSizeComparison =
    bidSize?.comparison && typeof bidSize.comparison === "object"
      ? (bidSize.comparison as Record<string, unknown>)
      : null;
  const bidSizeMatches = artifactMatchesRun(bidSize, healthRunId);
  if (bidSize && !bidSizeMatches) {
    warnings.push(
      `bid-size-coverage-audit.json run identity does not match selected run; ignoring comparison fields.`,
    );
  }

  const orderbook =
    health?.orderbook && typeof health.orderbook === "object"
      ? (health.orderbook as Record<string, unknown>)
      : null;
  const durations =
    reconciliation?.durations && typeof reconciliation.durations === "object"
      ? (reconciliation.durations as Record<string, unknown>)
      : null;
  const suspension =
    reconciliation?.suspension && typeof reconciliation.suspension === "object"
      ? (reconciliation.suspension as Record<string, unknown>)
      : null;
  const auditBookState =
    auditSummary?.bookState && typeof auditSummary.bookState === "object"
      ? (auditSummary.bookState as Record<string, unknown>)
      : null;
  const auditBtcJoin =
    auditSummary?.btcJoin && typeof auditSummary.btcJoin === "object"
      ? (auditSummary.btcJoin as Record<string, unknown>)
      : null;

  const runDurationSeconds =
    (auditMatches ? readNumber(auditSummary?.runDurationSeconds) : null)
    ?? (reconciliationMatches ? readNumber(durations?.configuredDurationSeconds) : null)
    ?? resolveConfiguredDurationSeconds(health);
  if (runDurationSeconds === null) {
    warnMissingField(warnings, healthPath, healthRunId, "runDurationSeconds", "not present in matching artifacts");
  }

  const validBookShare =
    (auditMatches ? readNumber(auditBookState?.validBookShare) : null)
    ?? (reconciliationMatches ? resolveReconciledValidBookShare(reconciliation) : null)
    ?? computeValidBookShareFromHealth(health);
  if (validBookShare === null) {
    warnMissingField(warnings, healthPath, healthRunId, "validBookShare", "could not derive from matching artifacts");
  }

  const btcJoinCoverageShare =
  auditMatches ? readNumber(auditBtcJoin?.joinCoverageShare) : null;
  if (btcJoinCoverageShare === null) {
    warnMissingField(
      warnings,
      CAPTURE_HEALTH_AUDIT_PATH,
      healthRunId,
      "btcJoinCoverageShare",
      auditMatches ? "field missing" : "matching audit artifact unavailable",
    );
  }

  const bidSizeCoverageShare = bidSizeMatches
    ? (
      readNumber(bidSizeComparison?.bidSizeCoverageShare)
      ?? readNumber(bidSizeComparison?.topOfBookBidSizeCoverageShare)
    )
    : null;
  if (bidSizeCoverageShare === null) {
    warnMissingField(
      warnings,
      BID_SIZE_COVERAGE_AUDIT_PATH,
      healthRunId,
      "bidSizeCoverageShare",
      bidSizeMatches ? "field missing" : "matching audit artifact unavailable",
    );
  }

  const reconnectCount =
    (auditMatches ? readNumber(auditBookState?.reconnectCount) : null)
    ?? resolveReconnectCount(health);
  if (reconnectCount === null) {
    warnMissingField(warnings, healthPath, healthRunId, "reconnectCount", "not present in matching artifacts");
  }

  const suspectedSystemSleepSeconds = reconciliationMatches
    ? readNumber(suspension?.suspectedSystemSleepSeconds)
    : null;
  if (suspectedSystemSleepSeconds === null) {
    warnMissingField(
      warnings,
      CAPTURE_HEALTH_RECONCILIATION_PATH,
      healthRunId,
      "suspectedSystemSleepSeconds",
      reconciliationMatches ? "field missing" : "matching reconciliation artifact unavailable",
    );
  }

  const sequenceGapCount =
    (auditMatches ? readNumber(auditBookState?.sequenceGapCount) : null)
    ?? readNumber(orderbook?.sequenceGapCount);
  if (sequenceGapCount === null) {
    warnMissingField(warnings, healthPath, healthRunId, "sequenceGapCount", "not present in matching artifacts");
  }

  const captureVerdict = auditMatches ? readString(auditSummary?.verdict) : null;
  const reconciliationVerdict = reconciliationMatches
    ? readString(reconciliationSummary?.overallVerdict)
    : null;

  const selectedRunQuality: ParityNearMissSelectedRunQuality = {
    selectedRunId: healthRunId,
    runDurationSeconds,
    validBookShare,
    btcJoinCoverageShare,
    bidSizeCoverageShare,
    reconnectCount,
    suspectedSystemSleepSeconds,
    sequenceGapCount,
    captureVerdict,
    reconciliationVerdict,
  };

  const marketCloseTimes = new Map<string, number | null>();
  const metadataPath = joinPath(captureRunDir, "market-metadata.jsonl");
  if (input.io.fileExists(metadataPath)) {
    for (const line of input.io.readFile(metadataPath).split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      try {
        const parsed = JSON.parse(trimmed) as { marketTicker?: string; closeTime?: string | null };
        if (typeof parsed.marketTicker === "string") {
          marketCloseTimes.set(
            parsed.marketTicker,
            parsed.closeTime ? parseIsoTimestampMs(parsed.closeTime) : null,
          );
        }
      } catch {
        warnings.push("Skipped malformed market-metadata.jsonl line.");
      }
    }
  }

  return {
    runId: selectedRunQuality.selectedRunId,
    selectedRunQuality,
    inputArtifactIdentities: {
      captureHealthPath: healthPath,
      captureHealthRunId: readString(health?.runId),
      captureHealthAuditPath: input.io.fileExists(CAPTURE_HEALTH_AUDIT_PATH)
        ? CAPTURE_HEALTH_AUDIT_PATH
        : null,
      captureHealthReconciliationPath: input.io.fileExists(CAPTURE_HEALTH_RECONCILIATION_PATH)
        ? CAPTURE_HEALTH_RECONCILIATION_PATH
        : null,
      bidSizeCoverageAuditPath: input.io.fileExists(BID_SIZE_COVERAGE_AUDIT_PATH)
        ? BID_SIZE_COVERAGE_AUDIT_PATH
        : null,
    },
    marketCloseTimes,
    warnings,
  };
}

export function loadNearestBtcPrice(
  io: ParityNearMissAnalysisIo,
  captureRunDir: string,
  receivedAtMs: number,
): number | null {
  const path = joinPath(captureRunDir, "btc-spot.jsonl");
  if (!io.fileExists(path)) {
    return null;
  }

  let nearest: { distance: number; price: number } | null = null;
  for (const line of io.readFile(path).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    try {
      const parsed = JSON.parse(trimmed) as {
        receivedAtLocal?: string;
        exchangeTimestampMs?: number | null;
        priceUsd?: number;
      };
      const timestampMs =
        parsed.exchangeTimestampMs
        ?? (parsed.receivedAtLocal ? parseIsoTimestampMs(parsed.receivedAtLocal) : null);
      if (timestampMs === null || typeof parsed.priceUsd !== "number") {
        continue;
      }
      const distance = Math.abs(receivedAtMs - timestampMs);
      if (!nearest || distance < nearest.distance) {
        nearest = { distance, price: parsed.priceUsd };
      }
    } catch {
      // skip
    }
  }

  return nearest?.price ?? null;
}
