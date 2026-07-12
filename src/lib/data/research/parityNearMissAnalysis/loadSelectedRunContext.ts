import { joinPath, parseIsoTimestampMs } from "../bidOnlyCandidateLifecycle/bidOnlyCandidateLifecycleUtils";
import type {
  ParityNearMissAnalysisIo,
  ParityNearMissInputArtifactIdentities,
  ParityNearMissSelectedRunQuality,
} from "./parityNearMissAnalysisTypes";
import { ParityNearMissAnalysisError } from "./parityNearMissAnalysisTypes";

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
  const healthRunId = typeof health?.runId === "string" ? health.runId : null;
  if (healthRunId && healthRunId !== runId) {
    warnings.push(
      `capture-health.json runId (${healthRunId}) differs from directory name (${runId}).`,
    );
  }

  const reconciliationPath = "data/research-results/capture-health-reconciliation.json";
  const reconciliation = readJsonRecord(input.io, reconciliationPath);
  const reconciliationSummary =
    reconciliation?.summary && typeof reconciliation.summary === "object"
      ? (reconciliation.summary as Record<string, unknown>)
      : null;

  const bidSizePath = "data/research-results/bid-size-coverage-audit.json";
  const bidSize = readJsonRecord(input.io, bidSizePath);
  const bidSizeSummary =
    bidSize?.summary && typeof bidSize.summary === "object"
      ? (bidSize.summary as Record<string, unknown>)
      : null;
  const bidSizeComparison =
    bidSize?.comparison && typeof bidSize.comparison === "object"
      ? (bidSize.comparison as Record<string, unknown>)
      : null;

  const orderbook = health?.orderbook as Record<string, unknown> | undefined;
  const duration = health?.duration as Record<string, unknown> | undefined;
  const watchdog = health?.watchdog as Record<string, unknown> | undefined;

  const selectedRunQuality: ParityNearMissSelectedRunQuality = {
    selectedRunId: healthRunId ?? runId,
    runDurationSeconds:
      readNumber(duration?.runDurationSeconds)
      ?? readNumber(reconciliationSummary?.runDurationSeconds),
    validBookShare:
      readNumber(orderbook?.validBookShare)
      ?? readNumber(reconciliationSummary?.validBookShare),
    btcJoinCoverageShare:
      readNumber(health?.btcJoinCoverageShare)
      ?? readNumber(reconciliationSummary?.btcJoinCoverageShare),
    bidSizeCoverageShare:
      readNumber(bidSizeComparison?.bidSizeCoverageShare)
      ?? readNumber(bidSizeComparison?.topOfBookBidSizeCoverageShare)
      ?? readNumber(bidSizeSummary?.bidSizeCoverageShare),
    reconnectCount:
      readNumber(watchdog?.recoveryAttemptCount)
      ?? readNumber(reconciliationSummary?.reconnectCount),
    suspectedSystemSleepSeconds: readNumber(reconciliationSummary?.suspectedSystemSleepSeconds),
    sequenceGapCount:
      readNumber(orderbook?.sequenceGapCount)
      ?? readNumber(reconciliationSummary?.sequenceGapCount),
  };

  if (
    reconciliationSummary
    && typeof reconciliationSummary.selectedRunId === "string"
    && reconciliationSummary.selectedRunId !== selectedRunQuality.selectedRunId
  ) {
    warnings.push("capture-health-reconciliation.json selectedRunId does not match selected run.");
  }

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
      captureHealthRunId: healthRunId,
      captureHealthReconciliationPath: input.io.fileExists(reconciliationPath)
        ? reconciliationPath
        : null,
      bidSizeCoverageAuditPath: input.io.fileExists(bidSizePath) ? bidSizePath : null,
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
