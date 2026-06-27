import type { PositionSizeEstimate } from "./types";

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

/** Stable reasoning lines for engine trace / Builder #2 wiring. */
export function buildPositionSizingReasoning(
  estimate: Pick<
    PositionSizeEstimate,
    | "side"
    | "rawKellyFraction"
    | "cappedFraction"
    | "recommendedFraction"
    | "recommendedDollars"
  > & {
    action: string;
    winProbability: number;
    askCents: number | null;
    confidence: number;
    kellyFraction: number;
    maxFraction: number;
    minFraction: number;
    minEdgePercent: number;
    edgePercent: number;
  },
): readonly string[] {
  const askLabel =
    estimate.askCents === null ? "n/a" : `${estimate.askCents.toFixed(2)}¢`;

  return [
    `action=${estimate.action} side=${estimate.side ?? "none"}`,
    `p(win)=${formatPercent(estimate.winProbability)} ask=${askLabel} edge=${estimate.edgePercent.toFixed(2)}% (min ${estimate.minEdgePercent.toFixed(2)}%)`,
    `rawKelly=${formatPercent(estimate.rawKellyFraction)} × fractional=${formatPercent(estimate.kellyFraction)} × confidence=${formatPercent(estimate.confidence)}`,
    `capped=${formatPercent(estimate.cappedFraction)} (max ${formatPercent(estimate.maxFraction)}, min ${formatPercent(estimate.minFraction)})`,
    `recommend=${formatPercent(estimate.recommendedFraction)}${estimate.recommendedDollars === null ? "" : ` ($${estimate.recommendedDollars.toFixed(2)})`}`,
  ];
}
