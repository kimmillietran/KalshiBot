import {
  BatchImportRunnerError,
  BatchImportRunnerErrorCode,
} from "./batchImportTypes";

export const DEFAULT_ADAPTIVE_MIN_REQUEST_DELAY_MS = 100;
export const DEFAULT_ADAPTIVE_MAX_REQUEST_DELAY_MS = 3000;
export const DEFAULT_THROTTLE_INCREASE_FACTOR = 2;
export const DEFAULT_THROTTLE_DECREASE_MS = 50;

export type BatchImportAdaptiveThrottleOptions = {
  adaptiveThrottle?: boolean;
  minRequestDelayMs?: number;
  maxRequestDelayMs?: number;
  throttleIncreaseFactor?: number;
  throttleDecreaseMs?: number;
};

export type ResolvedBatchImportAdaptiveThrottleConfig = {
  enabled: boolean;
  minRequestDelayMs: number;
  maxRequestDelayMs: number;
  throttleIncreaseFactor: number;
  throttleDecreaseMs: number;
};

function parsePositiveInteger(
  value: number | undefined,
  label: string,
  code: BatchImportRunnerErrorCode,
  minimum = 0,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Number.isInteger(value) || value < minimum) {
    throw new BatchImportRunnerError(
      `${label} must be an integer >= ${minimum}`,
      code,
    );
  }

  return value;
}

function parseIncreaseFactor(value: number | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Number.isFinite(value) || value < 1) {
    throw new BatchImportRunnerError(
      "throttleIncreaseFactor must be a number >= 1",
      BatchImportRunnerErrorCode.INVALID_THROTTLE_INCREASE_FACTOR,
    );
  }

  return value;
}

export function parseBatchImportAdaptiveThrottleOptions(
  options: BatchImportAdaptiveThrottleOptions = {},
): ResolvedBatchImportAdaptiveThrottleConfig {
  const enabled = options.adaptiveThrottle ?? false;
  const minRequestDelayMs =
    parsePositiveInteger(
      options.minRequestDelayMs,
      "minRequestDelayMs",
      BatchImportRunnerErrorCode.INVALID_MIN_REQUEST_DELAY,
    ) ?? DEFAULT_ADAPTIVE_MIN_REQUEST_DELAY_MS;
  const maxRequestDelayMs =
    parsePositiveInteger(
      options.maxRequestDelayMs,
      "maxRequestDelayMs",
      BatchImportRunnerErrorCode.INVALID_MAX_REQUEST_DELAY,
    ) ?? DEFAULT_ADAPTIVE_MAX_REQUEST_DELAY_MS;
  const throttleIncreaseFactor =
    parseIncreaseFactor(options.throttleIncreaseFactor)
    ?? DEFAULT_THROTTLE_INCREASE_FACTOR;
  const throttleDecreaseMs =
    parsePositiveInteger(
      options.throttleDecreaseMs,
      "throttleDecreaseMs",
      BatchImportRunnerErrorCode.INVALID_THROTTLE_DECREASE_MS,
    ) ?? DEFAULT_THROTTLE_DECREASE_MS;

  if (minRequestDelayMs > maxRequestDelayMs) {
    throw new BatchImportRunnerError(
      "minRequestDelayMs cannot exceed maxRequestDelayMs",
      BatchImportRunnerErrorCode.INVALID_MIN_REQUEST_DELAY,
    );
  }

  if (!enabled) {
    return {
      enabled: false,
      minRequestDelayMs,
      maxRequestDelayMs,
      throttleIncreaseFactor,
      throttleDecreaseMs,
    };
  }

  return {
    enabled: true,
    minRequestDelayMs,
    maxRequestDelayMs,
    throttleIncreaseFactor,
    throttleDecreaseMs,
  };
}

export type AdaptiveThrottleMetrics = {
  initialRequestDelayMs: number;
  finalRequestDelayMs: number;
  throttleAdjustmentCount: number;
  rateLimitCount: number;
  averageRequestDelayMs: number;
};

export class AdaptiveThrottleController {
  currentDelayMs: number;
  readonly initialRequestDelayMs: number;
  private adjustmentCount = 0;
  private rateLimitCount = 0;
  private totalDelayMs = 0;
  private delaySamples = 0;

  constructor(private readonly config: ResolvedBatchImportAdaptiveThrottleConfig) {
    this.initialRequestDelayMs = config.minRequestDelayMs;
    this.currentDelayMs = config.minRequestDelayMs;
  }

  recordAppliedDelay(delayMs: number): void {
    if (!this.config.enabled || delayMs <= 0) {
      return;
    }

    this.totalDelayMs += delayMs;
    this.delaySamples += 1;
  }

  onSuccessWithoutRateLimit(): void {
    if (!this.config.enabled) {
      return;
    }

    const nextDelayMs = Math.max(
      this.config.minRequestDelayMs,
      this.currentDelayMs - this.config.throttleDecreaseMs,
    );

    if (nextDelayMs !== this.currentDelayMs) {
      this.currentDelayMs = nextDelayMs;
      this.adjustmentCount += 1;
    }
  }

  onRateLimit(): void {
    if (!this.config.enabled) {
      return;
    }

    this.rateLimitCount += 1;

    const increasedDelayMs = Math.min(
      this.config.maxRequestDelayMs,
      Math.max(
        this.currentDelayMs + 1,
        Math.ceil(this.currentDelayMs * this.config.throttleIncreaseFactor),
      ),
    );

    if (increasedDelayMs !== this.currentDelayMs) {
      this.currentDelayMs = increasedDelayMs;
      this.adjustmentCount += 1;
    }
  }

  getMetrics(): AdaptiveThrottleMetrics {
    const averageRequestDelayMs =
      this.delaySamples === 0
        ? this.initialRequestDelayMs
        : Math.round(this.totalDelayMs / this.delaySamples);

    return {
      initialRequestDelayMs: this.initialRequestDelayMs,
      finalRequestDelayMs: this.currentDelayMs,
      throttleAdjustmentCount: this.adjustmentCount,
      rateLimitCount: this.rateLimitCount,
      averageRequestDelayMs,
    };
  }
}

export function formatBatchImportProgressLine(input: {
  marketIndex: number;
  totalMarkets: number;
  marketTicker: string;
  status: "success" | "failed" | "skipped" | "rate-limited";
  delayMs: number;
  retries: number;
}): string {
  return `[import] market=${input.marketIndex}/${input.totalMarkets} ticker=${input.marketTicker} status=${input.status} delayMs=${input.delayMs} retries=${input.retries}`;
}
