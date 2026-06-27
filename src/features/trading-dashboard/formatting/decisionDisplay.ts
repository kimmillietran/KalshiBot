import type { TradeAction, TradeDecision } from "@/types/domain/trading";

export type ActionHeroTone = "bullish" | "bearish" | "caution";

export type ActionBadgeVariant = "success" | "danger" | "neutral";

export function actionHeroTone(action: TradeAction): ActionHeroTone {
  switch (action) {
    case "BUY UP":
      return "bullish";
    case "BUY DOWN":
      return "bearish";
    default:
      return "caution";
  }
}

export function actionBadgeVariant(action: TradeAction): ActionBadgeVariant {
  switch (action) {
    case "BUY UP":
      return "success";
    case "BUY DOWN":
      return "danger";
    default:
      return "neutral";
  }
}

export function formatProbabilityPercent(probability: number): string {
  return `${(probability * 100).toFixed(1)}%`;
}

export function formatConfidencePercent(confidence: number): string {
  return `${(confidence * 100).toFixed(0)}%`;
}

export function formatSignedCents(value: number): string {
  const prefix = value >= 0 ? "+" : "";
  return `${prefix}${value.toFixed(2)}¢`;
}

export function formatSignedEdgePercent(value: number): string {
  const prefix = value >= 0 ? "+" : "";
  return `${prefix}${value.toFixed(2)}%`;
}

export function isGuardFailure(decision: TradeDecision): boolean {
  return (
    decision.action === "NO TRADE" &&
    decision.probability === null &&
    decision.expectedValue === null &&
    (decision.gatesTriggered?.length ?? 0) > 0
  );
}

export function formatGuardGateLabel(gateId: string): string {
  return gateId.replace(/^guard-/, "").replace(/-/g, " ");
}
