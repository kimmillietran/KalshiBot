import { z } from "zod";

import {
  DEFAULT_HYPOTHESIS_CANDIDATES_OUTPUT_PATH,
  DEFAULT_MISPRICING_ATLAS_INPUT_PATH,
} from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import { DEFAULT_HYPOTHESIS_FAILURE_ANALYSIS_OUTPUT_PATH } from "@/lib/data/research/hypothesisFailureAnalysis/hypothesisFailureAnalysisTypes";
import { DEFAULT_HYPOTHESIS_REFINEMENTS_OUTPUT_PATH } from "@/lib/data/research/hypothesisRefinementGenerator/hypothesisRefinementTypes";
import { loadHypothesisCandidatesFromFile } from "@/lib/data/research/hypothesisRobustness/loadHypothesisValidationInputs";
import { DEFAULT_HYPOTHESIS_VALIDATION_OUTPUT_PATH } from "@/lib/data/research/hypothesisRobustness/hypothesisRobustnessTypes";
import type { HypothesisValidationEntry } from "@/lib/data/research/hypothesisRobustness/hypothesisRobustnessTypes";
import { DEFAULT_REFINEMENT_HYPOTHESIS_CANDIDATES_OUTPUT_PATH } from "@/lib/data/research/refinementHypothesisRegistration/refinementHypothesisRegistrationTypes";
import type { HypothesisCandidate } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import type { HypothesisFailureAnalysisEntry } from "@/lib/data/research/hypothesisFailureAnalysis/hypothesisFailureAnalysisTypes";
import type { HypothesisRefinementCandidate } from "@/lib/data/research/hypothesisRefinementGenerator/hypothesisRefinementTypes";
import type { MispricingAtlas } from "@/lib/data/research/mispricingAtlas/mispricingAtlasTypes";

import {
  ResearchRoiAnalysisError,
  type ParsedResearchRoiAnalysisInputs,
  type ResearchRoiAnalysisIo,
  type ResearchRoiInputPaths,
  type ResearchRoiInputStatus,
} from "./researchRoiAnalysisTypes";

const validationEntrySchema = z.object({
  hypothesisId: z.string().trim().min(1),
  robustnessScore: z.number().finite(),
  passes: z.boolean(),
});

const validationReportSchema = z.object({
  validations: z.array(validationEntrySchema),
});

const failureAnalysisEntrySchema = z.object({
  hypothesisId: z.string().trim().min(1),
  priorityCategory: z.enum([
    "near-promising",
    "needs-more-data",
    "likely-spurious",
    "blocked-by-coverage",
  ]),
  robustnessScore: z.number().finite(),
  passes: z.boolean(),
});

const failureAnalysisReportSchema = z.object({
  analyses: z.array(failureAnalysisEntrySchema),
});

const refinementSchema = z.object({
  refinementId: z.string().trim().min(1),
  parentHypothesisId: z.string().trim().min(1),
  refinementType: z.string().trim().min(1),
  parentRobustnessScore: z.number().finite(),
});

const refinementReportSchema = z.object({
  refinements: z.array(refinementSchema),
});

const mispricingAtlasSchema = z.object({
  generatedAt: z.string(),
  outputPath: z.string(),
  probabilityBuckets: z.array(z.object({ bucketId: z.string(), observations: z.number() })),
});

function parseJson(path: string, json: string): unknown {
  try {
    return JSON.parse(json.replace(/^\uFEFF/, ""));
  } catch {
    throw new ResearchRoiAnalysisError(`Invalid JSON in ${path}`);
  }
}

export function buildDefaultResearchRoiAnalysisInputPaths(options?: {
  hypothesisCandidatesPath?: string;
  hypothesisValidationPath?: string;
  hypothesisFailureAnalysisPath?: string;
  hypothesisRefinementsPath?: string;
  refinementHypothesisCandidatesPath?: string;
  mispricingAtlasPath?: string;
}): ResearchRoiInputPaths {
  return {
    hypothesisCandidatesPath:
      options?.hypothesisCandidatesPath ?? DEFAULT_HYPOTHESIS_CANDIDATES_OUTPUT_PATH,
    hypothesisValidationPath:
      options?.hypothesisValidationPath ?? DEFAULT_HYPOTHESIS_VALIDATION_OUTPUT_PATH,
    hypothesisFailureAnalysisPath:
      options?.hypothesisFailureAnalysisPath ?? DEFAULT_HYPOTHESIS_FAILURE_ANALYSIS_OUTPUT_PATH,
    hypothesisRefinementsPath:
      options?.hypothesisRefinementsPath ?? DEFAULT_HYPOTHESIS_REFINEMENTS_OUTPUT_PATH,
    refinementHypothesisCandidatesPath:
      options?.refinementHypothesisCandidatesPath
      ?? DEFAULT_REFINEMENT_HYPOTHESIS_CANDIDATES_OUTPUT_PATH,
    mispricingAtlasPath:
      options?.mispricingAtlasPath ?? DEFAULT_MISPRICING_ATLAS_INPUT_PATH,
  };
}

