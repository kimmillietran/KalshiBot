import { describe, expect, it } from "vitest";

import { buildCalibrationFadeFamilyVerdictReport } from "./buildCalibrationFadeFamilyVerdictReport";
import { evaluateCalibrationFadeFamilyVerdict } from "./evaluateCalibrationFadeFamilyVerdict";
import { loadCalibrationFadeFamilyVerdictInputs } from "./loadCalibrationFadeFamilyVerdictInputs";
import { serializeCalibrationFadeFamilyVerdictHtml } from "./serializeCalibrationFadeFamilyVerdictHtml";
import { serializeCalibrationFadeFamilyVerdictReport } from "./serializeCalibrationFadeFamilyVerdictReport";
import { DEFAULT_CALIBRATION_FADE_FAMILY_VERDICT_INPUT_PATHS } from "./calibrationFadeFamilyVerdictTypes";
import type { LoadedCalibrationFadeFamilyVerdictInputs } from "./loadCalibrationFadeFamilyVerdictInputs";

const GENERATED_AT = "2026-07-08T04:00:00.000Z";
const OUTPUT_PATH = "data/research-results/calibration-fade-family-verdict.json";
const HTML_PATH = "data/reports/calibration-fade-family-verdict.html";
const HYPOTHESIS_ID = "atlas-test-hypothesis";

function createMemoryIo(files: Record<string, string> = {}) {
  return {
    readFile: (path: string) => files[path] ?? "",
    fileExists: (path: string) => path in files,
  };
}

function createCandidate(overrides?: Partial<{
  candidateId: string;
  suggestedStrategyFamily: string;
}>) {
  return {
    candidateId: overrides?.candidateId ?? HYPOTHESIS_ID,
    hypothesis: "Test calibration fade hypothesis",
    suggestedStrategyFamily:
      overrides?.suggestedStrategyFamily ?? "calibration-no-fade",
    bucketMetadata: {
      groupId: "moneyness",
      bucketId: "moneyness-near-above",
      calibrationDirection: "over" as const,
    },
  };
}

function createHoldoutMetrics(overrides?: Partial<{
  observedNetEdge: number | null;
  clearsMde: boolean;
  isUnderpowered: boolean;
  effectiveSampleSizeEstimate: number;
}>) {
  return {
    rawObservationCount: 40,
    independentMarketCount: 12,
    marketDayCount: 10,
    effectiveSampleSizeEstimate: overrides?.effectiveSampleSizeEstimate ?? 10,
    observedNetEdge: overrides?.observedNetEdge ?? 0.03,
    minimumDetectableEffect: 0.02,
    confidenceInterval95: { lower: 0.01, upper: 0.05 },
    clearsMde: overrides?.clearsMde ?? true,
    isUnderpowered: overrides?.isUnderpowered ?? false,
    underpoweredReason: null,
  };
}

function createOosEntry(overrides?: Partial<{
  hypothesisId: string;
  passesCorrected: boolean;
  clearsMde: boolean;
  isUnderpowered: boolean;
  finalStatisticalVerdict: string;
  holdout: ReturnType<typeof createHoldoutMetrics>;
}>) {
  return {
    hypothesisId: overrides?.hypothesisId ?? HYPOTHESIS_ID,
    passesCorrected: overrides?.passesCorrected ?? true,
    clearsMde: overrides?.clearsMde ?? true,
    isUnderpowered: overrides?.isUnderpowered ?? false,
    correctedPValue: 0.02,
    qValue: 0.04,
    correctionMethod: "benjaminiYekutieli",
    finalStatisticalVerdict: overrides?.finalStatisticalVerdict ?? "pass",
    dependenceWarnings: ["market-day clustering"],
    splitMetrics: {
      holdout: overrides?.holdout ?? createHoldoutMetrics(),
    },
  };
}

