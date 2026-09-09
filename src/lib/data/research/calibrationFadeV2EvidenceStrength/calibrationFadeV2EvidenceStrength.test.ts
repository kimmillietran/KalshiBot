import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { stableStringify } from "@/lib/trading/config/hashConfig";

import {
  assessLoroInformativeness,
  assessStoppingRule,
  buildCalibrationFadeV2EvidenceStrengthReport,
  CalibrationFadeV2EvidenceStrengthError,
  classifyCalibrationDirectionVerdict,
  enumerateExactCalibratedNull,
  parseCalibrationFadeV2EvidenceStrengthArgv,
  serializeCalibrationFadeV2EvidenceStrengthJson,
} from "./index";
import type {
  CalibrationFadeV2EvidenceStrengthIo,
  EvaluatedMarketInput,
  FrozenCalibrationThresholds,
} from "./calibrationFadeV2EvidenceStrengthTypes";
import type { LoadedHypothesisThresholds } from "./loadEvidenceStrengthInputs";

const PRODUCTION_THRESHOLDS: FrozenCalibrationThresholds = {
  minimumIndependentCandidateMarkets: 5,
  materialRejectionCalibrationGap: 0.05,
  materialSupportCalibrationGap: 0.03,
  calibrationDirection: "over",
  minimumSettlementCoverageShare: 1,
};

const PRODUCTION_P = [0.665, 0.555, 0.535, 0.425, 0.455] as const;

function market(
  partial: Partial<EvaluatedMarketInput> & Pick<
    EvaluatedMarketInput,
    "marketTicker" | "impliedYesProbability" | "settledOutcome" | "selectedRunId"
  >,
): EvaluatedMarketInput {
  return {
    entryTimestamp: partial.entryTimestamp ?? null,
    calibrationGapSigned: partial.calibrationGapSigned ?? null,
    ...partial,
  };
}

function createMemoryIo(files: Record<string, string>): CalibrationFadeV2EvidenceStrengthIo {
  const store = new Map(Object.entries(files));
  const written = new Map<string, string>();
  return {
    fileExists: (path) => store.has(path) || written.has(path),
    readFile: (path) => {
      if (written.has(path)) {
        return written.get(path)!;
      }
      if (!store.has(path)) {
        throw new Error(`missing file ${path}`);
      }
      return store.get(path)!;
    },
    writeFile: (path, data) => {
      written.set(path, data);
    },
    appendFile: (path, data) => {
      const prior = written.get(path) ?? store.get(path) ?? "";
      written.set(path, `${prior}${data}`);
    },
    mkdirSync: () => undefined,
    unlinkFile: (path) => {
      written.delete(path);
    },
    renameFile: (from, to) => {
      const data = written.get(from);
      if (data === undefined) {
        throw new Error(`rename missing ${from}`);
      }
      written.delete(from);
      written.set(to, data);
    },
    isDirectory: () => false,
    listJsonlFiles: () => [],
    readJsonlRecords: () => [],
  } as CalibrationFadeV2EvidenceStrengthIo;
}

function realRepoConfigFiles(): Record<string, string> {
  return {
    "config/research/hypotheses/high-volatility-late-market-calibration-fade-v2.json":
      readFileSync(
        join(
          process.cwd(),
          "config/research/hypotheses/high-volatility-late-market-calibration-fade-v2.json",
        ),
        "utf8",
      ),
    "config/research/hypotheses/provenance/high-volatility-late-market-calibration-fade-v2.json":
      readFileSync(
        join(
          process.cwd(),
          "config/research/hypotheses/provenance/high-volatility-late-market-calibration-fade-v2.json",
        ),
        "utf8",
      ),
  };
}