function buildInputStatus(
  io: ResearchRoiAnalysisIo,
  inputPaths: ResearchRoiInputPaths,
): ResearchRoiInputStatus {
  return {
    hypothesisCandidatesPresent: io.fileExists(inputPaths.hypothesisCandidatesPath),
    hypothesisValidationPresent: io.fileExists(inputPaths.hypothesisValidationPath),
    hypothesisFailureAnalysisPresent: io.fileExists(inputPaths.hypothesisFailureAnalysisPath),
    hypothesisRefinementsPresent: io.fileExists(inputPaths.hypothesisRefinementsPath),
    refinementHypothesisCandidatesPresent: io.fileExists(
      inputPaths.refinementHypothesisCandidatesPath,
    ),
    mispricingAtlasPresent: io.fileExists(inputPaths.mispricingAtlasPath),
  };
}

function loadOptionalCandidates(
  io: ResearchRoiAnalysisIo,
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

function loadOptionalValidations(
  io: ResearchRoiAnalysisIo,
  path: string,
): HypothesisValidationEntry[] {
  if (!io.fileExists(path)) {
    return [];
  }

  const parsed = parseJson(path, io.readFile(path));
  const result = validationReportSchema.safeParse(parsed);
  if (!result.success) {
    throw new ResearchRoiAnalysisError(
      `Invalid hypothesis-validation.json schema in ${path}: ${result.error.message}`,
    );
  }

  return (parsed as { validations: HypothesisValidationEntry[] }).validations;
}

function loadOptionalFailureAnalyses(
  io: ResearchRoiAnalysisIo,
  path: string,
): HypothesisFailureAnalysisEntry[] {
  if (!io.fileExists(path)) {
    return [];
  }

  const parsed = parseJson(path, io.readFile(path));
  const result = failureAnalysisReportSchema.safeParse(parsed);
  if (!result.success) {
    throw new ResearchRoiAnalysisError(
      `Invalid hypothesis-failure-analysis.json schema in ${path}: ${result.error.message}`,
    );
  }

  return (parsed as { analyses: HypothesisFailureAnalysisEntry[] }).analyses;
}

function loadOptionalRefinements(
  io: ResearchRoiAnalysisIo,
  path: string,
): HypothesisRefinementCandidate[] {
  if (!io.fileExists(path)) {
    return [];
  }

  const parsed = parseJson(path, io.readFile(path));
  const result = refinementReportSchema.safeParse(parsed);
  if (!result.success) {
    throw new ResearchRoiAnalysisError(
      `Invalid hypothesis-refinements.json schema in ${path}: ${result.error.message}`,
    );
  }

  return (parsed as { refinements: HypothesisRefinementCandidate[] }).refinements;
}

function loadOptionalMispricingAtlas(
  io: ResearchRoiAnalysisIo,
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

function mergeCandidates(
  primary: readonly HypothesisCandidate[],
  refinementCandidates: readonly HypothesisCandidate[],
): HypothesisCandidate[] {
  const byId = new Map<string, HypothesisCandidate>();

  for (const candidate of primary) {
    byId.set(candidate.candidateId, candidate);
  }

  for (const candidate of refinementCandidates) {
    byId.set(candidate.candidateId, candidate);
  }

  return [...byId.values()].sort((left, right) =>
    left.candidateId.localeCompare(right.candidateId),
  );
}

export function loadResearchRoiAnalysisInputs(
  io: ResearchRoiAnalysisIo,
  inputPaths: ResearchRoiInputPaths,
): ParsedResearchRoiAnalysisInputs & { inputStatus: ResearchRoiInputStatus } {
  const primaryCandidates = loadOptionalCandidates(io, inputPaths.hypothesisCandidatesPath);
  const refinementCandidates = loadOptionalCandidates(
    io,
    inputPaths.refinementHypothesisCandidatesPath,
  );

  return {
    inputStatus: buildInputStatus(io, inputPaths),
    candidates: mergeCandidates(primaryCandidates, refinementCandidates),
    validations: loadOptionalValidations(io, inputPaths.hypothesisValidationPath),
    failureAnalyses: loadOptionalFailureAnalyses(io, inputPaths.hypothesisFailureAnalysisPath),
    refinements: loadOptionalRefinements(io, inputPaths.hypothesisRefinementsPath),
    mispricingAtlas: loadOptionalMispricingAtlas(io, inputPaths.mispricingAtlasPath),
  };
}
