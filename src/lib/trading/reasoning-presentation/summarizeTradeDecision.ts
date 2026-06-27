import type { TradeAction, TradeDecision } from "@/types/domain/trading";

import {
  DEFAULT_REASONING_PRESENTATION_CONFIG,
  REASONING_PRESENTATION_MODEL_VERSION,
} from "./config";
import { formatGuardGateLabel, formatReasoningTrace } from "./formatReasoningTrace";
import type {
  ReasoningPresentation,
  ReasoningPresentationConfig,
  ReasoningPresentationExtensions,
  SummarizeTradeDecisionInput,
} from "./types";

function isGuardFailure(decision: TradeDecision): boolean {
  return (
    decision.action === "NO TRADE" &&
    decision.probability === null &&
    decision.expectedValue === null &&
    (decision.gatesTriggered?.length ?? 0) > 0
  );
}

function findStep(decision: TradeDecision, stepId: string) {
  return decision.reasoning.steps.find((step) => step.id === stepId) ?? null;
}

function findFailedStep(decision: TradeDecision) {
  return decision.reasoning.steps.find((step) => step.outcome === "fail") ?? null;
}

function formatSignedCents(value: number): string {
  const prefix = value >= 0 ? "+" : "";
  return `${prefix}${value.toFixed(2)}¢`;
}

function formatSignedEdgePercent(value: number): string {
  const prefix = value >= 0 ? "+" : "";
  return `${prefix}${value.toFixed(2)}%`;
}

function formatConfidencePercent(confidence: number): string {
  return `${(confidence * 100).toFixed(0)}%`;
}

function headlineForAction(
  action: TradeAction,
  guardFailed: boolean,
  config: ReasoningPresentationConfig,
): string {
  if (guardFailed) {
    return config.headlineNoTradeGuard;
  }

  switch (action) {
    case "BUY UP":
      return config.headlineBuyUp;
    case "BUY DOWN":
      return config.headlineBuyDown;
    case "HOLD":
      return config.headlineHold;
    default:
      return config.headlineNoTradePolicy;
  }
}

function policyPrimaryReason(decision: TradeDecision): string | null {
  const policyStep = findStep(decision, "decision-policy");
  if (!policyStep) {
    return null;
  }

  if (policyStep.detail) {
    return policyStep.detail;
  }

  return policyStep.summary;
}

function guardPrimaryReason(decision: TradeDecision): string | null {
  const failedStep = findFailedStep(decision);
  if (!failedStep) {
    const gate = decision.gatesTriggered?.[0];
    return gate ? `Guard blocked: ${formatGuardGateLabel(gate)}` : null;
  }

  return failedStep.detail
    ? `${failedStep.summary} — ${failedStep.detail}`
    : failedStep.summary;
}

function directionalPrimaryReason(decision: TradeDecision): string | null {
  const policyReason = policyPrimaryReason(decision);
  if (policyReason) {
    return policyReason;
  }

  const expectedValue = decision.expectedValue;
  if (!expectedValue) {
    return null;
  }

  const side = decision.action === "BUY UP" ? "YES" : "NO";
  const edge =
    decision.action === "BUY UP"
      ? expectedValue.edgeYesPercent
      : expectedValue.edgeNoPercent;
  const netEv =
    decision.action === "BUY UP"
      ? expectedValue.netEvYesCents
      : expectedValue.netEvNoCents;

  return `Policy selected ${side} with net EV ${formatSignedCents(netEv)} and edge ${formatSignedEdgePercent(edge)}.`;
}

function buildSupportingReasons(
  decision: TradeDecision,
  config: ReasoningPresentationConfig,
): string[] {
  const reasons: string[] = [];

  if (decision.probability) {
    reasons.push(
      `Model probability: P(up)=${(decision.probability.probabilityUp * 100).toFixed(2)}%, P(down)=${(decision.probability.probabilityDown * 100).toFixed(2)}%, confidence ${formatConfidencePercent(decision.probability.confidence)}.`,
    );
  } else if (!isGuardFailure(decision)) {
    reasons.push(config.probabilityUnavailableNote);
  }

  if (decision.expectedValue) {
    const ev = decision.expectedValue;
    reasons.push(
      `Expected value: best side ${ev.bestSide?.toUpperCase() ?? "none"} at ${formatSignedCents(ev.bestEvCents)} net EV; YES edge ${formatSignedEdgePercent(ev.edgeYesPercent)}, NO edge ${formatSignedEdgePercent(ev.edgeNoPercent)}.`,
    );
    if (ev.reasoning.summary) {
      reasons.push(ev.reasoning.summary);
    }
  } else if (!isGuardFailure(decision)) {
    reasons.push(config.expectedValueUnavailableNote);
  }

  if (decision.features) {
    reasons.push(
      `Market structure: trend ${decision.features.trend.direction}, momentum ${decision.features.momentum.changePercent.toFixed(2)}%, liquidity ${decision.features.liquidity.quality}.`,
    );
  } else if (isGuardFailure(decision)) {
    reasons.push(config.featuresUnavailableNote);
  }

  const probabilityStep = findStep(decision, "model-probability");
  if (probabilityStep?.detail && decision.probability) {
    reasons.push(probabilityStep.detail);
  }

  return reasons;
}

