import { describe, expect, it } from "vitest";

import {
  resolveParameterStrategySweepSummaryPath,
  serializeParameterStrategySweepSummary,
} from "./serializeParameterStrategySweepSummary";
import type { ParameterStrategySweepSummary } from "./types";

describe("serializeParameterStrategySweepSummary", () => {
  it("includes parameter set summaries with config, runs, and duration", () => {
    const summary: ParameterStrategySweepSummary = {
      definition: {
        strategyId: "fair-value-diffusion",
        parameters: {
          minimumEdgeThresholdCents: [2, 4],
        },
      },
      registryDir: "data/research-datasets",
      outputDir: "data/research-results",
      summaryPath:
        "data/research-results/fair-value-diffusion/parameter-sweep-summary.json",
      concurrency: 1,
      startedAt: "2026-06-27T12:00:00.000Z",
      completedAt: "2026-06-27T12:00:05.000Z",
      durationMs: 5_000,
      totalRuns: 2,
      successfulRuns: 2,
      failedRuns: 0,
      parameterSets: [
        {
          parameterSetId: "ps-0001",
          strategyId: "fair-value-diffusion",
          config: { minimumEdgeThresholdCents: 2 },
          durationMs: 2_500,
          totalRuns: 1,
          successfulRuns: 1,
          failedRuns: 0,
          runs: [
            {
              strategyId: "fair-value-diffusion",
              seriesTicker: "KXBTC15M",
              marketTicker: "KXBTC15M-MARKET-A",
              registryPath: "data/research-datasets/KXBTC15M/dataset-registry.json",
              fixturePath: "data/fixtures/KXBTC15M/KXBTC15M-MARKET-A/fixture.json",
              outputPath:
                "data/research-results/fair-value-diffusion/ps-0001/KXBTC15M/KXBTC15M-MARKET-A/research-output.json",
              status: "success",
              errorMessage: null,
              durationMs: 2_500,
              runId: "fixture-KXBTC15M-MARKET-A",
            },
          ],
        },
      ],
    };

    const serialized = serializeParameterStrategySweepSummary(summary);
    const parsed = JSON.parse(serialized);

    expect(parsed.parameterSets[0]).toMatchObject({
      parameterSetId: "ps-0001",
      strategyId: "fair-value-diffusion",
      config: { minimumEdgeThresholdCents: 2 },
      durationMs: 2_500,
      runs: [
        expect.objectContaining({
          marketTicker: "KXBTC15M-MARKET-A",
          status: "success",
        }),
      ],
    });
    expect(serialized).toBe(serializeParameterStrategySweepSummary(summary));
  });
});

describe("resolveParameterStrategySweepSummaryPath", () => {
  it("defaults to strategy-scoped parameter-sweep-summary.json", () => {
    expect(
      resolveParameterStrategySweepSummaryPath(
        "data/research-results",
        "fair-value-diffusion",
      ),
    ).toBe(
      "data/research-results/fair-value-diffusion/parameter-sweep-summary.json",
    );
  });
});
