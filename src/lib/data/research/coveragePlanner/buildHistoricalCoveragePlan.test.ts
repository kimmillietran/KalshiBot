import { describe, expect, it } from "vitest";

import {
  buildHistoricalCoveragePlan,
  buildHistoricalCoveragePlanFromPaths,
  serializeHistoricalCoveragePlan,
} from "./buildHistoricalCoveragePlan";
import { serializeHistoricalCoveragePlanHtml } from "./serializeHistoricalCoveragePlanHtml";
import { buildCoverageImportRecommendations } from "./buildCoverageImportRecommendations";
import { computeCoverageSnapshot } from "./computeCoverageSnapshot";
import {
  calendarMonthsBetween,
  enumerateMonthRange,
  quarterLabel,
  tradingDaysBetween,
} from "./coveragePlannerDateUtils";
import type {
  CoverageMarketRecord,
  CoveragePlannerIo,
  HistoricalCoveragePlanConfig,
} from "./coveragePlannerTypes";
import { scanCoverageMarketRecords } from "./scanCoverageMarketRecords";

const GENERATED_AT = "2026-07-03T20:00:00.000Z";

const DEFAULT_CONFIG: HistoricalCoveragePlanConfig = {
  outputPath: "data/research-results/historical-coverage-plan.json",
  htmlOutputPath: "data/reports/historical-coverage-plan.html",
  dataHealthPath: "data/research-results/data-health.json",
  mispricingAtlasPath: "data/research-results/mispricing-atlas.json",
  hypothesisValidationPath: "data/research-results/hypothesis-validation.json",
  regimeTagsPath: "data/research-results/regime-tags.json",
  importConfigsDir: "data/import-configs",
  fixturesDir: "data/fixtures",
  researchResultsDir: "data/research-results",
  monthPersistenceThreshold: 0.67,
};

type MockFs = {
  files: Record<string, string>;
  directories: Set<string>;
};

function createIo(mock: MockFs): CoveragePlannerIo {
  return {
    readdir: (path) => {
      const prefix = path.endsWith("/") ? path.slice(0, -1) : path;
      const entries = new Set<string>();
      for (const filePath of Object.keys(mock.files)) {
        if (filePath.startsWith(`${prefix}/`)) {
          const remainder = filePath.slice(prefix.length + 1);
          const segment = remainder.split("/")[0];
          if (segment) {
            entries.add(segment);
          }
        }
      }
      for (const directory of mock.directories) {
        if (directory.startsWith(`${prefix}/`)) {
          const remainder = directory.slice(prefix.length + 1);
          const segment = remainder.split("/")[0];
          if (segment) {
            entries.add(segment);
          }
        }
      }
      return [...entries].sort();
    },
    readFile: (path) => mock.files[path] ?? "",
    fileExists: (path) =>
      mock.files[path] !== undefined || mock.directories.has(path),
    isDirectory: (path) => mock.directories.has(path),
  };
}

function addFile(mock: MockFs, path: string, content: string): void {
  const parts = path.split("/");
  for (let index = 1; index < parts.length; index += 1) {
    mock.directories.add(parts.slice(0, index).join("/"));
  }
  mock.files[path] = content;
}

function importConfig(
  marketTicker: string,
  startTime: string,
  endTime: string,
): string {
  return JSON.stringify({ marketTicker, startTime, endTime });
}

describe("coveragePlannerDateUtils", () => {
  it("lists inclusive months and trading days", () => {
    expect(
      calendarMonthsBetween("2026-01-15T00:00:00.000Z", "2026-03-02T00:00:00.000Z"),
    ).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(
      tradingDaysBetween("2026-01-01T00:00:00.000Z", "2026-01-03T00:00:00.000Z"),
    ).toEqual(["2026-01-01", "2026-01-02", "2026-01-03"]);
    expect(enumerateMonthRange("2026-01", "2026-03")).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
    ]);
    expect(quarterLabel("2026-02")).toBe("2026-Q1");
  });
});

