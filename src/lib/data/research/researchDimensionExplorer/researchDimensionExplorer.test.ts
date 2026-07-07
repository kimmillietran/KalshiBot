import { describe, expect, it } from "vitest";

import { buildResearchDimensionExplorerReport } from "./buildResearchDimensionExplorerReport";
import { computeSampleSizeStats, computeShannonEntropy } from "./dimensionExplorerMath";
import { loadResearchDimensionExplorerInputs } from "./loadResearchDimensionExplorerInputs";
import { serializeResearchDimensionExplorerHtml } from "./serializeResearchDimensionExplorerHtml";
import { serializeResearchDimensionExplorerReport } from "./serializeResearchDimensionExplorerReport";
import { DEFAULT_RESEARCH_DIMENSION_EXPLORER_INPUT_PATHS } from "./researchDimensionExplorerTypes";
import {
  listResearchAxisGroups,
  RESEARCH_DIMENSIONS,
} from "@/lib/data/research/dimensions";

const GENERATED_AT = "2026-07-07T21:00:00.000Z";
const OUTPUT_PATH = "data/research-results/research-dimension-explorer.json";
const HTML_PATH = "data/reports/research-dimension-explorer.html";

function createMemoryIo(files: Record<string, string> = {}) {
  return {
    readFile: (path: string) => files[path] ?? "",
    fileExists: (path: string) => path in files,
  };
}

function createBucket(bucketId: string, observations: number) {
  return {
    bucketId,
    bucketLabel: bucketId,
    observations,
    uniqueTradingDays: observations > 0 ? 2 : 0,
  };
}

function createAtlasJson(input?: {
  probability?: number;
  moneyness?: number;
  coarseProbabilityOnly?: number;
}) {
  return JSON.stringify({
    probabilityBuckets: [
      createBucket("prob-0", input?.probability ?? 0),
      createBucket("prob-1", input?.probability ?? 10),
    ],
    timeRemainingBuckets: [createBucket("time-0-5m", 5)],
    moneynessBuckets: [createBucket("moneyness-near-above", input?.moneyness ?? 8)],
    volatilityBuckets: [createBucket("vol-low", 4)],
    coarseBuckets: {
      probabilityOnly: [
        createBucket("coarse-prob-0", input?.coarseProbabilityOnly ?? 6),
      ],
      probabilityTime: [
        createBucket("coarse-prob-1-coarse-time-early", 12),
      ],
      probabilityRegime: [
        createBucket("coarse-prob-1-coarse-regime-high", 7),
      ],
      probabilityMoneyness: [
        createBucket("coarse-prob-1-moneyness-near-above", 9),
      ],
      moneynessTime: [createBucket("moneyness-near-above-time-5-15m", 3)],
      volatilityMoneyness: [createBucket("vol-low-moneyness-near-above", 2)],
      volatilityProbabilityTime: [
        createBucket("vol-low-coarse-prob-1-coarse-time-early", 1),
      ],
    },
    sampleCounts: {
      totalObservations: 40,
      skippedMissingProbability: 1,
      skippedMissingContext: 0,
      skippedMissingSettlement: 0,
    },
  });
}

