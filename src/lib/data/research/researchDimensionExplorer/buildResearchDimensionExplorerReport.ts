import {
  analyzeRegistryAxisGroups,
  analyzeRegistryDimensions,
  buildAtlasGroupBucketsFromLoadedInputs,
  buildDimensionExplorerRecommendations,
  buildDimensionExplorerVisualization,
} from "./analyzeResearchDimensionExplorer";
import type { LoadedResearchDimensionExplorerInputs } from "./loadResearchDimensionExplorerInputs";
import type {
  ResearchDimensionExplorerInputPaths,
  ResearchDimensionExplorerReport,
} from "./researchDimensionExplorerTypes";

/** Builds the research dimension explorer report from the registry and optional artifacts. */
export function buildResearchDimensionExplorerReport(input: {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  inputPaths: ResearchDimensionExplorerInputPaths;
  loadedInputs: LoadedResearchDimensionExplorerInputs;
}): ResearchDimensionExplorerReport {
  const bucketsByGroup = buildAtlasGroupBucketsFromLoadedInputs(input.loadedInputs);
  const dimensions = analyzeRegistryDimensions(bucketsByGroup);
  const axisGroups = analyzeRegistryAxisGroups(input.loadedInputs, bucketsByGroup);
  const recommendations = buildDimensionExplorerRecommendations({
    dimensions,
    axisGroups,
  });
  const visualization = buildDimensionExplorerVisualization({
    dimensions,
    axisGroups,
    bucketsByGroup,
  });

  const totalRegistryBuckets = dimensions.reduce(
    (sum, dimension) => sum + dimension.bucketCount,
    0,
  );
  const totalPopulatedBuckets = bucketsByGroup.size > 0
    ? dimensions.reduce((sum, dimension) => sum + dimension.populatedBucketCount, 0)
    : null;
  const totalObservations = bucketsByGroup.size > 0
    ? dimensions.reduce((sum, dimension) => sum + dimension.observationCount, 0)
    : null;

  return {
    generatedAt: input.generatedAt,
    outputPath: input.outputPath,
    htmlOutputPath: input.htmlOutputPath,
    inputPaths: input.inputPaths,
    inputStatus: input.loadedInputs.inputStatus,
    summary: {
      dimensionCount: dimensions.length,
      axisGroupCount: axisGroups.length,
      totalRegistryBuckets,
      totalPopulatedBuckets,
      totalObservations,
      totalCandidates: input.loadedInputs.hypothesisCandidates?.candidates?.length ?? 0,
      totalValidations: input.loadedInputs.hypothesisValidation?.entries?.length ?? 0,
      recommendationCount: recommendations.length,
    },
    dimensions,
    axisGroups,
    recommendations,
    visualization,
  };
}
