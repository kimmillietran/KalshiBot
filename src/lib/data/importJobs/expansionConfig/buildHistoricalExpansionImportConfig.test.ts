import { describe, expect, it } from "vitest";

import {
  buildHistoricalExpansionImportConfig,
} from "./buildHistoricalExpansionImportConfig";
import {
  collectCoveredWindowsFromImportConfigs,
  isWindowFullyCovered,
} from "./collectCoveredWindows";
import { parseHistoricalCoveragePlanJson } from "./loadHistoricalCoveragePlan";
import type { HistoricalCoveragePlan } from "./expansionConfigTypes";

const GENERATED_AT = "2026-07-03T12:00:00.000Z";

function createPlan(
  recommendations: HistoricalCoveragePlan["recommendations"],
  coveredWindows?: HistoricalCoveragePlan["coverageSnapshot"] extends infer T
    ? T extends { coveredWindows?: infer W }
      ? W
      : never
    : never,
): HistoricalCoveragePlan {
  return {
    generatedAt: GENERATED_AT,
    outputPath: "data/research-results/historical-coverage-plan.json",
    coverageSnapshot: {
      coveredWindows: coveredWindows ?? [],
    },
    recommendations,
  };
}

describe("parseHistoricalCoveragePlanJson", () => {
  it("parses a valid coverage plan", () => {
    const plan = parseHistoricalCoveragePlanJson(
      "plan.json",
      JSON.stringify({
        generatedAt: GENERATED_AT,
        outputPath: "plan.json",
        recommendations: [
          {
            priority: 1,
            windowStart: "2026-01-01T00:00:00.000Z",
            windowEnd: "2026-01-31T23:59:59.000Z",
            estimatedMarketCount: 8640,
            reason: "Fill Q1 gap",
          },
        ],
      }),
    );

    expect(plan.recommendations).toHaveLength(1);
    expect(plan.recommendations[0]?.estimatedMarketCount).toBe(8640);
  });

  it("parses M9.1 coverage planner recommendations with month fields", () => {
    const plan = parseHistoricalCoveragePlanJson(
      "plan.json",
      JSON.stringify({
        generatedAt: GENERATED_AT,
        outputPath: "plan.json",
        snapshot: {
          marketCount: 500,
          uniqueTradingDays: 6,
          monthCoverage: [{ month: "2026-04" }],
          missingMonths: ["2026-01"],
        },
        recommendations: [
          {
            seriesTicker: "KXBTC15M",
            startMonth: "2026-01",
            endMonth: "2026-03",
            priorityScore: 71,
            rationale: "Fill Q1 gap",
            expectedResearchBenefit: "Adds missing months",
          },
        ],
      }),
    );

    expect(plan.recommendations[0]?.priority).toBe(71);
    expect(plan.recommendations[0]?.windowStart).toBe("2026-01-01T00:00:00.000Z");
    expect(plan.recommendations[0]?.reason).toBe("Fill Q1 gap");
  });
});

describe("isWindowFullyCovered", () => {
  it("detects when a recommendation window is already covered", () => {
    expect(
      isWindowFullyCovered(
        {
          windowStart: "2026-02-01T00:00:00.000Z",
          windowEnd: "2026-02-15T00:00:00.000Z",
        },
        [
          {
            windowStart: "2026-01-01T00:00:00.000Z",
            windowEnd: "2026-03-31T23:59:59.000Z",
          },
        ],
      ),
    ).toBe(true);
  });
});

describe("buildHistoricalExpansionImportConfig", () => {
  it("converts recommendations into prioritized import jobs with Coinbase defaults", () => {
    const config = buildHistoricalExpansionImportConfig({
      plan: createPlan([
        {
          priority: 2,
          windowStart: "2026-02-01T00:00:00.000Z",
          windowEnd: "2026-02-28T23:59:59.000Z",
          estimatedMarketCount: 4000,
          reason: "February gap",
        },
        {
          priority: 1,
          windowStart: "2026-01-01T00:00:00.000Z",
          windowEnd: "2026-01-31T23:59:59.000Z",
          estimatedMarketCount: 8640,
          reason: "January gap",
        },
      ]),
      inputPath: "data/research-results/historical-coverage-plan.json",
      outputPath: "data/import-configs/historical-expansion-config.json",
      importConfigsDir: "data/import-configs",
      generatedAt: GENERATED_AT,
      dryRun: true,
    });

    expect(config.summary.scheduledJobCount).toBe(2);
    expect(config.jobs[0]?.priority).toBe(1);
    expect(config.jobs[0]?.importDefaults.btc.provider).toBe("coinbase-spot");
    expect(config.jobs[0]?.importDefaults.kalshi.marketSource).toBe("kalshi-rest");
    expect(config.jobs[0]?.discovery.sampling.afterDate).toBe("2026-01-01T00:00:00.000Z");
    expect(config.jobs[0]?.estimatedMarketCount).toBe(8640);
  });

  it("skips windows that are already covered", () => {
    const config = buildHistoricalExpansionImportConfig({
      plan: createPlan(
        [
          {
            priority: 1,
            windowStart: "2026-01-01T00:00:00.000Z",
            windowEnd: "2026-01-31T23:59:59.000Z",
            reason: "Already imported",
          },
        ],
        [
          {
            windowStart: "2026-01-01T00:00:00.000Z",
            windowEnd: "2026-01-31T23:59:59.000Z",
          },
        ],
      ),
      inputPath: "plan.json",
      outputPath: "out.json",
      importConfigsDir: "data/import-configs",
      generatedAt: GENERATED_AT,
      dryRun: true,
    });

    expect(config.summary.scheduledJobCount).toBe(0);
    expect(config.summary.skippedJobCount).toBe(1);
    expect(config.jobs[0]?.status).toBe("skipped");
  });

  it("dedupes against existing import config windows", () => {
    const config = buildHistoricalExpansionImportConfig({
      plan: createPlan([
        {
          priority: 1,
          windowStart: "2026-05-02T09:00:00.000Z",
          windowEnd: "2026-05-02T09:15:00.000Z",
          reason: "Single market already present",
        },
      ]),
      inputPath: "plan.json",
      outputPath: "out.json",
      importConfigsDir: "data/import-configs",
      generatedAt: GENERATED_AT,
      dryRun: true,
      existingCoveredWindows: [
        {
          windowStart: "2026-05-02T09:00:00.000Z",
          windowEnd: "2026-05-02T09:15:00.000Z",
        },
      ],
    });

    expect(config.summary.skippedJobCount).toBe(1);
  });
});

describe("collectCoveredWindowsFromImportConfigs", () => {
  it("reads covered windows from existing per-market configs", () => {
    const windows = collectCoveredWindowsFromImportConfigs(
      "data/import-configs",
      {
        fileExists: (path) =>
          path === "data/import-configs/KXBTC15M"
          || path === "data/import-configs/KXBTC15M/MARKET-A/config.json",
        isDirectory: (path) => path === "data/import-configs/KXBTC15M",
        readdir: (path) =>
          path.endsWith("KXBTC15M") ? ["MARKET-A"] : [],
        readFile: () =>
          JSON.stringify({
            startTime: "2026-05-02T09:00:00.000Z",
            endTime: "2026-05-02T09:15:00.000Z",
          }),
      },
    );

    expect(windows).toEqual([
      {
        windowStart: "2026-05-02T09:00:00.000Z",
        windowEnd: "2026-05-02T09:15:00.000Z",
      },
    ]);
  });
});
