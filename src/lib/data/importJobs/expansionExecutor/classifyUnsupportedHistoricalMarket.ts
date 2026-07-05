import type { KalshiMarketWireShape } from "@/lib/data/importers/kalshi/kalshiMarketImportDiagnostics";

import { evaluateExpansionMarketSchemaReconciliation } from "./evaluateExpansionMarketSchemaReconciliation";
import type { ExpansionImportMarketResult } from "./expansionExecutorTypes";

export const UNSUPPORTED_HISTORICAL_MARKET_SKIP_REASON_PREFIX =
  "Unsupported historical market: ";

export type UnsupportedHistoricalMarketSupport = "supported" | "unsupported";

export type UnsupportedHistoricalMarketClassification = {
  support: UnsupportedHistoricalMarketSupport;
  missingRequiredFields: readonly string[];
  reason: string | null;
  skipReason: string | null;
};

/** Formats a single missing required field for unsupported-market reporting. */
export function formatUnsupportedHistoricalMarketFieldReason(field: string): string {
  return `Missing ${field} from Kalshi historical API.`;
}

/** Formats the unsupported-market reason from missing required wire fields. */
export function formatUnsupportedHistoricalMarketReason(
  missingRequiredFields: readonly string[],
): string {
  if (missingRequiredFields.length === 0) {
    return "Missing required fields from Kalshi historical API.";
  }

  if (missingRequiredFields.length === 1) {
    return formatUnsupportedHistoricalMarketFieldReason(missingRequiredFields[0]!);
  }

  return `Missing required fields from Kalshi historical API: ${missingRequiredFields.join(", ")}.`;
}

/** Builds the expansion skip reason for an unsupported historical market. */
export function buildUnsupportedHistoricalMarketSkipReason(
  missingRequiredFields: readonly string[],
): string {
  return `${UNSUPPORTED_HISTORICAL_MARKET_SKIP_REASON_PREFIX}${formatUnsupportedHistoricalMarketReason(missingRequiredFields)}`;
}

/** Returns true when a skip reason marks an unsupported historical market. */
export function isUnsupportedHistoricalMarketSkipReason(
  skipReason: string | null | undefined,
): boolean {
  return (
    skipReason?.startsWith(UNSUPPORTED_HISTORICAL_MARKET_SKIP_REASON_PREFIX) ?? false
  );
}

/**
 * Classifies whether list/detail wires contain the required immutable historical fields.
 * Does not invent or derive missing values.
 */
export function classifyUnsupportedHistoricalMarket(input: {
  listMarketWire: KalshiMarketWireShape | null;
  detailMarketWire?: KalshiMarketWireShape | null;
}): UnsupportedHistoricalMarketClassification {
  const evaluation = evaluateExpansionMarketSchemaReconciliation({
    listMarketWire: input.listMarketWire,
    detailMarketWire: input.detailMarketWire ?? null,
  });

  if (evaluation.reconciliationSuccess) {
    return {
      support: "supported",
      missingRequiredFields: [],
      reason: null,
      skipReason: null,
    };
  }

  const missingRequiredFields = evaluation.mergedMissingRequiredFields;
  return {
    support: "unsupported",
    missingRequiredFields,
    reason: formatUnsupportedHistoricalMarketReason(missingRequiredFields),
    skipReason: buildUnsupportedHistoricalMarketSkipReason(missingRequiredFields),
  };
}

export type UnsupportedHistoricalMarketCounts = {
  unsupportedCount: number;
  skippedUnsupportedCount: number;
};

/** Counts unsupported markets in expansion import results. */
export function countUnsupportedHistoricalMarketResults(
  results: readonly ExpansionImportMarketResult[],
): UnsupportedHistoricalMarketCounts {
  const unsupportedResults = results.filter((entry) =>
    isUnsupportedHistoricalMarketSkipReason(entry.skipReason),
  );

  return {
    unsupportedCount: unsupportedResults.length,
    skippedUnsupportedCount: unsupportedResults.filter(
      (entry) => entry.status === "skipped",
    ).length,
  };
}
