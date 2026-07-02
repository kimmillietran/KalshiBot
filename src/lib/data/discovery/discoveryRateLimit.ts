import { KalshiHistoricalImporterError } from "@/lib/data/importers/kalshi/KalshiHistoricalImporter";

import { MarketDiscoveryError } from "./discoveryTypes";

export const DEFAULT_DISCOVERY_REQUEST_DELAY_MS = 250;
export const DEFAULT_DISCOVERY_MAX_RETRIES = 5;
export const DEFAULT_DISCOVERY_RETRY_BASE_DELAY_MS = 1000;

export type MarketDiscoveryRateLimitOptions = {
  requestDelayMs?: number;
  maxRetries?: number;
  retryBaseDelayMs?: number;
};

export type ResolvedMarketDiscoveryRateLimitConfig = {
  requestDelayMs: number;
  maxRetries: number;
  retryBaseDelayMs: number;
  use429FallbackRetries: boolean;
};

export type MarketDiscoveryRateLimitLogger = (message: string) => void;

export function hasMarketDiscoveryRateLimitOptions(
  options: MarketDiscoveryRateLimitOptions = {},
): boolean {
  return (
    options.requestDelayMs !== undefined
    || options.maxRetries !== undefined
    || options.retryBaseDelayMs !== undefined
  );
}

export function parseMarketDiscoveryRateLimitOptions(
  options: MarketDiscoveryRateLimitOptions = {},
): ResolvedMarketDiscoveryRateLimitConfig {
  if (options.requestDelayMs !== undefined) {
    if (!Number.isInteger(options.requestDelayMs) || options.requestDelayMs < 0) {
      throw new MarketDiscoveryError(
        "requestDelayMs must be a non-negative integer",
        "invalid-rate-limit-request-delay",
      );
    }
  }

  if (options.maxRetries !== undefined) {
    if (!Number.isInteger(options.maxRetries) || options.maxRetries < 0) {
      throw new MarketDiscoveryError(
        "maxRetries must be a non-negative integer",
        "invalid-rate-limit-max-retries",
      );
    }
  }

  if (options.retryBaseDelayMs !== undefined) {
    if (!Number.isInteger(options.retryBaseDelayMs) || options.retryBaseDelayMs < 0) {
      throw new MarketDiscoveryError(
        "retryBaseDelayMs must be a non-negative integer",
        "invalid-rate-limit-retry-base-delay",
      );
    }
  }

  const explicit = hasMarketDiscoveryRateLimitOptions(options);

  return {
    requestDelayMs:
      options.requestDelayMs ?? (explicit ? DEFAULT_DISCOVERY_REQUEST_DELAY_MS : 0),
    maxRetries: options.maxRetries ?? (explicit ? DEFAULT_DISCOVERY_MAX_RETRIES : 0),
    retryBaseDelayMs:
      options.retryBaseDelayMs ?? DEFAULT_DISCOVERY_RETRY_BASE_DELAY_MS,
    use429FallbackRetries: !explicit,
  };
}

export function parseRetryAfterHeader(
  value: string | undefined | null,
): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const seconds = Number(trimmed);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.ceil(seconds * 1000);
  }

  const parsedDateMs = Date.parse(trimmed);
  if (Number.isFinite(parsedDateMs)) {
    return Math.max(0, parsedDateMs - Date.now());
  }

  return undefined;
}

export function computeDiscoveryRetryDelayMs(input: {
  attempt: number;
  retryBaseDelayMs: number;
  retryAfterMs?: number;
}): number {
  if (input.retryAfterMs !== undefined) {
    return input.retryAfterMs;
  }

  return input.retryBaseDelayMs * (input.attempt + 1);
}

export function isKalshiRateLimitError(error: unknown): error is KalshiHistoricalImporterError {
  return error instanceof KalshiHistoricalImporterError && error.status === 429;
}

export function extractRetryAfterMs(error: unknown): number | undefined {
  if (error instanceof KalshiHistoricalImporterError && error.retryAfterMs !== undefined) {
    return error.retryAfterMs;
  }

  return undefined;
}

export async function sleepMs(
  delayMs: number,
  sleep: (ms: number) => Promise<void> = defaultSleep,
): Promise<void> {
  if (delayMs <= 0) {
    return;
  }

  await sleep(delayMs);
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export type FetchDiscoveryPageWithRetryInput<T> = {
  fetchPage: () => Promise<T>;
  rateLimit: ResolvedMarketDiscoveryRateLimitConfig;
  logWarning?: MarketDiscoveryRateLimitLogger;
  sleep?: (ms: number) => Promise<void>;
};

export async function fetchDiscoveryPageWithRetry<T>(
  input: FetchDiscoveryPageWithRetryInput<T>,
): Promise<T> {
  let maxRetries = input.rateLimit.maxRetries;
  let attempt = 0;

  while (true) {
    try {
      return await input.fetchPage();
    } catch (error) {
      if (!isKalshiRateLimitError(error)) {
        throw error;
      }

      if (input.rateLimit.use429FallbackRetries && maxRetries === 0) {
        maxRetries = DEFAULT_DISCOVERY_MAX_RETRIES;
      }

      if (attempt >= maxRetries) {
        throw new MarketDiscoveryError(
          `Kalshi historical API rate limit (429) persisted after ${maxRetries} retries`,
          "rate-limit-exhausted",
        );
      }

      const delayMs = computeDiscoveryRetryDelayMs({
        attempt,
        retryBaseDelayMs: input.rateLimit.retryBaseDelayMs,
        retryAfterMs: extractRetryAfterMs(error),
      });

      input.logWarning?.(
        `Kalshi discovery rate limited (429); retrying in ${delayMs}ms `
          + `(attempt ${attempt + 1}/${maxRetries})`,
      );

      await sleepMs(delayMs, input.sleep);
      attempt += 1;
    }
  }
}