function createReplayEntry(overrides?: Partial<{
  hypothesisId: string;
  netPnlCents: number;
  tradeCount: number;
  uniqueMarketCount: number;
  uniqueTradingDayCount: number;
  averageTradesPerMarket: number | null;
}>) {
  return {
    hypothesisId: overrides?.hypothesisId ?? HYPOTHESIS_ID,
    hypothesis: "Test calibration fade hypothesis",
    warnings: ["Repeated step-level entries are not independent bets."],
    metrics: {
      tradeCount: overrides?.tradeCount ?? 50,
      skippedCount: 5,
      uniqueMarketCount: overrides?.uniqueMarketCount ?? 12,
      uniqueTradingDayCount: overrides?.uniqueTradingDayCount ?? 10,
      averageTradesPerMarket: overrides?.averageTradesPerMarket ?? 4.2,
      maxTradesPerMarket: 8,
      grossPnlCents: (overrides?.netPnlCents ?? 120) + 20,
      netPnlCents: overrides?.netPnlCents ?? 120,
      averagePnlCentsPerTrade: 2.4,
      winRate: 0.58,
      averageFeeCents: 1.2,
      skipReasons: { "wide-spread": 5 },
    },
    candidate: {
      suggestedStrategyFamily: "calibration-no-fade",
    },
  };
}

function createRequiredFixture(input?: {
  oos?: ReturnType<typeof createOosEntry>;
  replay?: ReturnType<typeof createReplayEntry>;
  derived?: {
    recommendation: string;
    derivedObservationShare: number;
  } | null;
}): Record<string, string> {
  const paths = DEFAULT_CALIBRATION_FADE_FAMILY_VERDICT_INPUT_PATHS;
  const files: Record<string, string> = {
    [paths.hypothesisCandidatesPath]: JSON.stringify({
      candidates: [createCandidate()],
    }),
    [paths.hypothesisValidationPath]: JSON.stringify({
      validations: [
        {
          hypothesisId: HYPOTHESIS_ID,
          robustnessScore: 82,
          passes: true,
        },
      ],
    }),
    [paths.costAwareAtlasPath]: JSON.stringify({
      buckets: [
        {
          dimension: "moneyness",
          bucketId: "moneyness-near-above",
          primaryCohort: {
            grossExpectedValueCents: 4,
            spreadAdjustedExpectedValueCents: 3,
            feeAdjustedExpectedValueCents: 2,
            tradeability: "tradeable-positive",
          },
        },
      ],
    }),
    [paths.hypothesisTradeReplayPath]: JSON.stringify({
      entries: [input?.replay ?? createReplayEntry()],
    }),
    [paths.oosPowerCorrectionPath]: JSON.stringify({
      entries: [input?.oos ?? createOosEntry()],
    }),
  };

  if (input?.derived) {
    files[paths.derivedSettlementSensitivityPath] = JSON.stringify({
      entries: [
        {
          hypothesisId: HYPOTHESIS_ID,
          recommendation: input.derived.recommendation,
          deltaRobustness: 2,
          allObservations: {
            derivedObservationShare: input.derived.derivedObservationShare,
            passes: true,
          },
          officialOnlyObservations: { passes: true },
          notes: [],
        },
      ],
    });
  }

  return files;
}

function loadFromFixture(input?: {
  oos?: ReturnType<typeof createOosEntry>;
  replay?: ReturnType<typeof createReplayEntry>;
  derived?: {
    recommendation: string;
    derivedObservationShare: number;
  } | null;
}): LoadedCalibrationFadeFamilyVerdictInputs {
  return loadCalibrationFadeFamilyVerdictInputs(
    createMemoryIo(createRequiredFixture(input)),
    DEFAULT_CALIBRATION_FADE_FAMILY_VERDICT_INPUT_PATHS,
  );
}

