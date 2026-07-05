import {
  extractRetryAfterMs,
  isKalshiRateLimitError,
  sleepMs,
} from "@/lib/data/discovery/discoveryRateLimit";

import { classifyExpansionImportFailure } from "./expansionImportCircuitBreaker";

export const DEFAULT_EXPANSION_RATE_LIMIT_BACKOFF_MS = 5000;
export const DEFAULT_EXPANSION_MAX_RATE_LIMIT_RETRIES = 3;
export const EXPANSION_RATE_LIMIT_CASCADE_ABORT_THRESHOLD = 5;

export type ExpansionImportRateLimitConfig = {
  rateLimitBackoffMs: number;
  maxRateLimitRetries: number;
};

export type ExpansionImportRateLimitDiagnostics = {
  rateLimitedCount: number;
  backoffDurationMs: number;
  retryCount: number;
  firstRateLimitedTicker: string | null;
  recommendedNextAction: string;
};

export type ExpansionImportRateLimitState = {
  rateLimitedCount: number;
  backoffDurationMs: number;
  retryCount: number;
  firstRateLimitedTicker: string | null;
  consecutivePostRetryRateLimitFailures: number;
};

export function createExpansionImportRateLimitState(): ExpansionImportRateLimitState {
  return {
    rateLimitedCount: 0,
    backoffDurationMs: 0,
    retryCount: 0,
    firstRateLimitedTicker: null,
    consecutivePostRetryRateLimitFailures: 0,
  };
}

export function parseExpansionImportRateLimitConfig(input: {
  rateLimitBackoffMs?: number | null;
  maxRateLimitRetries?: number | null;
}): ExpansionImportRateLimitConfig {
  const rateLimitBackoffMs =
    input.rateLimitBackoffMs ?? DEFAULT_EXPANSION_RATE_LIMIT_BACKOFF_MS;
  const maxRateLimitRetries =
    input.maxRateLimitRetries ?? DEFAULT_EXPANSION_MAX_RATE_LIMIT_RETRIES;

  if (!Number.isInteger(rateLimitBackoffMs) || rateLimitBackoffMs < 0) {
    throw new Error("rateLimitBackoffMs must be a non-negative integer");
  }

  if (!Number.isInteger(maxRateLimitRetries) || maxRateLimitRetries < 0) {
    throw new Error("maxRateLimitRetries must be a non-negative integer");
  }

  return {
    rateLimitBackoffMs,
    maxRateLimitRetries,
  };
}

export function isExpansionImportRateLimitError(error: unknown): boolean {
  if (isKalshiRateLimitError(error)) {
    return true;
  }

  if (error instanceof Error) {
    return classifyExpansionImportFailure(error.message) === "rate-limit";
  }

  return false;
}

export function isExpansionImportRateLimitMessage(errorMessage: string | null): boolean {
  if (!errorMessage) {
    return false;
  }

  return classifyExpansionImportFailure(errorMessage) === "rate-limit";
}

export function computeExpansionRateLimitDelayMs(input: {
  attempt: number;
  rateLimitBackoffMs: number;
  retryAfterMs?: number;
}): number {
  if (input.retryAfterMs !== undefined) {
    return input.retryAfterMs;
  }

  return input.rateLimitBackoffMs * (input.attempt + 1);
}

export function buildExpansionRateLimitRecommendedNextAction(
  state: Pick<
    ExpansionImportRateLimitState,
    "rateLimitedCount" | "firstRateLimitedTicker" | "consecutivePostRetryRateLimitFailures"
  >,
): string {
  if (
    state.rateLimitedCount === 0
    && state.consecutivePostRetryRateLimitFailures === 0
  ) {
    return "No rate-limit backoff was required during this run.";
  }

  const parts = [
    "Kalshi returned HTTP 429 rate limits during expansion import.",
    state.firstRateLimitedTicker
      ? `First affected ticker: ${state.firstRateLimitedTicker}.`
      : null,
    "Wait for rate limits to clear, increase --rate-limit-backoff-ms if needed, then retry with --resume.",
  ];

  return parts.filter((part): part is string => part !== null).join(" ");
}

