import { z } from "zod";

import {
  DEFAULT_HYPOTHESIS_CANDIDATES_OUTPUT_PATH,
} from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import { loadHypothesisCandidatesFromFile } from "@/lib/data/research/hypothesisRobustness/loadHypothesisValidationInputs";
import { DEFAULT_HYPOTHESIS_VALIDATION_OUTPUT_PATH } from "@/lib/data/research/hypothesisRobustness/hypothesisRobustnessTypes";
import type { HypothesisValidationEntry } from "@/lib/data/research/hypothesisRobustness/hypothesisRobustnessTypes";
import { DEFAULT_CROSS_VALIDATION_OUTPUT_PATH } from "@/lib/data/research/crossValidation/crossValidationTypes";
import type { CrossValidationEntry } from "@/lib/data/research/crossValidation/crossValidationTypes";
import type { HypothesisCandidate } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";

import {
  DEFAULT_HISTORICAL_COVERAGE_PLAN_PATH,
  DEFAULT_MIN_MONTHS_FOR_JUDGMENT,
  DEFAULT_MIN_OBSERVATIONS_FOR_JUDGMENT,
  DEFAULT_MIN_REGIMES_FOR_JUDGMENT,
  DEFAULT_MIN_TRADING_DAYS_FOR_JUDGMENT,
  DEFAULT_PROMISING_ROBUSTNESS_FLOOR,
  CoverageAwareValidationError,
} from "./coverageAwareValidationTypes";
import type {
  CoverageAwareValidationInputPaths,
  CoverageAwareValidationIo,
  HistoricalCoveragePlan,
  ParsedCoverageAwareValidationInputs,
} from "./coverageAwareValidationTypes";

const recommendedImportWindowSchema = z.object({
  windowId: z.string().trim().min(1),
  label: z.string().trim().min(1),
  startDate: z.string().trim().min(1),
  endDate: z.string().trim().min(1),
  rationale: z.string().trim().min(1),
  priority: z.enum(["high", "medium", "low"]),
});

const historicalCoveragePlanSchema = z.object({
  thresholds: z
    .object({
      minMonths: z.number().finite().optional(),
      minTradingDays: z.number().finite().optional(),
      minObservations: z.number().finite().optional(),
      minRegimesWithData: z.number().finite().optional(),
      minRobustnessScore: z.number().finite().optional(),
      promisingRobustnessFloor: z.number().finite().optional(),
    })
    .optional(),
  currentCoverage: z
    .object({
      earliestTradingDayUtc: z.string().nullable(),
      latestTradingDayUtc: z.string().nullable(),
      uniqueTradingDays: z.number().finite(),
      uniqueMonths: z.number().finite(),
    })
    .optional(),
  recommendedImportWindows: z.array(recommendedImportWindowSchema).optional(),
});

const crossValidationEntrySchema = z.object({
  targetId: z.string().trim().min(1),
  targetType: z.enum(["hypothesis", "synthesized-strategy"]),
  hypothesisId: z.string().trim().min(1),
  overallPasses: z.boolean(),
});

const crossValidationReportSchema = z.object({
  entries: z.array(crossValidationEntrySchema),
});

const hypothesisValidationEntrySchema = z.object({
  hypothesisId: z.string().trim().min(1),
  hypothesis: z.string().trim().min(1),
  sourceArtifact: z.string().trim().min(1),
  robustnessScore: z.number().finite(),
  passes: z.boolean(),
  reasons: z.array(z.string()),
  observationCount: z.number().finite(),
  timeStability: z.object({
    monthPeriods: z.array(
      z.object({
        periodKey: z.string(),
        observations: z.number().finite(),
      }),
    ),
    monthPersistenceRate: z.number().finite(),
  }),
  regimeStability: z.object({
    regimes: z.array(
      z.object({
        regime: z.enum(["low", "medium", "high"]),
        observations: z.number().finite(),
      }),
    ),
    regimesWithEdge: z.number().finite(),
    regimesWithData: z.number().finite(),
  }),
  sampleConcentration: z.object({
    uniqueTradingDays: z.number().finite(),
    largestDayPercent: z.number().finite(),
    singleDayDominated: z.boolean(),
  }),
  leaveOnePeriodOut: z.object({
    errorStdDev: z.number().finite(),
  }),
});

const hypothesisValidationReportSchema = z.object({
  validations: z.array(hypothesisValidationEntrySchema),
});

function parseJson(path: string, json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    throw new CoverageAwareValidationError(`Invalid JSON in ${path}`);
  }
}

