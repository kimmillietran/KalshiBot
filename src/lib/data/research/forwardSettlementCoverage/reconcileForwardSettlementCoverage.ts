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
  if (message.includes("kalshi-market-not-found") || message.includes("market-not-found")) {
    return "kalshi-market-not-found";
  }
  if (message.includes("kalshi-event-not-found") || message.includes("event-not-found")) {
    return "kalshi-event-not-found";
  }
  if (message.includes("kalshi-endpoint-not-found") || message.includes("endpoint-not-found")) {
    return "kalshi-endpoint-not-found";
  }
  if (message.includes("kalshi-settlement-not-found") || message.includes("settlement-not-found")) {
    return "kalshi-settlement-not-found";
  }
  if (message.includes("historical api error (404)") || message.includes("returned 404")) {
    return "kalshi-market-not-found";
  }
  if (message.includes("market request") || message.includes("list market")) {
    return "kalshi-market-request-failed";
  }
  if (message.includes("settlement request") || message.includes("get-rest-market")
    || message.includes("get-historical-market") || message.includes("get-settlement-result")) {
    return "kalshi-settlement-request-failed";
  }
  if (message.includes("not settled") || message.includes("unsettled")) {
    return "market-not-settled";
  }
  if (message.includes("normalization") || message.includes("validation failed")
    || message.includes("malformed")) {
    return "normalization-failed";
  }
  if (message.includes("write") || message.includes("artifact")) {
    return "artifact-write-failed";
  }

  return "unknown";
}

const NON_RETRYABLE_ERROR_CATEGORIES = new Set<ForwardSettlementBackfillErrorCategory>([
  "kalshi-market-not-found",
  "kalshi-event-not-found",
  "kalshi-endpoint-not-found",
  "kalshi-settlement-not-found",
  "normalization-failed",
  "btc-provider-unexpectedly-required",
]);

export function isBackfillErrorRetryable(input: {
  errorMessage: string | null | undefined;
  errorCategory?: ForwardSettlementBackfillErrorCategory | null;
}): boolean {
  const category =
    input.errorCategory ?? classifyBackfillErrorCategory(input.errorMessage);
  if (NON_RETRYABLE_ERROR_CATEGORIES.has(category)) {
    return false;
  }

  const message = (input.errorMessage ?? "").toLowerCase();
  if (message.includes("(404)")) {
    return false;
  }

  if (category === "market-not-settled") {
    return true;
  }

  if (category === "kalshi-settlement-request-failed" || category === "kalshi-market-request-failed") {
    return message.includes("(429)") || message.includes("(5");
  }

  return category === "unknown" || category === "artifact-write-failed";
}

export function isCheckpointRetryDeferred(
  entry: ForwardSettlementBackfillCheckpointMarket,
  evaluatedAt: string,
): boolean {
  return isRetryDeferred(entry, evaluatedAt);
}
