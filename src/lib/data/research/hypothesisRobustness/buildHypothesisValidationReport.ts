import { stableStringify } from "@/lib/trading/config/hashConfig";

import type { RegimeVolatilityByMarketKey } from "@/lib/data/research/mispricingAtlas/mispricingAtlasTypes";
import { loadRegimeVolatilityByMarket } from "@/lib/data/research/mispricingAtlas/loadRegimeVolatilityByMarket";
import { DEFAULT_MIN_CALIBRATION_ERROR } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import type { HypothesisCandidate } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";

import {
  buildValidationReasons,
  computeLeaveOnePeriodOutMetrics,
  computeRegimeStabilityMetrics,
  computeRobustnessScore,
  computeSampleConcentrationMetrics,
  computeTimeStabilityMetrics,
} from "./computeHypothesisRobustnessMetrics";
import { filterObservationsForAtlasBucket } from "./filterObservationsForAtlasBucket";
import {
  buildValidationObservationAccumulators,
} from "./buildValidationObservationAccumulators";
import { validateCandidateFromAccumulator } from "./computeHypothesisRobustnessMetricsFromAccumulator";
import { collectEnrichedMispricingObservations } from "./collectEnrichedMispricingObservations";
import { parseAtlasHypothesisCandidateId } from "./parseAtlasHypothesisCandidateId";
import {
  DEFAULT_HYPOTHESIS_VALIDATION_PASS_SCORE,
  DEFAULT_MIN_PERIOD_OBSERVATIONS,
  DEFAULT_SINGLE_DAY_CONCENTRATION_FLAG,
} from "./hypothesisRobustnessTypes";
import type {
  BuildHypothesisValidationReportInput,
  HypothesisRobustnessIo,
  HypothesisValidationConfig,
  HypothesisValidationEntry,
  HypothesisValidationReport,
  HypothesisValidationSummary,
} from "./hypothesisRobustnessTypes";

function resolveConfig(
  partial?: Partial<HypothesisValidationConfig>,
): HypothesisValidationConfig {
  return {
    passScoreThreshold:
      partial?.passScoreThreshold ?? DEFAULT_HYPOTHESIS_VALIDATION_PASS_SCORE,
    minCalibrationError:
      partial?.minCalibrationError ?? DEFAULT_MIN_CALIBRATION_ERROR,
    singleDayConcentrationFlag:
      partial?.singleDayConcentrationFlag ?? DEFAULT_SINGLE_DAY_CONCENTRATION_FLAG,
    minPeriodObservations:
      partial?.minPeriodObservations ?? DEFAULT_MIN_PERIOD_OBSERVATIONS,
  };
}

function emptyScoreComponents() {
  const emptyPeriods = {
    monthPeriods: [],
    quarterPeriods: [],
    monthPersistenceRate: 0,
    quarterPersistenceRate: 0,
    scoreComponent: 0,
  };

  return {
    timeStability: emptyPeriods,
    regimeStability: {
      regimes: [],
      regimesWithEdge: 0,
      regimesWithData: 0,
      scoreComponent: 0,
    },
    sampleConcentration: {
      uniqueTradingDays: 0,
      largestContributingDay: null,
      largestDayObservations: 0,
      largestDayPercent: 0,
      singleDayDominated: false,
      scoreComponent: 0,
    },
    leaveOnePeriodOut: {
      folds: [],
      errorVariance: 0,
      errorStdDev: 0,
      scoreComponent: 0,
    },
  };
}

export function validateCandidate(
  candidate: HypothesisCandidate,
  observations: BuildHypothesisValidationReportInput["observations"],
  regimeVolatilityByMarket: RegimeVolatilityByMarketKey,
  config: HypothesisValidationConfig,
): HypothesisValidationEntry {
  const atlasRef = parseAtlasHypothesisCandidateId(candidate.candidateId);

  if (!atlasRef) {
    const components = emptyScoreComponents();
    const reasons = buildValidationReasons({
      robustnessScore: 0,
      config,
      observationCount: 0,
      ...components,
      unsupported: true,
    });

    return {
      hypothesisId: candidate.candidateId,
      hypothesis: candidate.hypothesis,
      sourceArtifact: candidate.sourceArtifact,
      robustnessScore: 0,
      passes: false,
      reasons,
      observationCount: 0,
      ...components,
    };
  }

  const bucketObservations = filterObservationsForAtlasBucket(
    observations,
    atlasRef,
    regimeVolatilityByMarket,
  );

  if (bucketObservations.length === 0) {
    const components = emptyScoreComponents();
    const reasons = buildValidationReasons({
      robustnessScore: 0,
      config,
      observationCount: 0,
      ...components,
      unsupported: false,
    });

    return {
      hypothesisId: candidate.candidateId,
      hypothesis: candidate.hypothesis,
      sourceArtifact: candidate.sourceArtifact,
      robustnessScore: 0,
      passes: false,
      reasons,
      observationCount: 0,
      ...components,
    };
  }

  const timeStability = computeTimeStabilityMetrics(
    bucketObservations,
    atlasRef.direction,
    config,
  );
  const regimeStability = computeRegimeStabilityMetrics(
    bucketObservations,
    atlasRef.direction,
    config,
  );
  const sampleConcentration = computeSampleConcentrationMetrics(
    bucketObservations,
    config,
  );
  const leaveOnePeriodOut = computeLeaveOnePeriodOutMetrics(
    bucketObservations,
    atlasRef.direction,
    config,
  );

  const robustnessScore = computeRobustnessScore({
    timeStability,
    regimeStability,
    sampleConcentration,
    leaveOnePeriodOut,
  });

  const reasons = buildValidationReasons({
    robustnessScore,
    config,
    observationCount: bucketObservations.length,
    timeStability,
    regimeStability,
    sampleConcentration,
    leaveOnePeriodOut,
    unsupported: false,
  });

  const passes =
    robustnessScore >= config.passScoreThreshold
    && !sampleConcentration.singleDayDominated
    && bucketObservations.length >= config.minPeriodObservations * 2;

  return {
    hypothesisId: candidate.candidateId,
    hypothesis: candidate.hypothesis,
    sourceArtifact: candidate.sourceArtifact,
    robustnessScore,
    passes,
    reasons,
    observationCount: bucketObservations.length,
    timeStability,
    regimeStability,
    sampleConcentration,
    leaveOnePeriodOut,
  };
}

