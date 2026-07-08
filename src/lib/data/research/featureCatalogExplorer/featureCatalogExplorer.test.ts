import { describe, expect, it } from "vitest";

import { listUnifiedFeatureCatalogEntries } from "@/lib/data/research/featureCatalog";
import { RESEARCH_DIMENSIONS } from "@/lib/data/research/dimensions";

import { analyzeFeatureCatalog } from "./analyzeFeatureCatalogExplorer";
import { buildFeatureCatalogExplorerReport } from "./buildFeatureCatalogExplorerReport";
import { loadFeatureCatalogExplorerInputs } from "./loadFeatureCatalogExplorerInputs";
import { serializeFeatureCatalogExplorerHtml } from "./serializeFeatureCatalogExplorerHtml";
import { serializeFeatureCatalogExplorerReport } from "./serializeFeatureCatalogExplorerReport";
import { DEFAULT_FEATURE_CATALOG_EXPLORER_INPUT_PATHS } from "./featureCatalogExplorerTypes";

const GENERATED_AT = "2026-07-07T23:30:00.000Z";
const OUTPUT_PATH = "data/research-results/feature-catalog.json";
const HTML_PATH = "data/reports/feature-catalog.html";

function createMemoryIo(files: Record<string, string> = {}) {
  return {
    readFile: (path: string) => files[path] ?? "",
    fileExists: (path: string) => path in files,
  };
}

function createOptionalArtifactsFixture(): Record<string, string> {
  return {
    [DEFAULT_FEATURE_CATALOG_EXPLORER_INPUT_PATHS.dimensionExplorerPath]:
      JSON.stringify({
        dimensions: [
          {
            dimensionId: "probability",
            bucketCount: 10,
            coverage: 0.95,
            sparsity: 0.05,
            observationCount: 1200,
          },
          {
            dimensionId: "momentum15m",
            bucketCount: 4,
            coverage: 0.62,
            sparsity: 0.38,
            observationCount: 800,
          },
        ],
        axisGroups: [
          {
            groupId: "probability-moneyness",
            candidateYield: 3,
            populationRate: 0.71,
          },
        ],
      }),
    [DEFAULT_FEATURE_CATALOG_EXPLORER_INPUT_PATHS.portfolioAnalyticsPath]:
      JSON.stringify({
        entries: [
          {
            researchFamily: "momentum",
            robustnessMedian: 0.74,
            candidateCount: 5,
          },
        ],
      }),
    [DEFAULT_FEATURE_CATALOG_EXPLORER_INPUT_PATHS.roiAnalysisPath]:
      JSON.stringify({
        entries: [
          {
            researchFamily: "hour-only",
            roiScore: 0.42,
            candidateYield: 2,
          },
        ],
      }),
    [DEFAULT_FEATURE_CATALOG_EXPLORER_INPUT_PATHS.duplicationAnalysisPath]:
      JSON.stringify({
        entries: [
          {
            featureId: "rolling-volatility",
            duplicationGroupId: "volatility",
            status: "duplicate",
            summary: "Overlaps annualized volatility research field",
          },
        ],
      }),
  };
}

