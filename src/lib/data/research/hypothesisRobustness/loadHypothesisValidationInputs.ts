import { z } from "zod";

import {
  DEFAULT_HYPOTHESIS_CANDIDATES_OUTPUT_PATH,
  DEFAULT_MISPRICING_ATLAS_INPUT_PATH,
  DEFAULT_REGIME_TAGS_INPUT_PATH,
} from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import { DEFAULT_CALIBRATION_INPUT_DIR } from "@/lib/data/research/calibration/calibrationTypes";

import { HypothesisRobustnessError } from "./hypothesisRobustnessTypes";
import type { HypothesisCandidate } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import type { HypothesisRobustnessIo } from "./hypothesisRobustnessTypes";

const hypothesisCandidateSchema = z.object({
  candidateId: z.string().trim().min(1),
  sourceArtifact: z.string().trim().min(1),
  hypothesis: z.string().trim().min(1),
  rationale: z.string().trim().min(1),
  marketCondition: z.string().trim().min(1),
  suggestedStrategyFamily: z.string().trim().min(1),
  requiredData: z.array(z.string().trim().min(1)),
  proposedEntryCondition: z.string().trim().min(1),
  proposedExitSettlementAssumption: z.string().trim().min(1),
  expectedFailureMode: z.string().trim().min(1),
  killCriterion: z.string().trim().min(1),
  confidence: z.enum(["low", "medium", "high"]),
  warnings: z.array(z.string().trim().min(1)),
});

const hypothesisCandidatesReportSchema = z.object({
  generatedAt: z.string().trim().min(1),
  outputPath: z.string().trim().min(1),
  config: z.object({
    minSampleSize: z.number().finite(),
    minCalibrationError: z.number().finite(),
    minLeadLagCorrelation: z.number().finite(),
  }),
  inputs: z.record(z.string(), z.unknown()),
  candidates: z.array(hypothesisCandidateSchema),
  summary: z.record(z.string(), z.unknown()),
});

function parseJson(path: string, json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    throw new HypothesisRobustnessError(`Invalid JSON in ${path}`);
  }
}

export function loadHypothesisCandidatesFromFile(
  io: HypothesisRobustnessIo,
  path: string,
): HypothesisCandidate[] {
  if (!io.fileExists(path)) {
    throw new HypothesisRobustnessError(`Missing hypothesis candidates file: ${path}`);
  }

  const parsed = parseJson(path, io.readFile(path));
  const result = hypothesisCandidatesReportSchema.safeParse(parsed);
  if (!result.success) {
    throw new HypothesisRobustnessError(
      `Invalid hypothesis-candidates.json schema in ${path}: ${result.error.message}`,
    );
  }

  return result.data.candidates;
}

export function assertHypothesisValidationInputFiles(
  io: HypothesisRobustnessIo,
  paths: {
    hypothesisCandidatesPath: string;
    mispricingAtlasPath: string;
  },
): void {
  if (!io.fileExists(paths.hypothesisCandidatesPath)) {
    throw new HypothesisRobustnessError(
      `Missing hypothesis candidates file: ${paths.hypothesisCandidatesPath}`,
    );
  }

  if (!io.fileExists(paths.mispricingAtlasPath)) {
    throw new HypothesisRobustnessError(
      `Missing mispricing atlas file: ${paths.mispricingAtlasPath}`,
    );
  }
}

export function buildDefaultHypothesisValidationInputPaths(options?: {
  hypothesisCandidatesPath?: string;
  mispricingAtlasPath?: string;
  researchResultsDir?: string;
  regimeTagsPath?: string;
}) {
  return {
    hypothesisCandidatesPath:
      options?.hypothesisCandidatesPath ?? DEFAULT_HYPOTHESIS_CANDIDATES_OUTPUT_PATH,
    mispricingAtlasPath:
      options?.mispricingAtlasPath ?? DEFAULT_MISPRICING_ATLAS_INPUT_PATH,
    researchResultsDir:
      options?.researchResultsDir ?? DEFAULT_CALIBRATION_INPUT_DIR,
    regimeTagsPath: options?.regimeTagsPath ?? DEFAULT_REGIME_TAGS_INPUT_PATH,
  };
}
