import { hashConfig } from "@/lib/trading/config/hashConfig";
import {
  hasMarket,
  hasStrike,
  isActiveLifecycle,
} from "@/lib/trading/snapshot/types";
import { ENGINE_VERSION } from "@/lib/trading/versioning";
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
  };
}

/**
 * Pure, deterministic trading engine entry point.
 * Milestone 5.0: guard rails + NO TRADE stub — no model or execution logic yet.
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

  steps.push({
    id: "model-probability",
    phase: "model",
    summary: "Probability model",
    outcome: "skip",
    detail: "Deferred — milestone 5.0 stub",
  });

  steps.push({
    id: "decision-stub",
    phase: "execution",
    summary: "Trade decision",
    outcome: "skip",
    detail: "Engine foundation returns NO TRADE until model is implemented",
  });

  return buildDecision(
    snapshot,
    config,
    steps,
    "Guards passed — engine stub returns NO TRADE",
  );
}
