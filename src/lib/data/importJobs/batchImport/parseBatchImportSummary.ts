import { z } from "zod";

import {
  BatchImportFailureAnalysisError,
  BatchImportFailureAnalysisErrorCode,
} from "./batchImportFailureAnalysisTypes";
import type { BatchImportSummary } from "./batchImportTypes";

const batchImportMarketResultSchema = z.object({
  marketTicker: z.string().trim().min(1),
  configPath: z.string().trim().min(1),
  outputPath: z.string().trim().min(1),
  status: z.enum(["success", "failed", "skipped"]),
  errorMessage: z.string().nullable(),
  jobId: z.string().nullable(),
  bronzeRecordCount: z.number().finite().nullable(),
  valid: z.boolean().nullable(),
  retryCount: z.number().finite().int().nonnegative().nullable().optional(),
  requestDelayMs: z.number().finite().int().nonnegative().nullable().optional(),
  rateLimited: z.boolean().nullable().optional(),
});

const batchImportSummarySchema = z.object({
  inputDir: z.string().trim().min(1),
  outputDir: z.string().trim().min(1),
  concurrency: z.number().finite().int().nonnegative(),
  requestDelayMs: z.number().finite().int().nonnegative().optional(),
  maxRetries: z.number().finite().int().nonnegative().optional(),
  retryBaseDelayMs: z.number().finite().int().nonnegative().optional(),
  startedAt: z.string().trim().min(1),
  completedAt: z.string().trim().min(1),
  durationMs: z.number().finite().nonnegative(),
  totalConfigs: z.number().finite().int().nonnegative(),
  successfulImports: z.number().finite().int().nonnegative(),
  failedImports: z.number().finite().int().nonnegative(),
  skippedImports: z.number().finite().int().nonnegative(),
  retryCount: z.number().finite().int().nonnegative().optional(),
  recoveredImports: z.number().finite().int().nonnegative().optional(),
  failedAfterRetries: z.number().finite().int().nonnegative().optional(),
  failureReasonCounts: z.record(z.string(), z.number().finite().int().nonnegative()).optional(),
  summaryPath: z.string().trim().min(1),
  adaptiveThrottleEnabled: z.boolean().optional(),
  initialRequestDelayMs: z.number().finite().int().nonnegative().optional(),
  finalRequestDelayMs: z.number().finite().int().nonnegative().optional(),
  minRequestDelayMs: z.number().finite().int().nonnegative().nullable().optional(),
  maxRequestDelayMs: z.number().finite().int().nonnegative().nullable().optional(),
  throttleAdjustmentCount: z.number().finite().int().nonnegative().optional(),
  rateLimitCount: z.number().finite().int().nonnegative().optional(),
  averageRequestDelayMs: z.number().finite().int().nonnegative().optional(),
  markets: z.array(batchImportMarketResultSchema),
});

/** Parses and validates a batch-import-summary.json document. */
export function parseBatchImportSummaryJson(json: string): BatchImportSummary {
  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch {
    throw new BatchImportFailureAnalysisError(
      "batch-import-summary.json contains invalid JSON",
      BatchImportFailureAnalysisErrorCode.INVALID_JSON,
    );
  }

  const result = batchImportSummarySchema.safeParse(parsed);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new BatchImportFailureAnalysisError(
      issue?.message ?? "batch-import-summary.json failed validation",
      BatchImportFailureAnalysisErrorCode.INVALID_SCHEMA,
    );
  }

  return {
    ...result.data,
    requestDelayMs: result.data.requestDelayMs ?? 0,
    maxRetries: result.data.maxRetries ?? 0,
    retryBaseDelayMs: result.data.retryBaseDelayMs ?? 0,
    retryCount: result.data.retryCount ?? 0,
    recoveredImports: result.data.recoveredImports ?? 0,
    failedAfterRetries: result.data.failedAfterRetries ?? 0,
    failureReasonCounts: result.data.failureReasonCounts ?? {},
    adaptiveThrottleEnabled: result.data.adaptiveThrottleEnabled ?? false,
    initialRequestDelayMs:
      result.data.initialRequestDelayMs ?? result.data.requestDelayMs ?? 0,
    finalRequestDelayMs:
      result.data.finalRequestDelayMs ?? result.data.requestDelayMs ?? 0,
    minRequestDelayMs: result.data.minRequestDelayMs ?? null,
    maxRequestDelayMs: result.data.maxRequestDelayMs ?? null,
    throttleAdjustmentCount: result.data.throttleAdjustmentCount ?? 0,
    rateLimitCount: result.data.rateLimitCount ?? 0,
    averageRequestDelayMs:
      result.data.averageRequestDelayMs ?? result.data.requestDelayMs ?? 0,
    markets: result.data.markets.map((market) => ({
      ...market,
      retryCount: market.retryCount ?? null,
      requestDelayMs: market.requestDelayMs ?? null,
      rateLimited: market.rateLimited ?? null,
    })),
  };
}
