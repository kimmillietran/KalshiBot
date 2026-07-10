import { posix } from "node:path";

import {
  compareRawDepthToTopOfBook,
  type CapturedTopOfBookSizeRecord,
  parseCapturedTopOfBookLine,
} from "./compareRawDepthToTopOfBook";
import { inspectRawLadderSizes } from "./inspectRawLadderSizes";
import { replayBidSizeState } from "./replayBidSizeState";
import {
  BidSizeCoverageAuditError,
  type BidSizeCoverageAuditConfig,
  type BidSizeCoverageAuditIo,
  type BidSizeCoverageAuditResult,
  type BidSizeCoverageAuditSummary,
  type RecommendedSizeFix,
  type SizeLossClassification,
} from "./bidSizeCoverageAuditTypes";

function joinPath(root: string, child: string): string {
  return posix.join(root.replaceAll("\\", "/"), child);
}

function classifySizeLoss(input: {
  comparison: BidSizeCoverageAuditResult["comparison"];
  replayState: BidSizeCoverageAuditResult["replayState"];
  rawInventory: BidSizeCoverageAuditResult["rawInventory"];
}): {
  sizeLossClassification: SizeLossClassification;
  recommendedNextFix: RecommendedSizeFix;
  confidence: BidSizeCoverageAuditSummary["confidence"];
} {
  if (input.comparison.emitSizeMissingCount > 0) {
    return {
      sizeLossClassification: "emit-size-missing",
      recommendedNextFix: "improve-bid-size-emission",
      confidence: "high",
    };
  }

  if (input.comparison.legacyRecordWithoutSizeCount > input.comparison.topOfBookRecordsCompared * 0.5) {
    return {
      sizeLossClassification: "legacy-missing-size-fields",
      recommendedNextFix: "extend-capture-with-size-fields",
      confidence: "high",
    };
  }

  if (
    input.comparison.fractionalBelowParityMinCount
      > input.comparison.sizeMatchCount
    || input.replayState.dustLevelBestBidCount
      > input.comparison.topOfBookRecordsCompared * 0.3
  ) {
    return {
      sizeLossClassification: "floating-point-dust-at-best-bid",
      recommendedNextFix: "apply-dust-level-epsilon-in-capture",
      confidence: "high",
    };
  }

  if (input.comparison.bidPairWithoutSizeCount > input.comparison.bidPairWithSizeCount) {
    return {
      sizeLossClassification: "parity-min-size-gate",
      recommendedNextFix: "document-parity-min-size-gate",
      confidence: "medium",
    };
  }

  if (input.comparison.sizeMatchCount > 0) {
    return {
      sizeLossClassification: "none",
      recommendedNextFix: "no-fix-needed",
      confidence: "high",
    };
  }

  return {
    sizeLossClassification: "unknown",
    recommendedNextFix: "unknown",
    confidence: "low",
  };
}

export function auditBidSizeCoverage(input: {
  io: BidSizeCoverageAuditIo;
  config: BidSizeCoverageAuditConfig;
}): BidSizeCoverageAuditResult {
  const captureRunDir = input.config.captureRunDir.replaceAll("\\", "/");
  const rawPath = joinPath(captureRunDir, "raw-kalshi-ws.jsonl");
  const topOfBookPath = joinPath(captureRunDir, "top-of-book.jsonl");
  const healthPath = joinPath(captureRunDir, "capture-health.json");

  if (!input.io.fileExists(captureRunDir)) {
    throw new BidSizeCoverageAuditError(`Capture run directory not found: ${captureRunDir}`);
  }
  if (!input.io.fileExists(rawPath)) {
    throw new BidSizeCoverageAuditError(`Missing raw-kalshi-ws.jsonl in ${captureRunDir}`);
  }
  if (!input.io.fileExists(topOfBookPath)) {
    throw new BidSizeCoverageAuditError(`Missing top-of-book.jsonl in ${captureRunDir}`);
  }

  const warnings: string[] = [];
  let runId: string | null = null;
  if (input.io.fileExists(healthPath)) {
    try {
      const health = JSON.parse(input.io.readFile(healthPath)) as { runId?: string };
      runId = health.runId ?? null;
    } catch {
      warnings.push("Malformed capture-health.json; runId unavailable.");
    }
  }

  const rawLines = input.io.readFile(rawPath).split(/\r?\n/);
  const rawInventory = inspectRawLadderSizes({
    lines: rawLines,
    maxMessages: input.config.maxRawMessages,
    marketTicker: input.config.marketTicker,
  });
  if (rawInventory.malformedLineCount > 0) {
    warnings.push(`Skipped ${rawInventory.malformedLineCount} malformed raw JSONL line(s).`);
  }

  const { state: replayState, points: replayPoints } = replayBidSizeState({
    lines: rawLines,
    maxMessages: input.config.maxRawMessages,
    marketTicker: input.config.marketTicker,
    runId: runId ?? captureRunDir.split("/").pop() ?? "unknown",
  });

  const captured: CapturedTopOfBookSizeRecord[] = [];
  for (const line of input.io.readFile(topOfBookPath).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const record = parseCapturedTopOfBookLine(trimmed);
    if (!record) {
      warnings.push("Skipped malformed top-of-book JSONL line.");
      continue;
    }
    if (input.config.marketTicker && record.marketTicker !== input.config.marketTicker) {
      continue;
    }
    captured.push(record);
  }

  const { metrics: comparison, samples } = compareRawDepthToTopOfBook({
    captured,
    replayPoints,
    sampleLimit: input.config.sampleLimit,
  });

  const decision = classifySizeLoss({
    comparison,
    replayState,
    rawInventory,
  });

  const summary: BidSizeCoverageAuditSummary = {
    captureRunDir,
    runId,
    messagesScanned: rawInventory.messagesScanned,
    topOfBookRecordsCompared: comparison.topOfBookRecordsCompared,
    rawBestBidSizePresentCount: rawInventory.rawBestBidSizePresentCount,
    replayBestBidSizePresentCount:
      replayState.yesBestBidSizePresentCount + replayState.noBestBidSizePresentCount,
    topOfBookBidSizePresentCount: comparison.topOfBookBidSizePresentCount,
    bidPairWithSizeCount: comparison.bidPairWithSizeCount,
    bidPairWithoutSizeCount: comparison.bidPairWithoutSizeCount,
    sizeLossClassification: decision.sizeLossClassification,
    recommendedNextFix: decision.recommendedNextFix,
    confidence: decision.confidence,
  };

  return {
    summary,
    rawInventory,
    replayState,
    comparison,
    samples,
    warnings,
  };
}