function buildCrossRunFixture(input: {
  markets: readonly EvaluatedMarketInput[];
  runIds?: readonly string[];
  interpretation?: string;
}): Record<string, string> {
  const runIds = input.runIds ?? [...new Set(input.markets.map((m) => m.selectedRunId))];
  const reportPath =
    "data/research-results/calibration-fade-v2/cross-run/confirmatory/aaaaaaaa/settlement-snapshots/bbbbbbbb/calibration-fade-v2-cross-run-validation.json";
  const marketsPath =
    "data/research-results/calibration-fade-v2/cross-run/confirmatory/aaaaaaaa/settlement-snapshots/bbbbbbbb/calibration-fade-v2-cross-run-markets.jsonl";
  const report = {
    runSetHash: "aaaaaaaa",
    settlementSnapshotHash: "bbbbbbbb",
    evidenceMode: "confirmatory",
    selectedRunIds: runIds,
    selectedRunCount: runIds.length,
    uniqueCandidateMarketCount: input.markets.length,
    evaluatedIndependentCandidateMarketCount: input.markets.length,
    candidateEpisodeCount: input.markets.length,
    settlementCoverageShare: 1,
    interpretationClassification: input.interpretation ?? "forward-rejects-hypothesis",
    recommendedNextAction: "continue-confirmatory-collection",
    marketsOutputPath: marketsPath,
    minimumIndependentCandidateMarkets: 5,
    minimumSettlementCoverageShare: 1,
    perRunSummaries: runIds.map((runId) => ({
      runId,
      candidateEpisodeCount: input.markets.filter((m) => m.selectedRunId === runId).length,
      candidateMarketCount: input.markets.filter((m) => m.selectedRunId === runId).length,
      captureRunDir: null,
    })),
  };
  const marketsJsonl = input.markets
    .map((entry) =>
      JSON.stringify({
        marketTicker: entry.marketTicker,
        evaluated: true,
        selectedCanonicalEntry: {
          marketTicker: entry.marketTicker,
          impliedYesProbability: entry.impliedYesProbability,
          settledOutcome: entry.settledOutcome,
          entryTimestamp: entry.entryTimestamp,
          selectedRunId: entry.selectedRunId,
          calibrationGapSigned: entry.calibrationGapSigned,
        },
      }),
    )
    .join("\n");

  return {
    ...realRepoConfigFiles(),
    [reportPath]: JSON.stringify(report),
    [marketsPath]: marketsJsonl.length ? `${marketsJsonl}\n` : "",
  };
}

describe("enumerateExactCalibratedNull", () => {
  it("enumerates heterogeneous Bernoulli states and sums probabilities to 1", () => {
    const markets = [
      market({
        marketTicker: "A",
        impliedYesProbability: 0.2,
        settledOutcome: "no",
        selectedRunId: "r1",
      }),
      market({
        marketTicker: "B",
        impliedYesProbability: 0.8,
        settledOutcome: "yes",
        selectedRunId: "r1",
      }),
    ];
    const result = enumerateExactCalibratedNull({
      markets,
      thresholds: PRODUCTION_THRESHOLDS,
      governedInterpretationClassification: "forward-rejects-hypothesis",
    });
    expect(result.distribution.probabilitiesSum).toBeCloseTo(1, 12);
    expect(result.distribution.candidateMarketCount).toBe(2);
    // Not a binomial: p differ → distribution depends on which markets settle yes.
    const gaps = result.reachability.reachableSignedGapValues.map((s) => s.signedCalibrationGap);
    expect(new Set(gaps).size).toBe(3);
  });

  it("handles zero candidates", () => {
    const result = enumerateExactCalibratedNull({
      markets: [],
      thresholds: PRODUCTION_THRESHOLDS,
      governedInterpretationClassification: "insufficient-forward-events",
    });
    expect(result.distribution.probabilitiesSum).toBe(1);
    expect(result.distribution.probabilityOfReject).toBe(0);
    expect(result.reachability.inconclusiveBandReachable).toBe(false);
  });

  it("handles one candidate", () => {
    const result = enumerateExactCalibratedNull({
      markets: [
        market({
          marketTicker: "ONLY",
          impliedYesProbability: 0.4,
          settledOutcome: "yes",
          selectedRunId: "r1",
        }),
      ],
      thresholds: PRODUCTION_THRESHOLDS,
      governedInterpretationClassification: "forward-rejects-hypothesis",
    });
    expect(result.distribution.probabilitiesSum).toBeCloseTo(1, 12);
    expect(result.distribution.candidateMarketCount).toBe(1);
    expect(result.reachability.reachableSignedGapValues).toHaveLength(2);
  });

  it("handles larger synthetic n without binomial-only assumptions", () => {
    const markets = Array.from({ length: 8 }, (_, index) =>
      market({
        marketTicker: `M${index}`,
        impliedYesProbability: 0.3 + (index % 5) * 0.05,
        settledOutcome: index % 2 === 0 ? "yes" : "no",
        selectedRunId: `r${index % 2}`,
      }),
    );
    const result = enumerateExactCalibratedNull({
      markets,
      thresholds: PRODUCTION_THRESHOLDS,
      governedInterpretationClassification: "forward-inconclusive",
    });
    expect(result.distribution.probabilitiesSum).toBeCloseTo(1, 10);
    expect(result.distribution.candidateMarketCount).toBe(8);
  });

  it("matches production n=5 calibrated-null probabilities and unreachable inconclusive", () => {
    const markets = PRODUCTION_P.map((p, index) =>
      market({
        marketTicker: `KXBTC15M-${index}`,
        impliedYesProbability: p,
        settledOutcome: index === 0 || index === 1 || index === 4 ? "yes" : "no",
        selectedRunId: index < 2 ? "run-a" : "run-b",
      }),
    );
    const result = enumerateExactCalibratedNull({
      markets,
      thresholds: PRODUCTION_THRESHOLDS,
      governedInterpretationClassification: "forward-rejects-hypothesis",
    });

    expect(result.distribution.observedSignedCalibrationGap).toBeCloseTo(-0.073, 3);
    expect(result.distribution.observedCalibrationDirectionVerdict).toBe("reject");
    expect(result.distribution.probabilityOfReject).toBeCloseTo(0.55104880690625, 10);
    expect(result.distribution.probabilityOfSupportCalibration).toBeCloseTo(0.44895119309375, 10);
    expect(result.distribution.probabilityOfInconclusive).toBe(0);
    expect(result.distribution.probabilityOfSupportExecutable).toBeNull();
    expect(result.reachability.inconclusiveBandReachable).toBe(false);
    expect(result.reachability.adjacentAttainableMeanGapDistance).toBeCloseTo(0.2, 12);
  });
});

