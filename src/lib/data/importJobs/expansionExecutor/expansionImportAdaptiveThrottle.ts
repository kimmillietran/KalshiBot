export const DEFAULT_EXPANSION_ADAPTIVE_MIN_BACKOFF_MS = 500;
export const DEFAULT_EXPANSION_ADAPTIVE_MAX_BACKOFF_MS = 30_000;
export const DEFAULT_EXPANSION_BACKOFF_MULTIPLIER = 2;
export const DEFAULT_EXPANSION_SUCCESS_DECAY_AFTER = 3;
export const DEFAULT_EXPANSION_THROTTLE_DECREASE_MS = 250;

export type ExpansionImportAdaptiveThrottleOptions = {
  adaptiveThrottle?: boolean;
  minBackoffMs?: number;
  maxBackoffMs?: number;
  backoffMultiplier?: number;
  successDecayAfter?: number;
  throttleDecreaseMs?: number;
};

export type ResolvedExpansionImportAdaptiveThrottleConfig = {
  enabled: boolean;
  minBackoffMs: number;
  maxBackoffMs: number;
  backoffMultiplier: number;
  successDecayAfter: number;
  throttleDecreaseMs: number;
};

export type ExpansionImportAdaptiveThrottleDiagnostics = {
  adaptiveThrottleEnabled: boolean;
  minBackoffMs: number | null;
  maxBackoffMs: number | null;
  currentDelayMs: number | null;
  initialDelayMs: number | null;
  rateLimitEvents: number;
  avoidedRetriesEstimate: number | null;
  totalBackoffMs: number;
  throughputMarketsPerMinute: number | null;
  throttleAdjustmentCount: number;
};

function parsePositiveInteger(
  value: number | undefined,
  label: string,
  minimum = 0,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(`${label} must be an integer >= ${minimum}`);
  }

  return value;
}

function parseMultiplier(value: number | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Number.isFinite(value) || value < 1) {
    throw new Error("backoffMultiplier must be a number >= 1");
  }

  return value;
}

export function parseExpansionImportAdaptiveThrottleOptions(
  options: ExpansionImportAdaptiveThrottleOptions = {},
): ResolvedExpansionImportAdaptiveThrottleConfig {
  const enabled = options.adaptiveThrottle ?? false;
  const minBackoffMs =
    parsePositiveInteger(options.minBackoffMs, "minBackoffMs", 0)
    ?? DEFAULT_EXPANSION_ADAPTIVE_MIN_BACKOFF_MS;
  const maxBackoffMs =
    parsePositiveInteger(options.maxBackoffMs, "maxBackoffMs", 0)
    ?? DEFAULT_EXPANSION_ADAPTIVE_MAX_BACKOFF_MS;
  const backoffMultiplier =
    parseMultiplier(options.backoffMultiplier) ?? DEFAULT_EXPANSION_BACKOFF_MULTIPLIER;
  const successDecayAfter =
    parsePositiveInteger(options.successDecayAfter, "successDecayAfter", 1)
    ?? DEFAULT_EXPANSION_SUCCESS_DECAY_AFTER;
  const throttleDecreaseMs =
    parsePositiveInteger(options.throttleDecreaseMs, "throttleDecreaseMs", 1)
    ?? DEFAULT_EXPANSION_THROTTLE_DECREASE_MS;

  if (minBackoffMs > maxBackoffMs) {
    throw new Error("minBackoffMs cannot exceed maxBackoffMs");
  }

  return {
    enabled,
    minBackoffMs,
    maxBackoffMs,
    backoffMultiplier,
    successDecayAfter,
    throttleDecreaseMs,
  };
}

export class ExpansionAdaptiveThrottleController {
  currentDelayMs: number;
  readonly initialDelayMs: number;
  private adjustmentCount = 0;
  private rateLimitEvents = 0;
  private totalInterMarketBackoffMs = 0;
  private consecutiveCleanImports = 0;
  private avoidedRetriesEstimate = 0;
  private importedMarketCount = 0;

