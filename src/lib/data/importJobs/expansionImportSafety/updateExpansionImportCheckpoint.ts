import type { ExpansionImportMarketResult } from "@/lib/data/importJobs/expansionExecutor/expansionExecutorTypes";
import { isUnsupportedHistoricalMarketSkipReason } from "@/lib/data/importJobs/expansionExecutor/classifyUnsupportedHistoricalMarket";

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
  const failedMarkets = job.failedMarkets.filter(
    (entry) => entry.marketTicker !== market.marketTicker,
  );

  if (market.status === "imported" || market.status === "planned") {
    completedMarkets.add(market.marketTicker);

    return {
      ...job,
      lastCompletedMarketTicker: market.marketTicker,
      completedMarkets: [...completedMarkets].sort(),
      failedMarkets,
    };
  }

  if (
    market.status === "skipped"
    && (
      market.skipReason?.includes("already present")
      || isUnsupportedHistoricalMarketSkipReason(market.skipReason)
    )
  ) {
    completedMarkets.add(market.marketTicker);

    return {
      ...job,
      lastCompletedMarketTicker: market.marketTicker,
      completedMarkets: [...completedMarkets].sort(),
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

  return job;
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
