import type { PositionSizeEstimate } from "@/lib/trading/position-sizing/types";
import type { TradeDecision } from "@/types/domain/trading";

import {
  buyDownDecision,
  buyUpDecision,
  buyUpWithBankrollDecision,
  guardFailureDecision,
  noTradePolicyDecision,
} from "./engineDecisions";

export function mockPositionSize(
  overrides: Partial<PositionSizeEstimate> = {},
): PositionSizeEstimate {
  return {
    modelVersion: "5.7.0",
    side: "yes",
    recommendedFraction: 0.05,
    recommendedPercent: 5,
    recommendedDollars: null,
    cappedFraction: 0.05,
    rawKellyFraction: 0.2,
    reasoning: [
      "action=BUY UP side=yes",
      "recommend=5.00%",
    ],
    ...overrides,
  };
}

export function decisionWithPositionSize(
  base: TradeDecision,
  positionSize: PositionSizeEstimate | null,
): TradeDecision {
  return {
    ...base,
    positionSize,
  };
}

export function buyUpWithDollarsDecision(): TradeDecision {
  return buyUpWithBankrollDecision(250);
}

export function zeroPositionSizeDecision(): TradeDecision {
  return noTradePolicyDecision();
}

export {
  buyDownDecision,
  buyUpDecision,
  guardFailureDecision,
  noTradePolicyDecision,
};