describe("scanCoverageMarketRecords", () => {
  it("merges import configs and research outputs", () => {
    const mock: MockFs = { files: {}, directories: new Set(["data"]) };
    addFile(
      mock,
      "data/import-configs/KXBTC15M/MKT-A/config.json",
      importConfig(
        "MKT-A",
        "2026-01-01T00:00:00.000Z",
        "2026-01-31T23:59:59.000Z",
      ),
    );
    addFile(
      mock,
      "data/research-results/noop/KXBTC15M/MKT-B/research-output.json",
      JSON.stringify({
        marketTicker: "MKT-B",
        seriesTicker: "KXBTC15M",
        closeTime: "2026-03-15T12:00:00.000Z",
      }),
    );

    const result = scanCoverageMarketRecords(createIo(mock), {
      importConfigsDir: "data/import-configs",
      fixturesDir: "data/fixtures",
      researchResultsDir: "data/research-results",
    });

    expect(result.importConfigCount).toBe(1);
    expect(result.researchOutputCount).toBe(1);
    expect(result.records).toHaveLength(2);
  });
});

describe("computeCoverageSnapshot", () => {
  it("detects missing months inside the observed horizon", () => {
    const records: CoverageMarketRecord[] = [
      {
        seriesTicker: "KXBTC15M",
        marketTicker: "MKT-A",
        source: "import-config",
        calendarMonths: ["2026-01"],
        tradingDays: ["2026-01-10"],
        volatilityRegime: null,
      },
      {
        seriesTicker: "KXBTC15M",
        marketTicker: "MKT-B",
        source: "import-config",
        calendarMonths: ["2026-03"],
        tradingDays: ["2026-03-10"],
        volatilityRegime: "high",
      },
    ];

    const snapshot = computeCoverageSnapshot(records, {
      importConfigCount: 2,
      fixtureCount: 0,
      researchOutputCount: 0,
    });

    expect(snapshot.marketCount).toBe(2);
    expect(snapshot.uniqueTradingDays).toBe(2);
    expect(snapshot.missingMonths).toEqual(["2026-02"]);
    expect(
      snapshot.volatilityRegimeCoverage.find((entry) => entry.regime === "high")?.marketCount,
    ).toBe(1);
  });
});

describe("buildCoverageImportRecommendations", () => {
  it("prioritizes Q1 imports when month-stability validation is weak", () => {
    const snapshot = computeCoverageSnapshot(
      [
        {
          seriesTicker: "KXBTC15M",
          marketTicker: "MKT-A",
          source: "import-config",
          calendarMonths: ["2026-04", "2026-05"],
          tradingDays: ["2026-04-10", "2026-05-10"],
          volatilityRegime: null,
        },
      ],
      { importConfigCount: 1, fixtureCount: 0, researchOutputCount: 0 },
    );

    const recommendations = buildCoverageImportRecommendations(
      snapshot,
      {
        dataHealth: null,
        mispricingAtlas: {
          generatedAt: GENERATED_AT,
          sampleCounts: { marketCount: 5, totalObservations: 10 },
        } as never,
        hypothesisValidation: {
          generatedAt: GENERATED_AT,
          validations: [
            {
              hypothesisId: "atlas-vol-high-over",
              passes: false,
              timeStability: { monthPersistenceRate: 0.4 },
            },
          ],
        } as never,
        regimeTags: null,
      },
      { monthPersistenceThreshold: 0.67 },
    );

    expect(recommendations).toHaveLength(1);
    expect(recommendations[0]?.startMonth).toBe("2026-01");
    expect(recommendations[0]?.endMonth).toBe("2026-03");
    expect(recommendations[0]?.rationale).toContain("month-stability checks");
    expect(recommendations[0]?.rationale).toContain("2026-01 through 2026-03");
  });
});

