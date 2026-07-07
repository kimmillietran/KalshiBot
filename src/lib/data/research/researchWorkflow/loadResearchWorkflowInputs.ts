import { z } from "zod";

import type {
  ResearchWorkflowInputPaths,
  ResearchWorkflowInputStatus,
  ResearchWorkflowIo,
} from "./researchWorkflowTypes";

const failureAnalysisEntrySchema = z
  .object({
    hypothesisId: z.string(),
    hypothesis: z.string().optional(),
    passes: z.boolean().optional(),
    robustnessScore: z.number().optional(),
    priorityRank: z.number().optional(),
    priorityCategory: z.string().optional(),
    recommendedNextAction: z.string().optional(),
    failureReasons: z
      .array(
        z.object({
          category: z.string(),
          summary: z.string().optional(),
        }),
      )
      .optional(),
  })
  .passthrough();

const failureAnalysisSchema = z
  .object({
    generatedAt: z.string().optional(),
    analyses: z.array(failureAnalysisEntrySchema).optional(),
    summary: z
      .object({
        nearPromisingCount: z.number().optional(),
        passingCount: z.number().optional(),
        totalHypotheses: z.number().optional(),
      })
      .optional(),
  })
  .passthrough();

const derivedSensitivitySchema = z
  .object({
    entries: z
      .array(
        z.object({
          hypothesisId: z.string(),
          recommendation: z.string(),
          deltaRobustness: z.number(),
          notes: z.array(z.string()).optional(),
        }),
      )
      .optional(),
  })
  .passthrough();

const refinementsSchema = z
  .object({
    refinements: z
      .array(
        z.object({
          parentHypothesisId: z.string(),
          refinementId: z.string(),
          refinedHypothesis: z.string().optional(),
        }),
      )
      .optional(),
    summary: z.object({ totalRefinements: z.number().optional() }).optional(),
  })
  .passthrough();

const refinementCandidatesSchema = z
  .object({
    candidates: z
      .array(
        z.object({
          hypothesisId: z.string().optional(),
          candidateId: z.string().optional(),
          parentHypothesisId: z.string(),
          hypothesis: z.string().optional(),
          refinedHypothesis: z.string().optional(),
        }),
      )
      .optional(),
  })
  .passthrough();

const synthesisDebugTraceSchema = z
  .object({
    hypothesisId: z.string(),
    harnessEligible: z.boolean().optional(),
    harnessEvaluated: z.boolean().optional(),
    funnelStageReached: z.string().optional(),
    rejectionReasons: z.array(z.string()).optional(),
    rejectionCategories: z.array(z.string()).optional(),
    robustnessScore: z.number().optional(),
    validationPasses: z.boolean().optional(),
  })
  .passthrough();

const synthesisDebugSchema = z
  .object({
    summary: z
      .object({
        funnel: z
          .object({
            hypothesisCandidates: z.number().optional(),
            synthesisCandidates: z.number().optional(),
            harnessEligible: z.number().optional(),
            harnessEvaluated: z.number().optional(),
          })
          .optional(),
        recommendedNextTask: z.string().optional(),
        nearPromisingCount: z.number().optional(),
      })
      .optional(),
    traces: z.array(synthesisDebugTraceSchema).optional(),
  })
  .passthrough();

const monthRegimeSchema = z
  .object({
    entries: z
      .array(
        z.object({
          hypothesisId: z.string(),
          monthInstability: z.boolean().optional(),
          unstable: z.boolean().optional(),
          summary: z.string().optional(),
          recommendation: z.string().optional(),
        }),
      )
      .optional(),
  })
  .passthrough();

const harnessSummarySchema = z
  .object({
    evaluatedStrategies: z.number().optional(),
    successfulRuns: z.number().optional(),
    results: z
      .array(
        z.object({
          hypothesisId: z.string().optional(),
          synthesizedStrategyId: z.string().optional(),
          status: z.enum(["success", "failed", "skipped"]).optional(),
        }),
      )
      .optional(),
  })
  .passthrough();

function isResearchWorkflowDocument(parsed: unknown): boolean {
  return (
    typeof parsed === "object"
    && parsed !== null
    && "queue" in parsed
    && "pipelines" in parsed
  );
}

function isFailureAnalysisDocument(
  parsed: z.infer<typeof failureAnalysisSchema>,
): boolean {
  return Array.isArray(parsed.analyses);
}

function isSynthesisDebugDocument(
  parsed: z.infer<typeof synthesisDebugSchema>,
): boolean {
  return Array.isArray(parsed.traces);
}

function tryRead<T>(
  io: ResearchWorkflowIo,
  path: string,
  schema: z.ZodType<T>,
  validate?: (document: T) => boolean,
): T | null {
  if (!io.fileExists(path)) {
    return null;
  }

  try {
    const parsed = JSON.parse(io.readFile(path));
    if (isResearchWorkflowDocument(parsed)) {
      return null;
    }

    const result = schema.safeParse(parsed);
    if (!result.success) {
      return null;
    }

    return validate && !validate(result.data) ? null : result.data;
  } catch {
    return null;
  }
}

export type LoadedResearchWorkflowInputs = {
  inputStatus: ResearchWorkflowInputStatus;
  failureAnalysis: z.infer<typeof failureAnalysisSchema> | null;
  derivedSensitivity: z.infer<typeof derivedSensitivitySchema> | null;
  refinements: z.infer<typeof refinementsSchema> | null;
  refinementCandidates: z.infer<typeof refinementCandidatesSchema> | null;
  synthesisDebug: z.infer<typeof synthesisDebugSchema> | null;
  monthRegime: z.infer<typeof monthRegimeSchema> | null;
  harnessSummary: z.infer<typeof harnessSummarySchema> | null;
};

/** Loads optional research workflow inputs without failing when artifacts are absent. */
export function loadResearchWorkflowInputs(
  io: ResearchWorkflowIo,
  inputPaths: ResearchWorkflowInputPaths,
): LoadedResearchWorkflowInputs {
  const failureAnalysis = tryRead(
    io,
    inputPaths.hypothesisFailureAnalysisPath,
    failureAnalysisSchema,
    isFailureAnalysisDocument,
  );
  const derivedSensitivity = tryRead(
    io,
    inputPaths.derivedSettlementSensitivityPath,
    derivedSensitivitySchema,
  );
  const refinements = tryRead(io, inputPaths.hypothesisRefinementsPath, refinementsSchema);
  const refinementCandidates = tryRead(
    io,
    inputPaths.refinementHypothesisCandidatesPath,
    refinementCandidatesSchema,
  );
  const synthesisDebug = tryRead(
    io,
    inputPaths.strategySynthesisDebugPath,
    synthesisDebugSchema,
    isSynthesisDebugDocument,
  );
  const monthRegime = tryRead(io, inputPaths.monthRegimeAnalysisPath, monthRegimeSchema);
  const harnessSummary = tryRead(io, inputPaths.harnessSummaryPath, harnessSummarySchema);

  return {
    inputStatus: {
      hypothesisFailureAnalysisPresent: failureAnalysis !== null,
      derivedSettlementSensitivityPresent: derivedSensitivity !== null,
      hypothesisRefinementsPresent: refinements !== null,
      refinementHypothesisCandidatesPresent: refinementCandidates !== null,
      strategySynthesisDebugPresent: synthesisDebug !== null,
      monthRegimeAnalysisPresent: monthRegime !== null,
      harnessSummaryPresent: harnessSummary !== null,
    },
    failureAnalysis,
    derivedSensitivity,
    refinements,
    refinementCandidates,
    synthesisDebug,
    monthRegime,
    harnessSummary,
  };
}
