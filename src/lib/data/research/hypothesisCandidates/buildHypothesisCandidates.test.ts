import { describe, expect, it } from "vitest";

import {
  buildAtlasCandidate,
  buildHypothesisCandidates,
  buildHypothesisCandidateInputStatus,
  HypothesisCandidateError,
  loadHypothesisCandidateInputs,
  serializeHypothesisCandidatesReport,
  selectLeadLagSignal,
} from "./index";
import { createEmptyMispricingAtlasCoarseBuckets } from "./normalizeMispricingAtlas";
import type {
  HypothesisCandidateInputStatus,
  ParsedHypothesisCandidateInputs,
} from "./hypothesisCandidateTypes";

const GENERATED_AT = "2026-07-02T12:00:00.000Z";

function defaultHypothesisConfig(overrides: Partial<{
  minSampleSize: number;
  minCalibrationError: number;
  minLeadLagCorrelation: number;
  minUniqueTradingDays: number;
}> = {}) {
  return {
    minSampleSize: 30,
    minCalibrationError: 0.05,
    minLeadLagCorrelation: 0.2,
    minUniqueTradingDays: 2,
    minSampleSizeByGroup: {},
    ...overrides,
  };
}
const OUTPUT_PATH = "data/research-results/hypothesis-candidates.json";

function createInputStatus(
  overrides: Partial<HypothesisCandidateInputStatus> = {},
): HypothesisCandidateInputStatus {
  return {
    mispricingAtlasPath: "data/research-results/mispricing-atlas.json",
    leadLagAnalysisPath: "data/research-results/lead-lag-analysis.json",
    statisticalSignificancePath: "data/research-results/statistical-significance.json",
    regimeTagsPath: "data/research-results/regime-tags.json",
    strategyLeaderboardPath: "data/leaderboards/strategy-leaderboard.json",
    mispricingAtlasPresent: true,
    leadLagAnalysisPresent: true,
    statisticalSignificancePresent: false,
    regimeTagsPresent: false,
    strategyLeaderboardPresent: false,
    ...overrides,
  };
}

function createEmptyMispricingAtlas() {
  const emptyBucket = {
    bucketId: "empty",
    bucketLabel: "Empty",
    observations: 0,
    averageImpliedProbability: null,
    realizedFrequency: null,
    calibrationError: null,
    brierScore: null,
    averageAbsoluteError: null,
  };

  return {
    generatedAt: GENERATED_AT,
    inputRoot: "data/research-results",
    outputPath: "data/research-results/mispricing-atlas.json",
    sampleCounts: {
      totalObservations: 0,
      marketCount: 0,
      skippedMissingSettlement: 0,
      skippedMissingProbability: 0,
      skippedMissingContext: 0,
    },
    overallCalibration: { ...emptyBucket, bucketId: "overall", bucketLabel: "Overall" },
    probabilityBuckets: [],
    timeRemainingBuckets: [],
    moneynessBuckets: [],
    volatilityBuckets: [],
    coarseBuckets: createEmptyMispricingAtlasCoarseBuckets(),
    warnings: [],
  };
}