describe("buildHistoricalCoveragePlanFromPaths", () => {
  it("builds JSON and HTML ready coverage plan report", () => {
    const mock: MockFs = { files: {}, directories: new Set(["data"]) };
    addFile(
      mock,
      "data/import-configs/KXBTC15M/MKT-A/config.json",
      importConfig(
        "MKT-A",
        "2026-01-01T00:00:00.000Z",
        "2026-01-31T23:59:59.000Z",
      ),
    );
    addFile(
      mock,
      "data/import-configs/KXBTC15M/MKT-C/config.json",
      importConfig(
        "MKT-C",
        "2026-03-01T00:00:00.000Z",
        "2026-03-31T23:59:59.000Z",
      ),
    );
    addFile(
      mock,
      "data/research-results/data-health.json",
      JSON.stringify({
        generatedAt: GENERATED_AT,
        pipelineCoverage: { importConfigs: 2, fixtures: 0, researchOutputs: 0 },
      }),
    );
    addFile(
      mock,
      "data/research-results/mispricing-atlas.json",
      JSON.stringify({
        generatedAt: GENERATED_AT,
        sampleCounts: { marketCount: 2, totalObservations: 20 },
      }),
    );
    addFile(
      mock,
      "data/research-results/hypothesis-validation.json",
      JSON.stringify({
        generatedAt: GENERATED_AT,
        validations: [
          {
            hypothesisId: "atlas-vol-high-over",
            passes: false,
            timeStability: { monthPersistenceRate: 0.5 },
          },
        ],
      }),
    );
    addFile(
      mock,
      "data/research-results/regime-tags.json",
      JSON.stringify({
        markets: [
          {
            marketTicker: "MKT-A",
            tags: { volatility: "medium" },
          },
        ],
      }),
    );

    const report = buildHistoricalCoveragePlanFromPaths(
      DEFAULT_CONFIG,
      createIo(mock),
      { generatedAt: GENERATED_AT },
    );

    expect(report.snapshot.marketCount).toBe(2);
    expect(report.snapshot.missingMonths).toEqual(["2026-02"]);
    expect(report.recommendations[0]?.missingMonths).toEqual(["2026-02"]);
    expect(report.recommendations[0]?.priorityScore).toBeGreaterThan(0);
    expect(serializeHistoricalCoveragePlan(report)).toContain("historical-coverage-plan");
    expect(serializeHistoricalCoveragePlanHtml(report)).toContain(
      "Historical Coverage Expansion Plan",
    );
    expect(serializeHistoricalCoveragePlanHtml(report)).toContain("2026-02");
  });
});

describe("buildHistoricalCoveragePlan", () => {
  it("is deterministic for equivalent serialized output", () => {
    const report = buildHistoricalCoveragePlan({
      generatedAt: GENERATED_AT,
      config: DEFAULT_CONFIG,
      inputStatus: {
        dataHealthPath: DEFAULT_CONFIG.dataHealthPath,
        mispricingAtlasPath: DEFAULT_CONFIG.mispricingAtlasPath,
        hypothesisValidationPath: DEFAULT_CONFIG.hypothesisValidationPath,
        regimeTagsPath: DEFAULT_CONFIG.regimeTagsPath,
        importConfigsDir: DEFAULT_CONFIG.importConfigsDir,
        fixturesDir: DEFAULT_CONFIG.fixturesDir,
        researchResultsDir: DEFAULT_CONFIG.researchResultsDir,
        dataHealthPresent: false,
        mispricingAtlasPresent: false,
        hypothesisValidationPresent: false,
        regimeTagsPresent: false,
      },
      artifacts: {
        dataHealth: null,
        mispricingAtlas: null,
        hypothesisValidation: null,
        regimeTags: null,
      },
      marketRecords: [],
      scanCounts: { importConfigCount: 0, fixtureCount: 0, researchOutputCount: 0 },
    });

    expect(serializeHistoricalCoveragePlan(report)).toBe(
      serializeHistoricalCoveragePlan(report),
    );
    expect(report.plannerNotes[0]).toContain("Read-only planner");
  });
});