describe("researchDimensionExplorer", () => {
  it("builds a registry-only report with empty optional inputs", () => {
    const io = createMemoryIo();
    const loadedInputs = loadResearchDimensionExplorerInputs(
      io,
      DEFAULT_RESEARCH_DIMENSION_EXPLORER_INPUT_PATHS,
    );
    const report = buildResearchDimensionExplorerReport({
      generatedAt: GENERATED_AT,
      outputPath: OUTPUT_PATH,
      htmlOutputPath: HTML_PATH,
      inputPaths: DEFAULT_RESEARCH_DIMENSION_EXPLORER_INPUT_PATHS,
      loadedInputs,
    });

    expect(report.summary.dimensionCount).toBe(RESEARCH_DIMENSIONS.length);
    expect(report.summary.axisGroupCount).toBe(listResearchAxisGroups().length);
    expect(RESEARCH_DIMENSIONS).toHaveLength(12);
    expect(listResearchAxisGroups()).toHaveLength(24);
    expect(report.summary.totalPopulatedBuckets).toBeNull();
    expect(report.dimensions.every((dimension) => dimension.coverage === null)).toBe(true);
    expect(report.dimensions[0]?.dimensionId).toBe("probability");
  });

  it("analyzes a single populated dimension from atlas input", () => {
    const io = createMemoryIo({
      [DEFAULT_RESEARCH_DIMENSION_EXPLORER_INPUT_PATHS.mispricingAtlasPath]:
        createAtlasJson({ probability: 15 }),
    });
    const loadedInputs = loadResearchDimensionExplorerInputs(
      io,
      DEFAULT_RESEARCH_DIMENSION_EXPLORER_INPUT_PATHS,
    );
    const report = buildResearchDimensionExplorerReport({
      generatedAt: GENERATED_AT,
      outputPath: OUTPUT_PATH,
      htmlOutputPath: HTML_PATH,
      inputPaths: DEFAULT_RESEARCH_DIMENSION_EXPLORER_INPUT_PATHS,
      loadedInputs,
    });

    const probability = report.dimensions.find(
      (dimension) => dimension.dimensionId === "probability",
    );
    expect(probability?.observationCount).toBeGreaterThan(0);
    expect(probability?.coverage).toBeGreaterThan(0);
    expect(probability?.entropy).not.toBeNull();
  });

  it("computes axis group yields from candidates and validation artifacts", () => {
    const io = createMemoryIo({
      [DEFAULT_RESEARCH_DIMENSION_EXPLORER_INPUT_PATHS.mispricingAtlasPath]:
        createAtlasJson(),
      [DEFAULT_RESEARCH_DIMENSION_EXPLORER_INPUT_PATHS.hypothesisCandidatesPath]:
        JSON.stringify({
          candidates: [
            {
              candidateId:
                "atlas-probabilityMoneyness-coarse-prob-1-moneyness-near-above-over",
            },
            {
              candidateId:
                "atlas-probabilityMoneyness-coarse-prob-1-moneyness-near-above-under",
            },
          ],
        }),
      [DEFAULT_RESEARCH_DIMENSION_EXPLORER_INPUT_PATHS.hypothesisValidationPath]:
        JSON.stringify({
          entries: [
            {
              hypothesisId:
                "atlas-probabilityMoneyness-coarse-prob-1-moneyness-near-above-over",
            },
          ],
        }),
    });

    const loadedInputs = loadResearchDimensionExplorerInputs(
      io,
      DEFAULT_RESEARCH_DIMENSION_EXPLORER_INPUT_PATHS,
    );
    const report = buildResearchDimensionExplorerReport({
      generatedAt: GENERATED_AT,
      outputPath: OUTPUT_PATH,
      htmlOutputPath: HTML_PATH,
      inputPaths: DEFAULT_RESEARCH_DIMENSION_EXPLORER_INPUT_PATHS,
      loadedInputs,
    });

    const group = report.axisGroups.find(
      (entry) => entry.groupId === "probabilityMoneyness",
    );
    expect(group?.candidateYield).toBe(2);
    expect(group?.validationYield).toBe(1);
    expect(report.recommendations.length).toBeGreaterThan(0);
  });

  it("handles a large registry deterministically", () => {
    const io = createMemoryIo({
      [DEFAULT_RESEARCH_DIMENSION_EXPLORER_INPUT_PATHS.mispricingAtlasPath]:
        createAtlasJson({
          probability: 20,
          moneyness: 11,
          coarseProbabilityOnly: 14,
        }),
    });
    const loadedInputs = loadResearchDimensionExplorerInputs(
      io,
      DEFAULT_RESEARCH_DIMENSION_EXPLORER_INPUT_PATHS,
    );
    const report = buildResearchDimensionExplorerReport({
      generatedAt: GENERATED_AT,
      outputPath: OUTPUT_PATH,
      htmlOutputPath: HTML_PATH,
      inputPaths: DEFAULT_RESEARCH_DIMENSION_EXPLORER_INPUT_PATHS,
      loadedInputs,
    });

    const first = serializeResearchDimensionExplorerReport(report);
    const second = serializeResearchDimensionExplorerReport(report);
    expect(first).toBe(second);
    expect(report.dimensions.map((dimension) => dimension.dimensionId)).toEqual(
      RESEARCH_DIMENSIONS.map((dimension) => dimension.id),
    );
    expect(serializeResearchDimensionExplorerHtml(report)).toContain(
      "Research Dimension Explorer",
    );
  });

  it("computes math helpers predictably", () => {
    expect(computeShannonEntropy([10, 10])).toBe(1);
    expect(computeSampleSizeStats([1, 2, 3, 4]).median).toBe(2.5);
  });
});
