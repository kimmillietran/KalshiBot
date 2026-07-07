import { z } from "zod";

import type {
  ResearchRecommendationEngineInputPaths,
  ResearchRecommendationEngineInputStatus,
  ResearchRecommendationEngineIo,
} from "./researchRecommendationEngineTypes";

const portfolioEntrySchema = z
  .object({
    researchFamily: z.string(),
    label: z.string().optional(),
    observationShare: z.number().optional(),
    candidateCount: z.number().optional(),
    validationCount: z.number().optional(),
    promisingCount: z.number().optional(),
    robustnessMedian: z.number().optional(),
  })
  .passthrough();

const portfolioAnalyticsSchema = z
  .object({
    entries: z.array(portfolioEntrySchema).optional(),
    summary: z
      .object({
        totalFamilies: z.number().optional(),
        underExploredFamilies: z.array(z.string()).optional(),
      })
      .optional(),
  })
  .passthrough();

const roiEntrySchema = z
  .object({
    researchFamily: z.string(),
    label: z.string().optional(),
    roiScore: z.number().optional(),
    yieldPerHour: z.number().optional(),
    costHours: z.number().optional(),
    candidateYield: z.number().optional(),
    validationYield: z.number().optional(),
  })
  .passthrough();

const roiAnalysisSchema = z
  .object({
    entries: z.array(roiEntrySchema).optional(),
    summary: z
      .object({
        highestRoiFamily: z.string().optional(),
        lowestRoiFamily: z.string().optional(),
      })
      .optional(),
  })
  .passthrough();

const interactionFamilySchema = z
  .object({
    familyId: z.string(),
    label: z.string().optional(),
    dimensionIds: z.array(z.string()).optional(),
    interactionStrength: z.number().optional(),
    candidateYield: z.number().optional(),
    validationYield: z.number().optional(),
    populationRate: z.number().optional(),
    recommendedAction: z.string().optional(),
  })
  .passthrough();

const interactionAnalysisSchema = z
  .object({
    families: z.array(interactionFamilySchema).optional(),
    summary: z
      .object({
        topInteractionFamily: z.string().optional(),
        unexploredFamilyCount: z.number().optional(),
      })
      .optional(),
  })
  .passthrough();

const dimensionExplorerRecommendationSchema = z
  .object({
    kind: z.string(),
    label: z.string(),
    rationale: z.string(),
    dimensionId: z.string().nullable().optional(),
    groupId: z.string().nullable().optional(),
    priorityRank: z.number().optional(),
  })
  .passthrough();

const dimensionExplorerSchema = z
  .object({
    dimensions: z
      .array(
        z
          .object({
            dimensionId: z.string(),
            label: z.string(),
            sparsity: z.number().nullable().optional(),
            coverage: z.number().nullable().optional(),
            entropy: z.number().nullable().optional(),
            observationCount: z.number().optional(),
          })
          .passthrough(),
      )
      .optional(),
    axisGroups: z
      .array(
        z
          .object({
            groupId: z.string(),
            populationRate: z.number().nullable().optional(),
            candidateYield: z.number().optional(),
            combinationCount: z.number().optional(),
          })
          .passthrough(),
      )
      .optional(),
    recommendations: z.array(dimensionExplorerRecommendationSchema).optional(),
  })
  .passthrough();

const failureAnalysisSchema = z
  .object({
    analyses: z
      .array(
        z
          .object({
            hypothesisId: z.string(),
            hypothesis: z.string().optional(),
            priorityCategory: z.string().optional(),
            priorityRank: z.number().optional(),
            recommendedNextAction: z.string().optional(),
            robustnessScore: z.number().optional(),
            failureReasons: z
              .array(
                z.object({
                  category: z.string(),
                  summary: z.string().optional(),
                }),
              )
              .optional(),
          })
          .passthrough(),
      )
      .optional(),
    summary: z
      .object({
        nearPromisingCount: z.number().optional(),
      })
      .optional(),
  })
  .passthrough();

