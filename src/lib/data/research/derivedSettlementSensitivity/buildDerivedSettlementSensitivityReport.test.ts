import { describe, expect, it } from "vitest";

import { DataQualityFlag } from "@/lib/data/schemas";

import { discoverDerivedSettlementMarketKeys } from "./discoverDerivedSettlementMarketKeys";
import { buildDerivedSettlementSensitivityReport } from "./buildDerivedSettlementSensitivityReport";
import { serializeDerivedSettlementSensitivityHtml } from "./serializeDerivedSettlementSensitivityHtml";
import type { HypothesisValidationEntry } from "@/lib/data/research/hypothesisRobustness/hypothesisRobustnessTypes";

function createResearchOutputWithDerivedFlag(): string {
  const dataset = {
    metadata: { contractVersion: "6.1.0" },
    snapshots: [
      {
        ticker: "KXBTC15M-25DEC311800-00",
        settlement: {
          result: "yes",
          qualityFlags: [DataQualityFlag.DERIVED_EXPIRATION_VALUE],
        },
        kalshiCandles: [{ yesBidCents: 70, yesAskCents: 80, timestamp: 1 }],
      },
    ],
  };

  return JSON.stringify({
    dataset: JSON.stringify(dataset),
    researchRun: { steps: [] },
  });
}

describe("discoverDerivedSettlementMarketKeys", () => {
  it("detects markets whose settlement carries derived-expiration-value", () => {
    const files = new Map<string, string>([
      [
        "data/research-results/strategy/KXBTC15M/KXBTC15M-25DEC311800-00/research-output.json",
        createResearchOutputWithDerivedFlag(),
      ],
    ]);

    const derivedKeys = discoverDerivedSettlementMarketKeys({
      researchResultsDir: "data/research-results",
      io: {
        readFile: (path) => files.get(path) ?? "",
        fileExists: (path) => files.has(path) || path === "data/research-results",
        readdir: (path) => {
          if (path === "data/research-results") {
            return ["strategy"];
          }
          if (path.endsWith("strategy")) {
            return ["KXBTC15M"];
          }
          if (path.endsWith("KXBTC15M")) {
            return ["KXBTC15M-25DEC311800-00"];
          }
          return [];
        },
        isDirectory: (path) =>
          path === "data/research-results"
          || path.endsWith("strategy")
          || path.endsWith("KXBTC15M"),
      },
    });

    expect(derivedKeys.has("strategy/KXBTC15M/KXBTC15M-25DEC311800-00")).toBe(true);
  });
});

describe("buildDerivedSettlementSensitivityReport", () => {
  it("builds a report with before/after metrics", () => {
    const validation: HypothesisValidationEntry = {
      hypothesisId: "hyp-a",
      hypothesis: "Test",
      sourceArtifact: "mispricing-atlas.json",
      robustnessScore: 58,
      passes: false,
      reasons: [],
      observationCount: 100,
      timeStability: {
        monthPeriods: [],
        quarterPeriods: [],
        monthPersistenceRate: 0.3,
        quarterPersistenceRate: 0.5,
        scoreComponent: 10,
      },
      regimeStability: {
        regimes: [],
        regimesWithEdge: 0,
        regimesWithData: 0,
        scoreComponent: 0,
      },
      sampleConcentration: {
        uniqueTradingDays: 20,
        largestContributingDay: null,
        largestDayObservations: 0,
        largestDayPercent: 0,
        singleDayDominated: false,
        scoreComponent: 20,
      },
      leaveOnePeriodOut: {
        folds: [],
        errorVariance: 0,
        errorStdDev: 0.02,
        scoreComponent: 20,
      },
    };

    const report = buildDerivedSettlementSensitivityReport({
      generatedAt: "2026-07-07T00:00:00.000Z",
      outputPath: "data/research-results/derived-settlement-sensitivity.json",
      htmlOutputPath: "data/reports/derived-settlement-sensitivity.html",
      inputPaths: {
        hypothesisCandidatesPath: "a",
        hypothesisValidationPath: "b",
        researchResultsDir: "data/research-results",
        regimeTagsPath: "c",
      },
      inputStatus: {
        hypothesisCandidatesPresent: true,
        hypothesisValidationPresent: true,
        researchResultsPresent: true,
        regimeTagsPresent: false,
      },
      passThreshold: 70,
      candidates: [],
      validations: [validation],
      derivedMarketKeys: new Set(["strategy/KXBTC15M/market-a"]),
      officialOnlyValidations: [{ ...validation, robustnessScore: 45, observationCount: 70 }],
      allCalibrationByHypothesisId: new Map([["hyp-a", 0.1]]),
      officialOnlyCalibrationByHypothesisId: new Map([["hyp-a", 0.06]]),
    });

    expect(report.summary.totalHypotheses).toBe(1);
    expect(report.entries[0]?.deltaRobustness).toBe(-13);
    expect(report.entries[0]?.allObservations.derivedObservationCount).toBe(30);

    const html = serializeDerivedSettlementSensitivityHtml(report);
    expect(html).toContain("Derived Settlement Sensitivity Audit");
    expect(html).toContain("hyp-a");
  });
});