describe("classifyCalibrationDirectionVerdict", () => {
  it("applies frozen over thresholds", () => {
    expect(
      classifyCalibrationDirectionVerdict({
        signedCalibrationGap: -0.073,
        thresholds: PRODUCTION_THRESHOLDS,
      }),
    ).toBe("reject");
    expect(
      classifyCalibrationDirectionVerdict({
        signedCalibrationGap: 0.04,
        thresholds: PRODUCTION_THRESHOLDS,
      }),
    ).toBe("support-calibration");
    expect(
      classifyCalibrationDirectionVerdict({
        signedCalibrationGap: 0,
        thresholds: PRODUCTION_THRESHOLDS,
      }),
    ).toBe("inconclusive");
  });
});

describe("parseCalibrationFadeV2EvidenceStrengthArgv", () => {
  it("requires explicit --cross-run-report and rejects latest/mtime discovery", () => {
    expect(() => parseCalibrationFadeV2EvidenceStrengthArgv([])).toThrow(
      /--cross-run-report is required/,
    );
    expect(() =>
      parseCalibrationFadeV2EvidenceStrengthArgv([
        "--cross-run-report",
        "path.json",
        "--latest",
      ]),
    ).toThrow(/latest\/mtime/);
    expect(() =>
      parseCalibrationFadeV2EvidenceStrengthArgv(["--mtime", "1"]),
    ).toThrow(/latest\/mtime/);
  });
});

describe("stopping-rule and LORO assessments", () => {
  it("flags minimum-floor-only stopping rule", () => {
    const loaded: LoadedHypothesisThresholds = {
      ...PRODUCTION_THRESHOLDS,
      hasExplicitFixedN: false,
      hasExplicitHorizon: false,
      hasSequentialCorrection: false,
      rawKeys: ["minimumEvidenceRequirements"],
    };
    const assessment = assessStoppingRule(loaded);
    expect(assessment.stoppingRuleStatus).toBe("minimum-floor-only");
    expect(assessment.optionalStoppingRiskFlag).toBe(true);
  });

  it("warns when LORO folds fall below frozen minimum", () => {
    const assessment = assessLoroInformativeness({
      selectedRunIds: ["a", "b"],
      candidateCountByRun: new Map([
        ["a", 2],
        ["b", 3],
      ]),
      frozenMinimumCandidateCount: 5,
    });
    expect(assessment.loroCurrentlyInformative).toBe(false);
    expect(assessment.minimumCandidatesInLeaveOneOutFold).toBe(2);
    expect(assessment.maximumCandidatesInLeaveOneOutFold).toBe(3);
    expect(assessment.reason).toMatch(/below the frozen minimum/);
  });
});

