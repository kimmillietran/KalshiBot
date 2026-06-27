import type { DecisionPolicyResult } from "./types";

function formatPercent(value: number): string {
  const prefix = value >= 0 ? "+" : "";
  return `${prefix}${value.toFixed(2)}%`;
}

/** Stable reasoning lines for engine trace / Builder #2 wiring. */
export function buildDecisionPolicyReasoning(
  result: Pick<
    DecisionPolicyResult,
    "action" | "selectedSide" | "reasonCode" | "confidence"
  > & {
    minConfidence: number;
    minEdgePercent: number;
    edgeYesPercent: number;
    edgeNoPercent: number;
    netEvYesCents: number;
    netEvNoCents: number;
    yesQualifies: boolean;
    noQualifies: boolean;
  },
): readonly string[] {
  return [
    `action=${result.action} side=${result.selectedSide ?? "none"} reason=${result.reasonCode}`,
    `confidence=${(result.confidence * 100).toFixed(0)}% (min ${(result.minConfidence * 100).toFixed(0)}%)`,
    `edge YES ${formatPercent(result.edgeYesPercent)} · edge NO ${formatPercent(result.edgeNoPercent)} (min ${result.minEdgePercent.toFixed(2)}%)`,
    `net EV YES ${result.netEvYesCents.toFixed(2)}¢ · net EV NO ${result.netEvNoCents.toFixed(2)}¢`,
    `qualifies YES=${result.yesQualifies} NO=${result.noQualifies}`,
  ];
}
