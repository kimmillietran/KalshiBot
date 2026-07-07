import { z } from "zod";

import type { HypothesisCandidatesReport } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import { parseHypothesisCandidatesReport } from "@/lib/data/research/strategySynthesis/parseStrategySynthesisInputs";
import type { HypothesisValidationEntry } from "@/lib/data/research/hypothesisRobustness/hypothesisRobustnessTypes";
import { DEFAULT_HYPOTHESIS_VALIDATION_PASS_SCORE } from "@/lib/data/research/hypothesisRobustness/hypothesisRobustnessTypes";
import type { MispricingAtlas } from "@/lib/data/research/mispricingAtlas/mispricingAtlasTypes";

import { loadMonthRegimeAnalysisInputs } from "@/lib/data/research/monthRegimeAnalysis/loadMonthRegimeAnalysisInputs";

import {
  DimensionInteractionAnalysisError,
  DimensionInteractionAnalysisErrorCode,
  type DimensionInteractionAnalysisInputPaths,
  type DimensionInteractionAnalysisInputStatus,
  type DimensionInteractionAnalysisIo,
} from "./dimensionInteractionAnalyticsTypes";

const failureAnalysisSchema = z.object({
  analyses: z.array(
    z.object({
      hypothesisId: z.string().trim().min(1),
      priorityCategory: z.string(),
    }),
  ),
});

export type LoadedDimensionInteractionAnalyticsInputs = {
  inputStatus: DimensionInteractionAnalysisInputStatus;
  candidatesReport: HypothesisCandidatesReport | null;
  validations: readonly HypothesisValidationEntry[];
  atlas: MispricingAtlas | null;
  priorityByHypothesisId: ReadonlyMap<string, string>;
  passScoreThreshold: number;
};

function parseJson(path: string, raw: string): unknown {
  try {
    return JSON.parse(raw.replace(/^\uFEFF/, ""));
  } catch {
    throw new DimensionInteractionAnalysisError(
      `Invalid JSON in ${path}`,
      DimensionInteractionAnalysisErrorCode.INVALID_JSON,
    );
  }
}

function tryLoadAtlas(io: DimensionInteractionAnalysisIo, path: string): MispricingAtlas | null {
  if (!io.fileExists(path)) {
    return null;
  }

  return parseJson(path, io.readFile(path)) as MispricingAtlas;
}

function tryLoadFailurePriorities(
  io: DimensionInteractionAnalysisIo,
  path: string,
): ReadonlyMap<string, string> {
  if (!io.fileExists(path)) {
    return new Map();
  }

  const parsed = parseJson(path, io.readFile(path));
  const result = failureAnalysisSchema.safeParse(parsed);
  if (!result.success) {
    return new Map();
  }

  return new Map(
    result.data.analyses.map((entry) => [entry.hypothesisId, entry.priorityCategory]),
  );
}

/** Loads upstream artifacts for dimension interaction analytics. */
export function loadDimensionInteractionAnalyticsInputs(
  io: DimensionInteractionAnalysisIo,
  inputPaths: DimensionInteractionAnalysisInputPaths,
): LoadedDimensionInteractionAnalyticsInputs {
  const validationLoaded = loadMonthRegimeAnalysisInputs(
    {
      readFile: io.readFile,
      fileExists: io.fileExists,
      readdir: () => [],
      isDirectory: () => false,
    },
    {
      hypothesisCandidatesPath: inputPaths.hypothesisCandidatesPath,
      hypothesisValidationPath: inputPaths.hypothesisValidationPath,
      regimeTagsPath: "data/research-results/regime-tags.json",
      researchResultsDir: "data/research-results",
    },
  );

  let candidatesReport: HypothesisCandidatesReport | null = null;
  if (validationLoaded.inputStatus.hypothesisCandidatesPresent) {
    candidatesReport = parseHypothesisCandidatesReport(
      io.readFile(inputPaths.hypothesisCandidatesPath),
    );
  }

  return {
    inputStatus: {
      hypothesisCandidatesPresent: validationLoaded.inputStatus.hypothesisCandidatesPresent,
      hypothesisValidationPresent: validationLoaded.inputStatus.hypothesisValidationPresent,
      mispricingAtlasPresent: io.fileExists(inputPaths.mispricingAtlasPath),
      hypothesisFailureAnalysisPresent: io.fileExists(inputPaths.hypothesisFailureAnalysisPath),
    },
    candidatesReport,
    validations: validationLoaded.validationReport?.validations ?? [],
    atlas: tryLoadAtlas(io, inputPaths.mispricingAtlasPath),
    priorityByHypothesisId: tryLoadFailurePriorities(
      io,
      inputPaths.hypothesisFailureAnalysisPath,
    ),
    passScoreThreshold: DEFAULT_HYPOTHESIS_VALIDATION_PASS_SCORE,
  };
}
