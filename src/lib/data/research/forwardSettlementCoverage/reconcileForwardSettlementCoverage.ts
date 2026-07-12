import type {
  ForwardSettlementBackfillCheckpointMarket,
  ForwardSettlementBackfillErrorCategory,
  MarketSettlementCoverageEntry,
} from "./forwardSettlementCoverageTypes";

function isRetryDeferred(
  entry: ForwardSettlementBackfillCheckpointMarket,
  evaluatedAt: string,
): boolean {
  if (entry.status !== "failed" || !entry.nextEligibleRetryAt) {
    return false;
  }

  const retryMs = Date.parse(entry.nextEligibleRetryAt);
  const evaluatedMs = Date.parse(evaluatedAt);
  return Number.isFinite(retryMs) && Number.isFinite(evaluatedMs) && evaluatedMs < retryMs;
}

/** Reconciles checkpoint failure state into coverage rows when import artifacts are absent. */
export function applyCheckpointCoverageOverride(input: {
  market: MarketSettlementCoverageEntry;
  checkpointEntry: ForwardSettlementBackfillCheckpointMarket | null;
  evaluatedAt: string;
}): MarketSettlementCoverageEntry {
  if (!input.checkpointEntry) {
    return input.market;
  }

  const { checkpointEntry } = input;

  if (
    input.market.classification === "settlement-ready"
    || input.market.classification === "settlement-present-but-conflicting"
    || input.market.classification === "market-not-yet-settled"
  ) {
    return input.market;
  }

  if (checkpointEntry.status === "failed") {
    const retryDeferred = isRetryDeferred(checkpointEntry, input.evaluatedAt);
    return {
      ...input.market,
      classification: "import-failed",
      exclusionReason: retryDeferred
        ? `retry deferred until ${checkpointEntry.nextEligibleRetryAt}: ${
          checkpointEntry.errorMessage ?? "settlement import failed"
        }`
        : checkpointEntry.errorMessage
          ?? "settlement import failed",
      nextEligibleRetryAt: checkpointEntry.nextEligibleRetryAt,
      sourceArtifact: checkpointEntry.importResultPath ?? input.market.sourceArtifact,
    };
  }

  if (
    checkpointEntry.status === "imported"
    && input.market.classification === "missing-settlement-source"
  ) {
    return {
      ...input.market,
      classification: "import-failed",
      exclusionReason:
        "checkpoint recorded imported status but settlement artifact is missing or malformed",
      sourceArtifact: checkpointEntry.importResultPath,
    };
  }

  return input.market;
}

export function classifyBackfillErrorCategory(
  errorMessage: string | null | undefined,
): ForwardSettlementBackfillErrorCategory {
  const message = (errorMessage ?? "").toLowerCase();
  if (message.includes("btc historical klines") || message.includes("btc provider")) {
    return "btc-provider-unexpectedly-required";
  }
  if (message.includes("market request") || message.includes("list market")) {
    return "kalshi-market-request-failed";
  }
  if (message.includes("settlement request")) {
    return "kalshi-settlement-request-failed";
  }
  if (message.includes("not settled") || message.includes("unsettled")) {
    return "market-not-settled";
  }
  if (message.includes("normalization") || message.includes("validation failed")) {
    return "normalization-failed";
  }
  if (message.includes("write") || message.includes("artifact")) {
    return "artifact-write-failed";
  }

  return "unknown";
}

export function isCheckpointRetryDeferred(
  entry: ForwardSettlementBackfillCheckpointMarket,
  evaluatedAt: string,
): boolean {
  return isRetryDeferred(entry, evaluatedAt);
}
