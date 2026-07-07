import { buildResearchRecommendations } from "./buildResearchRecommendations";
import type { LoadedResearchRecommendationInputs } from "./loadResearchRecommendationInputs";
import type {
  ResearchRecommendationEngineInputPaths,
  ResearchRecommendationEngineReport,
} from "./researchRecommendationEngineTypes";

/** Builds the research recommendation engine report from optional diagnostic artifacts. */
export function buildResearchRecommendationEngineReport(input: {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  inputPaths: ResearchRecommendationEngineInputPaths;
  loadedInputs: LoadedResearchRecommendationInputs;
}): ResearchRecommendationEngineReport {
  const recommendations = buildResearchRecommendations(input.loadedInputs);
  const statusValues = Object.values(input.loadedInputs.inputStatus);
  const highConfidenceCount = recommendations.filter(
    (entry) => entry.confidence === "high",
  ).length;

  return {
    generatedAt: input.generatedAt,
    outputPath: input.outputPath,
    htmlOutputPath: input.htmlOutputPath,
    inputPaths: input.inputPaths,
    inputStatus: input.loadedInputs.inputStatus,
    summary: {
      recommendationCount: recommendations.length,
      artifactsAvailable: statusValues.filter(Boolean).length,
      artifactsTotal: statusValues.length,
      topRecommendation: recommendations[0]?.title ?? null,
      highConfidenceCount,
    },
    recommendations,
  };
}
