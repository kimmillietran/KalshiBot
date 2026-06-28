import { PollingRateGovernorConfigError } from "./errors";
import { intervalMsForPriority, MARKET_POLL_PRIORITY_WEIGHT } from "./priority";
import type {
  JitterSample,
  MarketPollPriority,
  MarketPollState,
  PollIntervalDecision,
  PollReadiness,
  PollingRateGovernorConfig,
  StaleQuoteStatus,
} from "./types";

export const DEFAULT_POLLING_RATE_GOVERNOR_CONFIG: PollingRateGovernorConfig = {
  minIntervalMs: 5_000,
  maxIntervalMs: 30_000,
  tokenBudget: 60,
  tokenBudgetWindowMs: 60_000,
  tokensPerPoll: 1,
  backoffMultiplier: 2,
  maxBackoffExponent: 5,
  jitterFraction: 0.1,
  staleQuoteThresholdMs: 30_000,
};

type ResolvedPollingRateGovernorConfig = Required<PollingRateGovernorConfig>;

function resolveConfig(
  config: PollingRateGovernorConfig,
): ResolvedPollingRateGovernorConfig {
  validateConfig(config);

  return {
    minIntervalMs: config.minIntervalMs,
    maxIntervalMs: config.maxIntervalMs,
    tokenBudget: config.tokenBudget,
    tokenBudgetWindowMs: config.tokenBudgetWindowMs,
    tokensPerPoll: config.tokensPerPoll ?? 1,
    backoffMultiplier: config.backoffMultiplier ?? 2,
    maxBackoffExponent: config.maxBackoffExponent ?? 5,
    jitterFraction: config.jitterFraction ?? 0.1,
    staleQuoteThresholdMs: config.staleQuoteThresholdMs,
  };
}

export function validatePollingRateGovernorConfig(
  config: PollingRateGovernorConfig,
): void {
  validateConfig(config);
}

function validateConfig(config: PollingRateGovernorConfig): void {
  if (config.minIntervalMs <= 0) {
    throw new PollingRateGovernorConfigError("minIntervalMs must be positive");
  }
  if (config.maxIntervalMs <= 0) {
    throw new PollingRateGovernorConfigError("maxIntervalMs must be positive");
  }
  if (config.minIntervalMs > config.maxIntervalMs) {
    throw new PollingRateGovernorConfigError(
      "minIntervalMs must be less than or equal to maxIntervalMs",
    );
  }
  if (config.tokenBudget <= 0) {
    throw new PollingRateGovernorConfigError("tokenBudget must be positive");
  }
  if (config.tokenBudgetWindowMs <= 0) {
    throw new PollingRateGovernorConfigError(
      "tokenBudgetWindowMs must be positive",
    );
  }
  if (config.staleQuoteThresholdMs <= 0) {
    throw new PollingRateGovernorConfigError(
      "staleQuoteThresholdMs must be positive",
    );
  }

  const jitterFraction = config.jitterFraction ?? 0.1;
  if (jitterFraction < 0 || jitterFraction > 1) {
    throw new PollingRateGovernorConfigError(
      "jitterFraction must be between 0 and 1",
    );
  }

  const tokensPerPoll = config.tokensPerPoll ?? 1;
  if (tokensPerPoll <= 0) {
    throw new PollingRateGovernorConfigError("tokensPerPoll must be positive");
  }

  const backoffMultiplier = config.backoffMultiplier ?? 2;
  if (backoffMultiplier < 1) {
    throw new PollingRateGovernorConfigError(
      "backoffMultiplier must be greater than or equal to 1",
    );
  }

  const maxBackoffExponent = config.maxBackoffExponent ?? 5;
  if (maxBackoffExponent < 0) {
    throw new PollingRateGovernorConfigError(
      "maxBackoffExponent must be greater than or equal to 0",
    );
  }
}

