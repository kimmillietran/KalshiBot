import { hashConfig } from "@/lib/trading/config/hashConfig";
import { evaluateDecisionPolicy } from "@/lib/trading/decision-policy";
import type { DecisionPolicyAction } from "@/lib/trading/decision-policy/types";
import { estimateExpectedValue } from "@/lib/trading/expected-value";
import type { ExpectedValueEstimate } from "@/lib/trading/expected-value/types";
import { extractFeaturesFromSnapshot } from "@/lib/trading/features/extractFeatures";
import {
  runEvaluationGuards,
  type GuardStepId,
} from "@/lib/trading/guards/evaluationGuards";
import { estimateProbability } from "@/lib/trading/probability";
import type { ProbabilityEstimate } from "@/lib/trading/probability/types";
import { ENGINE_VERSION } from "@/lib/trading/versioning";
import type { MarketFeatureVector } from "@/lib/features/types";
import type {
  EngineConfig,
  EvaluationPricingSnapshot,
  EvaluationSnapshot,
  ReasoningStep,
  TradeAction,
  TradeDecision,
} from "@/types/domain/trading";

function buildDecision(
  snapshot: EvaluationSnapshot,
  config: EngineConfig,
  steps: ReasoningStep[],
  summary: string,
  options: {
    action?: TradeAction;
    features?: MarketFeatureVector | null;
    probability?: ProbabilityEstimate | null;
    expectedValue?: ExpectedValueEstimate | null;
    gatesTriggered?: readonly GuardStepId[];
  } = {},
): TradeDecision {
  const {
    action = "NO TRADE",
    features = null,
    probability = null,
    expectedValue = null,
    gatesTriggered,
  } = options;

  return {
    action,
    engineVersion: ENGINE_VERSION,
    configHash: hashConfig(config),
    reasoning: { steps, summary },
    evaluatedAt: snapshot.evaluatedAt,
    features,
    probability,
    expectedValue,
    ...(gatesTriggered ? { gatesTriggered } : {}),
  };
}

function toTradeAction(policyAction: DecisionPolicyAction): TradeAction {
  switch (policyAction) {
    case "BUY_UP":
      return "BUY UP";
    case "BUY_DOWN":
      return "BUY DOWN";
    case "NO_TRADE":
      return "NO TRADE";
  }
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

function formatProbabilitySummary(estimate: ProbabilityEstimate): string {
  return [
    `p(up)=${(estimate.probabilityUp * 100).toFixed(2)}%`,
    `p(down)=${(estimate.probabilityDown * 100).toFixed(2)}%`,
    `confidence=${(estimate.confidence * 100).toFixed(0)}%`,
    `model=${estimate.modelVersion}`,
  ].join(" ");
}

function toExpectedValuePricing(pricing: EvaluationPricingSnapshot) {
  return {
    yesBidCents: pricing.yesBidCents,
    yesAskCents: pricing.yesAskCents,
    noBidCents: pricing.noBidCents,
    noAskCents: pricing.noAskCents,
  };
}

function formatPolicyDetail(reasoning: readonly string[]): string {
  return reasoning.join(" · ");
}

function buildSuccessSummary(action: TradeAction): string {
  if (action === "NO TRADE") {
    return "Guards passed — features extracted — probability and EV estimated — policy returns NO TRADE";
  }
  return `Guards passed — features extracted — probability and EV estimated — policy returns ${action}`;
}

/** Pure engine: guards + features + probability + expected value + decision policy. */
export function evaluate(
  snapshot: EvaluationSnapshot,
  config: EngineConfig,
): TradeDecision {
  const guardResult = runEvaluationGuards(snapshot, config);

  if (guardResult.status === "fail") {
    return buildDecision(
      snapshot,
      config,
      guardResult.steps,
      guardResult.summary,
      { gatesTriggered: guardResult.gatesTriggered },
    );
  }

  const steps = [...guardResult.steps];
  const features = extractFeaturesFromSnapshot(snapshot);

  steps.push({
    id: "feature-extraction",
    phase: "model",
    summary: "Market feature vector",
    outcome: "pass",
    detail: formatFeatureSummary(features),
  });

  const probability = estimateProbability(features);

  steps.push({
    id: "model-probability",
    phase: "model",
    summary: "Probability model",
    outcome: "pass",
    detail: formatProbabilitySummary(probability),
  });

  const pricing = snapshot.pricing!;
  const expectedValue = estimateExpectedValue({
    probability,
    features,
    pricing: toExpectedValuePricing(pricing),
  });

  steps.push({
    id: "model-expected-value",
    phase: "model",
    summary: "Expected value",
    outcome: "pass",
    detail: expectedValue.reasoning.summary,
  });

  const policyResult = evaluateDecisionPolicy({
    expectedValue,
    probability,
    features,
    engineConfig: config,
  });
  const action = toTradeAction(policyResult.action);

  steps.push({
    id: "decision-policy",
    phase: "execution",
    summary: "Decision policy",
    outcome: policyResult.action === "NO_TRADE" ? "skip" : "pass",
    detail: formatPolicyDetail(policyResult.reasoning),
  });

  return buildDecision(
    snapshot,
    config,
    steps,
    buildSuccessSummary(action),
    {
      action,
      features,
      probability,
      expectedValue,
    },
  );
}
