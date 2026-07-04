import type {
  ExpansionImportSafetyConfig,
  ExpansionMarketExecutionPlan,
  HistoricalExpansionImportCheckpoint,
} from "./expansionImportSafetyTypes";

function findJobCheckpoint(
  checkpoint: HistoricalExpansionImportCheckpoint,
  jobId: string,
) {
  return checkpoint.jobs.find((job) => job.jobId === jobId) ?? null;
}

/** Decides whether a discovered market should execute, skip, or retry. */
export function planExpansionMarketExecution(input: {
  safety: ExpansionImportSafetyConfig;
  checkpoint: HistoricalExpansionImportCheckpoint;
  jobId: string;
  marketTicker: string;
}): ExpansionMarketExecutionPlan {
  if (
    input.safety.forceMarket !== null
    && input.marketTicker !== input.safety.forceMarket
  ) {
    return {
      action: "skip",
      reason: `Not target of --force-market (${input.safety.forceMarket})`,
    };
  }

  const jobCheckpoint = findJobCheckpoint(input.checkpoint, input.jobId);
  if (!jobCheckpoint) {
    return { action: "execute" };
  }

  if (jobCheckpoint.completedMarkets.includes(input.marketTicker)) {
    return {
      action: "skip",
      reason: "Already completed in checkpoint",
    };
  }

  const failedEntry = jobCheckpoint.failedMarkets.find(
    (entry) => entry.marketTicker === input.marketTicker,
  );

  if (failedEntry) {
    if (input.safety.skipFailed) {
      return {
        action: "skip",
        reason: "Skipped failed market (--skip-failed)",
      };
    }

    if (failedEntry.retryCount >= input.safety.maxRetries) {
      return {
        action: "skip",
        reason: `Retry exhausted (${failedEntry.retryCount}/${input.safety.maxRetries})`,
      };
    }

    return {
      action: "retry",
      retryCount: failedEntry.retryCount + 1,
    };
  }

  if (
    input.safety.resume
    && jobCheckpoint.lastCompletedMarketTicker !== null
    && input.marketTicker.localeCompare(jobCheckpoint.lastCompletedMarketTicker) <= 0
  ) {
    return {
      action: "skip",
      reason: "Already completed before resume checkpoint",
    };
  }

  return { action: "execute" };
}