  constructor(private readonly config: ResolvedExpansionImportAdaptiveThrottleConfig) {
    this.initialDelayMs = config.minBackoffMs;
    this.currentDelayMs = config.minBackoffMs;
  }

  onRateLimit(retryAfterMs?: number): void {
    if (!this.config.enabled) {
      return;
    }

    this.rateLimitEvents += 1;
    this.consecutiveCleanImports = 0;

    const increasedDelayMs = Math.min(
      this.config.maxBackoffMs,
      Math.max(
        this.currentDelayMs + 1,
        Math.ceil(this.currentDelayMs * this.config.backoffMultiplier),
      ),
    );
    const nextDelayMs =
      retryAfterMs !== undefined
        ? Math.min(this.config.maxBackoffMs, Math.max(increasedDelayMs, retryAfterMs))
        : increasedDelayMs;

    if (nextDelayMs !== this.currentDelayMs) {
      this.currentDelayMs = nextDelayMs;
      this.adjustmentCount += 1;
    }
  }

  onSuccessfulImport(hadRateLimitRetry: boolean): void {
    if (!this.config.enabled || hadRateLimitRetry) {
      this.consecutiveCleanImports = 0;
      return;
    }

    this.importedMarketCount += 1;
    this.consecutiveCleanImports += 1;

    if (this.rateLimitEvents > 0) {
      this.avoidedRetriesEstimate += 1;
    }

    if (this.consecutiveCleanImports < this.config.successDecayAfter) {
      return;
    }

    const nextDelayMs = Math.max(
      this.config.minBackoffMs,
      this.currentDelayMs - this.config.throttleDecreaseMs,
    );

    if (nextDelayMs !== this.currentDelayMs) {
      this.currentDelayMs = nextDelayMs;
      this.adjustmentCount += 1;
    }

    this.consecutiveCleanImports = 0;
  }

  recordInterMarketBackoff(delayMs: number): void {
    if (!this.config.enabled || delayMs <= 0) {
      return;
    }

    this.totalInterMarketBackoffMs += delayMs;
  }

  buildDiagnostics(input: {
    durationMs: number;
    rateLimitRetryBackoffMs: number;
  }): ExpansionImportAdaptiveThrottleDiagnostics {
    if (!this.config.enabled) {
      return {
        adaptiveThrottleEnabled: false,
        minBackoffMs: null,
        maxBackoffMs: null,
        currentDelayMs: null,
        initialDelayMs: null,
        rateLimitEvents: 0,
        avoidedRetriesEstimate: null,
        totalBackoffMs: input.rateLimitRetryBackoffMs,
        throughputMarketsPerMinute: computeExpansionImportThroughput(
          this.importedMarketCount,
          input.durationMs,
        ),
        throttleAdjustmentCount: 0,
      };
    }

    return {
      adaptiveThrottleEnabled: true,
      minBackoffMs: this.config.minBackoffMs,
      maxBackoffMs: this.config.maxBackoffMs,
      currentDelayMs: this.currentDelayMs,
      initialDelayMs: this.initialDelayMs,
      rateLimitEvents: this.rateLimitEvents,
      avoidedRetriesEstimate: this.avoidedRetriesEstimate,
      totalBackoffMs: this.totalInterMarketBackoffMs + input.rateLimitRetryBackoffMs,
      throughputMarketsPerMinute: computeExpansionImportThroughput(
        this.importedMarketCount,
        input.durationMs,
      ),
      throttleAdjustmentCount: this.adjustmentCount,
    };
  }
}

export function computeExpansionImportThroughput(
  importedMarketCount: number,
  durationMs: number,
): number | null {
  if (importedMarketCount <= 0 || durationMs <= 0) {
    return null;
  }

  return Math.round((importedMarketCount / durationMs) * 60_000 * 100) / 100;
}
