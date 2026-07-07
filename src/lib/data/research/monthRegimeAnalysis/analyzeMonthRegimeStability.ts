import type { HypothesisCandidate } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import type {
  HypothesisValidationEntry,
  ParsedAtlasHypothesisRef,
  VolatilityRegimeTag,
} from "@/lib/data/research/hypothesisRobustness/hypothesisRobustnessTypes";
import { parseAtlasHypothesisCandidateId } from "@/lib/data/research/hypothesisRobustness/parseAtlasHypothesisCandidateId";
import type { ValidationBucketAccumulator } from "@/lib/data/research/hypothesisRobustness/validationBucketAccumulator";

import {
  averagesFromAggregate,
  buildCombinedDiagnostic,
  buildMonthExplanation,
  buildRegimeExplanation,
  classifyEdgeDirection,
  computeInstabilityIndex,
  computeRegimeRobustnessContribution,
  edgeMatchesDirection,
  formatMonthLabel,
  realizedConfidenceInterval,
  roundMetric,
  signedErrorFromAggregate,
} from "./monthRegimeAnalysisMath";
import type {
  MonthRegimeHeatmapCell,
  MonthRegimeHypothesisAnalysis,
  MonthRegimeStabilitySummary,
  MonthStabilityMetric,
  RegimeStabilityMetric,
} from "./monthRegimeAnalysisTypes";

export type MonthRegimeAnalysisConfig = {
  minCalibrationError: number;
  minPeriodObservations: number;
};

export type MonthRegimeCrossTab = Map<string, ValidationGroupAggregateLike>;

export type ValidationGroupAggregateLike = {
  count: number;
  sumPredicted: number;
  sumOutcome: number;
};

const REGIME_ORDER: readonly VolatilityRegimeTag[] = ["low", "medium", "high"];

function monthRegimeKey(month: string, regime: VolatilityRegimeTag): string {
  return `${month}::${regime}`;
}

function buildMonthMetric(input: {
  month: string;
  aggregate: ValidationGroupAggregateLike;
  direction: ParsedAtlasHypothesisRef["direction"];
  config: MonthRegimeAnalysisConfig;
}): MonthStabilityMetric {
  const signedCalibrationError = signedErrorFromAggregate(input.aggregate);
  const { averageImpliedProbability, realizedProbability } = averagesFromAggregate(input.aggregate);
  const edgeDirection = classifyEdgeDirection({
    signedCalibrationError,
    direction: input.direction,
    minCalibrationError: input.config.minCalibrationError,
    observations: input.aggregate.count,
    minPeriodObservations: input.config.minPeriodObservations,
  });
  const matches = edgeMatchesDirection(
    signedCalibrationError,
    input.direction,
    input.config.minCalibrationError,
  );

  return {
    month: input.month,
    monthLabel: formatMonthLabel(input.month),
    observations: input.aggregate.count,
    averageImpliedProbability,
    realizedProbability,
    signedCalibrationError,
    calibrationErrorMagnitude:
      signedCalibrationError === null ? null : roundMetric(Math.abs(signedCalibrationError)),
    edgeDirection,
    edgeMatchesDirection: matches,
    confidenceInterval: realizedConfidenceInterval(input.aggregate),
    qualifiesForPersistence: input.aggregate.count >= input.config.minPeriodObservations,
  };
}

