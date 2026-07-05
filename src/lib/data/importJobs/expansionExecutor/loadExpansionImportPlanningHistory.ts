import { z } from "zod";

import { isUnsupportedHistoricalMarketSkipReason } from "./classifyUnsupportedHistoricalMarket";
import type { ExpansionImportPlanningHistory } from "./expansionImportSelectionTypes";

const marketRecordSchema = z.object({
  marketTicker: z.string().trim().min(1),
  status: z.enum(["planned", "imported", "skipped", "failed"]),
  skipReason: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
});

const summarySchema = z.object({
  jobs: z.array(
    z.object({
      markets: z.array(marketRecordSchema),
    }),
  ),
});

function isCompatibilityFailureMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("expiration_value")
    || normalized.includes("missing required fields")
    || normalized.includes("kalshi historical market response missing")
    || normalized.includes("import-compatibility")
    || normalized.includes("incompatible")
    || normalized.includes("missing opentime")
    || normalized.includes("missing closetime")
  );
}

function isHistoricalUnsupportedRecord(input: {
  status: "planned" | "imported" | "skipped" | "failed";
  skipReason: string | null;
  errorMessage: string | null;
}): boolean {
  if (isUnsupportedHistoricalMarketSkipReason(input.skipReason)) {
    return true;
  }

  if (input.status === "failed" && input.errorMessage) {
    return isCompatibilityFailureMessage(input.errorMessage);
  }

  if (input.status === "skipped" && input.skipReason) {
    return isCompatibilityFailureMessage(input.skipReason);
  }

  return false;
}

/** Loads prior expansion import outcomes used to deprioritize known unsupported markets. */
export function loadExpansionImportPlanningHistory(
  io: { readFile: (path: string) => string; fileExists: (path: string) => boolean },
  summaryPath: string,
): ExpansionImportPlanningHistory {
  if (!io.fileExists(summaryPath)) {
    return {
      summaryPath: null,
      summaryPresent: false,
      knownUnsupportedTickers: new Set(),
      successfullyImportedTickers: new Set(),
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(io.readFile(summaryPath));
  } catch {
    return {
      summaryPath,
      summaryPresent: false,
      knownUnsupportedTickers: new Set(),
      successfullyImportedTickers: new Set(),
    };
  }

  const result = summarySchema.safeParse(parsed);
  if (!result.success) {
    return {
      summaryPath,
      summaryPresent: false,
      knownUnsupportedTickers: new Set(),
      successfullyImportedTickers: new Set(),
    };
  }

  const knownUnsupportedTickers = new Set<string>();
  const successfullyImportedTickers = new Set<string>();

  for (const job of result.data.jobs) {
    for (const market of job.markets) {
      const skipReason = market.skipReason ?? null;
      const errorMessage = market.errorMessage ?? null;

      if (market.status === "imported") {
        successfullyImportedTickers.add(market.marketTicker);
        continue;
      }

      if (
        isHistoricalUnsupportedRecord({
          status: market.status,
          skipReason,
          errorMessage,
        })
      ) {
        knownUnsupportedTickers.add(market.marketTicker);
      }
    }
  }

  return {
    summaryPath,
    summaryPresent: true,
    knownUnsupportedTickers,
    successfullyImportedTickers,
  };
}