function createMispricingAtlasWithBucket(options: {
  bucketId: string;
  bucketLabel: string;
  observations: number;
  calibrationError: number;
  uniqueTradingDays?: number | null;
  group?:
    | "volatility"
    | "timeRemaining"
    | "moneyness"
    | "probabilityOnly"
    | "probabilityMoneyness"
    | "moneynessTime"
    | "volatilityMoneyness"
    | "volatilityProbabilityTime";
}) {
  const bucket = {
    bucketId: options.bucketId,
    bucketLabel: options.bucketLabel,
    observations: options.observations,
    uniqueTradingDays: options.uniqueTradingDays ?? null,
    averageImpliedProbability: 0.7,
    realizedFrequency: 0.7 - options.calibrationError,
    calibrationError: options.calibrationError,
    brierScore: 0.1,
    averageAbsoluteError: Math.abs(options.calibrationError),
  };

  const atlas = createEmptyMispricingAtlas();
  atlas.sampleCounts.totalObservations = options.observations;
  atlas.sampleCounts.marketCount = 1;

  if (options.group === "timeRemaining") {
    atlas.timeRemainingBuckets = [bucket];
  } else if (options.group === "moneyness") {
    atlas.moneynessBuckets = [bucket];
  } else if (options.group === "probabilityOnly") {
    atlas.coarseBuckets = {
      ...createEmptyMispricingAtlasCoarseBuckets(),
      probabilityOnly: [bucket],
    };
  } else if (options.group === "probabilityMoneyness") {
    atlas.coarseBuckets = {
      ...createEmptyMispricingAtlasCoarseBuckets(),
      probabilityMoneyness: [bucket],
    };
  } else if (options.group === "moneynessTime") {
    atlas.coarseBuckets = {
      ...createEmptyMispricingAtlasCoarseBuckets(),
      moneynessTime: [bucket],
    };
  } else if (options.group === "volatilityMoneyness") {
    atlas.coarseBuckets = {
      ...createEmptyMispricingAtlasCoarseBuckets(),
      volatilityMoneyness: [bucket],
    };
  } else if (options.group === "volatilityProbabilityTime") {
    atlas.coarseBuckets = {
      ...createEmptyMispricingAtlasCoarseBuckets(),
      volatilityProbabilityTime: [bucket],
    };
  } else {
    atlas.volatilityBuckets = [bucket];
  }

  return atlas;
}

function createLeadLagAnalysis(metrics: Array<{
  lag: number;
  correlation: number | null;
  direction: "btc-leads-kalshi" | "synchronous" | "insufficient-data";
  observationCount: number;
}>) {
  return {
    generatedAt: GENERATED_AT,
    inputRoot: "data/research-results",
    outputPath: "data/research-results/lead-lag-analysis.json",
    maxLag: 10,
    sampleCounts: {
      marketCount: 1,
      totalCandles: 100,
      skippedMarkets: 0,
      skippedMissingCandles: 0,
    },
    aggregateLagMetrics: metrics.map((metric) => ({
      lag: metric.lag,
      correlation: metric.correlation,
      crossCorrelation: metric.correlation,
      direction: metric.direction,
      observationCount: metric.observationCount,
    })),
    markets: [],
    warnings: [],
  };
}

function buildReport(inputs: ParsedHypothesisCandidateInputs, config?: { minSampleSize?: number }) {
  return buildHypothesisCandidates({
    generatedAt: GENERATED_AT,
    outputPath: OUTPUT_PATH,
    inputs,
    inputStatus: createInputStatus({
      mispricingAtlasPresent: inputs.mispricingAtlas !== null,
      leadLagAnalysisPresent: inputs.leadLagAnalysis !== null,
      statisticalSignificancePresent: inputs.statisticalSignificance !== null,
      regimeTagsPresent: inputs.regimeTags !== null,
    }),
    config,
  });
}

