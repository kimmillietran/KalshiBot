import { posix } from "node:path";

import {
  createFilesystemJsonlIo,
  createLineIterableFromFile,
} from "@/lib/data/research/jsonl";

import {
  compareRawDepthToTopOfBook,
  type CapturedTopOfBookSizeRecord,
  parseCapturedTopOfBookLine,
} from "./compareRawDepthToTopOfBook";
import { inspectRawLadderSizes } from "./inspectRawLadderSizes";
import { replayBidSizeState, replayKey } from "./replayBidSizeState";
import {
  BidSizeCoverageAuditError,
  type BidSizeCoverageAuditConfig,
  type BidSizeCoverageAuditIo,
  type BidSizeCoverageAuditResult,
  type BidSizeCoverageAuditSummary,
  type ComparisonMode,
  type RecommendedSizeFix,
  type SizeLossClassification,
} from "./bidSizeCoverageAuditTypes";

function joinPath(root: string, child: string): string {
  return posix.join(root.replaceAll("\\", "/"), child);
}

export function createFilesystemBidSizeCoverageIo(): BidSizeCoverageAuditIo {
  const jsonl = createFilesystemJsonlIo();
  return {
    ...jsonl,
    createLineIterable: createLineIterableFromFile,
  };
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

  if (
    input.rawInventory.rawBestBidPricePresentCount > 0
    && input.rawInventory.rawBestBidSizePresentCount === 0
  ) {
    return {
      sizeLossClassification: "raw-size-missing",
      recommendedNextFix: "extend-capture-with-size-fields",
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
    input.comparison.fractionalBelowParityMinCount > input.comparison.sizeMatchCount
    || input.replayState.dustLevelBestBidCount > input.comparison.topOfBookRecordsCompared * 0.3
  ) {
    return {
      sizeLossClassification: "floating-point-dust-at-best-bid",
      recommendedNextFix: "continue-capture-and-run-downstream-analysis",
      confidence: "high",
    };
  }

  if (
    input.comparison.bidSizeCoverageShare !== null
    && input.comparison.bidSizeCoverageShare < 0.5
  ) {
    return {
      sizeLossClassification: "parity-min-size-gate",
      recommendedNextFix: "investigate-low-bid-pair-coverage",
      confidence: "medium",
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
      recommendedNextFix: "run-static-parity-and-lifecycle",
      confidence: "high",
    };
  }

  return {
    sizeLossClassification: "unknown",
    recommendedNextFix: "unknown",
    confidence: "low",
  };
}

function resolveComparisonMode(config: BidSizeCoverageAuditConfig): ComparisonMode {
  return Number.isFinite(config.maxRawMessages) ? "bounded-sample" : "full";
}

export async function auditBidSizeCoverage(input: {
  io: BidSizeCoverageAuditIo;
  config: BidSizeCoverageAuditConfig;
}): Promise<BidSizeCoverageAuditResult> {
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

  const captured: CapturedTopOfBookSizeRecord[] = [];
  const topOfBookSummary = await input.io.iterateJsonl(topOfBookPath, {
    onLine: (line) => {
      const record = parseCapturedTopOfBookLine(line);
      if (!record) {
        warnings.push("Skipped malformed top-of-book JSONL line.");
        return "skip";
      }
      if (input.config.marketTicker && record.marketTicker !== input.config.marketTicker) {
        return "skip";
      }
      captured.push(record);
      return "continue";
    },
  });
  if (topOfBookSummary.invalidLineCount > 0) {
    warnings.push(`Skipped ${topOfBookSummary.invalidLineCount} malformed top-of-book JSONL line(s).`);
  }

  const neededReplayKeys = new Set<string>();
  for (const record of captured) {
    if (record.sequence !== null) {
      neededReplayKeys.add(replayKey(record.marketTicker, record.sequence));
    }
  }

  const rawInventory = await inspectRawLadderSizes({
    lines: input.io.createLineIterable(rawPath),
    maxMessages: input.config.maxRawMessages,
    marketTicker: input.config.marketTicker,
  });
  if (rawInventory.malformedLineCount > 0) {
    warnings.push(`Skipped ${rawInventory.malformedLineCount} malformed raw JSONL line(s).`);
  }

  const { state: replayState, replayIndex } = await replayBidSizeState({
    lines: input.io.createLineIterable(rawPath),
    maxMessages: input.config.maxRawMessages,
    marketTicker: input.config.marketTicker,
    runId: runId ?? captureRunDir.split("/").pop() ?? "unknown",
    neededReplayKeys,
  });

  const { metrics: comparison, samples } = compareRawDepthToTopOfBook({
    captured,
    replayIndex,
    sampleLimit: input.config.sampleLimit,
  });

  const decision = classifySizeLoss({
    comparison,
    replayState,
    rawInventory,
  });

  const comparisonMode = resolveComparisonMode(input.config);
  if (comparisonMode === "bounded-sample") {
    warnings.push(
      `Raw replay bounded to maxRawMessages=${input.config.maxRawMessages}; comparison may be partial.`,
    );
  }

  const summary: BidSizeCoverageAuditSummary = {
    captureRunDir,
    runId,
    comparisonMode,
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
