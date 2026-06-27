import { hashConfig } from "@/lib/trading/config/hashConfig";
import { extractFeaturesFromSnapshot } from "@/lib/trading/features/extractFeatures";
import {
  hasBtcSpot,
  hasContractPricing,
  hasMarket,
  hasStrike,
  isActiveLifecycle,
} from "@/lib/trading/snapshot/types";
import { ENGINE_VERSION } from "@/lib/trading/versioning";
import type { MarketFeatureVector } from "@/lib/features/types";
import type {
  EngineConfig,
  EvaluationSnapshot,
  ReasoningStep,
  TradeDecision,
} from "@/types/domain/trading";

function buildDecision(
  snapshot: EvaluationSnapshot,
  config: EngineConfig,
  steps: ReasoningStep[],
  summary: string,
  features: MarketFeatureVector | null = null,
): TradeDecision {
  return {
    action: "NO TRADE",
    engineVersion: ENGINE_VERSION,
    configHash: hashConfig(config),
    reasoning: {
      steps,
      summary,
    },
    evaluatedAt: snapshot.evaluatedAt,
    features,
  };
}

function formatFeatureSummary(features: MarketFeatureVector): string {
  return [
    `distance=${features.distanceToTarget.signed.toFixed(2)}`,
    `trend=${features.trend.direction}`,
    `momentum=${features.momentum.changePercent.toFixed(2)}%`,
    `vol=${features.volatility.stdDev.toFixed(2)}`,
    `liquidity=${features.liquidity.quality}`,
    `timeRemaining=${features.timeRemaining.minutes.toFixed(1)}m`,
  ].join(", ");
}

/**
 * Pure, deterministic trading engine entry point.
 * Milestone 5.3A: guard rails + feature extraction + NO TRADE stub.
 */
export function evaluate(
  snapshot: EvaluationSnapshot,
  config: EngineConfig,
): TradeDecision {
  const steps: ReasoningStep[] = [];

  if (!config.enabled) {
    steps.push({
      id: "guard-config-enabled",
      phase: "guard",
      summary: "Engine disabled in config",
      outcome: "fail",
      detail: "enabled=false",
    });
    return buildDecision(
      snapshot,
      config,
      steps,
      "Engine disabled — no trade",
    );
  }

  if (!hasMarket(snapshot)) {
    steps.push({
      id: "guard-market-present",
      phase: "guard",
      summary: "Active market required",
      outcome: "fail",
      detail: "snapshot.market is null",
    });
    return buildDecision(
      snapshot,
      config,
      steps,
      "Missing market — no trade",
    );
  }

  const { market } = snapshot;

  steps.push({
    id: "guard-market-present",
    phase: "guard",
    summary: "Active market required",
    outcome: "pass",
    detail: "active contract resolved",
  });

  if (!isActiveLifecycle(market.lifecycle)) {
    steps.push({
      id: "guard-market-lifecycle",
      phase: "guard",
      summary: "Market lifecycle must be ACTIVE",
      outcome: "fail",
      detail: market.lifecycle,
    });
    return buildDecision(
      snapshot,
      config,
      steps,
      "Inactive market lifecycle — no trade",
    );
  }

  steps.push({
    id: "guard-market-lifecycle",
    phase: "guard",
    summary: "Market lifecycle must be ACTIVE",
    outcome: "pass",
    detail: market.lifecycle,
  });

  if (!hasStrike(market)) {
    steps.push({
      id: "guard-strike-present",
      phase: "guard",
      summary: "Strike price required",
      outcome: "fail",
      detail:
        market.strikePrice === null
          ? "strikePrice is null"
          : `invalid strikePrice: ${market.strikePrice}`,
    });
    return buildDecision(
      snapshot,
      config,
      steps,
      "Missing strike — no trade",
    );
  }

  steps.push({
    id: "guard-strike-present",
    phase: "guard",
    summary: "Strike price required",
    outcome: "pass",
    detail: String(market.strikePrice),
  });

  if (!hasBtcSpot(snapshot)) {
    steps.push({
      id: "guard-btc-present",
      phase: "guard",
      summary: "BTC spot price required",
      outcome: "fail",
      detail: snapshot.btc === null ? "snapshot.btc is null" : "invalid price",
    });
    return buildDecision(
      snapshot,
      config,
      steps,
      "Missing BTC spot — no trade",
    );
  }

  steps.push({
    id: "guard-btc-present",
    phase: "guard",
    summary: "BTC spot price required",
    outcome: "pass",
    detail: String(snapshot.btc.price),
  });

  if (!hasContractPricing(snapshot)) {
    steps.push({
      id: "guard-pricing-present",
      phase: "guard",
      summary: "Contract pricing required",
      outcome: "fail",
      detail:
        snapshot.pricing === null
          ? "snapshot.pricing is null"
          : "no usable YES/NO quotes",
    });
    return buildDecision(
      snapshot,
      config,
      steps,
      "Missing contract pricing — no trade",
    );
  }

  steps.push({
    id: "guard-pricing-present",
    phase: "guard",
    summary: "Contract pricing required",
    outcome: "pass",
    detail: "YES/NO quotes available",
  });

  const features = extractFeaturesFromSnapshot(snapshot);

  steps.push({
    id: "feature-extraction",
    phase: "model",
    summary: "Market feature vector",
    outcome: "pass",
    detail: formatFeatureSummary(features),
  });

  steps.push({
    id: "model-probability",
    phase: "model",
    summary: "Probability model",
    outcome: "skip",
    detail: "Deferred — probability model not implemented",
  });

  steps.push({
    id: "decision-stub",
    phase: "execution",
    summary: "Trade decision",
    outcome: "skip",
    detail: "Engine returns NO TRADE until probability model is implemented",
  });

  return buildDecision(
    snapshot,
    config,
    steps,
    "Guards passed — features extracted — engine returns NO TRADE",
    features,
  );
}