function buildSummary(
  validations: readonly HypothesisValidationEntry[],
): HypothesisValidationSummary {
  const passingCount = validations.filter((entry) => entry.passes).length;
  const averageRobustnessScore =
    validations.length === 0
      ? 0
      : Math.round(
          validations.reduce((total, entry) => total + entry.robustnessScore, 0)
          / validations.length,
        );

  return {
    totalHypotheses: validations.length,
    passingCount,
    failingCount: validations.length - passingCount,
    averageRobustnessScore,
  };
}

/** Builds deterministic hypothesis robustness validation for all candidates. */
export function buildHypothesisValidationReport(
  input: BuildHypothesisValidationReportInput,
): HypothesisValidationReport {
  const config = resolveConfig(input.config);

  const validations = [...input.candidates]
    .sort((left, right) => left.candidateId.localeCompare(right.candidateId))
    .map((candidate) =>
      validateCandidate(
        candidate,
        input.observations,
        input.regimeVolatilityByMarket,
        config,
      ),
    );

  return {
    generatedAt: input.generatedAt,
    outputPath: input.outputPath,
    htmlOutputPath: input.htmlOutputPath,
    inputPaths: input.inputPaths,
    config,
    summary: buildSummary(validations),
    validations,
  };
}

export function buildHypothesisValidationReportFromInputs(input: {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  inputPaths: BuildHypothesisValidationReportInput["inputPaths"];
  candidates: readonly HypothesisCandidate[];
  io: HypothesisRobustnessIo;
  config?: Partial<HypothesisValidationConfig>;
  memoryReport?: boolean;
}): HypothesisValidationReport {
  const config = resolveConfig(input.config);
  const accumulatorIndex = buildValidationObservationAccumulators({
    candidates: input.candidates,
    researchResultsDir: input.inputPaths.researchResultsDir,
    regimeTagsPath: input.inputPaths.regimeTagsPath,
    io: input.io,
    memoryReport: input.memoryReport,
  });

  const validations = [...input.candidates]
    .sort((left, right) => left.candidateId.localeCompare(right.candidateId))
    .map((candidate) => {
      const atlasRef = parseAtlasHypothesisCandidateId(candidate.candidateId);
      const validated = validateCandidateFromAccumulator({
        candidate,
        atlasRef,
        accumulator: atlasRef
          ? accumulatorIndex.getAccumulator(atlasRef)
          : undefined,
        config,
      });

      return {
        hypothesisId: candidate.candidateId,
        hypothesis: candidate.hypothesis,
        sourceArtifact: candidate.sourceArtifact,
        robustnessScore: validated.robustnessScore,
        passes: validated.passes,
        reasons: validated.reasons,
        observationCount: validated.observationCount,
        timeStability: validated.timeStability,
        regimeStability: validated.regimeStability,
        sampleConcentration: validated.sampleConcentration,
        leaveOnePeriodOut: validated.leaveOnePeriodOut,
      };
    });

  return {
    generatedAt: input.generatedAt,
    outputPath: input.outputPath,
    htmlOutputPath: input.htmlOutputPath,
    inputPaths: input.inputPaths,
    config,
    summary: buildSummary(validations),
    validations,
    ...(input.memoryReport
      ? { memoryDiagnostics: accumulatorIndex.memoryDiagnostics }
      : {}),
  };
}

/** @deprecated Prefer accumulator-based validation via buildHypothesisValidationReportFromInputs. */
export function buildHypothesisValidationReportFromObservations(input: {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  inputPaths: BuildHypothesisValidationReportInput["inputPaths"];
  candidates: readonly HypothesisCandidate[];
  io: HypothesisRobustnessIo;
  config?: Partial<HypothesisValidationConfig>;
}): HypothesisValidationReport {
  const observations = collectEnrichedMispricingObservations({
    researchResultsDir: input.inputPaths.researchResultsDir,
    regimeTagsPath: input.inputPaths.regimeTagsPath,
    io: input.io,
  });
  const regimeVolatilityByMarket = loadRegimeVolatilityByMarket(
    input.io,
    input.inputPaths.regimeTagsPath,
  );

  return buildHypothesisValidationReport({
    generatedAt: input.generatedAt,
    outputPath: input.outputPath,
    htmlOutputPath: input.htmlOutputPath,
    inputPaths: input.inputPaths,
    candidates: input.candidates,
    observations,
    regimeVolatilityByMarket,
    config: input.config,
  });
}

export function serializeHypothesisValidationReport(
  report: HypothesisValidationReport,
): string {
  return stableStringify(report);
}
