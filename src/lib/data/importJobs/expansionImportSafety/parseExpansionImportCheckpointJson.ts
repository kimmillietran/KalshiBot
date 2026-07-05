import { z } from "zod";

import type { HistoricalExpansionImportCheckpoint } from "./expansionImportSafetyTypes";

const failedMarketSchema = z.object({
  marketTicker: z.string().trim().min(1),
  retryCount: z.number().finite().int().nonnegative(),
  lastErrorMessage: z.string().nullable(),
  lastAttemptAt: z.string().trim().min(1),
});

const jobCheckpointSchema = z.object({
  jobId: z.string().trim().min(1),
  lastCompletedMarketTicker: z.string().trim().min(1).nullable(),
  completedMarkets: z.array(z.string().trim().min(1)),
  unsupportedSkippedMarkets: z.array(z.string().trim().min(1)).optional(),
  failedMarkets: z.array(failedMarketSchema),
});

const checkpointSchema = z.object({
  generatedAt: z.string().trim().min(1),
  updatedAt: z.string().trim().min(1),
  inputPath: z.string().trim().min(1),
  checkpointPath: z.string().trim().min(1),
  resume: z.boolean(),
  runStatus: z.enum(["running", "completed", "partial", "interrupted"]),
  maxRetries: z.number().finite().int().nonnegative(),
  jobs: z.array(jobCheckpointSchema),
});

/** Parses and validates a historical expansion import checkpoint document. */
export function parseExpansionImportCheckpointJson(
  path: string,
  json: string,
): HistoricalExpansionImportCheckpoint {
  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error(`Invalid JSON in historical expansion import checkpoint: ${path}`);
  }

  const result = checkpointSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `Invalid historical expansion import checkpoint schema in ${path}: ${result.error.message}`,
    );
  }

  return {
    ...result.data,
    jobs: result.data.jobs.map((job) => ({
      ...job,
      unsupportedSkippedMarkets: job.unsupportedSkippedMarkets ?? [],
    })),
  } as HistoricalExpansionImportCheckpoint;
}
