import {
  hasBtcSpot,
  hasContractPricing,
  hasMarket,
  hasStrike,
  isActiveLifecycle,
} from "@/lib/trading/snapshot/types";
import type {
  EngineConfig,
  EvaluationSnapshot,
  ReasoningStep,
} from "@/types/domain/trading";

import { maxContractSpreadPercent, meetsMinLiquidityQuality } from "./pricing";

export const GUARD_STEP_ORDER = [
  "guard-config-enabled",
  "guard-market-present",
  "guard-market-lifecycle",
  "guard-strike-present",
  "guard-contract-expired",
  "guard-settlement-window",
  "guard-btc-present",
  "guard-btc-feed-stale",
  "guard-btc-fallback-source",
  "guard-btc-candles",
  "guard-pricing-present",
  "guard-liquidity-minimum",
  "guard-spread-maximum",
] as const;

export type GuardStepId = (typeof GUARD_STEP_ORDER)[number];

export type GuardRunFailure = {
  status: "fail";
  steps: ReasoningStep[];
  summary: string;
  gatesTriggered: readonly [GuardStepId];
};

export type GuardRunSuccess = { status: "pass"; steps: ReasoningStep[] };
export type GuardRunResult = GuardRunFailure | GuardRunSuccess;

function pass(id: GuardStepId, summary: string, detail: string): ReasoningStep {
  return { id, phase: "guard", summary, outcome: "pass", detail };
}

function fail(id: GuardStepId, summary: string, detail: string): ReasoningStep {
  return { id, phase: "guard", summary, outcome: "fail", detail };
}

function guardFailure(
  steps: ReasoningStep[],
  step: ReasoningStep,
  summary: string,
): GuardRunFailure {
  return {
    status: "fail",
    steps: [...steps, step],
    summary,
    gatesTriggered: [step.id as GuardStepId],
  };
}

