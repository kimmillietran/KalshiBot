import type { ExpansionImportMarketResult } from "@/lib/data/importJobs/expansionExecutor/expansionExecutorTypes";

import { isTerminalUnsupportedSkipReason } from "./expansionImportResumeSemantics";
import type {
  ExpansionImportJobCheckpoint,
  HistoricalExpansionImportCheckpoint,
} from "./expansionImportSafetyTypes";

function updateJobCheckpoint(
  job: ExpansionImportJobCheckpoint,
  market: ExpansionImportMarketResult,
  updatedAt: string,
): ExpansionImportJobCheckpoint {
  const completedMarkets = new Set(job.completedMarkets);
  const unsupportedSkippedMarkets = new Set(job.unsupportedSkippedMarkets);
  const failedMarkets = job.failedMarkets.filter(
    (entry) => entry.marketTicker !== market.marketTicker,
  );

  if (market.status === "imported") {
    completedMarkets.add(market.marketTicker);
    unsupportedSkippedMarkets.delete(market.marketTicker);

    return {
      ...job,
      lastCompletedMarketTicker: market.marketTicker,
      completedMarkets: [...completedMarkets].sort(),
      unsupportedSkippedMarkets: [...unsupportedSkippedMarkets].sort(),
      failedMarkets,
    };
  }

  if (
    market.status === "skipped"
    && market.skipReason?.includes("already present")
  ) {
    completedMarkets.add(market.marketTicker);

    return {
      ...job,
      lastCompletedMarketTicker: market.marketTicker,
      completedMarkets: [...completedMarkets].sort(),
      unsupportedSkippedMarkets: [...unsupportedSkippedMarkets].sort(),
      failedMarkets,
    };
  }

  if (
    market.status === "skipped"
    && isTerminalUnsupportedSkipReason(market.skipReason)
  ) {
    unsupportedSkippedMarkets.add(market.marketTicker);
    completedMarkets.delete(market.marketTicker);

    return {
      ...job,
      completedMarkets: [...completedMarkets].sort(),
      unsupportedSkippedMarkets: [...unsupportedSkippedMarkets].sort(),
      failedMarkets,
    };
  }

  if (market.status === "failed") {
    const existing = job.failedMarkets.find(
      (entry) => entry.marketTicker === market.marketTicker,
    );
    const retryCount = (existing?.retryCount ?? 0) + 1;

    return {
      ...job,
      completedMarkets: [...completedMarkets].sort(),
      unsupportedSkippedMarkets: [...unsupportedSkippedMarkets].sort(),
      failedMarkets: [
        ...failedMarkets,
        {
          marketTicker: market.marketTicker,
          retryCount,
          lastErrorMessage: market.errorMessage,
          lastAttemptAt: updatedAt,
        },
      ].sort((left, right) => left.marketTicker.localeCompare(right.marketTicker)),
    };
  }

  return {
    ...job,
    completedMarkets: [...completedMarkets].sort(),
    unsupportedSkippedMarkets: [...unsupportedSkippedMarkets].sort(),
    failedMarkets,
  };
}

/** Applies a market result to the in-memory checkpoint. */
export function updateExpansionImportCheckpoint(
  checkpoint: HistoricalExpansionImportCheckpoint,
  jobId: string,
  market: ExpansionImportMarketResult,
  updatedAt: string,
): HistoricalExpansionImportCheckpoint {
  return {
    ...checkpoint,
    updatedAt,
    jobs: checkpoint.jobs.map((job) =>
      job.jobId === jobId ? updateJobCheckpoint(job, market, updatedAt) : job,
    ),
  };
}
