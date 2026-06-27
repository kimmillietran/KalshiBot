import type { ExpectedValueEstimate } from "./types";

function formatCents(value: number): string {
  const prefix = value >= 0 ? "+" : "";
  return `${prefix}${value.toFixed(2)}¢`;
}

function formatPercent(value: number): string {
  const prefix = value >= 0 ? "+" : "";
  return `${prefix}${value.toFixed(2)}%`;
}

/** Stable reasoning lines for engine trace / Builder #2 wiring. */
export function buildExpectedValueReasoning(
  estimate: ExpectedValueEstimate,
): ExpectedValueEstimate["reasoning"] {
  const lines = [
    `fair YES ${estimate.fairYesCents.toFixed(2)}¢ · fair NO ${estimate.fairNoCents.toFixed(2)}¢`,
    `EV YES ${formatCents(estimate.netEvYesCents)} · EV NO ${formatCents(estimate.netEvNoCents)}`,
    `edge YES ${formatPercent(estimate.edgeYesPercent)} · edge NO ${formatPercent(estimate.edgeNoPercent)}`,
    `best=${estimate.bestSide ?? "none"} ${formatCents(estimate.bestEvCents)}`,
    `confidence=${(estimate.confidence * 100).toFixed(0)}%`,
  ];

  const bestLabel =
    estimate.bestSide === null
      ? "no tradable edge"
      : `${estimate.bestSide.toUpperCase()} ${formatCents(estimate.bestEvCents)}`;

  return {
    summary: `Expected value — ${bestLabel}`,
    lines,
  };
}
