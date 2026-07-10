import { posix } from "node:path";

import {
  buildLadderEvaluationPoints,
  compareTransformModels,
} from "./compareTransformModels";
import { inspectRawOrderbookPayloads } from "./inspectRawOrderbookPayloads";
import {
  OrderbookSemanticsValidationError,
  type EvidenceSummary,
  type MicrostructureInterpretation,
  type OrderbookSemanticsValidationConfig,
  type OrderbookSemanticsValidationIo,
  type OrderbookSemanticsValidationResult,
  type OrderbookSemanticsValidationSummary,
  type RecommendedNextFix,
  type RecommendedPricingModel,
  type SemanticsRootCauseClassification,
} from "./orderbookSemanticsValidationTypes";

const CODEBASE_EVIDENCE = [
  "src/lib/data/live/forwardQuoteCapture/orderbookCaptureBook.ts derives yesAsk=100-noBid and noAsk=100-yesBid from opposite-side best bids.",
  "src/features/market-data/orderbook/topOfBook.ts extractTopOfBook() applies the same complement transform.",
  "src/features/market-data/orderbook/schemas.ts defines snapshots with yes_dollars_fp/no_dollars_fp only (no explicit ask ladders).",
  "src/features/market-data/orderbook/types.ts KalshiOrderbookSnapshotMessage has optional yes_dollars_fp and no_dollars_fp bid ladders.",
] as const;

const SCHEMA_EVIDENCE = [
  "kalshiOrderbookSnapshotMessageSchema: yes_dollars_fp and no_dollars_fp optional tuple arrays [price_dollars, quantity_fp].",
  "kalshiOrderbookDeltaMessageSchema: side enum yes|no, price_dollars, delta_fp relative quantity change.",
  "kalshiRestOrderbookSchema: REST orderbook_fp exposes yes_dollars and no_dollars bid maps only.",
] as const;

function joinPath(root: string, child: string): string {
  return posix.join(root.replaceAll("\\", "/"), child);
}

function buildEvidenceSummary(input: {
  rawNotes: string[];
  explicitAskFieldsFound: boolean;
  yesNoBidLaddersFound: boolean;
}): EvidenceSummary {
  const observedPayloadEvidence = [...input.rawNotes];
  if (input.yesNoBidLaddersFound) {
    observedPayloadEvidence.push(
      "Captured snapshots contain YES/NO bid ladders (yes_dollars_fp/no_dollars_fp).",
    );
  }
  if (!input.explicitAskFieldsFound) {
    observedPayloadEvidence.push(
      "No explicit ask ladder fields observed in captured raw orderbook payloads.",
    );
  }

  let confidence: EvidenceSummary["confidence"] = "medium";
  if (input.yesNoBidLaddersFound && !input.explicitAskFieldsFound) {
    confidence = "high";
  } else if (!input.yesNoBidLaddersFound) {
    confidence = "low";
  }

  return {
    localSchemaEvidence: [...SCHEMA_EVIDENCE],
    codebaseEvidence: [...CODEBASE_EVIDENCE],
    observedPayloadEvidence,
    documentationEvidence: [
      "No bundled external Kalshi API markdown found in-repo; conclusions rely on schema + observed payloads.",
    ],
    confidence,
  };
}

function interpretMicrostructure(input: {
  complementCrossedShare: number | null;
  freshDualSideCrossedShare: number | null;
  yesBidPlusNoBidGt100Share: number | null;
  staleCrossedCount: number;
}): MicrostructureInterpretation {
  if (
    input.freshDualSideCrossedShare !== null
    && input.freshDualSideCrossedShare > 0.5
  ) {
    return {
      classification: "true-arbitrage-like-crossed-binary-book",
      rationale:
        "Crossed complement books persist even when YES and NO ladders were updated within the freshness window.",
    };
  }

  if (
    (input.complementCrossedShare ?? 0) > 0.5
    && input.staleCrossedCount > 0
    && (input.freshDualSideCrossedShare ?? 0) < 0.3
  ) {
    return {
      classification: "stale-update-artifact",
      rationale:
        "Most crossed states correlate with stale opposite-side ladder updates; fresh synchronized sides are less crossed.",
    };
  }

  if ((input.yesBidPlusNoBidGt100Share ?? 0) > 0.5) {
    return {
      classification: "normal-independent-bid-books",
      rationale:
        "yesBid+noBid>100 is common, consistent with independent YES/NO bid books rather than synchronized binary books.",
    };
  }

  if ((input.complementCrossedShare ?? 0) > 0.5) {
    return {
      classification: "wrong-ask-transform",
      rationale:
        "High crossed share under complement-derived asks suggests the transform may not represent executable asks.",
    };
  }

  return {
    classification: "unknown",
    rationale: "Insufficient evidence to classify microstructure interpretation.",
  };
}