describe("buildAtlasCandidate", () => {
  it("ignores sparse atlas cells below the minimum sample threshold", () => {
    const candidate = buildAtlasCandidate({
      groupId: "volatility",
      bucket: {
        bucketId: "vol-high",
        bucketLabel: "High (>=60% annualized)",
        observations: 5,
        averageImpliedProbability: 0.8,
        realizedFrequency: 0.5,
        calibrationError: 0.3,
        brierScore: 0.2,
        averageAbsoluteError: 0.3,
      },
      config: defaultHypothesisConfig(),
      significanceWarnings: [],
      significancePresent: false,
      regimeContext: null,
      direction: "over",
    });

    expect(candidate).toBeNull();
  });

  it("creates a candidate for a significant atlas cell", () => {
    const candidate = buildAtlasCandidate({
      groupId: "volatility",
      bucket: {
        bucketId: "vol-high",
        bucketLabel: "High (>=60% annualized)",
        observations: 40,
        averageImpliedProbability: 0.8,
        realizedFrequency: 0.65,
        calibrationError: 0.15,
        brierScore: 0.2,
        averageAbsoluteError: 0.15,
      },
      config: defaultHypothesisConfig(),
      significanceWarnings: [],
      significancePresent: false,
      regimeContext: "High-volatility regime",
      direction: "over",
    });

    expect(candidate).not.toBeNull();
    expect(candidate?.candidateId).toBe("atlas-volatility-vol-high-over");
    expect(candidate?.bucketMetadata?.calibrationDirection).toBe("over");
    expect(candidate?.suggestedStrategyFamily).toBe("calibration-no-fade");
    expect(candidate?.marketCondition).toContain("High (>=60% annualized)");
    expect(candidate?.killCriterion).toContain("Stop pursuing");
  });

  it("filters buckets dominated by a single trading day", () => {
    const candidate = buildAtlasCandidate({
      groupId: "probabilityMoneyness",
      bucket: {
        bucketId: "coarse-prob-1-moneyness-near-above",
        bucketLabel: "[0.2, 0.4) × 0% to 2% from strike",
        observations: 40,
        uniqueTradingDays: 1,
        averageImpliedProbability: 0.55,
        realizedFrequency: 0.4,
        calibrationError: 0.15,
        brierScore: 0.2,
        averageAbsoluteError: 0.15,
      },
      config: defaultHypothesisConfig({ minUniqueTradingDays: 2 }),
      significanceWarnings: [],
      significancePresent: false,
      regimeContext: null,
      direction: "over",
    });

    expect(candidate).toBeNull();
  });

  it("creates underconfidence candidates when calibration error is negative", () => {
    const candidate = buildAtlasCandidate({
      groupId: "moneynessTime",
      bucket: {
        bucketId: "moneyness-near-below-time-0-5m",
        bucketLabel: "-2% to 0% from strike × 0-5 minutes remaining",
        observations: 40,
        uniqueTradingDays: 5,
        averageImpliedProbability: 0.45,
        realizedFrequency: 0.58,
        calibrationError: -0.13,
        brierScore: 0.2,
        averageAbsoluteError: 0.13,
      },
      config: defaultHypothesisConfig(),
      significanceWarnings: [],
      significancePresent: false,
      regimeContext: null,
      direction: "under",
    });

    expect(candidate?.candidateId).toBe(
      "atlas-moneynessTime-moneyness-near-below-time-0-5m-under",
    );
    expect(candidate?.hypothesis).toContain("underconfident");
  });
});

describe("selectLeadLagSignal", () => {
  it("selects a BTC-leading lag above thresholds", () => {
    const signal = selectLeadLagSignal(
      [
        {
          lag: 0,
          correlation: 0.1,
          crossCorrelation: 0.1,
          direction: "synchronous",
          observationCount: 100,
        },
        {
          lag: 1,
          correlation: 0.45,
          crossCorrelation: 0.45,
          direction: "btc-leads-kalshi",
          observationCount: 80,
        },
      ],
      {
        minSampleSize: 30,
        minCalibrationError: 0.05,
        minLeadLagCorrelation: 0.2,
        minUniqueTradingDays: 2,
        minSampleSizeByGroup: {},
      },
    );

    expect(signal?.lag).toBe(1);
    expect(signal?.direction).toBe("btc-leads-kalshi");
  });
});

