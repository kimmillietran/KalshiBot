import { joinPath, parseIsoTimestampMs, readNumber, readString } from "./leadLagUtils";
import type {
  BtcKalshiLeadLagAnalysisIo,
  BtcKalshiLeadLagInputArtifactIdentities,
  BtcKalshiLeadLagSelectedRunQuality,
  MarketContractSemantics,
} from "./btcKalshiLeadLagAnalysisTypes";
import { BtcKalshiLeadLagAnalysisError } from "./btcKalshiLeadLagAnalysisTypes";
import {
  mergeMarketMetadataRecord,
  readMarketMetadataLine,
  resolveMarketContractSemantics,
} from "./resolveMarketContractSemantics";

const CAPTURE_HEALTH_AUDIT_PATH = "data/research-results/capture-health-audit.json";
const CAPTURE_HEALTH_RECONCILIATION_PATH =
  "data/research-results/capture-health-reconciliation.json";
const BID_SIZE_COVERAGE_AUDIT_PATH = "data/research-results/bid-size-coverage-audit.json";

function readJsonRecord(io: BtcKalshiLeadLagAnalysisIo, path: string): Record<string, unknown> | null {
  if (!io.fileExists(path)) {
    return null;
  }
  try {
    return JSON.parse(io.readFile(path).replace(/^\uFEFF/, "")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function artifactMatchesRun(artifact: Record<string, unknown> | null, runId: string): boolean {
  if (!artifact) {
    return false;
  }
  const summary =
    artifact.summary && typeof artifact.summary === "object"
      ? (artifact.summary as Record<string, unknown>)
      : null;
  const artifactRunId =
    readString(artifact.selectedRunId)
    ?? readString(summary?.selectedRunId)
    ?? readString(artifact.captureRunDir)?.split("/").pop()
    ?? null;
  if (artifactRunId === runId) {
    return true;
  }
  const sourceRunIds = artifact.sourceRunIds;
  return Array.isArray(sourceRunIds) && sourceRunIds.includes(runId);
}

export function resolveSelectedRunId(captureRunDir: string): string {
  const normalized = captureRunDir.replace(/\\/g, "/").replace(/\/$/, "");
  const parts = normalized.split("/");
  return parts[parts.length - 1] ?? captureRunDir;
}

export function validateSelectedRunDirectory(
  io: BtcKalshiLeadLagAnalysisIo,
  captureRunDir: string,
): string {
  if (!io.isDirectory(captureRunDir)) {
    throw new BtcKalshiLeadLagAnalysisError(`Capture run directory not found: ${captureRunDir}`);
  }
  for (const required of ["capture-health.json", "top-of-book.jsonl", "btc-spot.jsonl"]) {
    const path = joinPath(captureRunDir, required);
    if (!io.fileExists(path)) {
      throw new BtcKalshiLeadLagAnalysisError(`Missing required capture artifact: ${path}`);
    }
  }
  return captureRunDir;
}

export function loadSelectedRunLeadLagContext(input: {
  io: BtcKalshiLeadLagAnalysisIo;
  captureRunDir: string;
}): {
  runId: string;
  selectedRunQuality: BtcKalshiLeadLagSelectedRunQuality;
  inputArtifactIdentities: BtcKalshiLeadLagInputArtifactIdentities;
  marketSemantics: Map<string, MarketContractSemantics>;
  warnings: string[];
} {
  const captureRunDir = validateSelectedRunDirectory(input.io, input.captureRunDir);
  const runId = resolveSelectedRunId(captureRunDir);
  const warnings: string[] = [];

  const healthPath = joinPath(captureRunDir, "capture-health.json");
  const health = readJsonRecord(input.io, healthPath);
  const healthRunId = readString(health?.runId) ?? runId;

  const audit = readJsonRecord(input.io, CAPTURE_HEALTH_AUDIT_PATH);
  const auditSummary =
    audit?.summary && typeof audit.summary === "object"
      ? (audit.summary as Record<string, unknown>)
      : null;
  const auditMatches = artifactMatchesRun(audit, healthRunId);
  if (audit && !auditMatches) {
    warnings.push("capture-health-audit.json run identity does not match selected run.");
  }

  const reconciliation = readJsonRecord(input.io, CAPTURE_HEALTH_RECONCILIATION_PATH);
  const reconciliationSummary =
    reconciliation?.summary && typeof reconciliation.summary === "object"
      ? (reconciliation.summary as Record<string, unknown>)
      : null;
  const reconciliationMatches = artifactMatchesRun(reconciliation, healthRunId);
  if (reconciliation && !reconciliationMatches) {
    warnings.push("capture-health-reconciliation.json run identity does not match selected run.");
  }

  const bidSize = readJsonRecord(input.io, BID_SIZE_COVERAGE_AUDIT_PATH);
  const bidSizeComparison =
    bidSize?.comparison && typeof bidSize.comparison === "object"
      ? (bidSize.comparison as Record<string, unknown>)
      : null;
  const bidSizeMatches = artifactMatchesRun(bidSize, healthRunId);
  if (bidSize && !bidSizeMatches) {
    warnings.push("bid-size-coverage-audit.json run identity does not match selected run.");
  }

  const orderbook =
    health?.orderbook && typeof health.orderbook === "object"
      ? (health.orderbook as Record<string, unknown>)
      : null;
  const auditBookState =
    auditSummary?.bookState && typeof auditSummary.bookState === "object"
      ? (auditSummary.bookState as Record<string, unknown>)
      : null;
  const auditBtcJoin =
    auditSummary?.btcJoin && typeof auditSummary.btcJoin === "object"
      ? (auditSummary.btcJoin as Record<string, unknown>)
      : null;
  const durations =
    reconciliation?.durations && typeof reconciliation.durations === "object"
      ? (reconciliation.durations as Record<string, unknown>)
      : null;
  const suspension =
    reconciliation?.suspension && typeof reconciliation.suspension === "object"
      ? (reconciliation.suspension as Record<string, unknown>)
      : null;

  const selectedRunQuality: BtcKalshiLeadLagSelectedRunQuality = {
    selectedRunId: healthRunId,
    runDurationSeconds:
      (auditMatches ? readNumber(auditSummary?.runDurationSeconds) : null)
      ?? (reconciliationMatches ? readNumber(durations?.configuredDurationSeconds) : null)
      ?? readNumber((health?.config as Record<string, unknown> | undefined)?.durationSeconds),
    validBookShare:
      (auditMatches ? readNumber(auditBookState?.validBookShare) : null)
      ?? (() => {
        const valid = readNumber(orderbook?.validTopOfBookRecords);
        const total = readNumber((health?.capture as Record<string, unknown> | undefined)?.topOfBookRecordCount);
        return valid !== null && total !== null && total > 0 ? valid / total : null;
      })(),
    btcJoinCoverageShare: auditMatches ? readNumber(auditBtcJoin?.joinCoverageShare) : null,
    bidSizeCoverageShare: bidSizeMatches
      ? readNumber(bidSizeComparison?.bidSizeCoverageShare)
      ?? readNumber(bidSizeComparison?.topOfBookBidSizeCoverageShare)
      : null,
    reconnectCount:
      (auditMatches ? readNumber(auditBookState?.reconnectCount) : null)
      ?? readNumber(orderbook?.reconnectCount),
    sequenceGapCount:
      (auditMatches ? readNumber(auditBookState?.sequenceGapCount) : null)
      ?? readNumber(orderbook?.sequenceGapCount),
    suspectedSystemSleepSeconds: reconciliationMatches
      ? readNumber(suspension?.suspectedSystemSleepSeconds)
      : null,
    captureVerdict: auditMatches ? readString(auditSummary?.verdict) : null,
    reconciliationVerdict: reconciliationMatches
      ? readString(reconciliationSummary?.overallVerdict)
      : null,
  };

  const metadataByMarket = new Map<string, Record<string, unknown>>();
  const metadataPath = joinPath(captureRunDir, "market-metadata.jsonl");
  if (input.io.fileExists(metadataPath)) {
    for (const line of input.io.readFile(metadataPath).split(/\r?\n/)) {
      const parsed = readMarketMetadataLine(line.trim());
      if (!parsed) {
        continue;
      }
      const marketTicker = readString(parsed.marketTicker);
      if (!marketTicker) {
        continue;
      }
      metadataByMarket.set(
        marketTicker,
        mergeMarketMetadataRecord(metadataByMarket.get(marketTicker), parsed),
      );
    }
  }

  const marketSemantics = new Map<string, MarketContractSemantics>();
  for (const [marketTicker, metadataRecord] of metadataByMarket.entries()) {
    const closeTime = readString(metadataRecord.closeTime);
    marketSemantics.set(
      marketTicker,
      resolveMarketContractSemantics({
        marketTicker,
        seriesTicker: readString(metadataRecord.seriesTicker),
        eventTicker: readString(metadataRecord.eventTicker),
        closeTimeMs: closeTime ? parseIsoTimestampMs(closeTime) : null,
        metadataRecord,
      }),
    );
  }

  return {
    runId,
    selectedRunQuality,
    inputArtifactIdentities: {
      captureHealthPath: healthPath,
      topOfBookPath: joinPath(captureRunDir, "top-of-book.jsonl"),
      btcSpotPath: joinPath(captureRunDir, "btc-spot.jsonl"),
      marketMetadataPath: metadataPath,
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
    marketSemantics,
    warnings,
  };
}
