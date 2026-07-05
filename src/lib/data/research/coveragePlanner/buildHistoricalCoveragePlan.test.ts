import { describe, expect, it } from "vitest";

import {
  buildHistoricalCoveragePlan,
  buildHistoricalCoveragePlanFromPaths,
  serializeHistoricalCoveragePlan,
} from "./buildHistoricalCoveragePlan";
import { serializeHistoricalCoveragePlanHtml } from "./serializeHistoricalCoveragePlanHtml";
import { buildCoverageImportRecommendations } from "./buildCoverageImportRecommendations";
import { classifyMonthCoverageDepth } from "./computeMonthCoverageDepth";
import { computeCoverageSnapshot } from "./computeCoverageSnapshot";
import { createEmptyHistoricalImportabilityProfile } from "./importability/buildHistoricalImportabilityProfile";
import { normalizeExpansionImportMarketRecords } from "./importability/estimateRecommendationImportability";
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
  expansionImportSummaryPath:
    "data/research-results/historical-expansion-import-summary.json",
  importConfigsDir: "data/import-configs",
  fixturesDir: "data/fixtures",
  researchResultsDir: "data/research-results",
  monthPersistenceThreshold: 0.67,
  minMarketsPerMonth: 100,
  minTradingDaysPerMonth: 10,
};

