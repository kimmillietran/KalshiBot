/** Relative polling urgency for a market ticker. */
export type MarketPollPriority = "critical" | "high" | "normal" | "low";

export type PollingRateGovernorConfig = {
  /** Shortest allowed poll interval in milliseconds. */
  minIntervalMs: number;
  /** Longest allowed poll interval in milliseconds. */
  maxIntervalMs: number;
  /** Maximum request tokens allowed within `tokenBudgetWindowMs`. */
  tokenBudget: number;
  /** Sliding window for token budget accounting in milliseconds. */
  tokenBudgetWindowMs: number;
  /** Token cost charged per poll attempt. Defaults to 1. */
  tokensPerPoll?: number;
  /** Multiplier applied per consecutive HTTP 429 response. Defaults to 2. */
  backoffMultiplier?: number;
  /** Maximum exponent applied to `backoffMultiplier`. Defaults to 5. */
  maxBackoffExponent?: number;
  /** Fractional jitter applied to intervals (0–1). Defaults to 0.1 (±10%). */
  jitterFraction?: number;
  /** Quote age threshold before a market is considered stale. */
  staleQuoteThresholdMs: number;
};

export type MarketPollState = {
  marketId: string;
  priority: MarketPollPriority;
  lastPolledAtMs: number | null;
  lastSuccessAtMs: number | null;
  lastQuoteObservedAtMs: number | null;
  consecutive429Count: number;
  tokenWindowStartMs: number;
  tokensConsumedInWindow: number;
  nextPollDueAtMs: number | null;
};

export type PollThrottleReason =
  | "ready"
  | "scheduled-wait"
  | "token-budget-exhausted";

export type PollReadiness = {
  allowed: boolean;
  reason: PollThrottleReason;
  retryAfterMs: number | null;
};

export type PollIntervalDecision = {
  baseIntervalMs: number;
  intervalMs: number;
  backoffActive: boolean;
  throttledByBudget: boolean;
  priority: MarketPollPriority;
};

export type StaleQuoteStatus = {
  isStale: boolean;
  ageMs: number | null;
  thresholdMs: number;
};

export type JitterSample = number;