function buildRiskNotes(
  decision: TradeDecision,
  config: ReasoningPresentationConfig,
): string[] {
  const notes = [config.executionDisabledNote];

  if (isGuardFailure(decision)) {
    notes.push("Evaluation stopped at the guard layer — model outputs were not produced.");
    for (const gate of decision.gatesTriggered ?? []) {
      notes.push(`Triggered gate: ${formatGuardGateLabel(gate)}.`);
    }
  }

  if (decision.action === "NO TRADE" && !isGuardFailure(decision)) {
    notes.push("Policy returned NO TRADE — no directional entry is recommended.");
  }

  return notes;
}

function resolvePrimaryReason(
  decision: TradeDecision,
  guardFailed: boolean,
): string | null {
  if (guardFailed) {
    return guardPrimaryReason(decision);
  }

  if (decision.action === "BUY UP" || decision.action === "BUY DOWN") {
    return directionalPrimaryReason(decision);
  }

  if (decision.action === "NO TRADE" || decision.action === "HOLD") {
    return policyPrimaryReason(decision) ?? decision.reasoning.summary;
  }

  return decision.reasoning.summary;
}

function normalizeInput(
  decisionOrInput: TradeDecision | SummarizeTradeDecisionInput,
  config?: ReasoningPresentationConfig,
  extensions?: ReasoningPresentationExtensions,
): {
  decision: TradeDecision;
  config: ReasoningPresentationConfig;
  extensions?: ReasoningPresentationExtensions;
} {
  if ("decision" in decisionOrInput) {
    return {
      decision: decisionOrInput.decision,
      config: decisionOrInput.config ?? DEFAULT_REASONING_PRESENTATION_CONFIG,
      extensions: decisionOrInput.extensions,
    };
  }

  return {
    decision: decisionOrInput,
    config: config ?? DEFAULT_REASONING_PRESENTATION_CONFIG,
    extensions,
  };
}

/**
 * Deterministic user-facing explanation from an engine `TradeDecision`.
 * Formats existing fields only — no model math or LLM generation.
 */
export function summarizeTradeDecision(
  decisionOrInput: TradeDecision | SummarizeTradeDecisionInput,
  config?: ReasoningPresentationConfig,
  extensions?: ReasoningPresentationExtensions,
): ReasoningPresentation {
  const { decision, config: resolvedConfig, extensions: resolvedExtensions } =
    normalizeInput(decisionOrInput, config, extensions);

  void resolvedExtensions;

  const guardFailed = isGuardFailure(decision);
  const technicalTrace = formatReasoningTrace(
    decision.reasoning.steps,
    resolvedConfig,
  );

  return {
    modelVersion: REASONING_PRESENTATION_MODEL_VERSION,
    headline: headlineForAction(decision.action, guardFailed, resolvedConfig),
    summary: decision.reasoning.summary,
    primaryReason: resolvePrimaryReason(decision, guardFailed),
    supportingReasons: buildSupportingReasons(decision, resolvedConfig),
    riskNotes: buildRiskNotes(decision, resolvedConfig),
    technicalTrace,
  };
}

export {
  DEFAULT_REASONING_PRESENTATION_CONFIG,
  REASONING_PRESENTATION_MODEL_VERSION,
  REASONING_STEP_LABELS,
} from "./config";

export { formatGuardGateLabel, formatReasoningTrace } from "./formatReasoningTrace";

export type {
  ReasoningPresentation,
  ReasoningPresentationConfig,
  ReasoningPresentationExtensions,
  ReasoningTraceItem,
  SummarizeTradeDecisionInput,
} from "./types";
