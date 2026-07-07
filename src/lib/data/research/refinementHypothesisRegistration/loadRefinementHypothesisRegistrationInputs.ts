import { z } from "zod";

import {
  DEFAULT_HYPOTHESIS_CANDIDATES_OUTPUT_PATH,
} from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import { loadHypothesisCandidatesFromFile } from "@/lib/data/research/hypothesisRobustness/loadHypothesisValidationInputs";
import type { HypothesisCandidate } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import { DEFAULT_HYPOTHESIS_REFINEMENTS_OUTPUT_PATH } from "@/lib/data/research/hypothesisRefinementGenerator/hypothesisRefinementTypes";
import type { HypothesisRefinementCandidate } from "@/lib/data/research/hypothesisRefinementGenerator/hypothesisRefinementTypes";
import { HYPOTHESIS_REFINEMENT_TYPES } from "@/lib/data/research/hypothesisRefinementGenerator/hypothesisRefinementTypes";
import { DEFAULT_HYPOTHESIS_FAILURE_ANALYSIS_OUTPUT_PATH } from "@/lib/data/research/hypothesisFailureAnalysis/hypothesisFailureAnalysisTypes";

import {
  RefinementHypothesisRegistrationError,
  type RefinementHypothesisCandidatesInputPaths,
  type RefinementHypothesisCandidatesInputStatus,
  type RefinementHypothesisRegistrationIo,
} from "./refinementHypothesisRegistrationTypes";

const refinementSchema = z.object({
  refinementId: z.string().trim().min(1),
  parentHypothesisId: z.string().trim().min(1),
  parentHypothesis: z.string().trim().min(1),
  refinementType: z.enum(HYPOTHESIS_REFINEMENT_TYPES),
  refinedHypothesis: z.string().trim().min(1),
  rationale: z.string().trim().min(1),
  expectedBenefit: z.string().trim().min(1),
  expectedRisk: z.string().trim().min(1),
  overfittingRisk: z.enum(["low", "medium", "high"]),
  priorityRank: z.number().finite(),
  priorityScore: z.number().finite(),
  status: z.literal("candidate-refinement"),
  parentPriorityCategory: z.string(),
  parentRobustnessScore: z.number().finite(),
  parentScoreGap: z.number().finite(),
  suggestedFilters: z.record(z.string(), z.unknown()),
  atlasSupportObservations: z.number().finite().nullable(),
});

const refinementsReportSchema = z.object({
  refinements: z.array(refinementSchema),
});

function parseJson(path: string, json: string): unknown {
  try {
    return JSON.parse(json.replace(/^\uFEFF/, ""));
  } catch {
    throw new RefinementHypothesisRegistrationError(`Invalid JSON in ${path}`);
  }
}

export function buildDefaultRefinementHypothesisRegistrationInputPaths(options?: {
  hypothesisRefinementsPath?: string;
  hypothesisCandidatesPath?: string;
  hypothesisFailureAnalysisPath?: string;
}): RefinementHypothesisCandidatesInputPaths {
  return {
    hypothesisRefinementsPath:
      options?.hypothesisRefinementsPath ?? DEFAULT_HYPOTHESIS_REFINEMENTS_OUTPUT_PATH,
    hypothesisCandidatesPath:
      options?.hypothesisCandidatesPath ?? DEFAULT_HYPOTHESIS_CANDIDATES_OUTPUT_PATH,
    hypothesisFailureAnalysisPath:
      options?.hypothesisFailureAnalysisPath ?? DEFAULT_HYPOTHESIS_FAILURE_ANALYSIS_OUTPUT_PATH,
  };
}

function buildInputStatus(
  io: RefinementHypothesisRegistrationIo,
  inputPaths: RefinementHypothesisCandidatesInputPaths,
): RefinementHypothesisCandidatesInputStatus {
  return {
    hypothesisRefinementsPresent: io.fileExists(inputPaths.hypothesisRefinementsPath),
    hypothesisCandidatesPresent: io.fileExists(inputPaths.hypothesisCandidatesPath),
    hypothesisFailureAnalysisPresent: io.fileExists(inputPaths.hypothesisFailureAnalysisPath),
  };
}

export function loadRefinementHypothesisRegistrationInputs(
  io: RefinementHypothesisRegistrationIo,
  inputPaths: RefinementHypothesisCandidatesInputPaths,
): {
  inputStatus: RefinementHypothesisCandidatesInputStatus;
  refinements: HypothesisRefinementCandidate[];
  parentCandidates: HypothesisCandidate[];
  generatedFromFailureAnalysis: boolean;
} {
  if (!io.fileExists(inputPaths.hypothesisRefinementsPath)) {
    throw new RefinementHypothesisRegistrationError(
      `Missing hypothesis refinements file: ${inputPaths.hypothesisRefinementsPath}`,
    );
  }

  const parsed = parseJson(inputPaths.hypothesisRefinementsPath, io.readFile(inputPaths.hypothesisRefinementsPath));
  const result = refinementsReportSchema.safeParse(parsed);
  if (!result.success) {
    throw new RefinementHypothesisRegistrationError(
      `Invalid hypothesis-refinements.json schema in ${inputPaths.hypothesisRefinementsPath}: ${result.error.message}`,
    );
  }

  const parentCandidates = io.fileExists(inputPaths.hypothesisCandidatesPath)
    ? loadHypothesisCandidatesFromFile(
        io as Parameters<typeof loadHypothesisCandidatesFromFile>[0],
        inputPaths.hypothesisCandidatesPath,
      )
    : [];

  return {
    inputStatus: buildInputStatus(io, inputPaths),
    refinements: result.data.refinements as unknown as HypothesisRefinementCandidate[],
    parentCandidates,
    generatedFromFailureAnalysis: io.fileExists(inputPaths.hypothesisFailureAnalysisPath),
  };
}
