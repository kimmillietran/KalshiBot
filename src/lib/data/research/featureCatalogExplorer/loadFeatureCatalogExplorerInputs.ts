import { z } from "zod";

import type {
  FeatureCatalogExplorerInputPaths,
  FeatureCatalogExplorerInputStatus,
  FeatureCatalogExplorerIo,
} from "./featureCatalogExplorerTypes";

const dimensionExplorerSchema = z
  .object({
    dimensions: z
      .array(
        z
          .object({
            dimensionId: z.string(),
            label: z.string().optional(),
            bucketCount: z.number().optional(),
            coverage: z.number().nullable().optional(),
            sparsity: z.number().nullable().optional(),
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
            dimensionIds: z.array(z.string()).optional(),
            candidateYield: z.number().optional(),
            populationRate: z.number().nullable().optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

const portfolioAnalyticsSchema = z
  .object({
    entries: z
      .array(
        z
          .object({
            researchFamily: z.string(),
            robustnessMedian: z.number().optional(),
            candidateCount: z.number().optional(),
            promisingCount: z.number().optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

const roiAnalysisSchema = z
  .object({
    entries: z
      .array(
        z
          .object({
            researchFamily: z.string(),
            roiScore: z.number().optional(),
            candidateYield: z.number().optional(),
            validationYield: z.number().optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

const duplicationAnalysisSchema = z
  .object({
    entries: z
      .array(
        z
          .object({
            featureId: z.string(),
            duplicationGroupId: z.string().nullable().optional(),
            status: z.string().optional(),
            summary: z.string().optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

function isFeatureCatalogExplorerReport(parsed: unknown): boolean {
  return (
    typeof parsed === "object"
    && parsed !== null
    && "features" in parsed
    && "computedButUnused" in parsed
    && "genuinelyMissingIndicators" in parsed
  );
}

function tryRead<T>(
  io: FeatureCatalogExplorerIo,
  path: string,
  schema: z.ZodType<T>,
): T | null {
  if (!io.fileExists(path)) {
    return null;
  }

  try {
    const parsed = JSON.parse(io.readFile(path));
    if (isFeatureCatalogExplorerReport(parsed)) {
      return null;
    }

    const result = schema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export type LoadedFeatureCatalogExplorerInputs = {
  inputStatus: FeatureCatalogExplorerInputStatus;
  dimensionExplorer: z.infer<typeof dimensionExplorerSchema> | null;
  portfolioAnalytics: z.infer<typeof portfolioAnalyticsSchema> | null;
  roiAnalysis: z.infer<typeof roiAnalysisSchema> | null;
  duplicationAnalysis: z.infer<typeof duplicationAnalysisSchema> | null;
};

/** Loads optional feature catalog explorer inputs without failing when artifacts are absent. */
export function loadFeatureCatalogExplorerInputs(
  io: FeatureCatalogExplorerIo,
  inputPaths: FeatureCatalogExplorerInputPaths,
): LoadedFeatureCatalogExplorerInputs {
  const dimensionExplorer = tryRead(
    io,
    inputPaths.dimensionExplorerPath,
    dimensionExplorerSchema,
  );
  const portfolioAnalytics = tryRead(
    io,
    inputPaths.portfolioAnalyticsPath,
    portfolioAnalyticsSchema,
  );
  const roiAnalysis = tryRead(io, inputPaths.roiAnalysisPath, roiAnalysisSchema);
  const duplicationAnalysis = tryRead(
    io,
    inputPaths.duplicationAnalysisPath,
    duplicationAnalysisSchema,
  );

  return {
    inputStatus: {
      dimensionExplorerPresent: dimensionExplorer !== null,
      portfolioAnalyticsPresent: portfolioAnalytics !== null,
      roiAnalyticsPresent: roiAnalysis !== null,
      duplicationAnalysisPresent: duplicationAnalysis !== null,
    },
    dimensionExplorer,
    portfolioAnalytics,
    roiAnalysis,
    duplicationAnalysis,
  };
}
