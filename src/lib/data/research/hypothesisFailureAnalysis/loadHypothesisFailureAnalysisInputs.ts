import { z } from "zod";

import {
  DEFAULT_HYPOTHESIS_CANDIDATES_OUTPUT_PATH,
} from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import { loadHypothesisCandidatesFromFile } from "@/lib/data/research/hypothesisRobustness/loadHypothesisValidationInputs";
import { DEFAULT_HYPOTHESIS_VALIDATION_OUTPUT_PATH } from "@/lib/data/research/hypothesisRobustness/hypothesisRobustnessTypes";
import type { HypothesisValidationEntry } from "@/lib/data/research/hypothesisRobustness/hypothesisRobustnessTypes";
import { DEFAULT_MISPRICING_ATLAS_INPUT_PATH } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import {
  DEFAULT_COVERAGE_AWARE_VALIDATION_OUTPUT_PATH,
} from "@/lib/data/research/coverageAwareValidation/coverageAwareValidationTypes";
import type { CoverageAwareValidationEntry } from "@/lib/data/research/coverageAwareValidation/coverageAwareValidationTypes";
import { DEFAULT_CROSS_VALIDATION_OUTPUT_PATH } from "@/lib/data/research/crossValidation/crossValidationTypes";
import type { CrossValidationEntry } from "@/lib/data/research/crossValidation/crossValidationTypes";
import { DEFAULT_HYPOTHESIS_HISTORY_OUTPUT_PATH } from "@/lib/data/research/hypothesisEvolution/hypothesisEvolutionTypes";
import type { HypothesisHistoryDocument } from "@/lib/data/research/hypothesisEvolution/hypothesisEvolutionTypes";
import type { MispricingAtlas } from "@/lib/data/research/mispricingAtlas/mispricingAtlasTypes";
import type { HypothesisCandidate } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";

import {
  HypothesisFailureAnalysisError,
  type HypothesisFailureAnalysisInputPaths,
  type HypothesisFailureAnalysisInputStatus,
  type HypothesisFailureAnalysisIo,
  type ParsedHypothesisFailureAnalysisInputs,
} from "./hypothesisFailureAnalysisTypes";

const coverageEntrySchema = z.object({
  hypothesisId: z.string().trim().min(1),
  classification: z.string(),
});

const coverageReportSchema = z.object({
  entries: z.array(coverageEntrySchema),
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
  }),
  sampleConcentration: z.object({
    uniqueTradingDays: z.number().finite(),
    largestContributingDay: z.string().nullable(),
    largestDayObservations: z.number().finite(),
    largestDayPercent: z.number().finite(),
    singleDayDominated: z.boolean(),
  }),
  leaveOnePeriodOut: z.object({
    errorStdDev: z.number().finite(),
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
      passScoreThreshold: z.number().finite().optional(),
    })
    .optional(),
  validations: z.array(hypothesisValidationEntrySchema),
});

const mispricingAtlasSchema = z.object({
  generatedAt: z.string(),
  outputPath: z.string(),
  sampleCounts: z.record(z.string(), z.number()),
});

const hypothesisHistorySchema = z.object({
  runs: z.array(
    z.object({
      runId: z.string(),
      snapshotsByHypothesisId: z.record(z.string(), z.object({
        robustnessScore: z.number().finite(),
        passes: z.boolean(),
      })),
    }),
  ),
});

function parseJson(path: string, json: string): unknown {
  try {
    return JSON.parse(json.replace(/^\uFEFF/, ""));
  } catch {
    throw new HypothesisFailureAnalysisError(`Invalid JSON in ${path}`);
  }
}

export function buildDefaultHypothesisFailureAnalysisInputPaths(options?: {
  hypothesisCandidatesPath?: string;
  hypothesisValidationPath?: string;
  mispricingAtlasPath?: string;
  coverageAwareValidationPath?: string;
  crossValidationPath?: string;
  hypothesisHistoryPath?: string;
}): HypothesisFailureAnalysisInputPaths {
  return {
    hypothesisCandidatesPath:
      options?.hypothesisCandidatesPath ?? DEFAULT_HYPOTHESIS_CANDIDATES_OUTPUT_PATH,
    hypothesisValidationPath:
      options?.hypothesisValidationPath ?? DEFAULT_HYPOTHESIS_VALIDATION_OUTPUT_PATH,
    mispricingAtlasPath:
      options?.mispricingAtlasPath ?? DEFAULT_MISPRICING_ATLAS_INPUT_PATH,
    coverageAwareValidationPath:
      options?.coverageAwareValidationPath ?? DEFAULT_COVERAGE_AWARE_VALIDATION_OUTPUT_PATH,
    crossValidationPath:
      options?.crossValidationPath ?? DEFAULT_CROSS_VALIDATION_OUTPUT_PATH,
    hypothesisHistoryPath:
      options?.hypothesisHistoryPath ?? DEFAULT_HYPOTHESIS_HISTORY_OUTPUT_PATH,
  };
}

