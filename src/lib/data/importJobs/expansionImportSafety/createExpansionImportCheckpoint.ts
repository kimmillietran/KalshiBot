import type {
  ExpansionImportJobCheckpoint,
  HistoricalExpansionImportCheckpoint,
} from "./expansionImportSafetyTypes";
import { parseExpansionImportCheckpointJson } from "./parseExpansionImportCheckpointJson";

function createEmptyJobCheckpoint(jobId: string): ExpansionImportJobCheckpoint {
  return {
    jobId,
    lastCompletedMarketTicker: null,
    completedMarkets: [],
    failedMarkets: [],
  };
}

function mergeJobCheckpoints(
  jobIds: readonly string[],
  existingJobs: readonly ExpansionImportJobCheckpoint[],
): ExpansionImportJobCheckpoint[] {
  const byJobId = new Map(existingJobs.map((job) => [job.jobId, job]));

  return jobIds.map((jobId) => byJobId.get(jobId) ?? createEmptyJobCheckpoint(jobId));
}

/** Initializes checkpoint state for a fresh or resumed expansion import run. */
export function initializeExpansionImportCheckpoint(input: {
  generatedAt: string;
  inputPath: string;
  checkpointPath: string;
  resume: boolean;
  maxRetries: number;
  jobIds: readonly string[];
  existingCheckpointJson: string | null;
}): HistoricalExpansionImportCheckpoint {
  if (input.existingCheckpointJson) {
    const existing = parseExpansionImportCheckpointJson(
      input.checkpointPath,
      input.existingCheckpointJson,
    );

    if (existing.inputPath !== input.inputPath) {
      throw new Error(
        `Checkpoint input path mismatch: expected ${input.inputPath}, found ${existing.inputPath}`,
      );
    }

    const jobs = mergeJobCheckpoints(input.jobIds, existing.jobs).map((job) => ({
      ...job,
      failedMarkets: input.resume ? job.failedMarkets : [],
    }));

    return {
      ...existing,
      updatedAt: input.generatedAt,
      checkpointPath: input.checkpointPath,
      resume: input.resume,
      runStatus: "running",
      maxRetries: input.maxRetries,
      jobs,
    };
  }

  return {
    generatedAt: input.generatedAt,
    updatedAt: input.generatedAt,
    inputPath: input.inputPath,
    checkpointPath: input.checkpointPath,
    resume: input.resume,
    runStatus: "running",
    maxRetries: input.maxRetries,
    jobs: input.jobIds.map(createEmptyJobCheckpoint),
  };
}
