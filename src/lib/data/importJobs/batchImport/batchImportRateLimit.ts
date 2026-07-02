import {
  extractRetryAfterMs,
  isKalshiRateLimitError,
  sleepMs,
} from "@/lib/data/discovery/discoveryRateLimit";

import {
  BatchImportRunnerError,
  BatchImportRunnerErrorCode,
} from "./batchImportTypes";

export const DEFAULT_BATCH_IMPORT_REQUEST_DELAY_MS = 0;
export const DEFAULT_BATCH_IMPORT_MAX_RETRIES = 0;
export const DEFAULT_BATCH_IMPORT_RETRY_BASE_DELAY_MS = 2000;

export type BatchImportRateLimitOptions = {
  requestDelayMs?: number;
  maxRetries?: number;
  retryBaseDelayMs?: number;
};

export type ResolvedBatchImportRateLimitConfig = {
  requestDelayMs: number;
  maxRetries: number;
  retryBaseDelayMs: number;
};

export function parseBatchImportRateLimitOptions(
  options: BatchImportRateLimitOptions = {},
): ResolvedBatchImportRateLimitConfig {
  if (options.requestDelayMs !== undefined) {
    if (!Number.isInteger(options.requestDelayMs) || options.requestDelayMs < 0) {
      throw new BatchImportRunnerError(
        "requestDelayMs must be a non-negative integer",
        BatchImportRunnerErrorCode.INVALID_REQUEST_DELAY,
      );
    }
  }

  if (options.maxRetries !== undefined) {
    if (!Number.isInteger(options.maxRetries) || options.maxRetries < 0) {
      throw new BatchImportRunnerError(
        "maxRetries must be a non-negative integer",
        BatchImportRunnerErrorCode.INVALID_MAX_RETRIES,
      );
    }
  }

  if (options.retryBaseDelayMs !== undefined) {
    if (!Number.isInteger(options.retryBaseDelayMs) || options.retryBaseDelayMs < 0) {
      throw new BatchImportRunnerError(
        "retryBaseDelayMs must be a non-negative integer",
        BatchImportRunnerErrorCode.INVALID_RETRY_BASE_DELAY,
      );
    }
  }

  return {
    requestDelayMs: options.requestDelayMs ?? DEFAULT_BATCH_IMPORT_REQUEST_DELAY_MS,
    maxRetries: options.maxRetries ?? DEFAULT_BATCH_IMPORT_MAX_RETRIES,
    retryBaseDelayMs:
      options.retryBaseDelayMs ?? DEFAULT_BATCH_IMPORT_RETRY_BASE_DELAY_MS,
  };
}

export function computeBatchImportRetryDelayMs(input: {
  attempt: number;
  retryBaseDelayMs: number;
  retryAfterMs?: number;
}): number {
  if (input.retryAfterMs !== undefined) {
    return input.retryAfterMs;
  }

  return input.retryBaseDelayMs * (input.attempt + 1);
}

export function isBatchImportRecoverableError(error: unknown): boolean {
  return isKalshiRateLimitError(error);
}

export type RunImportWithRateLimitRetryInput = {
  runImport: () => Promise<unknown>;
  rateLimit: ResolvedBatchImportRateLimitConfig;
  sleep?: (ms: number) => Promise<void>;
  onRateLimited?: () => void;
};

export type RunImportWithRateLimitRetryResult = {
  result: unknown;
  retryCount: number;
  rateLimited: boolean;
};

export class BatchImportRetryExhaustedError extends Error {
  readonly retryCount: number;
  readonly causeError: unknown;

  constructor(message: string, retryCount: number, causeError: unknown) {
    super(message);
    this.name = "BatchImportRetryExhaustedError";
    this.retryCount = retryCount;
    this.causeError = causeError;
  }
}

export async function runImportWithRateLimitRetry(
  input: RunImportWithRateLimitRetryInput,
): Promise<RunImportWithRateLimitRetryResult> {
  let retryCount = 0;
  let attempt = 0;
  let rateLimited = false;

  while (true) {
    try {
      const result = await input.runImport();
      return { result, retryCount, rateLimited };
    } catch (error) {
      if (!isBatchImportRecoverableError(error) || attempt >= input.rateLimit.maxRetries) {
        const message =
          error instanceof Error ? error.message : "Batch import failed after retries";
        throw new BatchImportRetryExhaustedError(message, retryCount, error);
      }

      rateLimited = true;
      input.onRateLimited?.();

      const delayMs = computeBatchImportRetryDelayMs({
        attempt,
        retryBaseDelayMs: input.rateLimit.retryBaseDelayMs,
        retryAfterMs: extractRetryAfterMs(error),
      });

      await sleepMs(delayMs, input.sleep);
      retryCount += 1;
      attempt += 1;
    }
  }
}
