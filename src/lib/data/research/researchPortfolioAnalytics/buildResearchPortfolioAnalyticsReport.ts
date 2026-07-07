import {
  aggregatePortfolioMetricsByAxisGroup,
  aggregatePortfolioMetricsByDimension,
  buildPortfolioAnalyticsRankings,
  buildPortfolioHypothesisRecords,
  resolvePassScoreThreshold,
} from "./aggregatePortfolioAnalytics";
import { computePassRate } from "./portfolioAnalyticsMath";
import type { LoadedResearchPortfolioAnalyticsInputs } from "./loadResearchPortfolioAnalyticsInputs";
import type {
  ResearchPortfolioAnalyticsInputPaths,
  ResearchPortfolioAnalyticsReport,
} from "./researchPortfolioAnalyticsTypes";

export function buildResearchPortfolioAnalyticsReport(input: {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  inputPaths: ResearchPortfolioAnalyticsInputPaths;
  loadedInputs: LoadedResearchPortfolioAnalyticsInputs;
}): ResearchPortfolioAnalyticsReport {
  const passScoreThreshold = resolvePassScoreThreshold(
    input.loadedInputs.passScoreThreshold,
    input.loadedInputs.failureAnalysisPassThreshold,
  );

  const records = buildPortfolioHypothesisRecords({
    candidates: input.loadedInputs.candidates,
    validations: input.loadedInputs.validations,
    failureAnalyses: input.loadedInputs.failureAnalyses,
  });

  const dimensions = aggregatePortfolioMetricsByDimension({
    records,
    candidates: input.loadedInputs.candidates,
    passScoreThreshold,
  });

  const axisGroups = aggregatePortfolioMetricsByAxisGroup({
    records,
    candidates: input.loadedInputs.candidates,
    passScoreThreshold,
  });

  const rankings = buildPortfolioAnalyticsRankings({ dimensions, axisGroups });

  const totalPasses = input.loadedInputs.validations.filter((entry) => entry.passes).length;
  const totalValidations = input.loadedInputs.validations.length;

  return {
    generatedAt: input.generatedAt,
    outputPath: input.outputPath,
    htmlOutputPath: input.htmlOutputPath,
    inputPaths: input.inputPaths,
    inputStatus: input.loadedInputs.inputStatus,
    summary: {
      totalCandidates: input.loadedInputs.candidates.length,
      totalValidations,
      totalPasses,
      overallPassRate: computePassRate(totalPasses, totalValidations),
      dimensionCount: dimensions.length,
      axisGroupCount: axisGroups.length,
      passScoreThreshold,
    },
    dimensions,
    axisGroups,
    rankings,
  };
}
