import { stableStringify } from "@/lib/trading/config/hashConfig";
import type { GuardStepId } from "@/lib/trading/guards/evaluationGuards";
import type { ExpectedValueEstimate } from "@/lib/trading/expected-value/types";
import type { PositionSizeEstimate } from "@/lib/trading/position-sizing/types";
import type { ProbabilityEstimate } from "@/lib/trading/probability/types";
import type {
  ReasoningTrace,
  TradeAction,
  TradeDecision,
} from "@/types/domain/trading";

/** JSON-safe engine decision snapshot for dashboard export (pre-5.11A). */
export type TradeDecisionExport = {
  action: TradeAction;
  engineVersion: string;
  probability: ProbabilityEstimate | null;
  expectedValue: ExpectedValueEstimate | null;
  positionSize: PositionSizeEstimate | null;
  reasoning: ReasoningTrace;
  gatesTriggered?: readonly GuardStepId[];
};

/** Builds a plain export payload from the current engine decision (no UI state). */
export function buildTradeDecisionExport(
  decision: TradeDecision,
): TradeDecisionExport {
  const payload: TradeDecisionExport = {
    action: decision.action,
    engineVersion: decision.engineVersion,
    probability: decision.probability,
    expectedValue: decision.expectedValue,
    positionSize: decision.positionSize,
    reasoning: {
      summary: decision.reasoning.summary,
      steps: decision.reasoning.steps.map((step) => ({ ...step })),
    },
  };

  if (decision.gatesTriggered !== undefined) {
    return { ...payload, gatesTriggered: [...decision.gatesTriggered] };
  }

  return payload;
}

/** Deterministic JSON string with stable key ordering. */
export function serializeTradeDecision(decision: TradeDecision): string {
  return stableStringify(buildTradeDecisionExport(decision));
}