function buildRegimeMetric(input: {
  regime: VolatilityRegimeTag;
  aggregate: ValidationGroupAggregateLike;
  direction: ParsedAtlasHypothesisRef["direction"];
  config: MonthRegimeAnalysisConfig;
  regimesWithData: number;
}): RegimeStabilityMetric {
  const signedCalibrationError = signedErrorFromAggregate(input.aggregate);
  const { averageImpliedProbability, realizedProbability } = averagesFromAggregate(input.aggregate);
  const edgeDirection = classifyEdgeDirection({
    signedCalibrationError,
    direction: input.direction,
    minCalibrationError: input.config.minCalibrationError,
    observations: input.aggregate.count,
    minPeriodObservations: input.config.minPeriodObservations,
  });
  const matches = edgeMatchesDirection(
    signedCalibrationError,
    input.direction,
    input.config.minCalibrationError,
  );
  const qualifiesForPersistence = input.aggregate.count >= input.config.minPeriodObservations;

  return {
    regime: input.regime,
    observations: input.aggregate.count,
    averageImpliedProbability,
    realizedProbability,
    signedCalibrationError,
    calibrationErrorMagnitude:
      signedCalibrationError === null ? null : roundMetric(Math.abs(signedCalibrationError)),
    edgeDirection,
    edgeMatchesDirection: matches,
    robustnessContribution: computeRegimeRobustnessContribution({
      edgeMatchesDirection: matches,
      qualifiesForPersistence,
      regimesWithData: input.regimesWithData,
    }),
    qualifiesForPersistence,
  };
}

function buildHeatmapCells(input: {
  crossTab: MonthRegimeCrossTab;
  direction: ParsedAtlasHypothesisRef["direction"];
  config: MonthRegimeAnalysisConfig;
}): MonthRegimeHeatmapCell[] {
  const cells: MonthRegimeHeatmapCell[] = [];

  for (const [key, aggregate] of input.crossTab.entries()) {
    const [month, regimeText] = key.split("::");
    if (!month || !regimeText) {
      continue;
    }

    const regime = regimeText as VolatilityRegimeTag;
    const signedCalibrationError = signedErrorFromAggregate(aggregate);
    cells.push({
      month,
      regime,
      observations: aggregate.count,
      signedCalibrationError,
      edgeDirection: classifyEdgeDirection({
        signedCalibrationError,
        direction: input.direction,
        minCalibrationError: input.config.minCalibrationError,
        observations: aggregate.count,
        minPeriodObservations: input.config.minPeriodObservations,
      }),
    });
  }

  return cells.sort((left, right) => {
    const monthCompare = left.month.localeCompare(right.month);
    if (monthCompare !== 0) {
      return monthCompare;
    }

    return REGIME_ORDER.indexOf(left.regime) - REGIME_ORDER.indexOf(right.regime);
  });
}

function buildSummary(input: {
  months: readonly MonthStabilityMetric[];
  regimes: readonly RegimeStabilityMetric[];
  validation: HypothesisValidationEntry;
}): MonthRegimeStabilitySummary {
  const qualifyingMonths = input.months.filter((month) => month.qualifiesForPersistence);
  const persistentMonths = qualifyingMonths
    .filter((month) => month.edgeMatchesDirection)
    .map((month) => month.month);
  const reversingMonths = qualifyingMonths
    .filter((month) => month.edgeDirection === "reverses")
    .map((month) => month.month);

  const strongestMonth = [...qualifyingMonths]
    .sort((left, right) => {
      const leftScore =
        (left.edgeMatchesDirection ? 1 : 0) * 100
        + Math.abs(left.signedCalibrationError ?? 0) * 50;
      const rightScore =
        (right.edgeMatchesDirection ? 1 : 0) * 100
        + Math.abs(right.signedCalibrationError ?? 0) * 50;
      return rightScore - leftScore;
    })
    .at(0)?.month ?? null;

  const weakestMonth = [...qualifyingMonths]
    .sort((left, right) => {
      const leftWeakness =
        (left.edgeDirection === "reverses" ? 1 : 0) * 100
        + Math.abs(left.signedCalibrationError ?? 0) * 30;
      const rightWeakness =
        (right.edgeDirection === "reverses" ? 1 : 0) * 100
        + Math.abs(right.signedCalibrationError ?? 0) * 30;
      return rightWeakness - leftWeakness;
    })
    .at(0)?.month ?? null;

  const monthAgreementScore = roundMetric(input.validation.timeStability.monthPersistenceRate);
  const regimesWithData = input.validation.regimeStability.regimesWithData;
  const regimesWithEdge = input.validation.regimeStability.regimesWithEdge;
  const regimeAgreementScore =
    regimesWithData > 0 ? roundMetric(regimesWithEdge / regimesWithData) : 0;

  const monthPersistenceRate = monthAgreementScore;
  const instabilityIndex = computeInstabilityIndex({
    monthAgreementScore,
    regimeAgreementScore,
  });

  return {
    strongestMonth,
    weakestMonth,
    reversingMonths,
    persistentMonths,
    regimeAgreementScore,
    monthAgreementScore,
    instabilityIndex,
    monthPersistenceRate,
    regimesWithEdge,
    regimesWithData,
  };
}

