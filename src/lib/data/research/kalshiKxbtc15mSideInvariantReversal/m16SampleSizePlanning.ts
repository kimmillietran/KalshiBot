/**
 * M16.0 incidence disposition — descriptive coverage only.
 *
 * Confirmatory sample-size / power / CI planning is intentionally ABSENT from
 * sealed M16.0 authority. Those belong to M16.1 before any outcome-open.
 * Do NOT estimate SD or edge from hidden economic outcomes during census.
 */
import type { M16IncidenceDisposition } from "./m16Types";

/**
 * Characterize blind census observability. Does NOT claim confirmatory
 * adequacy, powered N, or profitability-testing feasibility.
 */
export function decideM16IncidenceDisposition(input: {
  usableEntryCount: number;
  captureHours: number;
}): { disposition: M16IncidenceDisposition; rationale: string } {
  if (input.usableEntryCount <= 0 || input.captureHours <= 0) {
    return {
      disposition: "insufficient-census-observability",
      rationale:
        "Census produced no usable time-gate-eligible entries and/or zero "
        + "capture hours; cannot characterize incidence.",
    };
  }
  const rate = input.usableEntryCount / input.captureHours;
  return {
    disposition: "incidence-characterized",
    rationale:
      `Blind census observed ${input.usableEntryCount} time-gate-eligible `
      + `reversal confirmations over ${input.captureHours.toFixed(2)}h `
      + `(~${rate.toFixed(2)}/hour). Descriptive only — does not seal a `
      + `confirmatory N, dependence plan, or authorize outcome-open.`,
  };
}