const monthRegimeSchema = z
  .object({
    entries: z
      .array(
        z
          .object({
            hypothesisId: z.string().optional(),
            monthInstability: z.boolean().optional(),
            unstable: z.boolean().optional(),
            weekendUnderrepresented: z.boolean().optional(),
            weekendObservationShare: z.number().optional(),
            weekdayObservationShare: z.number().optional(),
            recommendation: z.string().optional(),
            summary: z.string().optional(),
          })
          .passthrough(),
      )
      .optional(),
    summary: z
      .object({
        weekendObservationShare: z.number().optional(),
        weekdayObservationShare: z.number().optional(),
        recommendWeekendSampling: z.boolean().optional(),
      })
      .optional(),
  })
  .passthrough();

function isRecommendationEngineReport(parsed: unknown): boolean {
  return (
    typeof parsed === "object"
    && parsed !== null
    && "recommendations" in parsed
    && "summary" in parsed
    && typeof (parsed as { summary: unknown }).summary === "object"
    && (parsed as { summary: { topRecommendation?: unknown } }).summary !== null
    && "topRecommendation" in (parsed as { summary: object }).summary
    && "highConfidenceCount" in (parsed as { summary: object }).summary
  );
}

function tryRead<T>(
  io: ResearchRecommendationEngineIo,
  path: string,
  schema: z.ZodType<T>,
): T | null {
  if (!io.fileExists(path)) {
    return null;
  }

  try {
    const parsed = JSON.parse(io.readFile(path));
    if (isRecommendationEngineReport(parsed)) {
      return null;
    }

    const result = schema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export type LoadedResearchRecommendationInputs = {
  inputStatus: ResearchRecommendationEngineInputStatus;
  portfolioAnalytics: z.infer<typeof portfolioAnalyticsSchema> | null;
  roiAnalysis: z.infer<typeof roiAnalysisSchema> | null;
  interactionAnalysis: z.infer<typeof interactionAnalysisSchema> | null;
  dimensionExplorer: z.infer<typeof dimensionExplorerSchema> | null;
  failureAnalysis: z.infer<typeof failureAnalysisSchema> | null;
  monthRegime: z.infer<typeof monthRegimeSchema> | null;
};

/** Loads optional recommendation engine inputs without failing when artifacts are absent. */
export function loadResearchRecommendationInputs(
  io: ResearchRecommendationEngineIo,
  inputPaths: ResearchRecommendationEngineInputPaths,
): LoadedResearchRecommendationInputs {
  const portfolioAnalytics = tryRead(
    io,
    inputPaths.portfolioAnalyticsPath,
    portfolioAnalyticsSchema,
  );
  const roiAnalysis = tryRead(io, inputPaths.roiAnalysisPath, roiAnalysisSchema);
  const interactionAnalysis = tryRead(
    io,
    inputPaths.interactionAnalysisPath,
    interactionAnalysisSchema,
  );
  const dimensionExplorer = tryRead(
    io,
    inputPaths.dimensionExplorerPath,
    dimensionExplorerSchema,
  );
  const failureAnalysis = tryRead(
    io,
    inputPaths.failureAnalysisPath,
    failureAnalysisSchema,
  );
  const monthRegime = tryRead(
    io,
    inputPaths.monthRegimeAnalysisPath,
    monthRegimeSchema,
  );

  return {
    inputStatus: {
      portfolioAnalyticsPresent: portfolioAnalytics !== null,
      roiAnalysisPresent: roiAnalysis !== null,
      interactionAnalysisPresent: interactionAnalysis !== null,
      dimensionExplorerPresent: dimensionExplorer !== null,
      failureAnalysisPresent: failureAnalysis !== null,
      monthRegimeAnalysisPresent: monthRegime !== null,
    },
    portfolioAnalytics,
    roiAnalysis,
    interactionAnalysis,
    dimensionExplorer,
    failureAnalysis,
    monthRegime,
  };
}
