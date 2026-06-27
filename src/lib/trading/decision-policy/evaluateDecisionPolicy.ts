import { clamp01 } from "@/lib/features/normalize";

import {
  DECISION_POLICY_MODEL_VERSION,
  DEFAULT_DECISION_POLICY_CONFIG,
  type DecisionPolicyConfig,
} from "./config";
import { buildDecisionPolicyReasoning } from "./reasoning";
import type {
  DecisionPolicyAction,
  DecisionPolicyReasonCode,
  DecisionPolicyResult,
  DecisionPolicySide,
  EvaluateDecisionPolicyInput,
} from "./types";

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function combinedConfidence(
  probability: EvaluateDecisionPolicyInput["probability"],
  expectedValue: EvaluateDecisionPolicyInput["expectedValue"],
): number {
  return clamp01(Math.min(probability.confidence, expectedValue.confidence));
}

function sideQualifies(
  edgePercent: number,
  netEvCents: number,
  minEdgePercent: number,
): boolean {
  return netEvCents > 0 && edgePercent >= minEdgePercent;
}

function noTradeResult(
  reasonCode: DecisionPolicyReasonCode,
  confidence: number,
  context: {
    minConfidence: number;
    minEdgePercent: number;
    edgeYesPercent: number;
    edgeNoPercent: number;
    netEvYesCents: number;
    netEvNoCents: number;
    yesQualifies: boolean;
    noQualifies: boolean;
  },
): DecisionPolicyResult {
  const base = {
    modelVersion: DECISION_POLICY_MODEL_VERSION,
    action: "NO_TRADE" as const,
    selectedSide: null,
    reasonCode,
    confidence,
  };

  return {
    ...base,
    reasoning: buildDecisionPolicyReasoning({
      ...base,
      ...context,
    }),
  };
}

function tradeResult(
  action: Extract<DecisionPolicyAction, "BUY_UP" | "BUY_DOWN">,
  selectedSide: DecisionPolicySide,
  reasonCode: Extract<DecisionPolicyReasonCode, "BUY_UP" | "BUY_DOWN" | "BUY_UP_TIE_BREAK">,
  confidence: number,
  context: {
    minConfidence: number;
    minEdgePercent: number;
    edgeYesPercent: number;
    edgeNoPercent: number;
    netEvYesCents: number;
    netEvNoCents: number;
    yesQualifies: boolean;
    noQualifies: boolean;
  },
): DecisionPolicyResult {
  const base = {
    modelVersion: DECISION_POLICY_MODEL_VERSION,
    action,
    selectedSide,
    reasonCode,
    confidence,
  };

  return {
    ...base,
    reasoning: buildDecisionPolicyReasoning({
      ...base,
      ...context,
    }),
  };
}

function inputsAreValid(input: EvaluateDecisionPolicyInput): boolean {
  const { probability, expectedValue } = input;

  return (
    isFiniteNumber(probability.confidence) &&
    isFiniteNumber(expectedValue.confidence) &&
    isFiniteNumber(expectedValue.edgeYesPercent) &&
    isFiniteNumber(expectedValue.edgeNoPercent) &&
    isFiniteNumber(expectedValue.netEvYesCents) &&
    isFiniteNumber(expectedValue.netEvNoCents) &&
    isFiniteNumber(input.engineConfig.minEdgePercent)
  );
}

/**
 * Deterministic decision policy: converts probability + EV + config into a trade action.
 *
 * Tie-break: when both YES and NO pass thresholds, `BUY_UP` is selected (deterministic).
 */
export function evaluateDecisionPolicy(
  input: EvaluateDecisionPolicyInput,
  config: DecisionPolicyConfig = DEFAULT_DECISION_POLICY_CONFIG,
): DecisionPolicyResult {
  const minEdgePercent = input.engineConfig.minEdgePercent;
  const minConfidence = config.minConfidence;

  const edgeYesPercent = input.expectedValue.edgeYesPercent;
  const edgeNoPercent = input.expectedValue.edgeNoPercent;
  const netEvYesCents = input.expectedValue.netEvYesCents;
  const netEvNoCents = input.expectedValue.netEvNoCents;

  const yesQualifies = sideQualifies(edgeYesPercent, netEvYesCents, minEdgePercent);
  const noQualifies = sideQualifies(edgeNoPercent, netEvNoCents, minEdgePercent);

  const reasoningContext = {
    minConfidence,
    minEdgePercent,
    edgeYesPercent,
    edgeNoPercent,
    netEvYesCents,
    netEvNoCents,
    yesQualifies,
    noQualifies,
  };

  if (!config.enabled || !input.engineConfig.enabled) {
    return noTradeResult("POLICY_DISABLED", 0, reasoningContext);
  }

  if (!inputsAreValid(input)) {
    return noTradeResult("INVALID_INPUT", 0, reasoningContext);
  }

  const confidence = combinedConfidence(input.probability, input.expectedValue);

  if (confidence < minConfidence) {
    return noTradeResult("CONFIDENCE_BELOW_THRESHOLD", confidence, reasoningContext);
  }

  if (yesQualifies && noQualifies) {
    return tradeResult("BUY_UP", "yes", "BUY_UP_TIE_BREAK", confidence, reasoningContext);
  }

  if (yesQualifies) {
    return tradeResult("BUY_UP", "yes", "BUY_UP", confidence, reasoningContext);
  }

  if (noQualifies) {
    return tradeResult("BUY_DOWN", "no", "BUY_DOWN", confidence, reasoningContext);
  }

  const bestEdge = Math.max(edgeYesPercent, edgeNoPercent);
  const bestNetEv = Math.max(netEvYesCents, netEvNoCents);

  if (bestNetEv > 0 && bestEdge < minEdgePercent) {
    return noTradeResult("EDGE_BELOW_THRESHOLD", confidence, reasoningContext);
  }

  return noTradeResult("NO_QUALIFYING_SIDE", confidence, reasoningContext);
}

export {
  DECISION_POLICY_MODEL_VERSION,
  DEFAULT_DECISION_POLICY_CONFIG,
} from "./config";

export type {
  DecisionPolicyAction,
  DecisionPolicyReasonCode,
  DecisionPolicyResult,
  DecisionPolicySide,
  EvaluateDecisionPolicyInput,
} from "./types";

export type { DecisionPolicyConfig } from "./config";

export { buildDecisionPolicyReasoning } from "./reasoning";
