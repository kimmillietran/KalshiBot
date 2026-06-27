import { hashConfig } from "@/lib/trading/config/hashConfig";
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
  TradeDecision,
} from "@/types/domain/trading";

function buildDecision(
  snapshot: EvaluationSnapshot,
  config: EngineConfig,
  steps: ReasoningStep[],
  summary: string,
  options: {
    features?: MarketFeatureVector | null;
    probability?: ProbabilityEstimate | null;
    expectedValue?: ExpectedValueEstimate | null;
    gatesTriggered?: readonly GuardStepId[];
  } = {},
): TradeDecision {
  const {
    features = null,
    probability = null,
    expectedValue = null,
    gatesTriggered,
  } = options;

  return {
    action: "NO TRADE",
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

/** Pure engine: guards + features + probability + expected value + NO TRADE stub. */
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
  steps.push({
    id: "decision-stub",
    phase: "execution",
    summary: "Trade decision",
    outcome: "skip",
    detail: "Engine returns NO TRADE until trade policy is implemented",
  });

  return buildDecision(
    snapshot,
    config,
    steps,
    "Guards passed — features extracted — probability and EV estimated — engine returns NO TRADE",
    { features, probability, expectedValue },
  );
}