function resolveDirection(
  validation: HypothesisValidationEntry,
  candidate: HypothesisCandidate | null,
): ParsedAtlasHypothesisRef["direction"] {
  if (candidate) {
    const reference = parseAtlasHypothesisCandidateId(candidate.candidateId);
    if (reference) {
      return reference.direction;
    }
  }

  const positiveMonths = validation.timeStability.monthPeriods.filter(
    (period) => (period.signedCalibrationError ?? 0) > 0,
  ).length;
  const negativeMonths = validation.timeStability.monthPeriods.filter(
    (period) => (period.signedCalibrationError ?? 0) < 0,
  ).length;

  return positiveMonths >= negativeMonths ? "over" : "under";
}

/** Analyzes month and regime stability for one hypothesis validation entry. */
export function analyzeMonthRegimeStability(input: {
  validation: HypothesisValidationEntry;
  candidate: HypothesisCandidate | null;
  accumulator: ValidationBucketAccumulator | null;
  crossTab: MonthRegimeCrossTab | null;
  config: MonthRegimeAnalysisConfig;
}): MonthRegimeHypothesisAnalysis {
  const direction = resolveDirection(input.validation, input.candidate);

  const monthKeys = new Set<string>([
    ...input.validation.timeStability.monthPeriods.map((period) => period.periodKey),
    ...(input.accumulator ? [...input.accumulator.byMonth.keys()] : []),
    ...(input.crossTab
      ? [...input.crossTab.keys()].map((key) => key.split("::")[0]!).filter(Boolean)
      : []),
  ]);

  const months = [...monthKeys]
    .sort()
    .map((month) => {
      const validationPeriod = input.validation.timeStability.monthPeriods.find(
        (period) => period.periodKey === month,
      );
      const aggregate = input.accumulator?.byMonth.get(month);

      if (aggregate) {
        return buildMonthMetric({
          month,
          aggregate,
          direction,
          config: input.config,
        });
      }

      if (validationPeriod) {
        return buildMonthMetricFromValidationPeriod({
          month,
          validationPeriod,
          direction,
          config: input.config,
        });
      }

      return buildMonthMetric({
        month,
        aggregate: { count: 0, sumPredicted: 0, sumOutcome: 0 },
        direction,
        config: input.config,
      });
    });

  const regimesWithData = input.validation.regimeStability.regimes.filter(
    (regime) => regime.observations >= input.config.minPeriodObservations,
  ).length;

  const regimes = REGIME_ORDER.map((regime) => {
    const fromAccumulator = input.accumulator?.byRegime.get(regime);
    if (fromAccumulator) {
      return buildRegimeMetric({
        regime,
        aggregate: fromAccumulator,
        direction,
        config: input.config,
        regimesWithData,
      });
    }

    const validationRegime = input.validation.regimeStability.regimes.find(
      (entry) => entry.regime === regime,
    );
    if (validationRegime) {
      return buildRegimeMetricFromValidation({
        regime,
        validationRegime,
        direction,
        config: input.config,
        regimesWithData,
      });
    }

    return buildRegimeMetric({
      regime,
      aggregate: { count: 0, sumPredicted: 0, sumOutcome: 0 },
      direction,
      config: input.config,
      regimesWithData,
    });
  });

  const summary = buildSummary({ months, regimes, validation: input.validation });
  const monthExplanation = buildMonthExplanation({
    persistentMonths: summary.persistentMonths,
    reversingMonths: summary.reversingMonths,
  });
  const regimeExplanation = buildRegimeExplanation(regimes);
  const combinedDiagnostic = buildCombinedDiagnostic(
    summary,
    monthExplanation,
    regimeExplanation,
  );

  return {
    hypothesisId: input.validation.hypothesisId,
    hypothesis: input.candidate?.hypothesis ?? input.validation.hypothesisId,
    direction,
    robustnessScore: input.validation.robustnessScore,
    passes: input.validation.passes,
    observationCount: input.validation.observationCount,
    months,
    regimes,
    heatmap: buildHeatmapCells({
      crossTab: input.crossTab ?? new Map(),
      direction,
      config: input.config,
    }),
    summary,
    monthExplanation,
    regimeExplanation,
    combinedDiagnostic,
  };
}