const LOW_THRESHOLD_CONFIG: HistoricalCoveragePlanConfig = {
  ...DEFAULT_CONFIG,
  minMarketsPerMonth: 1,
  minTradingDaysPerMonth: 1,
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

function buildSparseMonthRecords(): CoverageMarketRecord[] {
  return [
    {
      seriesTicker: "KXBTC15M",
      marketTicker: "MKT-JAN-1",
      source: "import-config",
      calendarMonths: ["2026-01"],
      tradingDays: ["2026-01-10"],
      volatilityRegime: null,
    },
    {
      seriesTicker: "KXBTC15M",
      marketTicker: "MKT-JAN-2",
      source: "import-config",
      calendarMonths: ["2026-01"],
      tradingDays: ["2026-01-11"],
      volatilityRegime: null,
    },
    {
      seriesTicker: "KXBTC15M",
      marketTicker: "MKT-JAN-3",
      source: "import-config",
      calendarMonths: ["2026-01"],
      tradingDays: ["2026-01-12"],
      volatilityRegime: null,
    },
    {
      seriesTicker: "KXBTC15M",
      marketTicker: "MKT-JAN-4",
      source: "import-config",
      calendarMonths: ["2026-01"],
      tradingDays: ["2026-01-13"],
      volatilityRegime: null,
    },
    {
      seriesTicker: "KXBTC15M",
      marketTicker: "MKT-JAN-5",
      source: "import-config",
      calendarMonths: ["2026-01"],
      tradingDays: ["2026-01-14"],
      volatilityRegime: null,
    },
    {
      seriesTicker: "KXBTC15M",
      marketTicker: "MKT-FEB-1",
      source: "import-config",
      calendarMonths: ["2026-02"],
      tradingDays: ["2026-02-01"],
      volatilityRegime: null,
    },
    {
      seriesTicker: "KXBTC15M",
      marketTicker: "MKT-FEB-2",
      source: "import-config",
      calendarMonths: ["2026-02"],
      tradingDays: ["2026-02-02"],
      volatilityRegime: null,
    },
    {
      seriesTicker: "KXBTC15M",
      marketTicker: "MKT-FEB-3",
      source: "import-config",
      calendarMonths: ["2026-02"],
      tradingDays: ["2026-02-03"],
      volatilityRegime: null,
    },
    {
      seriesTicker: "KXBTC15M",
      marketTicker: "MKT-FEB-4",
      source: "import-config",
      calendarMonths: ["2026-02"],
      tradingDays: ["2026-02-04"],
      volatilityRegime: null,
    },
    {
      seriesTicker: "KXBTC15M",
      marketTicker: "MKT-FEB-5",
      source: "import-config",
      calendarMonths: ["2026-02"],
      tradingDays: ["2026-02-05"],
      volatilityRegime: null,
    },
    {
      seriesTicker: "KXBTC15M",
      marketTicker: "MKT-FEB-6",
      source: "import-config",
      calendarMonths: ["2026-02"],
      tradingDays: ["2026-02-06"],
      volatilityRegime: null,
    },
    {
      seriesTicker: "KXBTC15M",
      marketTicker: "MKT-MAR-1",
      source: "import-config",
      calendarMonths: ["2026-03"],
      tradingDays: ["2026-03-01"],
      volatilityRegime: null,
    },
    {
      seriesTicker: "KXBTC15M",
      marketTicker: "MKT-APR-1",
      source: "import-config",
      calendarMonths: ["2026-04"],
      tradingDays: Array.from({ length: 20 }, (_, index) => `2026-04-${String(index + 1).padStart(2, "0")}`),
      volatilityRegime: null,
    },
    ...Array.from({ length: 308 }, (_, index) => ({
      seriesTicker: "KXBTC15M",
      marketTicker: `MKT-APR-${index + 2}`,
      source: "import-config" as const,
      calendarMonths: ["2026-04"] as const,
      tradingDays: [`2026-04-${String((index % 20) + 1).padStart(2, "0")}`] as const,
      volatilityRegime: null,
    })),
  ];
}

function buildSplitGapMonthRecords(): CoverageMarketRecord[] {
  const coveredApril = Array.from({ length: 120 }, (_, index) => ({
    seriesTicker: "KXBTC15M",
    marketTicker: `MKT-APR-${index + 1}`,
    source: "import-config" as const,
    calendarMonths: ["2026-04"] as const,
    tradingDays: [`2026-04-${String((index % 20) + 1).padStart(2, "0")}`] as const,
    volatilityRegime: null,
  }));

  return [
    ...Array.from({ length: 5 }, (_, index) => ({
      seriesTicker: "KXBTC15M",
      marketTicker: `MKT-JAN-${index + 1}`,
      source: "import-config" as const,
      calendarMonths: ["2026-01"] as const,
      tradingDays: [`2026-01-${String(index + 10).padStart(2, "0")}`] as const,
      volatilityRegime: null,
    })),
    ...Array.from({ length: 5 }, (_, index) => ({
      seriesTicker: "KXBTC15M",
      marketTicker: `MKT-JUN-${index + 1}`,
      source: "import-config" as const,
      calendarMonths: ["2026-06"] as const,
      tradingDays: [`2026-06-${String(index + 1).padStart(2, "0")}`] as const,
      volatilityRegime: null,
    })),
    ...coveredApril,
  ];
}

describe("classifyMonthCoverageDepth", () => {
  it("classifies missing, under-covered, and covered months", () => {
    expect(
      classifyMonthCoverageDepth(0, 0, {
        minMarketsPerMonth: 100,
        minTradingDaysPerMonth: 10,
      }).coverageStatus,
    ).toBe("MISSING");

    expect(
      classifyMonthCoverageDepth(5, 1, {
        minMarketsPerMonth: 100,
        minTradingDaysPerMonth: 10,
      }),
    ).toMatchObject({
      coverageStatus: "UNDER_COVERED",
      thresholds: {
        marketsMet: false,
        tradingDaysMet: false,
      },
    });

    expect(
      classifyMonthCoverageDepth(309, 20, {
        minMarketsPerMonth: 100,
        minTradingDaysPerMonth: 10,
      }),
    ).toMatchObject({
      coverageStatus: "COVERED",
      thresholds: {
        marketsMet: true,
        tradingDaysMet: true,
      },
    });
  });
});

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

    const snapshot = computeCoverageSnapshot(
      records,
      {
        importConfigCount: 2,
        fixtureCount: 0,
        researchOutputCount: 0,
      },
      { minMarketsPerMonth: 1, minTradingDaysPerMonth: 1 },
    );

    expect(snapshot.marketCount).toBe(2);
    expect(snapshot.uniqueTradingDays).toBe(2);
    expect(snapshot.missingMonths).toEqual(["2026-02"]);
    expect(snapshot.underCoveredMonths).toEqual([]);
    expect(snapshot.coveredMonths).toEqual(["2026-01", "2026-03"]);
    expect(
      snapshot.volatilityRegimeCoverage.find((entry) => entry.regime === "high")?.marketCount,
    ).toBe(1);
  });

  it("flags sparse present months as under-covered with default depth thresholds", () => {
    const snapshot = computeCoverageSnapshot(buildSparseMonthRecords(), {
      importConfigCount: 13,
      fixtureCount: 0,
      researchOutputCount: 0,
    });

    const january = snapshot.monthCoverage.find((entry) => entry.month === "2026-01");
    const april = snapshot.monthCoverage.find((entry) => entry.month === "2026-04");

    expect(january).toMatchObject({
      marketCount: 5,
      tradingDayCount: 5,
      coverageStatus: "UNDER_COVERED",
    });
    expect(april).toMatchObject({
      marketCount: 309,
      coverageStatus: "COVERED",
    });
    expect(snapshot.underCoveredMonths).toEqual(
      expect.arrayContaining(["2026-01", "2026-02", "2026-03"]),
    );
    expect(snapshot.coveredMonths).toEqual(["2026-04"]);
  });

  it("respects configurable depth thresholds", () => {
    const snapshot = computeCoverageSnapshot(
      buildSparseMonthRecords(),
      { importConfigCount: 13, fixtureCount: 0, researchOutputCount: 0 },
      { minMarketsPerMonth: 5, minTradingDaysPerMonth: 5 },
    );

    expect(snapshot.monthCoverage.find((entry) => entry.month === "2026-01")?.coverageStatus).toBe(
      "COVERED",
    );
    expect(snapshot.monthCoverage.find((entry) => entry.month === "2026-03")?.coverageStatus).toBe(
      "UNDER_COVERED",
    );
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
      { minMarketsPerMonth: 1, minTradingDaysPerMonth: 1 },
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
      LOW_THRESHOLD_CONFIG,
    );

    expect(recommendations).toHaveLength(1);
    expect(recommendations[0]?.startMonth).toBe("2026-01");
    expect(recommendations[0]?.endMonth).toBe("2026-03");
    expect(recommendations[0]?.recommendationType).toBe("coverage-gap-import");
    expect(recommendations[0]?.rationale).toContain("month-stability checks");
    expect(recommendations[0]?.rationale).toContain("2026-01 through 2026-03");
    expect(recommendations[0]?.estimatedSupportLevel).toBe("medium");
  });

  it("deprioritizes windows with mostly unsupported prior imports", () => {
    const snapshot = computeCoverageSnapshot(buildSplitGapMonthRecords(), {
      importConfigCount: 13,
      fixtureCount: 0,
      researchOutputCount: 0,
    });
    const importabilityMarkets = normalizeExpansionImportMarketRecords([
      {
        marketTicker: "KXBTC15M-26JAN151215-00",
        seriesTicker: "KXBTC15M",
        status: "failed",
        errorMessage: "Kalshi historical market response missing required fields: expiration_value",
      },
      {
        marketTicker: "KXBTC15M-26JAN151230-00",
        seriesTicker: "KXBTC15M",
        status: "failed",
        errorMessage: "Kalshi historical market response missing required fields: expiration_value",
      },
      {
        marketTicker: "KXBTC15M-26JAN151245-00",
        seriesTicker: "KXBTC15M",
        status: "failed",
        errorMessage: "Kalshi historical market response missing required fields: expiration_value",
      },
      {
        marketTicker: "KXBTC15M-26JUN151215-00",
        seriesTicker: "KXBTC15M",
        status: "imported",
      },
      {
        marketTicker: "KXBTC15M-26JUN151230-00",
        seriesTicker: "KXBTC15M",
        status: "imported",
      },
    ]);

    const recommendations = buildCoverageImportRecommendations(
      snapshot,
      {
        dataHealth: null,
        mispricingAtlas: null,
        hypothesisValidation: null,
        regimeTags: null,
      },
      LOW_THRESHOLD_CONFIG,
      importabilityMarkets,
    );

    const januaryRecommendation = recommendations.find((entry) =>
      entry.missingMonths.includes("2026-01"),
    );
    const juneRecommendation = recommendations.find((entry) =>
      entry.missingMonths.includes("2026-06"),
    );

    expect(januaryRecommendation?.estimatedSupportLevel).toBe("low");
    expect(juneRecommendation?.estimatedSupportLevel).toBe("high");
    expect((juneRecommendation?.priorityScore ?? 0)).toBeGreaterThan(
      januaryRecommendation?.priorityScore ?? 0,
    );
  });

  it("recommends imports for under-covered months and scores them by severity", () => {
    const snapshot = computeCoverageSnapshot(buildSparseMonthRecords(), {
      importConfigCount: 13,
      fixtureCount: 0,
      researchOutputCount: 0,
    });

    const recommendations = buildCoverageImportRecommendations(
      snapshot,
      {
        dataHealth: null,
        mispricingAtlas: null,
        hypothesisValidation: null,
        regimeTags: null,
      },
      DEFAULT_CONFIG,
    );

    expect(recommendations.length).toBeGreaterThan(0);
    const januaryRecommendation = recommendations.find((entry) =>
      entry.missingMonths.includes("2026-01"),
    );
    expect(januaryRecommendation?.includesUnderCovered).toBe(true);
    expect(januaryRecommendation?.priorityScore).toBeGreaterThan(0);

    const aprilRecommendation = recommendations.find((entry) =>
      entry.missingMonths.includes("2026-04"),
    );
    expect(aprilRecommendation).toBeUndefined();
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
      LOW_THRESHOLD_CONFIG,
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
    expect(serializeHistoricalCoveragePlanHtml(report)).toContain("Under-covered");
    expect(report.temporalBalance.hypothesisBalances).toEqual([]);
  });
});

