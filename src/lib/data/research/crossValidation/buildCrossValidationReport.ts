import { DEFAULT_MIN_CALIBRATION_ERROR } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import type { HypothesisCandidate } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import { filterObservationsForAtlasBucket } from "@/lib/data/research/hypothesisRobustness/filterObservationsForAtlasBucket";
import { parseAtlasHypothesisCandidateId } from "@/lib/data/research/hypothesisRobustness/parseAtlasHypothesisCandidateId";
import { DEFAULT_MIN_PERIOD_OBSERVATIONS } from "@/lib/data/research/hypothesisRobustness/hypothesisRobustnessTypes";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import { computeAllCrossValidationMethods } from "./computeCrossValidationMetrics";
import {
  CROSS_VALIDATION_METHOD_IDS,
  DEFAULT_BOOTSTRAP_ITERATIONS,
  DEFAULT_BOOTSTRAP_SEED,
  DEFAULT_MAX_ERROR_STD_DEV,
  DEFAULT_MIN_PERSISTENCE_RATE,
  DEFAULT_ROLLING_WINDOW_MONTHS,
} from "./crossValidationTypes";
import type {
  BuildCrossValidationReportInput,
  CrossValidationConfig,
  CrossValidationEntry,
  CrossValidationMethodId,
  CrossValidationReport,
  CrossValidationSummary,
  HypothesisValidationReference,
  ParsedHypothesisValidationRecord,
} from "./crossValidationTypes";

function resolveConfig(partial?: Partial<CrossValidationConfig>): CrossValidationConfig {
  return {
    rollingWindowMonths: partial?.rollingWindowMonths ?? DEFAULT_ROLLING_WINDOW_MONTHS,
    bootstrapIterations: partial?.bootstrapIterations ?? DEFAULT_BOOTSTRAP_ITERATIONS,
    bootstrapSeed: partial?.bootstrapSeed ?? DEFAULT_BOOTSTRAP_SEED,
    minPeriodObservations:
      partial?.minPeriodObservations ?? DEFAULT_MIN_PERIOD_OBSERVATIONS,
    minCalibrationError: partial?.minCalibrationError ?? DEFAULT_MIN_CALIBRATION_ERROR,
    maxErrorStdDev: partial?.maxErrorStdDev ?? DEFAULT_MAX_ERROR_STD_DEV,
    minPersistenceRate: partial?.minPersistenceRate ?? DEFAULT_MIN_PERSISTENCE_RATE,
  };
}

function emptyMethodResults(): CrossValidationEntry["methods"] {
  const emptyFold = {
    folds: [],
    calibrationError: null,
    variance: 0,
    observationCount: 0,
    passes: false,
    stabilityMetrics: {
      errorStdDev: 0,
      errorVariance: 0,
      persistenceRate: 0,
      coefficientOfVariation: null,
      qualifyingFoldCount: 0,
      totalFoldCount: 0,
    },
  };

  return {
    rollingWindow: { method: "rollingWindow", ...emptyFold },
    expandingWindow: { method: "expandingWindow", ...emptyFold },
    leaveOneMonthOut: { method: "leaveOneMonthOut", ...emptyFold },
    leaveOneRegimeOut: { method: "leaveOneRegimeOut", ...emptyFold },
    randomBootstrap: { method: "randomBootstrap", ...emptyFold },
  };
}

function buildValidationReference(
  hypothesisId: string,
  validations: readonly ParsedHypothesisValidationRecord[],
): HypothesisValidationReference | null {
  const entry = validations.find((validation) => validation.hypothesisId === hypothesisId);
  if (!entry) {
    return null;
  }

  return {
    robustnessScore: entry.robustnessScore,
    passes: entry.passes,
    leaveOnePeriodOutStdDev: entry.leaveOnePeriodOutStdDev,
  };
}