export function runEvaluationGuards(
  snapshot: EvaluationSnapshot,
  config: EngineConfig,
): GuardRunResult {
  const steps: ReasoningStep[] = [];

  if (!config.enabled) {
    return guardFailure(
      steps,
      fail("guard-config-enabled", "Engine disabled in config", "enabled=false"),
      "Engine disabled — no trade",
    );
  }
  steps.push(pass("guard-config-enabled", "Engine disabled in config", "enabled=true"));

  if (!hasMarket(snapshot)) {
    return guardFailure(
      steps,
      fail("guard-market-present", "Active market required", "snapshot.market is null"),
      "Missing market — no trade",
    );
  }
  const { market } = snapshot;
  steps.push(pass("guard-market-present", "Active market required", "active contract resolved"));

  if (!isActiveLifecycle(market.lifecycle)) {
    return guardFailure(
      steps,
      fail("guard-market-lifecycle", "Market lifecycle must be ACTIVE", market.lifecycle),
      "Inactive market lifecycle — no trade",
    );
  }
  steps.push(pass("guard-market-lifecycle", "Market lifecycle must be ACTIVE", market.lifecycle));

  if (!hasStrike(market)) {
    const detail =
      market.strikePrice === null
        ? "strikePrice is null"
        : `invalid strikePrice: ${market.strikePrice}`;
    return guardFailure(
      steps,
      fail("guard-strike-present", "Strike price required", detail),
      "Invalid strike — no trade",
    );
  }
  steps.push(pass("guard-strike-present", "Strike price required", String(market.strikePrice)));

  if (market.timeRemainingMs <= 0) {
    return guardFailure(
      steps,
      fail(
        "guard-contract-expired",
        "Contract must not be expired",
        `timeRemainingMs=${market.timeRemainingMs}`,
      ),
      "Expired contract — no trade",
    );
  }
  steps.push(
    pass("guard-contract-expired", "Contract must not be expired", `${market.timeRemainingMs}ms remaining`),
  );

  if (market.timeRemainingMs < config.minimumTimeRemaining) {
    return guardFailure(
      steps,
      fail(
        "guard-settlement-window",
        "Settlement window too close",
        `timeRemainingMs=${market.timeRemainingMs} < minimumTimeRemaining=${config.minimumTimeRemaining}`,
      ),
      "Settlement too close — no trade",
    );
  }
  steps.push(
    pass(
      "guard-settlement-window",
      "Settlement window too close",
      `${market.timeRemainingMs}ms >= ${config.minimumTimeRemaining}ms minimum`,
    ),
  );

  if (!hasBtcSpot(snapshot)) {
    const detail = snapshot.btc === null ? "snapshot.btc is null" : "invalid price";
    return guardFailure(
      steps,
      fail("guard-btc-present", "BTC spot price required", detail),
      "Missing BTC spot — no trade",
    );
  }
  const { btc } = snapshot;
  steps.push(pass("guard-btc-present", "BTC spot price required", String(btc.price)));

  if (btc.feedStatus === "stale") {
    return guardFailure(
      steps,
      fail("guard-btc-feed-stale", "BTC feed must be fresh", "feedStatus=stale"),
      "Stale BTC feed — no trade",
    );
  }
  steps.push(pass("guard-btc-feed-stale", "BTC feed must be fresh", btc.feedStatus));

  if (btc.feedStatus === "fallback" || btc.providerSource === "fallback") {
    const detail =
      btc.feedStatus === "fallback" ? "feedStatus=fallback" : "providerSource=fallback";
    return guardFailure(
      steps,
      fail("guard-btc-fallback-source", "BTC must use upstream feed", detail),
      "BTC fallback source — no trade",
    );
  }
  steps.push(pass("guard-btc-fallback-source", "BTC must use upstream feed", btc.providerSource));

  const candleCount = btc.candles.length;
  if (candleCount < config.minimumCandles) {
    return guardFailure(
      steps,
      fail(
        "guard-btc-candles",
        "Minimum BTC candles required",
        `candles=${candleCount} < minimumCandles=${config.minimumCandles}`,
      ),
      "Missing BTC candles — no trade",
    );
  }
  steps.push(pass("guard-btc-candles", "Minimum BTC candles required", `${candleCount} candles`));

  if (!hasContractPricing(snapshot)) {
    const detail =
      snapshot.pricing === null ? "snapshot.pricing is null" : "no usable YES/NO quotes";
    return guardFailure(
      steps,
      fail("guard-pricing-present", "Contract pricing required", detail),
      "Missing contract pricing — no trade",
    );
  }
  const { pricing } = snapshot;
  steps.push(pass("guard-pricing-present", "Contract pricing required", "YES/NO quotes available"));

  if (!meetsMinLiquidityQuality(pricing.liquidityQuality, config.minLiquidityQuality)) {
    return guardFailure(
      steps,
      fail(
        "guard-liquidity-minimum",
        "Liquidity meets configured minimum",
        `liquidityQuality=${pricing.liquidityQuality} < minLiquidityQuality=${config.minLiquidityQuality}`,
      ),
      "Liquidity below minimum — no trade",
    );
  }
  steps.push(
    pass("guard-liquidity-minimum", "Liquidity meets configured minimum", pricing.liquidityQuality),
  );

  const spreadPercent = maxContractSpreadPercent(pricing);
  if (spreadPercent === null) {
    return guardFailure(
      steps,
      fail(
        "guard-spread-maximum",
        "Spread within configured maximum",
        "cannot compute spread from bid/ask quotes",
      ),
      "Spread unavailable — no trade",
    );
  }
  if (spreadPercent > config.maxSpreadPercent) {
    return guardFailure(
      steps,
      fail(
        "guard-spread-maximum",
        "Spread within configured maximum",
        `spread=${spreadPercent.toFixed(2)}% > maxSpreadPercent=${config.maxSpreadPercent}%`,
      ),
      "Spread above maximum — no trade",
    );
  }
  steps.push(
    pass(
      "guard-spread-maximum",
      "Spread within configured maximum",
      `${spreadPercent.toFixed(2)}% <= ${config.maxSpreadPercent}%`,
    ),
  );

  return { status: "pass", steps };
}