describe("buildCalibrationFadeV2EvidenceStrengthReport", () => {
  it("builds a production-like report and does not mutate source artifacts", () => {
    const markets = PRODUCTION_P.map((p, index) =>
      market({
        marketTicker: `KXBTC15M-${index}`,
        impliedYesProbability: p,
        settledOutcome: index === 0 || index === 1 || index === 4 ? "yes" : "no",
        selectedRunId: index < 2 ? "2026-09-08T07-46-44-416Z" : "2026-09-09T06-39-04-259Z",
        entryTimestamp:
          index < 2 ? "2026-09-08T13:45:00.000Z" : "2026-09-09T13:45:00.000Z",
        calibrationGapSigned: p - (index === 0 || index === 1 || index === 4 ? 1 : 0),
      }),
    );
    const files = buildCrossRunFixture({ markets });
    const reportPath =
      "data/research-results/calibration-fade-v2/cross-run/confirmatory/aaaaaaaa/settlement-snapshots/bbbbbbbb/calibration-fade-v2-cross-run-validation.json";
    const marketsPath =
      "data/research-results/calibration-fade-v2/cross-run/confirmatory/aaaaaaaa/settlement-snapshots/bbbbbbbb/calibration-fade-v2-cross-run-markets.jsonl";
    const sourceReportBefore = files[reportPath]!;
    const sourceMarketsBefore = files[marketsPath]!;
    const io = createMemoryIo(files);

    const report = buildCalibrationFadeV2EvidenceStrengthReport({
      config: {
        crossRunReportPath: reportPath,
        marketsPath: null,
        hypothesisConfigPath:
          "config/research/hypotheses/high-volatility-late-market-calibration-fade-v2.json",
        provenancePath:
          "config/research/hypotheses/provenance/high-volatility-late-market-calibration-fade-v2.json",
        outputPath: null,
        htmlOutputPath: null,
      },
      io,
      generatedAt: "2026-09-09T12:00:00.000Z",
    });

    expect(report.candidateMarketCount).toBe(5);
    expect(report.observedSignedCalibrationGap).toBeCloseTo(-0.073, 3);
    expect(report.governedInterpretationClassification).toBe("forward-rejects-hypothesis");
    expect(report.exactCalibratedNullDistribution.probabilityOfReject).toBeCloseTo(
      0.55104880690625,
      10,
    );
    expect(report.verdictReachability.inconclusiveBandReachable).toBe(false);
    expect(report.stoppingRuleAssessment.stoppingRuleStatus).toBe("minimum-floor-only");
    expect(report.loroAssessment.loroCurrentlyInformative).toBe(false);
    expect(report.historicalLineageContext.observationCount).toBe(457);
    expect(report.historicalLineageContext.uniqueTradingDays).toBe(63);
    expect(report.historicalLineageContext.passes).toBe(false);
    expect(report.historicalLineageContext.robustnessScore).toBe(59);
    expect(report.historicalLineageContext.distinction).toMatch(/exploratory/);
    expect(report.runConcentration).toHaveLength(2);
    expect(report.selectedRunCount).toBe(2);
    expect(report.candidateContributingRunCount).toBe(2);
    expect(report.outputPath).not.toMatch(/latest/);
    expect(report.recommendedResearchAction).toBe(
      "repair-prospective-evidence-contract-before-next-family",
    );

    expect(io.readFile(reportPath)).toBe(sourceReportBefore);
    expect(io.readFile(marketsPath)).toBe(sourceMarketsBefore);

    const serialized = serializeCalibrationFadeV2EvidenceStrengthJson(report);
    expect(serialized).toBe(`${stableStringify(report)}\n`);
    const again = serializeCalibrationFadeV2EvidenceStrengthJson(report);
    expect(again).toBe(serialized);
  });

  it("rejects non-confirmatory evidence mode", () => {
    const files = buildCrossRunFixture({
      markets: [
        market({
          marketTicker: "X",
          impliedYesProbability: 0.5,
          settledOutcome: "yes",
          selectedRunId: "r1",
        }),
      ],
    });
    const reportPath =
      "data/research-results/calibration-fade-v2/cross-run/confirmatory/aaaaaaaa/settlement-snapshots/bbbbbbbb/calibration-fade-v2-cross-run-validation.json";
    const parsed = JSON.parse(files[reportPath]!) as Record<string, unknown>;
    parsed.evidenceMode = "diagnostic";
    files[reportPath] = JSON.stringify(parsed);
    const io = createMemoryIo(files);
    expect(() =>
      buildCalibrationFadeV2EvidenceStrengthReport({
        config: {
          crossRunReportPath: reportPath,
          marketsPath: null,
          hypothesisConfigPath:
            "config/research/hypotheses/high-volatility-late-market-calibration-fade-v2.json",
          provenancePath:
            "config/research/hypotheses/provenance/high-volatility-late-market-calibration-fade-v2.json",
          outputPath: null,
          htmlOutputPath: null,
        },
        io,
      }),
    ).toThrow(CalibrationFadeV2EvidenceStrengthError);
  });
});
