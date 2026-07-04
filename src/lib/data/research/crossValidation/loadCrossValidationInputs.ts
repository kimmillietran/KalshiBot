import { z } from "zod";

import {
  DEFAULT_HYPOTHESIS_CANDIDATES_OUTPUT_PATH,
  DEFAULT_REGIME_TAGS_INPUT_PATH,
} from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import {
  DEFAULT_CALIBRATION_INPUT_DIR,
} from "@/lib/data/research/calibration/calibrationTypes";
import { collectEnrichedMispricingObservations } from "@/lib/data/research/hypothesisRobustness/collectEnrichedMispricingObservations";
import { loadHypothesisCandidatesFromFile } from "@/lib/data/research/hypothesisRobustness/loadHypothesisValidationInputs";
import { loadRegimeVolatilityByMarket } from "@/lib/data/research/mispricingAtlas/loadRegimeVolatilityByMarket";
import { DEFAULT_HYPOTHESIS_VALIDATION_OUTPUT_PATH } from "@/lib/data/research/hypothesisRobustness/hypothesisRobustnessTypes";
import { DEFAULT_STRATEGY_SYNTHESIS_OUTPUT_PATH } from "@/lib/data/research/strategySynthesis/strategySynthesisTypes";
import type { HypothesisCandidate } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";

import { buildCrossValidationReport } from "./buildCrossValidationReport";
import { CrossValidationError } from "./crossValidationTypes";
import type {
  BuildCrossValidationReportInput,
  CrossValidationConfig,
  CrossValidationInputPaths,
  CrossValidationIo,
  CrossValidationReport,
  ParsedHypothesisValidationRecord,
  ParsedSynthesizedStrategyRecord,
} from "./crossValidationTypes";

const hypothesisValidationEntrySchema = z.object({
  hypothesisId: z.string().trim().min(1),
  hypothesis: z.string().trim().min(1),
  sourceArtifact: z.string().trim().min(1),
  robustnessScore: z.number().finite(),
  passes: z.boolean(),
  reasons: z.array(z.string()),
  observationCount: z.number().finite(),
  leaveOnePeriodOut: z.object({
    errorStdDev: z.number().finite(),
  }),
});

const hypothesisValidationReportSchema = z.object({
  validations: z.array(hypothesisValidationEntrySchema),
});

const strategySynthesisCandidateSchema = z.object({
  strategyId: z.string().trim().min(1),
  hypothesisId: z.string().trim().min(1),
  strategyFamily: z.string().trim().min(1),
});

const strategySynthesisReportSchema = z.object({
  strategies: z.array(strategySynthesisCandidateSchema),
});

function parseJson(path: string, json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    throw new CrossValidationError(`Invalid JSON in ${path}`);
  }
}

function loadOptionalHypothesisValidations(
  io: CrossValidationIo,
  path: string,
): ParsedHypothesisValidationRecord[] {
  if (!io.fileExists(path)) {
    return [];
  }

  const parsed = parseJson(path, io.readFile(path));
  const result = hypothesisValidationReportSchema.safeParse(parsed);
  if (!result.success) {
    throw new CrossValidationError(
      `Invalid hypothesis-validation.json schema in ${path}: ${result.error.message}`,
    );
  }

  return result.data.validations.map((validation) => ({
    hypothesisId: validation.hypothesisId,
    robustnessScore: validation.robustnessScore,
    passes: validation.passes,
    leaveOnePeriodOutStdDev: validation.leaveOnePeriodOut.errorStdDev,
  }));
}

function loadOptionalSynthesizedStrategies(
  io: CrossValidationIo,
  path: string,
): ParsedSynthesizedStrategyRecord[] {
  if (!io.fileExists(path)) {
    return [];
  }

  const parsed = parseJson(path, io.readFile(path));
  const result = strategySynthesisReportSchema.safeParse(parsed);
  if (!result.success) {
    throw new CrossValidationError(
      `Invalid strategy-synthesis-candidates.json schema in ${path}: ${result.error.message}`,
    );
  }

  return result.data.strategies;
}

function loadOptionalHypothesisCandidates(
  io: CrossValidationIo,
  path: string,
): HypothesisCandidate[] {
  if (!io.fileExists(path)) {
    return [];
  }

  return loadHypothesisCandidatesFromFile(io, path);
}

export function buildDefaultCrossValidationInputPaths(options?: {
  hypothesisCandidatesPath?: string;
  hypothesisValidationPath?: string;
  strategySynthesisPath?: string;
  researchResultsDir?: string;
  regimeTagsPath?: string;
}): CrossValidationInputPaths {
  return {
    hypothesisCandidatesPath:
      options?.hypothesisCandidatesPath ?? DEFAULT_HYPOTHESIS_CANDIDATES_OUTPUT_PATH,
    hypothesisValidationPath:
      options?.hypothesisValidationPath ?? DEFAULT_HYPOTHESIS_VALIDATION_OUTPUT_PATH,
    strategySynthesisPath:
      options?.strategySynthesisPath ?? DEFAULT_STRATEGY_SYNTHESIS_OUTPUT_PATH,
    researchResultsDir:
      options?.researchResultsDir ?? DEFAULT_CALIBRATION_INPUT_DIR,
    regimeTagsPath:
      options?.regimeTagsPath ?? DEFAULT_REGIME_TAGS_INPUT_PATH,
  };
}

function loadOptionalObservations(
  io: CrossValidationIo,
  inputPaths: CrossValidationInputPaths,
): BuildCrossValidationReportInput["observations"] {
  try {
    return collectEnrichedMispricingObservations({
      researchResultsDir: inputPaths.researchResultsDir,
      regimeTagsPath: inputPaths.regimeTagsPath,
      io,
    });
  } catch {
    return [];
  }
}

export function buildCrossValidationReportFromInputs(input: {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  inputPaths: CrossValidationInputPaths;
  io: CrossValidationIo;
  config?: Partial<CrossValidationConfig>;
}): CrossValidationReport {
  const candidates = loadOptionalHypothesisCandidates(
    input.io,
    input.inputPaths.hypothesisCandidatesPath,
  );
  const hypothesisValidations = loadOptionalHypothesisValidations(
    input.io,
    input.inputPaths.hypothesisValidationPath,
  );
  const synthesizedStrategies = loadOptionalSynthesizedStrategies(
    input.io,
    input.inputPaths.strategySynthesisPath,
  );
  const observations = loadOptionalObservations(input.io, input.inputPaths);
  const regimeVolatilityByMarket = loadRegimeVolatilityByMarket(
    input.io,
    input.inputPaths.regimeTagsPath,
  );

  return buildCrossValidationReport({
    generatedAt: input.generatedAt,
    outputPath: input.outputPath,
    htmlOutputPath: input.htmlOutputPath,
    inputPaths: input.inputPaths,
    candidates,
    synthesizedStrategies,
    hypothesisValidations,
    observations,
    regimeVolatilityByMarket,
    config: input.config,
  } satisfies BuildCrossValidationReportInput);
}