function buildCrossValidationEntry(input: {
  targetId: string;
  targetType: CrossValidationEntry["targetType"];
  hypothesisId: string;
  strategyId: string | null;
  strategyFamily: string | null;
  candidate: HypothesisCandidate | null;
  observations: BuildCrossValidationReportInput["observations"];
  regimeVolatilityByMarket: BuildCrossValidationReportInput["regimeVolatilityByMarket"];
  config: CrossValidationConfig;
  hypothesisValidations: readonly ParsedHypothesisValidationRecord[];
}): CrossValidationEntry {
  const atlasRef = input.candidate
    ? parseAtlasHypothesisCandidateId(input.candidate.candidateId)
    : null;

  if (!atlasRef) {
    return {
      targetId: input.targetId,
      targetType: input.targetType,
      hypothesisId: input.hypothesisId,
      strategyId: input.strategyId,
      strategyFamily: input.strategyFamily,
      direction: null,
      observationCount: 0,
      methods: emptyMethodResults(),
      hypothesisValidationReference: buildValidationReference(
        input.hypothesisId,
        input.hypothesisValidations,
      ),
      overallPasses: false,
    };
  }

  const bucketObservations = filterObservationsForAtlasBucket(
    input.observations,
    atlasRef,
    input.regimeVolatilityByMarket,
  );

  if (bucketObservations.length === 0) {
    return {
      targetId: input.targetId,
      targetType: input.targetType,
      hypothesisId: input.hypothesisId,
      strategyId: input.strategyId,
      strategyFamily: input.strategyFamily,
      direction: atlasRef.direction,
      observationCount: 0,
      methods: emptyMethodResults(),
      hypothesisValidationReference: buildValidationReference(
        input.hypothesisId,
        input.hypothesisValidations,
      ),
      overallPasses: false,
    };
  }

  const methods = computeAllCrossValidationMethods(
    bucketObservations,
    atlasRef.direction,
    input.config,
  );
  const overallPasses = CROSS_VALIDATION_METHOD_IDS.every(
    (methodId) => methods[methodId].passes,
  );

  return {
    targetId: input.targetId,
    targetType: input.targetType,
    hypothesisId: input.hypothesisId,
    strategyId: input.strategyId,
    strategyFamily: input.strategyFamily,
    direction: atlasRef.direction,
    observationCount: bucketObservations.length,
    methods,
    hypothesisValidationReference: buildValidationReference(
      input.hypothesisId,
      input.hypothesisValidations,
    ),
    overallPasses,
  };
}

function buildSummary(entries: readonly CrossValidationEntry[]): CrossValidationSummary {
  const passingCount = entries.filter((entry) => entry.overallPasses).length;
  const methodPassRates = Object.fromEntries(
    CROSS_VALIDATION_METHOD_IDS.map((methodId) => {
      const passing = entries.filter((entry) => entry.methods[methodId].passes).length;
      return [
        methodId,
        entries.length === 0 ? 0 : Math.round((passing / entries.length) * 100) / 100,
      ];
    }),
  ) as Record<CrossValidationMethodId, number>;

  return {
    totalTargets: entries.length,
    hypothesisCount: entries.filter((entry) => entry.targetType === "hypothesis").length,
    synthesizedStrategyCount: entries.filter(
      (entry) => entry.targetType === "synthesized-strategy",
    ).length,
    passingCount,
    failingCount: entries.length - passingCount,
    methodPassRates,
  };
}

/** Builds cross-validation diagnostics for hypotheses and synthesized strategies. */
export function buildCrossValidationReport(
  input: BuildCrossValidationReportInput,
): CrossValidationReport {
  const config = resolveConfig(input.config);
  const candidateById = new Map(
    input.candidates.map((candidate) => [candidate.candidateId, candidate]),
  );

  const entries: CrossValidationEntry[] = [];

  for (const candidate of [...input.candidates].sort((left, right) =>
    left.candidateId.localeCompare(right.candidateId),
  )) {
    entries.push(
      buildCrossValidationEntry({
        targetId: candidate.candidateId,
        targetType: "hypothesis",
        hypothesisId: candidate.candidateId,
        strategyId: null,
        strategyFamily: null,
        candidate,
        observations: input.observations,
        regimeVolatilityByMarket: input.regimeVolatilityByMarket,
        config,
        hypothesisValidations: input.hypothesisValidations,
      }),
    );
  }

  for (const strategy of [...input.synthesizedStrategies].sort((left, right) =>
    left.strategyId.localeCompare(right.strategyId),
  )) {
    const candidate = candidateById.get(strategy.hypothesisId) ?? null;
    entries.push(
      buildCrossValidationEntry({
        targetId: strategy.strategyId,
        targetType: "synthesized-strategy",
        hypothesisId: strategy.hypothesisId,
        strategyId: strategy.strategyId,
        strategyFamily: strategy.strategyFamily,
        candidate,
        observations: input.observations,
        regimeVolatilityByMarket: input.regimeVolatilityByMarket,
        config,
        hypothesisValidations: input.hypothesisValidations,
      }),
    );
  }

  return {
    generatedAt: input.generatedAt,
    outputPath: input.outputPath,
    htmlOutputPath: input.htmlOutputPath,
    inputPaths: input.inputPaths,
    config,
    summary: buildSummary(entries),
    entries,
  };
}

export function serializeCrossValidationReport(report: CrossValidationReport): string {
  return stableStringify(report);
}