describe("featureCatalogExplorer", () => {
  it("builds an empty catalog report when no entries are provided", () => {
    const io = createMemoryIo();
    const loadedInputs = loadFeatureCatalogExplorerInputs(
      io,
      DEFAULT_FEATURE_CATALOG_EXPLORER_INPUT_PATHS,
    );
    const analysis = analyzeFeatureCatalog(loadedInputs, []);

    expect(analysis.summary.totalFeatures).toBe(0);
    expect(analysis.summary.usedInResearchCount).toBe(0);
    expect(analysis.computedButUnused).toEqual([]);
    expect(analysis.dimensionsWithoutCatalogMetadata).toEqual(
      RESEARCH_DIMENSIONS.map((dimension) => dimension.id).sort((left, right) =>
        left.localeCompare(right),
      ),
    );
  });

  it("builds a full catalog report with registry joins and no optional artifacts", () => {
    const io = createMemoryIo();
    const loadedInputs = loadFeatureCatalogExplorerInputs(
      io,
      DEFAULT_FEATURE_CATALOG_EXPLORER_INPUT_PATHS,
    );
    const report = buildFeatureCatalogExplorerReport({
      generatedAt: GENERATED_AT,
      outputPath: OUTPUT_PATH,
      htmlOutputPath: HTML_PATH,
      inputPaths: DEFAULT_FEATURE_CATALOG_EXPLORER_INPUT_PATHS,
      loadedInputs,
    });

    expect(report.summary.totalFeatures).toBe(listUnifiedFeatureCatalogEntries().length);
    expect(report.summary.registryDimensionCount).toBe(RESEARCH_DIMENSIONS.length);
    expect(report.summary.optionalArtifactsAvailable).toBe(0);
    expect(report.features.some((feature) => feature.featureId === "predicted-probability")).toBe(
      true,
    );
    expect(
      report.features.find((feature) => feature.featureId === "predicted-probability")
        ?.registeredAsResearchDimension,
    ).toBe(true);
    expect(report.genuinelyMissingIndicators).toContain("ema");
    expect(report.computedButUnused.length).toBeGreaterThan(0);
  });

  it("joins dimension registry metrics from optional artifacts", () => {
    const io = createMemoryIo(createOptionalArtifactsFixture());
    const loadedInputs = loadFeatureCatalogExplorerInputs(
      io,
      DEFAULT_FEATURE_CATALOG_EXPLORER_INPUT_PATHS,
    );
    const report = buildFeatureCatalogExplorerReport({
      generatedAt: GENERATED_AT,
      outputPath: OUTPUT_PATH,
      htmlOutputPath: HTML_PATH,
      inputPaths: DEFAULT_FEATURE_CATALOG_EXPLORER_INPUT_PATHS,
      loadedInputs,
    });

    expect(report.inputStatus.dimensionExplorerPresent).toBe(true);
    expect(report.inputStatus.portfolioAnalyticsPresent).toBe(true);
    expect(report.summary.optionalArtifactsAvailable).toBe(4);

    const probability = report.features.find(
      (feature) => feature.featureId === "predicted-probability",
    );
    expect(probability?.bucketCount).toBe(10);
    expect(probability?.coverageNotes).toContain("Coverage 95%");

    const momentum = report.features.find(
      (feature) => feature.featureId === "momentum-percent",
    );
    expect(momentum?.averageRobustness).toBe(0.74);

    const rollingVolatility = report.features.find(
      (feature) => feature.featureId === "rolling-volatility",
    );
    expect(rollingVolatility?.duplicationStatus).toContain("annualized volatility");
  });

  it("ignores missing optional artifacts without failing", () => {
    const io = createMemoryIo({
      [DEFAULT_FEATURE_CATALOG_EXPLORER_INPUT_PATHS.dimensionExplorerPath]:
        JSON.stringify({ dimensions: [] }),
    });
    const loadedInputs = loadFeatureCatalogExplorerInputs(
      io,
      DEFAULT_FEATURE_CATALOG_EXPLORER_INPUT_PATHS,
    );

    expect(loadedInputs.inputStatus.dimensionExplorerPresent).toBe(true);
    expect(loadedInputs.inputStatus.portfolioAnalyticsPresent).toBe(false);
    expect(loadedInputs.roiAnalysis).toBeNull();
  });

  it("rejects its own output file when loading optional inputs", () => {
    const io = createMemoryIo({
      [DEFAULT_FEATURE_CATALOG_EXPLORER_INPUT_PATHS.dimensionExplorerPath]:
        JSON.stringify({
          features: [],
          computedButUnused: [],
          genuinelyMissingIndicators: [],
        }),
    });
    const loadedInputs = loadFeatureCatalogExplorerInputs(
      io,
      DEFAULT_FEATURE_CATALOG_EXPLORER_INPUT_PATHS,
    );

    expect(loadedInputs.dimensionExplorer).toBeNull();
  });

  it("serializes deterministic JSON and HTML output", () => {
    const io = createMemoryIo(createOptionalArtifactsFixture());
    const loadedInputs = loadFeatureCatalogExplorerInputs(
      io,
      DEFAULT_FEATURE_CATALOG_EXPLORER_INPUT_PATHS,
    );
    const report = buildFeatureCatalogExplorerReport({
      generatedAt: GENERATED_AT,
      outputPath: OUTPUT_PATH,
      htmlOutputPath: HTML_PATH,
      inputPaths: DEFAULT_FEATURE_CATALOG_EXPLORER_INPUT_PATHS,
      loadedInputs,
    });

    const json = serializeFeatureCatalogExplorerReport(report);
    const html = serializeFeatureCatalogExplorerHtml(report);

    expect(json).toBe(serializeFeatureCatalogExplorerReport(report));
    expect(html).toBe(serializeFeatureCatalogExplorerHtml(report));
    expect(json).toContain('"featureId":"annualized-volatility"');
    expect(html).toContain("Feature Catalog Explorer");
    expect(html).toContain("annualized-volatility");
  });
});