describe("calibrationFadeFamilyVerdict", () => {
  it("returns blocked-by-missing-artifacts when required inputs are absent", () => {
    const loadedInputs = loadCalibrationFadeFamilyVerdictInputs(
      createMemoryIo({}),
      DEFAULT_CALIBRATION_FADE_FAMILY_VERDICT_INPUT_PATHS,
    );
    const evaluation = evaluateCalibrationFadeFamilyVerdict(
      loadedInputs,
      "calibration-fade",
    );

    expect(evaluation.summary.familyVerdict).toBe("blocked-by-missing-artifacts");
    expect(evaluation.hypotheses).toHaveLength(0);
    expect(evaluation.summary.missingRequiredArtifacts.length).toBeGreaterThan(0);
  });

  it("promotes a hypothesis when all gates pass", () => {
    const evaluation = evaluateCalibrationFadeFamilyVerdict(
      loadFromFixture({
        derived: { recommendation: "robust", derivedObservationShare: 0.1 },
      }),
      "calibration-fade",
    );

    expect(evaluation.summary.familyVerdict).toBe("promote-family");
    expect(evaluation.summary.promotedHypothesisCount).toBe(1);
    expect(evaluation.hypotheses[0]?.verdict).toBe("promote");
  });

  it("rejects cost when net replay PnL is non-positive", () => {
    const evaluation = evaluateCalibrationFadeFamilyVerdict(
      loadFromFixture({
        replay: createReplayEntry({ netPnlCents: -10 }),
      }),
      "calibration-fade",
    );

    expect(evaluation.hypotheses[0]?.verdict).toBe("reject-cost");
  });

  it("rejects fillability when unique markets are insufficient", () => {
    const evaluation = evaluateCalibrationFadeFamilyVerdict(
      loadFromFixture({
        replay: createReplayEntry({ uniqueMarketCount: 1, uniqueTradingDayCount: 1 }),
      }),
      "calibration-fade",
    );

    expect(evaluation.hypotheses[0]?.verdict).toBe("reject-fillability");
  });

  it("rejects OOS when holdout calibration edge is not positive", () => {
    const evaluation = evaluateCalibrationFadeFamilyVerdict(
      loadFromFixture({
        oos: createOosEntry({
          holdout: createHoldoutMetrics({ observedNetEdge: -0.01, clearsMde: false }),
          finalStatisticalVerdict: "fail",
          passesCorrected: false,
          isUnderpowered: false,
        }),
      }),
      "calibration-fade",
    );

    expect(evaluation.hypotheses[0]?.verdict).toBe("reject-oos");
  });

  it("rejects power when MDE is not cleared", () => {
    const evaluation = evaluateCalibrationFadeFamilyVerdict(
      loadFromFixture({
        oos: createOosEntry({
          clearsMde: false,
          isUnderpowered: false,
          passesCorrected: false,
          finalStatisticalVerdict: "fail",
          holdout: createHoldoutMetrics({ clearsMde: false, observedNetEdge: 0.03 }),
        }),
      }),
      "calibration-fade",
    );

    expect(evaluation.hypotheses[0]?.verdict).toBe("reject-power");
  });

  it("rejects correction when dependence-aware correction fails", () => {
    const evaluation = evaluateCalibrationFadeFamilyVerdict(
      loadFromFixture({
        oos: createOosEntry({
          passesCorrected: false,
          clearsMde: true,
          isUnderpowered: false,
          finalStatisticalVerdict: "fail",
        }),
      }),
      "calibration-fade",
    );

    expect(evaluation.hypotheses[0]?.verdict).toBe("reject-correction");
  });

  it("marks underpowered when M11.7 reports underpowered", () => {
    const evaluation = evaluateCalibrationFadeFamilyVerdict(
      loadFromFixture({
        oos: createOosEntry({
          isUnderpowered: true,
          clearsMde: false,
          passesCorrected: false,
          finalStatisticalVerdict: "underpowered",
          holdout: createHoldoutMetrics({
            isUnderpowered: true,
            clearsMde: false,
            observedNetEdge: 0.01,
          }),
        }),
      }),
      "calibration-fade",
    );

    expect(evaluation.hypotheses[0]?.verdict).toBe("underpowered");
    expect(evaluation.summary.familyVerdict).toBe("underpowered");
  });

  it("rejects derived sensitivity when recommendation is highly sensitive", () => {
    const evaluation = evaluateCalibrationFadeFamilyVerdict(
      loadFromFixture({
        derived: {
          recommendation: "highly-sensitive",
          derivedObservationShare: 0.2,
        },
      }),
      "calibration-fade",
    );

    expect(evaluation.hypotheses[0]?.verdict).toBe("reject-derived-sensitivity");
  });

  it("does not treat raw filled trade count as independent sample size", () => {
    const evaluation = evaluateCalibrationFadeFamilyVerdict(
      loadFromFixture({
        replay: createReplayEntry({
          tradeCount: 500,
          uniqueMarketCount: 2,
          uniqueTradingDayCount: 2,
        }),
      }),
      "calibration-fade",
    );

    expect(evaluation.hypotheses[0]?.verdict).toBe("reject-fillability");
    expect(evaluation.hypotheses[0]?.primaryFailureReason).toContain("unique markets 2");
  });

  it("propagates repeated-entry warnings from trade replay", () => {
    const evaluation = evaluateCalibrationFadeFamilyVerdict(
      loadFromFixture({}),
      "calibration-fade",
    );

    expect(evaluation.hypotheses[0]?.tradeReplayEvidence.repeatedEntryWarning).toContain(
      "not independent bets",
    );
    expect(evaluation.hypotheses[0]?.tradeReplayEvidence.dependenceWarnings.length).toBeGreaterThan(
      0,
    );
  });

  it("serializes deterministic JSON and HTML output", () => {
    const report = buildCalibrationFadeFamilyVerdictReport({
      generatedAt: GENERATED_AT,
      outputPath: OUTPUT_PATH,
      htmlOutputPath: HTML_PATH,
      inputPaths: DEFAULT_CALIBRATION_FADE_FAMILY_VERDICT_INPUT_PATHS,
      loadedInputs: loadFromFixture({
        oos: createOosEntry({
          isUnderpowered: true,
          clearsMde: false,
          passesCorrected: false,
          finalStatisticalVerdict: "underpowered",
        }),
      }),
    });

    const json = serializeCalibrationFadeFamilyVerdictReport(report);
    const html = serializeCalibrationFadeFamilyVerdictHtml(report);

    expect(json).toBe(serializeCalibrationFadeFamilyVerdictReport(report));
    expect(html).toBe(serializeCalibrationFadeFamilyVerdictHtml(report));
    expect(json).toContain('"familyVerdict":"underpowered"');
    expect(html).toContain("Calibration-Fade Family Verdict");
    expect(html).toContain("does not authorize live trading");
  });

  it("matches expected upstream underpowered family outcome", () => {
    const paths = DEFAULT_CALIBRATION_FADE_FAMILY_VERDICT_INPUT_PATHS;
    const files = createRequiredFixture({
      oos: createOosEntry({
        isUnderpowered: true,
        clearsMde: false,
        passesCorrected: false,
        finalStatisticalVerdict: "underpowered",
      }),
      replay: createReplayEntry({ netPnlCents: 323 }),
    });
    files[paths.hypothesisCandidatesPath] = JSON.stringify({
      candidates: [
        createCandidate(),
        createCandidate({
          candidateId:
            "atlas-probabilityMoneyness-coarse-prob-0-moneyness-near-above-under",
          suggestedStrategyFamily: "calibration-yes-fade",
        }),
      ],
    });
    files[paths.oosPowerCorrectionPath] = JSON.stringify({
      entries: [
        createOosEntry({
          isUnderpowered: true,
          clearsMde: false,
          passesCorrected: false,
          finalStatisticalVerdict: "underpowered",
        }),
        createOosEntry({
          hypothesisId:
            "atlas-probabilityMoneyness-coarse-prob-0-moneyness-near-above-under",
          isUnderpowered: true,
          clearsMde: false,
          passesCorrected: false,
          finalStatisticalVerdict: "underpowered",
        }),
      ],
    });
    files[paths.hypothesisTradeReplayPath] = JSON.stringify({
      entries: [
        createReplayEntry({ netPnlCents: 323 }),
        createReplayEntry({
          hypothesisId:
            "atlas-probabilityMoneyness-coarse-prob-0-moneyness-near-above-under",
          netPnlCents: 1618,
          tradeCount: 221,
          uniqueMarketCount: 217,
          uniqueTradingDayCount: 80,
        }),
      ],
    });

    const evaluation = evaluateCalibrationFadeFamilyVerdict(
      loadCalibrationFadeFamilyVerdictInputs(
        createMemoryIo(files),
        DEFAULT_CALIBRATION_FADE_FAMILY_VERDICT_INPUT_PATHS,
      ),
      "calibration-fade",
    );

    expect(evaluation.summary.hypothesisCount).toBe(2);
    expect(evaluation.summary.positiveInSampleReplayCount).toBe(2);
    expect(evaluation.summary.promotedHypothesisCount).toBe(0);
    expect(evaluation.summary.familyVerdict).toBe("underpowered");
    expect(evaluation.summary.recommendedNextAction).toBe("add-trade-pnl-oos-overlay");
  });
});