function buildInputStatus(
  io: HypothesisFailureAnalysisIo,
  inputPaths: HypothesisFailureAnalysisInputPaths,
): HypothesisFailureAnalysisInputStatus {
  return {
    hypothesisCandidatesPresent: io.fileExists(inputPaths.hypothesisCandidatesPath),
    hypothesisValidationPresent: io.fileExists(inputPaths.hypothesisValidationPath),
    mispricingAtlasPresent: io.fileExists(inputPaths.mispricingAtlasPath),
    coverageAwareValidationPresent: io.fileExists(inputPaths.coverageAwareValidationPath),
    crossValidationPresent: io.fileExists(inputPaths.crossValidationPath),
    hypothesisHistoryPresent: io.fileExists(inputPaths.hypothesisHistoryPath),
  };
}

function loadOptionalValidations(
  io: HypothesisFailureAnalysisIo,
  path: string,
): { validations: HypothesisValidationEntry[]; passThreshold: number | null } {
  if (!io.fileExists(path)) {
    return { validations: [], passThreshold: null };
  }

  const parsed = parseJson(path, io.readFile(path));
  const result = hypothesisValidationReportSchema.safeParse(parsed);
  if (!result.success) {
    throw new HypothesisFailureAnalysisError(
      `Invalid hypothesis-validation.json schema in ${path}: ${result.error.message}`,
    );
  }

  return {
    validations: result.data.validations as unknown as HypothesisValidationEntry[],
    passThreshold: result.data.config?.passScoreThreshold ?? null,
  };
}

function loadOptionalCandidates(
  io: HypothesisFailureAnalysisIo,
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

function loadOptionalMispricingAtlas(
  io: HypothesisFailureAnalysisIo,
  path: string,
): MispricingAtlas | null {
  if (!io.fileExists(path)) {
    return null;
  }

  const parsed = parseJson(path, io.readFile(path));
  const result = mispricingAtlasSchema.safeParse(parsed);
  if (!result.success) {
    return parsed as MispricingAtlas;
  }

  return parsed as MispricingAtlas;
}

function loadOptionalCoverageEntries(
  io: HypothesisFailureAnalysisIo,
  path: string,
): CoverageAwareValidationEntry[] {
  if (!io.fileExists(path)) {
    return [];
  }

  const parsed = parseJson(path, io.readFile(path));
  const result = coverageReportSchema.safeParse(parsed);
  if (!result.success) {
    throw new HypothesisFailureAnalysisError(
      `Invalid coverage-aware-validation.json schema in ${path}: ${result.error.message}`,
    );
  }

  return (parsed as { entries: CoverageAwareValidationEntry[] }).entries;
}

function loadOptionalCrossValidationEntries(
  io: HypothesisFailureAnalysisIo,
  path: string,
): CrossValidationEntry[] {
  if (!io.fileExists(path)) {
    return [];
  }

  const parsed = parseJson(path, io.readFile(path));
  const result = crossValidationReportSchema.safeParse(parsed);
  if (!result.success) {
    throw new HypothesisFailureAnalysisError(
      `Invalid cross-validation.json schema in ${path}: ${result.error.message}`,
    );
  }

  return result.data.entries as unknown as CrossValidationEntry[];
}

function loadOptionalHypothesisHistory(
  io: HypothesisFailureAnalysisIo,
  path: string,
): HypothesisHistoryDocument | null {
  if (!io.fileExists(path)) {
    return null;
  }

  const parsed = parseJson(path, io.readFile(path));
  const result = hypothesisHistorySchema.safeParse(parsed);
  if (!result.success) {
    return null;
  }

  return parsed as HypothesisHistoryDocument;
}

export function loadHypothesisFailureAnalysisInputs(
  io: HypothesisFailureAnalysisIo,
  inputPaths: HypothesisFailureAnalysisInputPaths,
): ParsedHypothesisFailureAnalysisInputs & {
  inputStatus: HypothesisFailureAnalysisInputStatus;
  passThreshold: number | null;
} {
  const validationLoad = loadOptionalValidations(io, inputPaths.hypothesisValidationPath);

  return {
    inputStatus: buildInputStatus(io, inputPaths),
    passThreshold: validationLoad.passThreshold,
    candidates: loadOptionalCandidates(io, inputPaths.hypothesisCandidatesPath),
    validations: validationLoad.validations,
    mispricingAtlas: loadOptionalMispricingAtlas(io, inputPaths.mispricingAtlasPath),
    coverageEntries: loadOptionalCoverageEntries(io, inputPaths.coverageAwareValidationPath),
    crossValidationEntries: loadOptionalCrossValidationEntries(
      io,
      inputPaths.crossValidationPath,
    ),
    hypothesisHistory: loadOptionalHypothesisHistory(io, inputPaths.hypothesisHistoryPath),
  };
}