export function buildDefaultCoverageAwareValidationInputPaths(options?: {
  hypothesisValidationPath?: string;
  crossValidationPath?: string;
  historicalCoveragePlanPath?: string;
  hypothesisCandidatesPath?: string;
}): CoverageAwareValidationInputPaths {
  return {
    hypothesisValidationPath:
      options?.hypothesisValidationPath ?? DEFAULT_HYPOTHESIS_VALIDATION_OUTPUT_PATH,
    crossValidationPath:
      options?.crossValidationPath ?? DEFAULT_CROSS_VALIDATION_OUTPUT_PATH,
    historicalCoveragePlanPath:
      options?.historicalCoveragePlanPath ?? DEFAULT_HISTORICAL_COVERAGE_PLAN_PATH,
    hypothesisCandidatesPath:
      options?.hypothesisCandidatesPath ?? DEFAULT_HYPOTHESIS_CANDIDATES_OUTPUT_PATH,
  };
}

function loadOptionalCoveragePlan(
  io: CoverageAwareValidationIo,
  path: string,
): HistoricalCoveragePlan | null {
  if (!io.fileExists(path)) {
    return null;
  }

  const parsed = parseJson(path, io.readFile(path));
  const result = historicalCoveragePlanSchema.safeParse(parsed);
  if (!result.success) {
    throw new CoverageAwareValidationError(
      `Invalid historical-coverage-plan.json schema in ${path}: ${result.error.message}`,
    );
  }

  return {
    thresholds: {
      minMonths: result.data.thresholds?.minMonths ?? DEFAULT_MIN_MONTHS_FOR_JUDGMENT,
      minTradingDays:
        result.data.thresholds?.minTradingDays ?? DEFAULT_MIN_TRADING_DAYS_FOR_JUDGMENT,
      minObservations:
        result.data.thresholds?.minObservations ?? DEFAULT_MIN_OBSERVATIONS_FOR_JUDGMENT,
      minRegimesWithData:
        result.data.thresholds?.minRegimesWithData ?? DEFAULT_MIN_REGIMES_FOR_JUDGMENT,
      minRobustnessScore: result.data.thresholds?.minRobustnessScore ?? 70,
      promisingRobustnessFloor:
        result.data.thresholds?.promisingRobustnessFloor ?? DEFAULT_PROMISING_ROBUSTNESS_FLOOR,
    },
    currentCoverage: result.data.currentCoverage ?? {
      earliestTradingDayUtc: null,
      latestTradingDayUtc: null,
      uniqueTradingDays: 0,
      uniqueMonths: 0,
    },
    recommendedImportWindows: result.data.recommendedImportWindows ?? [],
  };
}

function loadOptionalHypothesisValidations(
  io: CoverageAwareValidationIo,
  path: string,
): HypothesisValidationEntry[] {
  if (!io.fileExists(path)) {
    return [];
  }

  const parsed = parseJson(path, io.readFile(path));
  const result = hypothesisValidationReportSchema.safeParse(parsed);
  if (!result.success) {
    throw new CoverageAwareValidationError(
      `Invalid hypothesis-validation.json schema in ${path}: ${result.error.message}`,
    );
  }

  return result.data.validations as unknown as HypothesisValidationEntry[];
}

function loadOptionalCrossValidationEntries(
  io: CoverageAwareValidationIo,
  path: string,
): CrossValidationEntry[] {
  if (!io.fileExists(path)) {
    return [];
  }

  const parsed = parseJson(path, io.readFile(path));
  const result = crossValidationReportSchema.safeParse(parsed);
  if (!result.success) {
    throw new CoverageAwareValidationError(
      `Invalid cross-validation.json schema in ${path}: ${result.error.message}`,
    );
  }

  return result.data.entries as unknown as CrossValidationEntry[];
}

function loadOptionalHypothesisCandidates(
  io: CoverageAwareValidationIo,
  path: string,
): HypothesisCandidate[] {
  if (!io.fileExists(path)) {
    return [];
  }

  return loadHypothesisCandidatesFromFile(
    io as Parameters<typeof loadHypothesisCandidatesFromFile>[0],
    path,
  );
}

export function loadCoverageAwareValidationInputs(
  io: CoverageAwareValidationIo,
  inputPaths: CoverageAwareValidationInputPaths,
): ParsedCoverageAwareValidationInputs {
  return {
    candidates: loadOptionalHypothesisCandidates(io, inputPaths.hypothesisCandidatesPath),
    validations: loadOptionalHypothesisValidations(io, inputPaths.hypothesisValidationPath),
    crossValidationEntries: loadOptionalCrossValidationEntries(
      io,
      inputPaths.crossValidationPath,
    ),
    coveragePlan: loadOptionalCoveragePlan(io, inputPaths.historicalCoveragePlanPath),
  };
}
