import { z } from "zod";

import {
  DEFAULT_HYPOTHESIS_FAILURE_ANALYSIS_OUTPUT_PATH,
} from "@/lib/data/research/hypothesisFailureAnalysis/hypothesisFailureAnalysisTypes";
import type { HypothesisFailureAnalysisEntry } from "@/lib/data/research/hypothesisFailureAnalysis/hypothesisFailureAnalysisTypes";
import { DEFAULT_HYPOTHESIS_VALIDATION_OUTPUT_PATH } from "@/lib/data/research/hypothesisRobustness/hypothesisRobustnessTypes";
import type { HypothesisValidationEntry } from "@/lib/data/research/hypothesisRobustness/hypothesisRobustnessTypes";
import { DEFAULT_MISPRICING_ATLAS_INPUT_PATH } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import type { MispricingAtlas } from "@/lib/data/research/mispricingAtlas/mispricingAtlasTypes";
import { DEFAULT_CROSS_VALIDATION_OUTPUT_PATH } from "@/lib/data/research/crossValidation/crossValidationTypes";
import type { CrossValidationEntry } from "@/lib/data/research/crossValidation/crossValidationTypes";

import {
  HypothesisRefinementError,
  type HypothesisRefinementInputPaths,
  type HypothesisRefinementInputStatus,
  type HypothesisRefinementIo,
  type ParsedHypothesisRefinementInputs,
} from "./hypothesisRefinementTypes";

const failureAnalysisEntrySchema = z.object({
  hypothesisId: z.string().trim().min(1),
  hypothesis: z.string().trim().min(1),
  passes: z.boolean(),
  robustnessScore: z.number().finite(),
  passThreshold: z.number().finite(),
  scoreGap: z.number().finite(),
  observationCount: z.number().finite(),
  uniqueTradingDays: z.number().finite(),
  priorityRank: z.number().finite(),
  priorityCategory: z.enum([
    "near-promising",
    "needs-more-data",
    "likely-spurious",
    "blocked-by-coverage",
  ]),
  priorityScore: z.number().finite(),
  recommendedNextAction: z.string(),
  failureReasons: z.array(
    z.object({
      category: z.string(),
      summary: z.string(),
      detail: z.string().nullable(),
    }),
  ),
  stabilityDiagnostics: z.object({
    strongestMonths: z.array(z.object({
      month: z.string(),
      observations: z.number().finite(),
      edgeMatchesDirection: z.boolean(),
      signedCalibrationError: z.number().nullable(),
      observationShare: z.number().finite(),
    })),
    weakestMonths: z.array(z.object({
      month: z.string(),
      observations: z.number().finite(),
      edgeMatchesDirection: z.boolean(),
      signedCalibrationError: z.number().nullable(),
      observationShare: z.number().finite(),
    })),
    missingOrThinMonths: z.array(z.string()),
    highConcentrationDays: z.array(z.object({
      day: z.string(),
      observations: z.number().finite(),
      percent: z.number().finite(),
    })),
    signalBreadth: z.enum(["broad", "narrow", "mixed"]),
    monthPersistenceRate: z.number().finite(),
    quarterPersistenceRate: z.number().finite(),
    uniqueTradingDays: z.number().finite(),
    monthCount: z.number().finite(),
    leaveOnePeriodOutStdDev: z.number().finite(),
    regimesWithData: z.number().finite(),
    regimesWithEdge: z.number().finite(),
  }),
  marginalEvidenceNeeds: z.array(z.string()),
  notes: z.array(z.string()),
  suggestedStrategyFamily: z.string().nullable(),
  coverageClassification: z.string().nullable(),
  crossValidationPasses: z.boolean().nullable(),
});

const failureAnalysisReportSchema = z.object({
  analyses: z.array(failureAnalysisEntrySchema),
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
});

const hypothesisValidationReportSchema = z.object({
  validations: z.array(hypothesisValidationEntrySchema),
});

function parseJson(path: string, json: string): unknown {
  try {
    return JSON.parse(json.replace(/^\uFEFF/, ""));
  } catch {
    throw new HypothesisRefinementError(`Invalid JSON in ${path}`);
  }
}

