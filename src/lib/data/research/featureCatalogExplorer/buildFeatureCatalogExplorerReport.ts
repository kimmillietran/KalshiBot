import { analyzeFeatureCatalog } from "./analyzeFeatureCatalogExplorer";
import type { LoadedFeatureCatalogExplorerInputs } from "./loadFeatureCatalogExplorerInputs";
import type {
  FeatureCatalogExplorerInputPaths,
  FeatureCatalogExplorerReport,
} from "./featureCatalogExplorerTypes";

/** Builds the feature catalog explorer report from the unified catalog and optional artifacts. */
export function buildFeatureCatalogExplorerReport(input: {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  inputPaths: FeatureCatalogExplorerInputPaths;
  loadedInputs: LoadedFeatureCatalogExplorerInputs;
}): FeatureCatalogExplorerReport {
  const analysis = analyzeFeatureCatalog(input.loadedInputs);

  return {
    generatedAt: input.generatedAt,
    outputPath: input.outputPath,
    htmlOutputPath: input.htmlOutputPath,
    inputPaths: input.inputPaths,
    inputStatus: input.loadedInputs.inputStatus,
    summary: analysis.summary,
    features: analysis.features,
    computedButUnused: analysis.computedButUnused,
    dimensionsWithoutCatalogMetadata: analysis.dimensionsWithoutCatalogMetadata,
    eligibleForFutureDimensions: analysis.eligibleForFutureDimensions,
    genuinelyMissingIndicators: analysis.genuinelyMissingIndicators,
    recommendedNextFeatureDimensions: analysis.recommendedNextFeatureDimensions,
  };
}