function clampInterval(
  intervalMs: number,
  config: ResolvedPollingRateGovernorConfig,
): number {
  const maxBackoffInterval = Math.round(
    config.maxIntervalMs *
      config.backoffMultiplier ** config.maxBackoffExponent,
  );
  const upperBound = Math.max(config.maxIntervalMs, maxBackoffInterval);

  return Math.min(Math.max(intervalMs, config.minIntervalMs), upperBound);
}

export function applyPollIntervalJitter(
  intervalMs: number,
  jitterFraction: number,
  jitterSample: JitterSample,
): number {
  const clampedSample = Math.min(Math.max(jitterSample, 0), 1);
  const factor = 1 - jitterFraction + clampedSample * (2 * jitterFraction);
  return Math.round(intervalMs * factor);
}

function resetTokenWindowIfExpired(
  state: MarketPollState,
  config: ResolvedPollingRateGovernorConfig,
  nowMs: number,
): MarketPollState {
  if (nowMs - state.tokenWindowStartMs < config.tokenBudgetWindowMs) {
    return state;
  }

  return {
    ...state,
    tokenWindowStartMs: nowMs,
    tokensConsumedInWindow: 0,
  };
}

function hasTokenBudget(
  state: MarketPollState,
  config: ResolvedPollingRateGovernorConfig,
): boolean {
  return state.tokensConsumedInWindow + config.tokensPerPoll <= config.tokenBudget;
}

function consumeTokens(
  state: MarketPollState,
  config: ResolvedPollingRateGovernorConfig,
): MarketPollState {
  return {
    ...state,
    tokensConsumedInWindow: state.tokensConsumedInWindow + config.tokensPerPoll,
  };
}

/** Adaptive REST polling governor with budget, backoff, jitter, and stale detection. */
export class PollingRateGovernor {
  private readonly config: ResolvedPollingRateGovernorConfig;

  constructor(config: PollingRateGovernorConfig = DEFAULT_POLLING_RATE_GOVERNOR_CONFIG) {
    this.config = resolveConfig(config);
  }

  createMarketState(
    marketId: string,
    priority: MarketPollPriority,
    nowMs: number,
  ): MarketPollState {
    return {
      marketId,
      priority,
      lastPolledAtMs: null,
      lastSuccessAtMs: null,
      lastQuoteObservedAtMs: null,
      consecutive429Count: 0,
      tokenWindowStartMs: nowMs,
      tokensConsumedInWindow: 0,
      nextPollDueAtMs: nowMs,
    };
  }

  computeIntervalDecision(
    state: MarketPollState,
    jitterSample: JitterSample = 0.5,
    nowMs?: number,
  ): PollIntervalDecision {
    const current =
      nowMs === undefined
        ? state
        : resetTokenWindowIfExpired(state, this.config, nowMs);

    const priorityIntervalMs = intervalMsForPriority(
      current.priority,
      this.config.minIntervalMs,
      this.config.maxIntervalMs,
    );

    const backoffExponent = Math.min(
      current.consecutive429Count,
      this.config.maxBackoffExponent,
    );
    const backoffActive = backoffExponent > 0;
    const backoffIntervalMs = Math.round(
      priorityIntervalMs * this.config.backoffMultiplier ** backoffExponent,
    );
    const throttledByBudget = !hasTokenBudget(current, this.config);
    const budgetPenaltyMs = throttledByBudget ? this.config.maxIntervalMs : 0;
    const baseIntervalMs = clampInterval(
      backoffIntervalMs + budgetPenaltyMs,
      this.config,
    );
    const intervalMs = clampInterval(
      applyPollIntervalJitter(
        baseIntervalMs,
        this.config.jitterFraction,
        jitterSample,
      ),
      this.config,
    );

    return {
      baseIntervalMs,
      intervalMs,
      backoffActive,
      throttledByBudget,
      priority: current.priority,
    };
  }