describe("buildHypothesisCandidates", () => {
  it("returns no candidates and summary reasons for empty inputs", () => {
    const report = buildReport({
      mispricingAtlas: null,
      leadLagAnalysis: null,
      statisticalSignificance: null,
      regimeTags: null,
      strategyLeaderboard: null,
    });

    expect(report.candidates).toEqual([]);
    expect(report.summary.noCandidateReasons).toContain(
      "No candidate: missing mispricing-atlas.json and lead-lag-analysis.json inputs.",
    );
  });

  it("creates a lead-lag candidate when aggregate metrics qualify", () => {
    const report = buildReport({
      mispricingAtlas: createEmptyMispricingAtlas(),
      leadLagAnalysis: createLeadLagAnalysis([
        {
          lag: 1,
          correlation: 0.55,
          direction: "btc-leads-kalshi",
          observationCount: 60,
        },
      ]),
      statisticalSignificance: null,
      regimeTags: null,
      strategyLeaderboard: null,
    });

    expect(report.candidates).toHaveLength(1);
    expect(report.candidates[0]?.sourceArtifact).toBe("lead-lag-analysis.json");
    expect(report.candidates[0]?.suggestedStrategyFamily).toBe("delayed-reaction");
    expect(report.candidates[0]?.warnings[0]).toContain("Statistical significance artifact is missing");
  });

  it("creates an atlas candidate for meaningful mispricing", () => {
    const report = buildReport({
      mispricingAtlas: createMispricingAtlasWithBucket({
        bucketId: "time-0-5m",
        bucketLabel: "0-5 minutes remaining",
        observations: 50,
        calibrationError: 0.12,
        group: "timeRemaining",
      }),
      leadLagAnalysis: null,
      statisticalSignificance: null,
      regimeTags: null,
      strategyLeaderboard: null,
    });

    expect(report.candidates).toHaveLength(1);
    expect(report.candidates[0]?.hypothesis).toContain("overconfident");
    expect(report.candidates[0]?.sourceArtifact).toBe("mispricing-atlas.json");
  });

  it("adds warnings when significance is missing", () => {
    const report = buildReport({
      mispricingAtlas: createMispricingAtlasWithBucket({
        bucketId: "vol-high",
        bucketLabel: "High (>=60% annualized)",
        observations: 35,
        calibrationError: 0.1,
      }),
      leadLagAnalysis: null,
      statisticalSignificance: null,
      regimeTags: null,
      strategyLeaderboard: null,
    });

    expect(report.candidates[0]?.warnings).toContain(
      "Statistical significance artifact is missing; confidence is capped and hypothesis remains unvalidated.",
    );
    expect(report.candidates[0]?.confidence).not.toBe("high");
  });

  it("serializes deterministically", () => {
    const inputs: ParsedHypothesisCandidateInputs = {
      mispricingAtlas: createMispricingAtlasWithBucket({
        bucketId: "vol-high",
        bucketLabel: "High (>=60% annualized)",
        observations: 40,
        calibrationError: 0.08,
      }),
      leadLagAnalysis: createLeadLagAnalysis([
        {
          lag: 1,
          correlation: 0.4,
          direction: "btc-leads-kalshi",
          observationCount: 45,
        },
      ]),
      statisticalSignificance: null,
      regimeTags: null,
      strategyLeaderboard: null,
    };

    const first = serializeHypothesisCandidatesReport(buildReport(inputs));
    const second = serializeHypothesisCandidatesReport(buildReport(inputs));

    expect(first).toBe(second);
    expect(JSON.parse(first).candidates.map((candidate: { candidateId: string }) => candidate.candidateId)).toEqual([
      "atlas-volatility-vol-high-over",
      "lead-lag-aggregate-lag-1",
    ]);
  });
  it("reports atlas coverage diagnostics in the summary", () => {
    const report = buildReport({
      mispricingAtlas: createMispricingAtlasWithBucket({
        bucketId: "coarse-prob-2",
        bucketLabel: "[0.4, 0.6)",
        observations: 50,
        calibrationError: 0.12,
        group: "probabilityOnly",
      }),
      leadLagAnalysis: null,
      statisticalSignificance: null,
      regimeTags: null,
      strategyLeaderboard: null,
    });

    expect(report.summary.atlasCoverageDiagnostics?.totalAtlasObservations).toBe(50);
    expect(report.summary.atlasCoverageDiagnostics?.largestBucketObservations).toBe(50);
  });

  it("reports sparse bucket diagnostics when cells are below threshold", () => {
    const atlas = createEmptyMispricingAtlas();
    atlas.sampleCounts.totalObservations = 45;
    atlas.sampleCounts.marketCount = 3;
    atlas.probabilityBuckets = [
      {
        bucketId: "prob-0",
        bucketLabel: "[0.0, 0.1)",
        observations: 15,
        averageImpliedProbability: 0.7,
        realizedFrequency: 0.55,
        calibrationError: 0.15,
        brierScore: 0.2,
        averageAbsoluteError: 0.15,
      },
      {
        bucketId: "prob-1",
        bucketLabel: "[0.1, 0.2)",
        observations: 12,
        averageImpliedProbability: 0.65,
        realizedFrequency: 0.5,
        calibrationError: 0.15,
        brierScore: 0.2,
        averageAbsoluteError: 0.15,
      },
    ];

    const report = buildReport({
      mispricingAtlas: atlas,
      leadLagAnalysis: null,
      statisticalSignificance: null,
      regimeTags: null,
      strategyLeaderboard: null,
    });

    expect(report.candidates).toHaveLength(0);
    expect(report.summary.noCandidateReasons).toContain(
      "No candidate: largest bucket has 15 observations, below threshold (30).",
    );
    expect(report.summary.atlasCoverageDiagnostics?.bucketsBelowMinSampleThreshold).toBeGreaterThan(
      0,
    );
  });

  it("reports settlement skip reason when atlas has zero observations", () => {
    const atlas = createEmptyMispricingAtlas();
    atlas.sampleCounts.skippedMissingSettlement = 12;

    const report = buildReport({
      mispricingAtlas: atlas,
      leadLagAnalysis: null,
      statisticalSignificance: null,
      regimeTags: null,
      strategyLeaderboard: null,
    });

    expect(report.summary.noCandidateReasons).toContain(
      "No candidate: no settlement outcomes found (12 markets skipped).",
    );
  });

  it("creates a candidate from a coarse probability-only bucket", () => {
    const report = buildReport({
      mispricingAtlas: createMispricingAtlasWithBucket({
        bucketId: "coarse-prob-1",
        bucketLabel: "[0.2, 0.4)",
        observations: 40,
        calibrationError: 0.1,
        group: "probabilityOnly",
      }),
      leadLagAnalysis: null,
      statisticalSignificance: null,
      regimeTags: null,
      strategyLeaderboard: null,
    });

    expect(report.candidates).toHaveLength(1);
    expect(report.candidates[0]?.candidateId).toBe("atlas-probabilityOnly-coarse-prob-1-over");
  });

  it("creates candidates from expanded multi-axis bucket groups", () => {
    const report = buildReport({
      mispricingAtlas: createMispricingAtlasWithBucket({
        bucketId: "coarse-prob-1-moneyness-near-above",
        bucketLabel: "[0.2, 0.4) × 0% to 2% from strike",
        observations: 50,
        calibrationError: 0.11,
        uniqueTradingDays: 4,
        group: "probabilityMoneyness",
      }),
      leadLagAnalysis: null,
      statisticalSignificance: null,
      regimeTags: null,
      strategyLeaderboard: null,
    });

    expect(report.candidates).toHaveLength(1);
    expect(report.candidates[0]?.candidateId).toBe(
      "atlas-probabilityMoneyness-coarse-prob-1-moneyness-near-above-over",
    );
    expect(report.candidates[0]?.bucketMetadata?.groupId).toBe("probabilityMoneyness");
  });

  it("requires a higher sample threshold for triple-axis buckets by default", () => {
    const report = buildReport(
      {
        mispricingAtlas: createMispricingAtlasWithBucket({
          bucketId: "vol-high-coarse-prob-1-coarse-time-early",
          bucketLabel: "High × [0.2, 0.4) × < 15 minutes remaining",
          observations: 40,
          calibrationError: 0.12,
          uniqueTradingDays: 5,
          group: "volatilityProbabilityTime",
        }),
        leadLagAnalysis: null,
        statisticalSignificance: null,
        regimeTags: null,
        strategyLeaderboard: null,
      },
      { minSampleSize: 30 },
    );

    expect(report.candidates).toHaveLength(0);
    expect(report.summary.noCandidateReasons.length).toBeGreaterThan(0);
  });

  it("handles empty atlas artifacts gracefully", () => {
    const report = buildReport({
      mispricingAtlas: createEmptyMispricingAtlas(),
      leadLagAnalysis: null,
      statisticalSignificance: null,
      regimeTags: null,
      strategyLeaderboard: null,
    });

    expect(report.candidates).toEqual([]);
    expect(report.summary.atlasCoverageDiagnostics?.totalAtlasObservations).toBe(0);
    expect(report.summary.noCandidateReasons).toContain(
      "No candidate: insufficient atlas observations (0 < 30).",
    );
  });
});

