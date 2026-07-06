import { enumerateMonthRange, minCalendarMonth } from "./coveragePlannerDateUtils";

export type CoverageHorizonBounds = {
  configuredEarliestMonth: string | null;
  observedEarliestMonth: string | null;
  effectiveEarliestMonth: string | null;
  latestMonth: string | null;
  horizonExpandedByConfig: boolean;
  horizonMonths: string[];
};

/** Resolves configured and observed months into an effective coverage horizon. */
export function resolveCoverageHorizonBounds(input: {
  observedMonths: readonly string[];
  configuredEarliestMonth?: string;
}): CoverageHorizonBounds {
  const observedEarliestMonth = input.observedMonths[0] ?? null;
  const latestMonth = input.observedMonths.at(-1) ?? null;
  const configuredEarliestMonth = input.configuredEarliestMonth ?? null;

  let effectiveEarliestMonth = observedEarliestMonth;
  if (configuredEarliestMonth && observedEarliestMonth) {
    effectiveEarliestMonth = minCalendarMonth(
      configuredEarliestMonth,
      observedEarliestMonth,
    );
  } else if (configuredEarliestMonth) {
    effectiveEarliestMonth = configuredEarliestMonth;
  }

  const horizonExpandedByConfig =
    configuredEarliestMonth !== null
    && observedEarliestMonth !== null
    && configuredEarliestMonth < observedEarliestMonth;

  const horizonMonths =
    effectiveEarliestMonth && latestMonth
      ? enumerateMonthRange(effectiveEarliestMonth, latestMonth)
      : [];

  return {
    configuredEarliestMonth,
    observedEarliestMonth,
    effectiveEarliestMonth,
    latestMonth,
    horizonExpandedByConfig,
    horizonMonths,
  };
}
