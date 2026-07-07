import { z } from "zod";

import {
  DEFAULT_HYPOTHESIS_FAILURE_ANALYSIS_HTML_PATH,
} from "@/lib/data/research/hypothesisFailureAnalysis/hypothesisFailureAnalysisTypes";

import type {
  ResearchDiagnosticsInputPaths,
  ResearchDiagnosticsIo,
} from "./researchDiagnosticsTypes";
import {
  DEFAULT_DERIVED_SETTLEMENT_SENSITIVITY_HTML_PATH,
  DEFAULT_HYPOTHESIS_REFINEMENTS_HTML_PATH,
  DEFAULT_STRATEGY_SYNTHESIS_DEBUG_HTML_PATH,
} from "./researchDiagnosticsTypes";

const generatedArtifactSchema = z.object({
  generatedAt: z.string().trim().min(1).optional(),
  htmlOutputPath: z.string().trim().min(1).optional(),
});

const hypothesisFailureAnalysisSchema = generatedArtifactSchema.extend({
  summary: z
    .object({
      nearPromisingCount: z.number().finite().optional(),
      highestRobustnessScore: z.number().finite().optional(),
      totalHypotheses: z.number().finite().optional(),
      passingCount: z.number().finite().optional(),
      failingCount: z.number().finite().optional(),
    })
    .optional(),
});

const derivedSettlementSensitivitySchema = generatedArtifactSchema.extend({
  summary: z
    .object({
      derivedSensitiveHypothesisCount: z.number().finite().optional(),
      sensitiveHypothesisCount: z.number().finite().optional(),
      totalHypotheses: z.number().finite().optional(),
    })
    .optional(),
  sensitiveHypothesisCount: z.number().finite().optional(),
});

const hypothesisRefinementsSchema = generatedArtifactSchema.extend({
  summary: z
    .object({
      refinementCandidateCount: z.number().finite().optional(),
      candidateCount: z.number().finite().optional(),
      totalRefinements: z.number().finite().optional(),
    })
    .optional(),
  refinements: z.array(z.unknown()).optional(),
});

const strategySynthesisDebugSchema = generatedArtifactSchema.extend({
  summary: z
    .object({
      funnelStatus: z.string().trim().min(1).optional(),
      funnelStage: z.string().trim().min(1).optional(),
      harnessCandidateCount: z.number().finite().optional(),
      candidateCount: z.number().finite().optional(),
      experimentalCount: z.number().finite().optional(),
      rejectedCount: z.number().finite().optional(),
      synthesizedCount: z.number().finite().optional(),
    })
    .optional(),
});

function parseJson(path: string, json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function tryReadDocument<T>(
  io: ResearchDiagnosticsIo,
  path: string,
  schema: z.ZodType<T>,
): T | null {
  if (!io.fileExists(path)) {
    return null;
  }

  const parsed = parseJson(path, io.readFile(path));
  if (parsed === null) {
    return null;
  }

  const result = schema.safeParse(parsed);
  return result.success ? result.data : null;
}

export type LoadedResearchDiagnosticsInputs = {
  hypothesisFailureAnalysis: z.infer<typeof hypothesisFailureAnalysisSchema> | null;
  derivedSettlementSensitivity: z.infer<typeof derivedSettlementSensitivitySchema> | null;
  hypothesisRefinements: z.infer<typeof hypothesisRefinementsSchema> | null;
  strategySynthesisDebug: z.infer<typeof strategySynthesisDebugSchema> | null;
  htmlPaths: {
    hypothesisFailureAnalysis: string;
    derivedSettlementSensitivity: string;
    hypothesisRefinements: string;
    strategySynthesisDebug: string;
  };
};

/** Loads optional research diagnostic artifacts without failing when absent. */
export function loadResearchDiagnosticsInputs(
  io: ResearchDiagnosticsIo,
  inputPaths: ResearchDiagnosticsInputPaths,
): LoadedResearchDiagnosticsInputs {
  const hypothesisFailureAnalysis = tryReadDocument(
    io,
    inputPaths.hypothesisFailureAnalysisPath,
    hypothesisFailureAnalysisSchema,
  );
  const derivedSettlementSensitivity = tryReadDocument(
    io,
    inputPaths.derivedSettlementSensitivityPath,
    derivedSettlementSensitivitySchema,
  );
  const hypothesisRefinements = tryReadDocument(
    io,
    inputPaths.hypothesisRefinementsPath,
    hypothesisRefinementsSchema,
  );
  const strategySynthesisDebug = tryReadDocument(
    io,
    inputPaths.strategySynthesisDebugPath,
    strategySynthesisDebugSchema,
  );

  return {
    hypothesisFailureAnalysis,
    derivedSettlementSensitivity,
    hypothesisRefinements,
    strategySynthesisDebug,
    htmlPaths: {
      hypothesisFailureAnalysis:
        hypothesisFailureAnalysis?.htmlOutputPath ?? DEFAULT_HYPOTHESIS_FAILURE_ANALYSIS_HTML_PATH,
      derivedSettlementSensitivity:
        derivedSettlementSensitivity?.htmlOutputPath
        ?? DEFAULT_DERIVED_SETTLEMENT_SENSITIVITY_HTML_PATH,
      hypothesisRefinements:
        hypothesisRefinements?.htmlOutputPath ?? DEFAULT_HYPOTHESIS_REFINEMENTS_HTML_PATH,
      strategySynthesisDebug:
        strategySynthesisDebug?.htmlOutputPath ?? DEFAULT_STRATEGY_SYNTHESIS_DEBUG_HTML_PATH,
    },
  };
}