describe("loadHypothesisCandidateInputs atlas parsing", () => {
  it("throws a schema mismatch error for invalid mispricing atlas documents", () => {
    expect(() =>
      loadHypothesisCandidateInputs(
        {
          fileExists: (path) => path.endsWith("mispricing-atlas.json"),
          readFile: () => JSON.stringify({ generatedAt: "bad" }),
        },
        {
          mispricingAtlasPath: "data/research-results/mispricing-atlas.json",
          leadLagAnalysisPath: "missing/lead-lag-analysis.json",
          statisticalSignificancePath: "missing/statistical-significance.json",
          regimeTagsPath: "missing/regime-tags.json",
          strategyLeaderboardPath: "missing/strategy-leaderboard.json",
        },
      ),
    ).toThrow(HypothesisCandidateError);

    try {
      loadHypothesisCandidateInputs(
        {
          fileExists: (path) => path.endsWith("mispricing-atlas.json"),
          readFile: () => JSON.stringify({ generatedAt: "bad" }),
        },
        {
          mispricingAtlasPath: "data/research-results/mispricing-atlas.json",
          leadLagAnalysisPath: "missing/lead-lag-analysis.json",
          statisticalSignificancePath: "missing/statistical-significance.json",
          regimeTagsPath: "missing/regime-tags.json",
          strategyLeaderboardPath: "missing/strategy-leaderboard.json",
        },
      );
    } catch (error) {
      expect((error as HypothesisCandidateError).message).toContain(
        "mispricing-atlas schema mismatch",
      );
    }
  });
});

