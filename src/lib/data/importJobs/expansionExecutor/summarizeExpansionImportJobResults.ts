import type { ExpansionImportMarketResult } from "./expansionExecutorTypes";

export type ExpansionImportJobAttemptCounts = {
  importedCount: number;
  skippedCount: number;
  failedCount: number;
  plannedStatusCount: number;
  attemptedCount: number;
};

export function countExpansionImportAttempts(
  results: readonly ExpansionImportMarketResult[],
): ExpansionImportJobAttemptCounts {
  const importedCount = results.filter((entry) => entry.status === "imported").length;
  const skippedCount = results.filter((entry) => entry.status === "skipped").length;
  const failedCount = results.filter((entry) => entry.status === "failed").length;
  const plannedStatusCount = results.filter((entry) => entry.status === "planned").length;

  return {
    importedCount,
    skippedCount,
    failedCount,
    plannedStatusCount,
    attemptedCount: importedCount + skippedCount + failedCount,
  };
}

/** Validates summary invariants for a single job's planned queue execution. */
export function assertExpansionImportJobSummaryInvariants(input: {
  plannedQueueLength: number;
  attemptedResults: readonly ExpansionImportMarketResult[];
  budgetAtPlanning: number | null;
  execute: boolean;
}): void {
  const counts = countExpansionImportAttempts(input.attemptedResults);

  if (counts.attemptedCount > input.plannedQueueLength) {
    throw new Error(
      `attempted (${counts.attemptedCount}) exceeds planned queue length (${input.plannedQueueLength})`,
    );
  }

  if (
    input.budgetAtPlanning !== null
    && input.plannedQueueLength > input.budgetAtPlanning
  ) {
    throw new Error(
      `planned queue length (${input.plannedQueueLength}) exceeds remaining budget (${input.budgetAtPlanning})`,
    );
  }

  if (
    input.execute
    && input.plannedQueueLength === 0
    && counts.failedCount > 0
  ) {
    throw new Error("failedCount > 0 with empty planned queue");
  }
}

export function buildExpansionImportMarketsInDiscoveryOrder(input: {
  sortedDiscovered: readonly { marketTicker: string; seriesTicker: string }[];
  existingTickersAtPlanning: ReadonlySet<string>;
  plannedTickers: ReadonlySet<string>;
  attemptedResultsByTicker: ReadonlyMap<string, ExpansionImportMarketResult>;
  dedupedSkipReason: string;
}): ExpansionImportMarketResult[] {
  const markets: ExpansionImportMarketResult[] = [];

  for (const market of input.sortedDiscovered) {
    if (input.existingTickersAtPlanning.has(market.marketTicker)) {
      markets.push({
        marketTicker: market.marketTicker,
        seriesTicker: market.seriesTicker,
        status: "skipped",
        configPath: null,
        importResultPath: null,
        errorMessage: null,
        skipReason: input.dedupedSkipReason,
        durationMs: 0,
      });
      continue;
    }

    if (!input.plannedTickers.has(market.marketTicker)) {
      continue;
    }

    const attempted = input.attemptedResultsByTicker.get(market.marketTicker);
    if (attempted) {
      markets.push(attempted);
    }
  }

  return markets;
}

export function formatExpansionImportAbortGuardLines(
  failureMessages: readonly string[],
): string[] {
  const lines = [
    "[Expansion Import] ABORT: all planned markets failed with zero imports.",
    "First failure reasons:",
  ];

  for (const message of failureMessages.slice(0, 3)) {
    lines.push(`  - ${message}`);
  }

  return lines;
}

export function collectFirstExpansionImportFailureMessages(
  results: readonly ExpansionImportMarketResult[],
  limit = 3,
): string[] {
  return results
    .filter((entry): entry is ExpansionImportMarketResult & { errorMessage: string } =>
      entry.status === "failed" && entry.errorMessage !== null,
    )
    .slice(0, limit)
    .map((entry) => `${entry.marketTicker}: ${entry.errorMessage}`);
}

export function isExpansionImportAbortGuardTriggered(input: {
  plannedQueueLength: number;
  importedCount: number;
  failedCount: number;
  execute: boolean;
}): boolean {
  return (
    input.execute
    && input.plannedQueueLength > 0
    && input.importedCount === 0
    && input.failedCount === input.plannedQueueLength
  );
}