  assessPollReadiness(state: MarketPollState, nowMs: number): PollReadiness {
    const current = resetTokenWindowIfExpired(state, this.config, nowMs);

    if (!hasTokenBudget(current, this.config)) {
      const retryAfterMs =
        current.tokenWindowStartMs +
        this.config.tokenBudgetWindowMs -
        nowMs;
      return {
        allowed: false,
        reason: "token-budget-exhausted",
        retryAfterMs: Math.max(retryAfterMs, 0),
      };
    }

    if (current.nextPollDueAtMs !== null && nowMs < current.nextPollDueAtMs) {
      return {
        allowed: false,
        reason: "scheduled-wait",
        retryAfterMs: current.nextPollDueAtMs - nowMs,
      };
    }

    return {
      allowed: true,
      reason: "ready",
      retryAfterMs: null,
    };
  }

  scheduleNextPoll(
    state: MarketPollState,
    nowMs: number,
    jitterSample: JitterSample = 0.5,
  ): MarketPollState {
    const current = resetTokenWindowIfExpired(state, this.config, nowMs);
    const decision = this.computeIntervalDecision(current, jitterSample, nowMs);

    return {
      ...current,
      nextPollDueAtMs: nowMs + decision.intervalMs,
    };
  }

  recordPollAttempt(
    state: MarketPollState,
    nowMs: number,
    jitterSample: JitterSample = 0.5,
  ): MarketPollState {
    const current = resetTokenWindowIfExpired(state, this.config, nowMs);
    const withTokens = consumeTokens(current, this.config);

    return this.scheduleNextPoll(
      {
        ...withTokens,
        lastPolledAtMs: nowMs,
      },
      nowMs,
      jitterSample,
    );
  }

  recordPollSuccess(
    state: MarketPollState,
    nowMs: number,
    observedAtMs: number,
    jitterSample: JitterSample = 0.5,
  ): MarketPollState {
    const afterAttempt = this.recordPollAttempt(state, nowMs, jitterSample);

    return {
      ...afterAttempt,
      lastSuccessAtMs: nowMs,
      lastQuoteObservedAtMs: observedAtMs,
      consecutive429Count: 0,
    };
  }

  recordRateLimited(
    state: MarketPollState,
    nowMs: number,
    jitterSample: JitterSample = 0.5,
  ): MarketPollState {
    const afterAttempt = this.recordPollAttempt(state, nowMs, jitterSample);

    return {
      ...afterAttempt,
      consecutive429Count: afterAttempt.consecutive429Count + 1,
    };
  }

  detectStaleQuote(
    observedAtMs: number | null,
    nowMs: number,
  ): StaleQuoteStatus {
    if (observedAtMs === null) {
      return {
        isStale: true,
        ageMs: null,
        thresholdMs: this.config.staleQuoteThresholdMs,
      };
    }

    const ageMs = Math.max(nowMs - observedAtMs, 0);

    return {
      isStale: ageMs > this.config.staleQuoteThresholdMs,
      ageMs,
      thresholdMs: this.config.staleQuoteThresholdMs,
    };
  }

  /** Select the highest-priority market that is ready to poll. */
  selectNextMarket(
    states: readonly MarketPollState[],
    nowMs: number,
  ): MarketPollState | null {
    const readyStates = states
      .map((state) => ({
        state: resetTokenWindowIfExpired(state, this.config, nowMs),
        readiness: this.assessPollReadiness(state, nowMs),
      }))
      .filter(({ readiness }) => readiness.allowed);

    if (readyStates.length === 0) {
      return null;
    }

    readyStates.sort((left, right) => {
      const weightDelta =
        MARKET_POLL_PRIORITY_WEIGHT[right.state.priority] -
        MARKET_POLL_PRIORITY_WEIGHT[left.state.priority];
      if (weightDelta !== 0) {
        return weightDelta;
      }

      const dueDelta =
        (left.state.nextPollDueAtMs ?? 0) - (right.state.nextPollDueAtMs ?? 0);
      if (dueDelta !== 0) {
        return dueDelta;
      }

      return left.state.marketId.localeCompare(right.state.marketId);
    });

    return readyStates[0]?.state ?? null;
  }
}

export { MARKET_POLL_PRIORITY_WEIGHT };
