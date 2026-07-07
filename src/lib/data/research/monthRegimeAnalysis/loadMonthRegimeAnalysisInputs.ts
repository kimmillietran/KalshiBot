import { z } from "zod";

import type { HypothesisCandidatesReport } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import type { HypothesisValidationEntry } from "@/lib/data/research/hypothesisRobustness/hypothesisRobustnessTypes";
import { parseHypothesisCandidatesReport } from "@/lib/data/research/strategySynthesis/parseStrategySynthesisInputs";

import {
  MonthRegimeAnalysisError,
  MonthRegimeAnalysisErrorCode,
  type MonthRegimeAnalysisInputPaths,
  type MonthRegimeAnalysisInputStatus,
  type MonthRegimeAnalysisIo,
} from "./monthRegimeAnalysisTypes";

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
        signedCalibrationError: z.number().nullable(),
        edgeMatchesDirection: z.boolean(),
      }),
    ),
    quarterPeriods: z.array(
      z.object({
        periodKey: z.string(),
        observations: z.number().finite(),
        signedCalibrationError: z.number().nullable(),
        edgeMatchesDirection: z.boolean(),
      }),
    ),
    monthPersistenceRate: z.number().finite(),
    quarterPersistenceRate: z.number().finite(),
    scoreComponent: z.number().finite().optional(),
  }),
  regimeStability: z.object({
    regimes: z.array(
      z.object({
        regime: z.enum(["low", "medium", "high"]),
        observations: z.number().finite(),
        signedCalibrationError: z.number().nullable(),
        edgeMatchesDirection: z.boolean(),
      }),
    ),
    regimesWithEdge: z.number().finite(),
    regimesWithData: z.number().finite(),
    scoreComponent: z.number().finite().optional(),
  }),
  sampleConcentration: z.object({
    uniqueTradingDays: z.number().finite(),
    largestContributingDay: z.string().nullable(),
    largestDayObservations: z.number().finite(),
    largestDayPercent: z.number().finite(),
    singleDayDominated: z.boolean(),
    scoreComponent: z.number().finite().optional(),
  }),
  leaveOnePeriodOut: z.object({
    errorStdDev: z.number().finite(),
    errorVariance: z.number().finite().optional(),
    scoreComponent: z.number().finite().optional(),
    folds: z.array(
      z.object({
        excludedMonth: z.string(),
        remainingObservations: z.number().finite(),
        signedCalibrationError: z.number().nullable(),
      }),
    ),
  }),
});

const hypothesisValidationReportSchema = z.object({
  config: z
    .object({
      minCalibrationError: z.number().finite().optional(),
      minPeriodObservations: z.number().finite().optional(),
    })
    .optional(),
  validations: z.array(hypothesisValidationEntrySchema),
});

export type LoadedMonthRegimeValidationReport = {
  config: {
    minCalibrationError?: number;
    minPeriodObservations?: number;
  };
  validations: readonly HypothesisValidationEntry[];
};

export type LoadedMonthRegimeAnalysisInputs = {
  inputStatus: MonthRegimeAnalysisInputStatus;
  candidatesReport: HypothesisCandidatesReport | null;
  validationReport: LoadedMonthRegimeValidationReport | null;
};

function parseJson(path: string, raw: string): unknown {
  try {
    return JSON.parse(raw.replace(/^\uFEFF/, ""));
  } catch {
    throw new MonthRegimeAnalysisError(
      `Invalid JSON in ${path}`,
      MonthRegimeAnalysisErrorCode.INVALID_JSON,
    );
  }
}

function tryLoadCandidates(
  io: MonthRegimeAnalysisIo,
  path: string,
): HypothesisCandidatesReport | null {
  if (!io.fileExists(path)) {
    return null;
  }

  return parseHypothesisCandidatesReport(io.readFile(path));
}

function tryLoadValidation(
  io: MonthRegimeAnalysisIo,
  path: string,
): LoadedMonthRegimeValidationReport | null {
  if (!io.fileExists(path)) {
    return null;
  }

  const parsed = parseJson(path, io.readFile(path));
  const result = hypothesisValidationReportSchema.safeParse(parsed);
  if (!result.success) {
    throw new MonthRegimeAnalysisError(
      `Invalid hypothesis-validation.json schema in ${path}: ${result.error.message}`,
      MonthRegimeAnalysisErrorCode.INVALID_DOCUMENT,
    );
  }

  return {
    config: result.data.config ?? {},
    validations: result.data.validations as unknown as HypothesisValidationEntry[],
  };
}

/** Loads upstream artifacts for month/regime stability analysis. */
export function loadMonthRegimeAnalysisInputs(
  io: MonthRegimeAnalysisIo,
  inputPaths: MonthRegimeAnalysisInputPaths,
): LoadedMonthRegimeAnalysisInputs {
  const hypothesisCandidatesPresent = io.fileExists(inputPaths.hypothesisCandidatesPath);
  const hypothesisValidationPresent = io.fileExists(inputPaths.hypothesisValidationPath);
  const regimeTagsPresent = io.fileExists(inputPaths.regimeTagsPath);

  let candidatesReport: HypothesisCandidatesReport | null = null;
  let validationReport: LoadedMonthRegimeValidationReport | null = null;

  try {
    candidatesReport = tryLoadCandidates(io, inputPaths.hypothesisCandidatesPath);
    validationReport = tryLoadValidation(io, inputPaths.hypothesisValidationPath);
  } catch (error) {
    if (error instanceof MonthRegimeAnalysisError) {
      throw error;
    }

    throw new MonthRegimeAnalysisError(
      error instanceof Error ? error.message : "Failed to load month/regime analysis inputs",
      MonthRegimeAnalysisErrorCode.INVALID_DOCUMENT,
    );
  }

  return {
    inputStatus: {
      hypothesisCandidatesPresent,
      hypothesisValidationPresent,
      regimeTagsPresent,
    },
    candidatesReport,
    validationReport,
  };
}
