import type { ExpansionImportJobResult } from "@/lib/data/importJobs/expansionExecutor/expansionExecutorTypes";

import type {
  ExpansionImportCheckpointRunStatus,
  ExpansionImportSummaryRunStatus,
  HistoricalExpansionImportCheckpoint,
} from "./expansionImportSafetyTypes";

/** Derives terminal run status from checkpoint state and job results. */
export function finalizeExpansionImportRunStatus(input: {
  interrupted: boolean;
  checkpoint: HistoricalExpansionImportCheckpoint;
  jobs: readonly ExpansionImportJobResult[];
  maxRetries: number;
}): {
  checkpointRunStatus: ExpansionImportCheckpointRunStatus;
  summaryRunStatus: ExpansionImportSummaryRunStatus;
} {
  if (input.interrupted) {
    return {
      checkpointRunStatus: "interrupted",
      summaryRunStatus: "interrupted",
    };
  }

  const hasPendingRetries = input.checkpoint.jobs.some((job) =>
    job.failedMarkets.some((entry) => entry.retryCount < input.maxRetries),
  );
  const hasFailures = input.jobs.some((job) => job.failedCount > 0);

  if (hasPendingRetries || hasFailures) {
    return {
      checkpointRunStatus: "partial",
      summaryRunStatus: "partial",
    };
  }

  const hasRecordedFailures = input.checkpoint.jobs.some(
    (job) => job.failedMarkets.length > 0,
  );

  if (hasRecordedFailures) {
    return {
      checkpointRunStatus: "partial",
      summaryRunStatus: "partial",
    };
  }

  return {
    checkpointRunStatus: "completed",
    summaryRunStatus: "completed",
  };
}