export function buildExpansionRateLimitDiagnostics(
  state: ExpansionImportRateLimitState,
): ExpansionImportRateLimitDiagnostics {
  return {
    rateLimitedCount: state.rateLimitedCount,
    backoffDurationMs: state.backoffDurationMs,
    retryCount: state.retryCount,
    firstRateLimitedTicker: state.firstRateLimitedTicker,
    recommendedNextAction: buildExpansionRateLimitRecommendedNextAction(state),
  };
}

export type RunExpansionImportWithRateLimitRetryInput<T> = {
  runImport: () => Promise<T>;
  marketTicker: string;
  rateLimit: ExpansionImportRateLimitConfig;
  state: ExpansionImportRateLimitState;
  sleep?: (ms: number) => Promise<void>;
  onRateLimited?: (input: {
    attempt: number;
    delayMs: number;
    retryAfterMs?: number;
  }) => void;
};

export type RunExpansionImportWithRateLimitRetryResult<T> = {
  value: T;
  rateLimited: boolean;
  retryCount: number;
};

export async function runExpansionImportWithRateLimitRetry<T>(
  input: RunExpansionImportWithRateLimitRetryInput<T>,
): Promise<RunExpansionImportWithRateLimitRetryResult<T>> {
  let attempt = 0;
  let retryCount = 0;

  while (true) {
    try {
      const value = await input.runImport();
      return {
        value,
        rateLimited: retryCount > 0,
        retryCount,
      };
    } catch (error) {
      if (
        !isExpansionImportRateLimitError(error)
        || attempt >= input.rateLimit.maxRateLimitRetries
      ) {
        throw error;
      }

      input.state.rateLimitedCount += 1;
      if (!input.state.firstRateLimitedTicker) {
        input.state.firstRateLimitedTicker = input.marketTicker;
      }

      const retryAfterMs = extractRetryAfterMs(error);
      const delayMs = computeExpansionRateLimitDelayMs({
        attempt,
        rateLimitBackoffMs: input.rateLimit.rateLimitBackoffMs,
        retryAfterMs,
      });

      input.state.backoffDurationMs += delayMs;
      input.state.retryCount += 1;
      retryCount += 1;

      input.onRateLimited?.({
        attempt,
        delayMs,
        retryAfterMs,
      });

      await sleepMs(delayMs, input.sleep);
      attempt += 1;
    }
  }
}

export function recordExpansionPostRetryRateLimitFailure(
  state: ExpansionImportRateLimitState,
): void {
  state.consecutivePostRetryRateLimitFailures += 1;
}

export function resetExpansionRateLimitSuccessStreak(
  state: ExpansionImportRateLimitState,
): void {
  state.consecutivePostRetryRateLimitFailures = 0;
}

export function evaluateExpansionRateLimitCascadeAbort(
  state: ExpansionImportRateLimitState,
  options?: { threshold?: number },
): ExpansionImportRateLimitDiagnostics | null {
  const threshold = options?.threshold ?? EXPANSION_RATE_LIMIT_CASCADE_ABORT_THRESHOLD;

  if (state.consecutivePostRetryRateLimitFailures < threshold) {
    return null;
  }

  return buildExpansionRateLimitDiagnostics(state);
}

export function formatExpansionRateLimitAbortWarning(
  diagnostics: ExpansionImportRateLimitDiagnostics,
  threshold: number,
): string {
  const parts = [
    `Expansion import aborted after ${threshold} consecutive rate-limited market failures (HTTP 429).`,
    diagnostics.firstRateLimitedTicker
      ? `First rate-limited ticker: ${diagnostics.firstRateLimitedTicker}.`
      : null,
    `Total backoff waited: ${diagnostics.backoffDurationMs}ms across ${diagnostics.retryCount} retries.`,
    diagnostics.recommendedNextAction,
  ];

  return parts.filter((part): part is string => part !== null).join(" ");
}