function decideRecommendations(input: {
  explicitAskFieldsFound: boolean;
  complementCrossedShare: number | null;
  synchronizedCrossedShare: number | null;
  synchronizedParityShare: number | null;
  complementParityShare: number | null;
  freshDualSideCrossedShare: number | null;
  microstructure: SemanticsRootCauseClassification;
}): {
  recommendedPricingModel: RecommendedPricingModel;
  recommendedNextFix: RecommendedNextFix;
  complementTransformSupported: boolean;
} {
  if (input.explicitAskFieldsFound) {
    return {
      recommendedPricingModel: "explicit-ask",
      recommendedNextFix: "price-transform-fix",
      complementTransformSupported: false,
    };
  }

  if (
    input.synchronizedParityShare !== null
    && input.complementParityShare !== null
    && input.synchronizedParityShare > input.complementParityShare + 0.1
  ) {
    return {
      recommendedPricingModel: "synchronized-complement",
      recommendedNextFix: "bounded-freshness-gate",
      complementTransformSupported: true,
    };
  }

  if (
    (input.freshDualSideCrossedShare ?? 0) > 0.4
    && (input.complementCrossedShare ?? 0) > 0.5
  ) {
    return {
      recommendedPricingModel: "bid-only",
      recommendedNextFix: "bid-only-parity-model",
      complementTransformSupported: false,
    };
  }

  if (
    input.microstructure === "stale-update-artifact"
    && (input.synchronizedCrossedShare ?? 1) < (input.complementCrossedShare ?? 0)
  ) {
    return {
      recommendedPricingModel: "synchronized-complement",
      recommendedNextFix: "synchronized-complement-gate",
      complementTransformSupported: true,
    };
  }

  if (input.microstructure === "wrong-ask-transform") {
    return {
      recommendedPricingModel: "bid-only",
      recommendedNextFix: "price-transform-fix",
      complementTransformSupported: false,
    };
  }

  if ((input.complementCrossedShare ?? 0) > 0.5) {
    return {
      recommendedPricingModel: "synchronized-complement",
      recommendedNextFix: "bounded-freshness-gate",
      complementTransformSupported: true,
    };
  }

  return {
    recommendedPricingModel: "complement-derived",
    recommendedNextFix: "unknown",
    complementTransformSupported: true,
  };
}

export function validateOrderbookSemantics(input: {
  io: OrderbookSemanticsValidationIo;
  config: OrderbookSemanticsValidationConfig;
}): OrderbookSemanticsValidationResult {
  const captureRunDir = input.config.captureRunDir.replaceAll("\\", "/");
  const rawPath = joinPath(captureRunDir, "raw-kalshi-ws.jsonl");
  const healthPath = joinPath(captureRunDir, "capture-health.json");

  if (!input.io.fileExists(captureRunDir)) {
    throw new OrderbookSemanticsValidationError(
      `Capture run directory not found: ${captureRunDir}`,
    );
  }
  if (!input.io.fileExists(rawPath)) {
    throw new OrderbookSemanticsValidationError(
      `Missing raw-kalshi-ws.jsonl in ${captureRunDir}`,
    );
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
  const rawPayloadSemantics = inspectRawOrderbookPayloads({
    lines: rawLines,
    maxMessages: input.config.maxRawMessages,
  });
  if (rawPayloadSemantics.malformedLineCount > 0) {
    warnings.push(
      `Skipped ${rawPayloadSemantics.malformedLineCount} malformed raw JSONL line(s).`,
    );
  }

  const points = buildLadderEvaluationPoints({
    lines: rawLines,
    maxMessages: input.config.maxRawMessages,
    marketTicker: input.config.marketTicker,
  });

  const explicitAskFieldsFound = rawPayloadSemantics.explicitAskFieldsFound.length > 0;
  const yesNoBidLaddersFound =
    rawPayloadSemantics.yesNoBidLadderFieldsFound.length > 0;

  const { models, complementTransform } = compareTransformModels({
    points,
    freshnessWindowMs: input.config.freshnessWindowMs,
    hasExplicitAskFields: explicitAskFieldsFound,
  });

  const complementModel = models.find((model) => model.modelId === "complement-derived");
  const synchronizedModel = models.find(
    (model) => model.modelId === "synchronized-complement",
  );

  const markets = new Set(points.map((point) => point.marketTicker));
  const evidence = buildEvidenceSummary({
    rawNotes: rawPayloadSemantics.notes,
    explicitAskFieldsFound,
    yesNoBidLaddersFound,
  });

  const yesBidPlusNoBidGt100Share =
    complementTransform.recordsWithBothBids > 0
      ? complementTransform.yesBidPlusNoBidGreaterThan100Count
        / complementTransform.recordsWithBothBids
      : null;

  const microstructure = interpretMicrostructure({
    complementCrossedShare: complementModel?.crossedShare ?? null,
    freshDualSideCrossedShare: complementTransform.crossedWhenBothSidesFreshShare,
    yesBidPlusNoBidGt100Share,
    staleCrossedCount: complementTransform.staleOppositeSideCrossedCount,
  });

  const recommendations = decideRecommendations({
    explicitAskFieldsFound,
    complementCrossedShare: complementModel?.crossedShare ?? null,
    synchronizedCrossedShare: synchronizedModel?.crossedShare ?? null,
    synchronizedParityShare: synchronizedModel?.parityUsableShare ?? null,
    complementParityShare: complementModel?.parityUsableShare ?? null,
    freshDualSideCrossedShare: complementTransform.crossedWhenBothSidesFreshShare,
    microstructure: microstructure.classification,
  });

  const summary: OrderbookSemanticsValidationSummary = {
    captureRunDir,
    runId,
    messagesScanned: rawPayloadSemantics.messagesScanned,
    marketsAnalyzed: markets.size,
    explicitAskFieldsFound,
    yesNoBidLaddersFound,
    complementTransformSupported: recommendations.complementTransformSupported,
    crossedShareComplementModel: complementModel?.crossedShare ?? null,
    crossedShareSynchronizedModel: synchronizedModel?.crossedShare ?? null,
    freshDualSideRecordCount: complementTransform.freshDualSideRecordCount,
    freshDualSideCrossedCount: complementTransform.freshDualSideCrossedCount,
    recommendedPricingModel: recommendations.recommendedPricingModel,
    rootCauseClassification: microstructure.classification,
    recommendedNextFix: recommendations.recommendedNextFix,
    confidence: evidence.confidence,
  };

  return {
    summary,
    rawPayloadSemantics,
    transformModels: models,
    complementTransform,
    evidence,
    microstructure,
    warnings,
  };
}
