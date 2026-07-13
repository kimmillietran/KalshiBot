import { joinPath, parseIsoTimestampMs, readNumber, readString } from "./leadLagUtils";
import {
  GLOBAL_CAPTURE_HEALTH_AUDIT_PATH,
  SelectedRunCaptureHealthError,
  validateSelectedRunCaptureDirectory,
} from "../selectedRunCaptureHealth";
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

function mapCaptureHealthError(error: unknown): never {
  if (error instanceof SelectedRunCaptureHealthError) {
    throw new BtcKalshiLeadLagAnalysisError(error.message);
  }
  throw error;
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
  try {
    return validateSelectedRunCaptureDirectory({ io, captureRunDir }).captureRunDir;
  } catch (error) {
    mapCaptureHealthError(error);
  }
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
  let captureRunDir: string;
  let resolvedHealth;
  try {
    const validated = validateSelectedRunCaptureDirectory({ io: input.io, captureRunDir: input.captureRunDir });
    captureRunDir = validated.captureRunDir;
    resolvedHealth = validated.health;
  } catch (error) {
    mapCaptureHealthError(error);
  }

  const runId = resolveSelectedRunId(captureRunDir);
  const warnings = [...resolvedHealth.warnings];
  const healthRunId = resolvedHealth.selectedRunId;

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
    captureHealthSource: resolvedHealth.healthSource,
    runDurationSeconds:
      resolvedHealth.runDurationSeconds
      ?? (reconciliationMatches ? readNumber(durations?.configuredDurationSeconds) : null),
    validBookShare: resolvedHealth.validBookShare,
    btcJoinCoverageShare: resolvedHealth.btcJoinCoverageShare,
    bidSizeCoverageShare: bidSizeMatches
      ? readNumber(bidSizeComparison?.bidSizeCoverageShare)
      ?? readNumber(bidSizeComparison?.topOfBookBidSizeCoverageShare)
      : null,
    reconnectCount: resolvedHealth.reconnectCount,
    sequenceGapCount: resolvedHealth.sequenceGapCount,
    suspectedSystemSleepSeconds: reconciliationMatches
      ? readNumber(suspension?.suspectedSystemSleepSeconds)
      : null,
    captureVerdict: resolvedHealth.captureVerdict,
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
      captureHealthPath: resolvedHealth.nativeHealthPath,
      topOfBookPath: joinPath(captureRunDir, "top-of-book.jsonl"),
      btcSpotPath: joinPath(captureRunDir, "btc-spot.jsonl"),
      marketMetadataPath: metadataPath,
      captureHealthAuditPath:
        resolvedHealth.runScopedAuditPath
        ?? (input.io.fileExists(GLOBAL_CAPTURE_HEALTH_AUDIT_PATH)
          ? GLOBAL_CAPTURE_HEALTH_AUDIT_PATH
          : null),
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