describe("buildHistoricalCoveragePlan temporal balance integration", () => {
  it("serializes temporal balance diagnostics and recommendations in JSON and HTML", () => {
    const validation = {
      hypothesisId: "hyp-high-vol-overconfident",
      hypothesis: "High volatility × [0.3, 0.7) × <15 min remaining overconfident",
      sourceArtifact: "mispricing-atlas.json",
      robustnessScore: 61,
      passes: false,
      reasons: [],
      observationCount: 201,
      timeStability: {
        monthPeriods: [
          { periodKey: "2026-01", observations: 90, signedCalibrationError: 0.1, edgeMatchesDirection: true },
          { periodKey: "2026-02", observations: 85, signedCalibrationError: 0.1, edgeMatchesDirection: true },
          { periodKey: "2026-03", observations: 1, signedCalibrationError: 0.1, edgeMatchesDirection: true },
          { periodKey: "2026-04", observations: 23, signedCalibrationError: 0.1, edgeMatchesDirection: true },
          { periodKey: "2026-05", observations: 2, signedCalibrationError: 0.1, edgeMatchesDirection: true },
        ],
        quarterPeriods: [],
        monthPersistenceRate: 0.4,
        quarterPersistenceRate: 0.4,
        scoreComponent: 0,
      },
      regimeStability: {
        regimes: [],
        regimesWithEdge: 1,
        regimesWithData: 3,
        scoreComponent: 0,
      },
      sampleConcentration: {
        uniqueTradingDays: 37,
        largestContributingDay: "2026-01-15",
        largestDayObservations: 40,
        largestDayPercent: 0.4,
        singleDayDominated: true,
        scoreComponent: 0,
      },
      leaveOnePeriodOut: {
        folds: [],
        errorVariance: 0.0001,
        errorStdDev: 0.009,
        scoreComponent: 0,
      },
    };

    const report = buildHistoricalCoveragePlan({
      generatedAt: GENERATED_AT,
      config: LOW_THRESHOLD_CONFIG,
      inputStatus: {
        dataHealthPath: DEFAULT_CONFIG.dataHealthPath,
        mispricingAtlasPath: DEFAULT_CONFIG.mispricingAtlasPath,
        hypothesisValidationPath: DEFAULT_CONFIG.hypothesisValidationPath,
        regimeTagsPath: DEFAULT_CONFIG.regimeTagsPath,
        expansionImportSummaryPath: DEFAULT_CONFIG.expansionImportSummaryPath,
        importConfigsDir: DEFAULT_CONFIG.importConfigsDir,
        fixturesDir: DEFAULT_CONFIG.fixturesDir,
        researchResultsDir: DEFAULT_CONFIG.researchResultsDir,
        dataHealthPresent: false,
        mispricingAtlasPresent: false,
        hypothesisValidationPresent: true,
        regimeTagsPresent: false,
        expansionImportSummaryPresent: false,
      },
      artifacts: {
        dataHealth: null,
        mispricingAtlas: null,
        regimeTags: null,
        hypothesisValidation: {
          generatedAt: GENERATED_AT,
          validations: [validation],
        } as never,
      },
      marketRecords: [
        {
          seriesTicker: "KXBTC15M",
          marketTicker: "MKT-1",
          source: "import-config",
          calendarMonths: ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05"],
          tradingDays: ["2026-01-10", "2026-02-10", "2026-03-01", "2026-04-10", "2026-05-02"],
          volatilityRegime: "high",
        },
      ],
      scanCounts: { importConfigCount: 1, fixtureCount: 0, researchOutputCount: 0 },
      importabilityMarkets: [],
      importability: createEmptyHistoricalImportabilityProfile(
        DEFAULT_CONFIG.expansionImportSummaryPath,
      ),
    });

    const json = serializeHistoricalCoveragePlan(report);
    const html = serializeHistoricalCoveragePlanHtml(report);

    expect(report.temporalBalance.unevenHypothesisCount).toBe(1);
    expect(report.recommendations.some(
      (entry) => entry.recommendationType === "temporal-balance-import",
    )).toBe(true);
    expect(json).toContain("temporalBalance");
    expect(json).toContain("temporal-balance-import");
    expect(html).toContain("Temporal balance diagnostics");
    expect(html).toContain("Hypothesis temporal balance");
    expect(html).toContain("High volatility");
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
        expansionImportSummaryPath: DEFAULT_CONFIG.expansionImportSummaryPath,
        importConfigsDir: DEFAULT_CONFIG.importConfigsDir,
        fixturesDir: DEFAULT_CONFIG.fixturesDir,
        researchResultsDir: DEFAULT_CONFIG.researchResultsDir,
        dataHealthPresent: false,
        mispricingAtlasPresent: false,
        hypothesisValidationPresent: false,
        regimeTagsPresent: false,
        expansionImportSummaryPresent: false,
      },
      artifacts: {
        dataHealth: null,
        mispricingAtlas: null,
        hypothesisValidation: null,
        regimeTags: null,
      },
      marketRecords: [],
      scanCounts: { importConfigCount: 0, fixtureCount: 0, researchOutputCount: 0 },
      importabilityMarkets: [],
      importability: createEmptyHistoricalImportabilityProfile(
        DEFAULT_CONFIG.expansionImportSummaryPath,
      ),
    });

    expect(serializeHistoricalCoveragePlan(report)).toBe(
      serializeHistoricalCoveragePlan(report),
    );
    expect(report.plannerNotes[0]).toContain("Read-only planner");
  });
});