export function buildDefaultHypothesisRefinementInputPaths(options?: {
  hypothesisFailureAnalysisPath?: string;
  hypothesisValidationPath?: string;
  mispricingAtlasPath?: string;
  crossValidationPath?: string;
}): HypothesisRefinementInputPaths {
  return {
    hypothesisFailureAnalysisPath:
      options?.hypothesisFailureAnalysisPath ?? DEFAULT_HYPOTHESIS_FAILURE_ANALYSIS_OUTPUT_PATH,
    hypothesisValidationPath:
      options?.hypothesisValidationPath ?? DEFAULT_HYPOTHESIS_VALIDATION_OUTPUT_PATH,
    mispricingAtlasPath:
      options?.mispricingAtlasPath ?? DEFAULT_MISPRICING_ATLAS_INPUT_PATH,
    crossValidationPath:
      options?.crossValidationPath ?? DEFAULT_CROSS_VALIDATION_OUTPUT_PATH,
  };
}

function buildInputStatus(
  io: HypothesisRefinementIo,
  inputPaths: HypothesisRefinementInputPaths,
): HypothesisRefinementInputStatus {
  return {
    hypothesisFailureAnalysisPresent: io.fileExists(inputPaths.hypothesisFailureAnalysisPath),
    hypothesisValidationPresent: io.fileExists(inputPaths.hypothesisValidationPath),
    mispricingAtlasPresent: io.fileExists(inputPaths.mispricingAtlasPath),
    crossValidationPresent: io.fileExists(inputPaths.crossValidationPath),
  };
}

function loadFailureAnalyses(
  io: HypothesisRefinementIo,
  path: string,
): HypothesisFailureAnalysisEntry[] {
  if (!io.fileExists(path)) {
    return [];
  }

  const parsed = parseJson(path, io.readFile(path));
  const result = failureAnalysisReportSchema.safeParse(parsed);
  if (!result.success) {
    throw new HypothesisRefinementError(
      `Invalid hypothesis-failure-analysis.json schema in ${path}: ${result.error.message}`,
    );
  }

  return result.data.analyses as unknown as HypothesisFailureAnalysisEntry[];
}

function loadValidations(
  io: HypothesisRefinementIo,
  path: string,
): HypothesisValidationEntry[] {
  if (!io.fileExists(path)) {
    return [];
  }

  const parsed = parseJson(path, io.readFile(path));
  const result = hypothesisValidationReportSchema.safeParse(parsed);
  if (!result.success) {
    throw new HypothesisRefinementError(
      `Invalid hypothesis-validation.json schema in ${path}: ${result.error.message}`,
    );
  }

  return result.data.validations as unknown as HypothesisValidationEntry[];
}

function loadMispricingAtlas(
  io: HypothesisRefinementIo,
  path: string,
): MispricingAtlas | null {
  if (!io.fileExists(path)) {
    return null;
  }

  const parsed = parseJson(path, io.readFile(path));
  return parsed as MispricingAtlas;
}

function loadCrossValidationEntries(
  io: HypothesisRefinementIo,
  path: string,
): CrossValidationEntry[] {
  if (!io.fileExists(path)) {
    return [];
  }

  const parsed = parseJson(path, io.readFile(path));
  const result = crossValidationReportSchema.safeParse(parsed);
  if (!result.success) {
    throw new HypothesisRefinementError(
      `Invalid cross-validation.json schema in ${path}: ${result.error.message}`,
    );
  }

  return result.data.entries as unknown as CrossValidationEntry[];
}

export function loadHypothesisRefinementInputs(
  io: HypothesisRefinementIo,
  inputPaths: HypothesisRefinementInputPaths,
): ParsedHypothesisRefinementInputs & {
  inputStatus: HypothesisRefinementInputStatus;
} {
  const failureAnalyses = loadFailureAnalyses(io, inputPaths.hypothesisFailureAnalysisPath);
  const validations = loadValidations(io, inputPaths.hypothesisValidationPath);

  if (failureAnalyses.length === 0 && validations.length === 0) {
    throw new HypothesisRefinementError(
      "At least one of hypothesis-failure-analysis.json or hypothesis-validation.json must be present with entries.",
    );
  }

  return {
    inputStatus: buildInputStatus(io, inputPaths),
    failureAnalyses,
    validations,
    mispricingAtlas: loadMispricingAtlas(io, inputPaths.mispricingAtlasPath),
    crossValidationEntries: loadCrossValidationEntries(io, inputPaths.crossValidationPath),
  };
}