function buildMonthMetricFromValidationPeriod(input: {
  month: string;
  validationPeriod: {
    observations: number;
    signedCalibrationError: number | null;
    edgeMatchesDirection: boolean;
  };
  direction: ParsedAtlasHypothesisRef["direction"];
  config: MonthRegimeAnalysisConfig;
}): MonthStabilityMetric {
  const signedCalibrationError = input.validationPeriod.signedCalibrationError;
  const edgeDirection = classifyEdgeDirection({
    signedCalibrationError,
    direction: input.direction,
    minCalibrationError: input.config.minCalibrationError,
    observations: input.validationPeriod.observations,
    minPeriodObservations: input.config.minPeriodObservations,
  });

  return {
    month: input.month,
    monthLabel: formatMonthLabel(input.month),
    observations: input.validationPeriod.observations,
    averageImpliedProbability: null,
    realizedProbability: null,
    signedCalibrationError,
    calibrationErrorMagnitude:
      signedCalibrationError === null ? null : roundMetric(Math.abs(signedCalibrationError)),
    edgeDirection,
    edgeMatchesDirection: input.validationPeriod.edgeMatchesDirection,
    confidenceInterval: null,
    qualifiesForPersistence:
      input.validationPeriod.observations >= input.config.minPeriodObservations,
  };
}

function buildRegimeMetricFromValidation(input: {
  regime: VolatilityRegimeTag;
  validationRegime: {
    observations: number;
    signedCalibrationError: number | null;
    edgeMatchesDirection: boolean;
  };
  direction: ParsedAtlasHypothesisRef["direction"];
  config: MonthRegimeAnalysisConfig;
  regimesWithData: number;
}): RegimeStabilityMetric {
  const signedCalibrationError = input.validationRegime.signedCalibrationError;
  const edgeDirection = classifyEdgeDirection({
    signedCalibrationError,
    direction: input.direction,
    minCalibrationError: input.config.minCalibrationError,
    observations: input.validationRegime.observations,
    minPeriodObservations: input.config.minPeriodObservations,
  });
  const qualifiesForPersistence =
    input.validationRegime.observations >= input.config.minPeriodObservations;

  return {
    regime: input.regime,
    observations: input.validationRegime.observations,
    averageImpliedProbability: null,
    realizedProbability: null,
    signedCalibrationError,
    calibrationErrorMagnitude:
      signedCalibrationError === null ? null : roundMetric(Math.abs(signedCalibrationError)),
    edgeDirection,
    edgeMatchesDirection: input.validationRegime.edgeMatchesDirection,
    robustnessContribution: computeRegimeRobustnessContribution({
      edgeMatchesDirection: input.validationRegime.edgeMatchesDirection,
      qualifiesForPersistence,
      regimesWithData: input.regimesWithData,
    }),
    qualifiesForPersistence,
  };
}

export function monthRegimeCrossTabKey(month: string, regime: VolatilityRegimeTag): string {
  return monthRegimeKey(month, regime);
}
