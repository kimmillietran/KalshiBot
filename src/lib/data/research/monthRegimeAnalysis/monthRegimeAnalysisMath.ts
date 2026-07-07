import type { ParsedAtlasHypothesisRef } from "@/lib/data/research/hypothesisRobustness/hypothesisRobustnessTypes";
import type { ValidationGroupAggregate } from "@/lib/data/research/hypothesisRobustness/validationBucketAccumulator";

import type {
  MonthRegimeConfidenceInterval,
  MonthRegimeStabilitySummary,
} from "./monthRegimeAnalysisTypes";

const NORMAL_Z_95 = 1.9599639845;

export function roundMetric(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function formatMonthLabel(month: string): string {
  const [yearText, monthText] = month.split("-");
  const monthNumber = Number(monthText);
  const year = Number(yearText);
  if (!Number.isFinite(monthNumber) || !Number.isFinite(year)) {
    return month;
  }

  const labels = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const label = labels[monthNumber - 1];
  return label ? `${label} ${year}` : month;
}

export function formatMonthRange(months: readonly string[]): string {
  if (months.length === 0) {
    return "";
  }

  if (months.length === 1) {
    return formatMonthLabel(months[0]!);
  }

  return `${formatMonthLabel(months[0]!)}–${formatMonthLabel(months.at(-1)!)}`;
}

export function signedErrorFromAggregate(
  aggregate: ValidationGroupAggregate,
): number | null {
  if (aggregate.count === 0) {
    return null;
  }

  return roundMetric(
    aggregate.sumPredicted / aggregate.count - aggregate.sumOutcome / aggregate.count,
  );
}

export function averagesFromAggregate(
  aggregate: ValidationGroupAggregate,
): {
  averageImpliedProbability: number | null;
  realizedProbability: number | null;
} {
  if (aggregate.count === 0) {
    return { averageImpliedProbability: null, realizedProbability: null };
  }

  return {
    averageImpliedProbability: roundMetric(aggregate.sumPredicted / aggregate.count),
    realizedProbability: roundMetric(aggregate.sumOutcome / aggregate.count),
  };
}

export function edgeMatchesDirection(
  signedCalibrationError: number | null,
  direction: ParsedAtlasHypothesisRef["direction"],
  minCalibrationError: number,
): boolean {
  if (signedCalibrationError === null) {
    return false;
  }

  if (direction === "over") {
    return signedCalibrationError >= minCalibrationError;
  }

  return signedCalibrationError <= -minCalibrationError;
}

export function classifyEdgeDirection(input: {
  signedCalibrationError: number | null;
  direction: ParsedAtlasHypothesisRef["direction"];
  minCalibrationError: number;
  observations: number;
  minPeriodObservations: number;
}): "supports" | "reverses" | "neutral" | "insufficient-data" {
  if (input.observations < input.minPeriodObservations) {
    return "insufficient-data";
  }

  if (input.signedCalibrationError === null) {
    return "insufficient-data";
  }

  if (edgeMatchesDirection(input.signedCalibrationError, input.direction, input.minCalibrationError)) {
    return "supports";
  }

  const reverses =
    input.direction === "over"
      ? input.signedCalibrationError <= -input.minCalibrationError
      : input.signedCalibrationError >= input.minCalibrationError;

  if (reverses) {
    return "reverses";
  }

  return "neutral";
}

export function wilsonScoreInterval(
  successes: number,
  total: number,
): MonthRegimeConfidenceInterval | null {
  if (total <= 0) {
    return null;
  }

  const proportion = successes / total;
  const zSquared = NORMAL_Z_95 * NORMAL_Z_95;
  const denominator = 1 + zSquared / total;
  const center = proportion + zSquared / (2 * total);
  const margin =
    NORMAL_Z_95
    * Math.sqrt((proportion * (1 - proportion) + zSquared / (4 * total)) / total);

  return {
    lower: roundMetric(Math.max(0, (center - margin) / denominator)),
    upper: roundMetric(Math.min(1, (center + margin) / denominator)),
  };
}

export function realizedConfidenceInterval(
  aggregate: ValidationGroupAggregate,
): MonthRegimeConfidenceInterval | null {
  return wilsonScoreInterval(Math.round(aggregate.sumOutcome), aggregate.count);
}

export function computeInstabilityIndex(summary: {
  monthAgreementScore: number;
  regimeAgreementScore: number;
}): number {
  return roundMetric(
    1 - (summary.monthAgreementScore * 0.6 + summary.regimeAgreementScore * 0.4),
  );
}

export function computeRegimeRobustnessContribution(input: {
  edgeMatchesDirection: boolean;
  qualifiesForPersistence: boolean;
  regimesWithData: number;
}): number {
  if (!input.qualifiesForPersistence || !input.edgeMatchesDirection || input.regimesWithData === 0) {
    return 0;
  }

  const coverageFactor = Math.min(input.regimesWithData / 3, 1);
  return roundMetric((25 * coverageFactor) / input.regimesWithData);
}

export function groupConsecutiveMonths(months: readonly string[]): string[][] {
  if (months.length === 0) {
    return [];
  }

  const sorted = [...months].sort();
  const groups: string[][] = [[sorted[0]!]];

  for (let index = 1; index < sorted.length; index += 1) {
    const month = sorted[index]!;
    const previous = sorted[index - 1]!;
    const [prevYear, prevMonth] = previous.split("-").map(Number);
    const [year, monthNumber] = month.split("-").map(Number);

    const isAdjacent =
      year === prevYear && monthNumber === (prevMonth ?? 0) + 1
      || year === (prevYear ?? 0) + 1 && monthNumber === 1 && prevMonth === 12;

    if (isAdjacent) {
      groups.at(-1)?.push(month);
    } else {
      groups.push([month]);
    }
  }

  return groups;
}

export function buildMonthExplanation(input: {
  persistentMonths: readonly string[];
  reversingMonths: readonly string[];
}): string {
  const persistentGroups = groupConsecutiveMonths(input.persistentMonths);
  const reversingGroups = groupConsecutiveMonths(input.reversingMonths);

  const parts: string[] = [];

  if (persistentGroups.length > 0) {
    const persistentText = persistentGroups
      .map((group) => (group.length === 1 ? formatMonthLabel(group[0]!) : formatMonthRange(group)))
      .join(" and ");
    parts.push(`The edge exists primarily in ${persistentText}.`);
  }

  if (reversingGroups.length > 0) {
    const reversingText = reversingGroups
      .map((group) => (group.length === 1 ? formatMonthLabel(group[0]!) : formatMonthRange(group)))
      .join(" and ");
    parts.push(`It reverses in ${reversingText}.`);
  }

  if (parts.length === 0) {
    return "No month shows a persistent directional edge at current observation thresholds.";
  }

  return parts.join(" ");
}

export function buildRegimeExplanation(
  regimes: readonly {
    regime: string;
    edgeDirection: "supports" | "reverses" | "neutral" | "insufficient-data";
  }[],
): string {
  const supporting = regimes.filter((entry) => entry.edgeDirection === "supports");
  const reversing = regimes.filter((entry) => entry.edgeDirection === "reverses");

  if (supporting.length === 0 && reversing.length === 0) {
    return "No volatility regime shows a clear directional edge at current observation thresholds.";
  }

  const label = (regime: string) =>
    `${regime.charAt(0).toUpperCase()}${regime.slice(1)} volatility`;
  const parts: string[] = [];

  if (supporting.length > 0) {
    parts.push(`${supporting.map((entry) => label(entry.regime)).join(" and ")} supports the edge`);
  }

  if (reversing.length > 0) {
    parts.push(`${reversing.map((entry) => label(entry.regime)).join(" and ")} reverses it`);
  }

  return `${parts.join(" while ")}.`;
}

export function buildCombinedDiagnostic(
  summary: MonthRegimeStabilitySummary,
  monthExplanation: string,
  regimeExplanation: string,
): string {
  if (summary.instabilityIndex >= 0.65) {
    return `${monthExplanation} ${regimeExplanation} Instability index ${summary.instabilityIndex.toFixed(2)} indicates month/regime disagreement is the primary robustness drag.`;
  }

  if (summary.monthAgreementScore < summary.regimeAgreementScore) {
    return `${monthExplanation} Month persistence (${summary.monthAgreementScore.toFixed(2)}) is weaker than regime agreement (${summary.regimeAgreementScore.toFixed(2)}).`;
  }

  return `${regimeExplanation} ${monthExplanation}`;
}
