import type { PositionSizeEstimate } from "@/lib/trading/position-sizing/types";
import type { TradeAction, TradeDecision } from "@/types/domain/trading";

import {
  POSITION_SIZING_DOLLARS_UNAVAILABLE_LABEL,
  POSITION_SIZING_RECOMMENDED_ALLOCATION_MESSAGE,
  POSITION_SIZING_ZERO_ALLOCATION_MESSAGE,
  POSITION_SIZING_ZERO_REASON,
} from "../constants";

export type PositionSizingDisplayState = "unavailable" | "zero" | "positive";

export function positionSizingDisplayState(
  positionSize: PositionSizeEstimate | null,
): PositionSizingDisplayState {
  if (positionSize === null) {
    return "unavailable";
  }

  if (positionSize.recommendedFraction === 0) {
    return "zero";
  }

  return "positive";
}

export function formatRecommendedPercent(percent: number): string {
  return `${percent.toFixed(2)}%`;
}

export function formatFractionAsPercent(fraction: number): string {
  return formatRecommendedPercent(fraction * 100);
}

export function formatPositionSide(side: PositionSizeEstimate["side"]): string {
  if (side === "yes") {
    return "YES";
  }
  if (side === "no") {
    return "NO";
  }
  return "—";
}

export function formatRecommendedDollars(
  dollars: number | null | undefined,
): string {
  if (dollars === null || dollars === undefined) {
    return POSITION_SIZING_DOLLARS_UNAVAILABLE_LABEL;
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(dollars);
}

export function zeroSizingReason(): string {
  return POSITION_SIZING_ZERO_REASON;
}

export function tradeAllocationGuidance(
  action: TradeAction,
  positionSize: PositionSizeEstimate | null,
): string {
  if (positionSize === null) {
    return "Evaluation stopped before position sizing — guard or pipeline failure blocked the sizing step.";
  }

  if (positionSize.recommendedFraction > 0) {
    const allocation = formatRecommendedPercent(positionSize.recommendedPercent);
    switch (action) {
      case "BUY UP":
        return `${POSITION_SIZING_RECOMMENDED_ALLOCATION_MESSAGE}: ${allocation} on YES. Execution remains disabled — review odds and sizing before any manual trade.`;
      case "BUY DOWN":
        return `${POSITION_SIZING_RECOMMENDED_ALLOCATION_MESSAGE}: ${allocation} on NO. Execution remains disabled — review odds and sizing before any manual trade.`;
      default:
        return `${POSITION_SIZING_RECOMMENDED_ALLOCATION_MESSAGE}: ${allocation}. Execution remains disabled.`;
    }
  }

  return `${POSITION_SIZING_ZERO_ALLOCATION_MESSAGE} — policy returned NO TRADE or edge did not qualify for sizing (${POSITION_SIZING_ZERO_REASON}).`;
}

export function tradeGuidanceCopy(decision: TradeDecision): string {
  return tradeAllocationGuidance(decision.action, decision.positionSize);
}
