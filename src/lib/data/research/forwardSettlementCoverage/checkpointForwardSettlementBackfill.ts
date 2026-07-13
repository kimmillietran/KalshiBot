import { stableStringify } from "@/lib/trading/config/hashConfig";

import type {
  ForwardSettlementBackfillCheckpoint,
  ForwardSettlementBackfillCheckpointMarket,
} from "./forwardSettlementCoverageTypes";
import {
  FORWARD_SETTLEMENT_BACKFILL_IMPLEMENTATION_VERSION,
  ForwardSettlementCoverageError,
} from "./forwardSettlementCoverageTypes";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createForwardSettlementBackfillCheckpoint(input: {
  captureRunDir: string;
  selectedRunId: string;
  importsDir: string;
  dryRun: boolean;
  startedAt: string;
  marketTickers: readonly string[];
}): ForwardSettlementBackfillCheckpoint {
  return {
    version: 1,
    implementationVersion: FORWARD_SETTLEMENT_BACKFILL_IMPLEMENTATION_VERSION,
    captureRunDir: input.captureRunDir,
    selectedRunId: input.selectedRunId,
    importsDir: input.importsDir,
    startedAt: input.startedAt,
    updatedAt: input.startedAt,
    dryRun: input.dryRun,
    markets: input.marketTickers.map((marketTicker) => ({
      marketTicker,
      status: "pending",
      attempts: 0,
      lastAttemptAt: null,
      nextEligibleRetryAt: null,
      errorMessage: null,
      errorCategory: null,
      importResultPath: null,
    })),
  };
}

export function parseForwardSettlementBackfillCheckpoint(
  content: string,
): ForwardSettlementBackfillCheckpoint {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content.replace(/^\uFEFF/, ""));
  } catch {
    throw new ForwardSettlementCoverageError("Malformed backfill checkpoint JSON");
  }

  if (!isRecord(parsed) || parsed.version !== 1 || !Array.isArray(parsed.markets)) {
    throw new ForwardSettlementCoverageError("Invalid backfill checkpoint schema");
  }

  return parsed as ForwardSettlementBackfillCheckpoint;
}

export function serializeForwardSettlementBackfillCheckpoint(
  checkpoint: ForwardSettlementBackfillCheckpoint,
): string {
  return stableStringify(checkpoint);
}

export function loadForwardSettlementBackfillCheckpoint(input: {
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  checkpointPath: string;
}): ForwardSettlementBackfillCheckpoint | null {
  if (!input.fileExists(input.checkpointPath)) {
    return null;
  }

  return parseForwardSettlementBackfillCheckpoint(input.readFile(input.checkpointPath));
}

export function updateCheckpointMarket(
  checkpoint: ForwardSettlementBackfillCheckpoint,
  market: ForwardSettlementBackfillCheckpointMarket,
  updatedAt: string,
): ForwardSettlementBackfillCheckpoint {
  return {
    ...checkpoint,
    updatedAt,
    markets: checkpoint.markets.map((entry) =>
      entry.marketTicker === market.marketTicker ? market : entry),
  };
}

export function mergeCheckpointWithMarkets(
  existing: ForwardSettlementBackfillCheckpoint,
  marketTickers: readonly string[],
  updatedAt: string,
): ForwardSettlementBackfillCheckpoint {
  const byTicker = new Map(existing.markets.map((market) => [market.marketTicker, market]));

  return {
    ...existing,
    updatedAt,
    markets: marketTickers.map((marketTicker) =>
      byTicker.get(marketTicker) ?? {
        marketTicker,
        status: "pending",
        attempts: 0,
        lastAttemptAt: null,
        nextEligibleRetryAt: null,
        errorMessage: null,
        errorCategory: null,
        importResultPath: null,
      }),
  };
}

export function isBackfillCheckpointFailureStale(
  entry: ForwardSettlementBackfillCheckpointMarket,
): boolean {
  if (entry.status !== "failed") {
    return false;
  }

  const message = (entry.errorMessage ?? "").toLowerCase();
  if (entry.errorCategory === "btc-provider-unexpectedly-required") {
    return true;
  }

  if (entry.errorCategory === "unknown" && message.includes("404")) {
    return true;
  }

  if (entry.errorCategory === "kalshi-market-not-found" && message.includes("historical")) {
    return true;
  }

  return false;
}

export function isCheckpointImplementationStale(
  checkpoint: ForwardSettlementBackfillCheckpoint,
): boolean {
  return (
    checkpoint.implementationVersion !== FORWARD_SETTLEMENT_BACKFILL_IMPLEMENTATION_VERSION
  );
}

export function isCheckpointMarketEligible(
  market: ForwardSettlementBackfillCheckpointMarket,
  evaluatedAt: string,
  checkpoint?: ForwardSettlementBackfillCheckpoint,
): boolean {
  if (market.status === "imported" || market.status === "skipped-ready") {
    return false;
  }

  if (
    market.status === "skipped-unsettled"
    || market.status === "skipped-conflict"
    || market.status === "skipped-not-candidate"
  ) {
    return false;
  }

  if (market.status === "failed") {
    if (
      checkpoint
      && isCheckpointImplementationStale(checkpoint)
      && isBackfillCheckpointFailureStale(market)
    ) {
      return true;
    }

    if (isBackfillCheckpointFailureStale(market) && !market.nextEligibleRetryAt) {
      return true;
    }

    if (!market.nextEligibleRetryAt) {
      return true;
    }

    const retryMs = Date.parse(market.nextEligibleRetryAt);
    const evaluatedMs = Date.parse(evaluatedAt);
    return Number.isFinite(retryMs) && Number.isFinite(evaluatedMs) && evaluatedMs >= retryMs;
  }

  if (!market.nextEligibleRetryAt) {
    return true;
  }

  const retryMs = Date.parse(market.nextEligibleRetryAt);
  const evaluatedMs = Date.parse(evaluatedAt);
  return Number.isFinite(retryMs) && Number.isFinite(evaluatedMs) && evaluatedMs >= retryMs;
}