describe("buildHypothesisCandidateInputStatus", () => {
  it("tracks which optional artifacts are present", () => {
    const status = buildHypothesisCandidateInputStatus({
      io: {
        fileExists: (path) => path.endsWith("mispricing-atlas.json"),
        readFile: () => {
          throw new Error("not used");
        },
      },
    });

    expect(status.mispricingAtlasPresent).toBe(true);
    expect(status.leadLagAnalysisPresent).toBe(false);
  });

  it("loads M7.5 regime-tags.json summaryCounts without crashing", () => {
    const regimeTagsJson = JSON.stringify({
      generatedAt: GENERATED_AT,
      summaryCounts: {
        volatility: { low: 10, medium: 5, high: 2 },
        trend: { sideways: 15, uptrend: 1, downtrend: 1 },
        marketState: { quiet: 12, choppy: 3, trending: 1, reversal: 1 },
      },
    });

    const { inputs } = loadHypothesisCandidateInputs(
      {
        fileExists: (path) => path.endsWith("regime-tags.json"),
        readFile: (path) => {
          if (path.endsWith("regime-tags.json")) {
            return regimeTagsJson;
          }

          throw new Error(`unexpected read: ${path}`);
        },
      },
      {
        mispricingAtlasPath: "missing/mispricing-atlas.json",
        leadLagAnalysisPath: "missing/lead-lag-analysis.json",
        statisticalSignificancePath: "missing/statistical-significance.json",
        regimeTagsPath: "data/research-results/regime-tags.json",
        strategyLeaderboardPath: "missing/strategy-leaderboard.json",
      },
    );

    expect(inputs.regimeTags?.regimes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          regimeId: "volatility-high",
          label: "high volatility",
          marketCount: 2,
        }),
      ]),
    );
  });
});
