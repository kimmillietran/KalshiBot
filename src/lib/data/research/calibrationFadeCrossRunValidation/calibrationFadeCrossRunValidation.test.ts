import { describe, expect, it, vi } from "vitest";

import { publishResearchArtifactsAtomically } from "@/lib/data/research/calibrationFadeForwardValidation";
import type {
  CalibrationFadeForwardValidationReport,
  CalibrationFadeMarketRecord,
} from "@/lib/data/research/calibrationFadeForwardValidation/calibrationFadeForwardValidationTypes";
import {
  CalibrationFadeForwardValidationError,
  DEFAULT_CALIBRATION_FADE_HYPOTHESIS_CONFIG_PATH,
} from "@/lib/data/research/calibrationFadeForwardValidation";

import { analyzeCalibrationFadeCrossRun } from "./analyzeCalibrationFadeCrossRun";
import { classifyCalibrationFadeCrossRun } from "./classifyCalibrationFadeCrossRun";
import { computeRunSetHash } from "./computeRunSetHash";
import { createMemoryCalibrationFadeCrossRunValidationIo } from "./createCalibrationFadeCrossRunValidationIo";
import { deduplicateCandidateMarkets } from "./deduplicateCandidateMarkets";
import { parseCalibrationFadeCrossRunValidationArgv } from "./parseCalibrationFadeCrossRunValidationArgv";
import {
  CalibrationFadeCrossRunValidationError,
  type CalibrationFadeCrossRunValidationConfig,
} from "./calibrationFadeCrossRunValidationTypes";

const RUN1 = "data/live-capture/forward-quotes/2026-07-11T11-07-38-871Z";
const RUN2 = "data/live-capture/forward-quotes/2026-07-12T10-18-27-409Z";
const RUN3 = "data/live-capture/forward-quotes/2026-07-13T00-00-00-000Z";
const HYPOTHESIS_ID =
  "atlas-volatilityProbabilityTime-vol-high-coarse-prob-1-coarse-time-early-over";
const HYPOTHESIS_HASH = "76336405";

function freezeSpecContent(hashNote = HYPOTHESIS_HASH): string {
  return JSON.stringify({
    hypothesisId: HYPOTHESIS_ID,
    hypothesisVersion: "v1",
    description: "test freeze",
    canonicalSourceArtifacts: ["data/research-results/hypothesis-candidates.json"],
    sourceCandidateId: HYPOTHESIS_ID,
    axisGroupId: "volatilityProbabilityTime",
    bucketId: "vol-high-coarse-prob-1-coarse-time-early",
    calibrationDirection: "over",
    targetOutcomeSide: "no",
    suggestedStrategyFamily: "calibration-no-fade",
    eligibilityRules: {
      volatility: { bucketId: "vol-high", minInclusive: 0.6, maxExclusive: null },
      probability: { bucketId: "coarse-prob-1", minInclusive: 0.3, maxExclusive: 0.7 },
      timeRemainingMs: { bucketId: "coarse-time-early", minInclusive: 0, maxExclusive: 900000 },
    },
    probabilityMeasure: { id: "yes-bid-ask-midpoint", definition: "mid", formula: "mid" },
    volatilityDefinition: {
      sourceInstrument: "BTC",
      returnIntervalMs: 60000,
      lookbackBars: 10,
      method: "realized-log-return-annualized",
      causalOnly: true,
      maximumSourceGapMs: 5000,
    },
    marketEligibilityRules: {
      requireValidBook: true,
      requireSynchronizedBook: true,
      requireOpenMarket: true,
      requireBtcJoin: true,
    },
    deduplicationPolicy: {
      episodeBreakOnDisqualification: true,
      entryRule: "first-crossing-into-eligibility",
      primaryValidationUnit: "one-first-entry-per-market",
      suppressRepeatedQualifyingSnapshots: true,
    },
    entryPriceMeasures: {
      calibrationLayer: "yes-bid-ask-midpoint",
      executableLayer: "no-ask-cross-spread",
      diagnosticLayer: "yes-bid-ask-midpoint",
    },
    settlementMapping: {},
    minimumEvidenceRequirements: {
      minimumIndependentCandidateMarkets: 5,
      minimumSettlementCoverageShare: 0.8,
      minimumValidBookShare: 0.9,
      minimumBtcJoinCoverageShare: 0.9,
      materialRejectionCalibrationGap: 0.05,
      materialSupportCalibrationGap: 0.03,
      materialExecutableNetReturnCents: 1,
    },
    classificationRules: { precedence: ["insufficient-forward-events"] },
    _fixtureNote: hashNote,
  });
}

function hypothesisCandidatesFixture() {
  return JSON.stringify({
    candidates: [
      {
        candidateId: HYPOTHESIS_ID,
        bucketMetadata: {
          observations: 273,
          uniqueTradingDays: 37,
          calibrationError: 0.05,
        },
        rationale: "Observed calibration error of 5.0% (implied 50.5%, realized 45.5%).",
        warnings: [],
      },
    ],
  });
}

function marketRecord(partial: Partial<CalibrationFadeMarketRecord>): CalibrationFadeMarketRecord {
  return {
    marketTicker: "KXBTC15M-26JUL111200-00",
    entryTimestamp: "2026-07-11T18:00:00.000Z",
    impliedYesProbability: 0.57,
    noAskCents: 43,
    executableAvailable: true,
    settlementStatus: "known",
    settledOutcome: "yes",
    grossReturnCents: -43,
    feeAdjustedReturnCents: -44,
    calibrationGapSigned: -0.43,
    ...partial,
  };
}

function stubReport(input: {
  runId: string;
  runDir: string;
  recordsScanned: number;
  qualifyingObservationCount: number;
  candidateEpisodeCount: number;
  markets: CalibrationFadeMarketRecord[];
  captureHealthSource: string;
  captureVerdict: string | null;
  runDurationSeconds: number;
  validBookShare?: number;
  sequenceGapCount?: number;
  hypothesisConfigurationHash?: string;
  researchReadyVerified?: boolean;
}): CalibrationFadeForwardValidationReport {
  return {
    analysisVersion: "calibration-fade-forward-validation-v1",
    analysisScope: "selected-run",
    selectedRunId: input.runId,
    selectedRunDirectory: input.runDir,
    sourceRunIds: [input.runId],
    hypothesisId: HYPOTHESIS_ID,
    hypothesisVersion: "v1",
    hypothesisConfigurationHash: input.hypothesisConfigurationHash ?? HYPOTHESIS_HASH,
    historicalSourceArtifacts: ["data/research-results/hypothesis-candidates.json"],
    historicalSourceHashes: {},
    artifactGeneratedAt: "2026-07-19T00:00:00.000Z",
    outputPath: "unused.json",
    htmlOutputPath: "unused.html",
    eventsOutputPath: "unused-events.jsonl",
    marketsOutputPath: "unused-markets.jsonl",
    recordsScanned: input.recordsScanned,
    marketsScanned: input.markets.length,
    btcRecordsScanned: 100,
    qualifyingObservationCount: input.qualifyingObservationCount,
    candidateEpisodeCount: input.candidateEpisodeCount,
    candidateMarketCount: input.markets.length,
    executableCandidateCount: input.markets.filter((m) => m.executableAvailable).length,
    settlementCoverageShare: input.markets.length
      ? input.markets.filter((m) => m.settledOutcome === "yes" || m.settledOutcome === "no").length
        / input.markets.length
      : null,
    warnings: [],
    inputArtifactIdentities: [{ path: `${input.runDir}/capture-health.json` }],
    selectedRunQuality: {
      selectedRunId: input.runId,
      captureHealthSource: input.captureHealthSource as never,
      runDurationSeconds: input.runDurationSeconds,
      validBookShare: input.validBookShare ?? 0.99,
      btcJoinCoverageShare: 1,
      bidSizeCoverageShare: null,
      reconnectCount: 0,
      sequenceGapCount: input.sequenceGapCount ?? 0,
      suspectedSystemSleepSeconds: 0,
      captureVerdict: input.captureVerdict,
      reconciliationVerdict: null,
      nativeCaptureVerdict: null,
      captureEndReason: null,
      terminalFailureReason: null,
      completedNormally: null,
      researchReadyVerified:
        input.researchReadyVerified ?? input.captureVerdict === "capture-research-ready",
      auditFingerprintsVerified:
        input.researchReadyVerified ?? input.captureVerdict === "capture-research-ready",
    },
    historicalBenchmark: {
      discoveryObservationCount: 273,
      discoveryUniqueTradingDays: 37,
      discoveryCalibrationError: 0.05,
      discoveryAverageImpliedProbability: 0.505,
      discoveryRealizedFrequency: 0.455,
      discoveryRobustnessScore: 61,
      discoveryPassesValidation: false,
      sourceArtifactPaths: [],
      sourceArtifactHashes: {},
      caveats: [],
    },
    forwardBenchmark: {
      qualifyingObservationCount: input.qualifyingObservationCount,
      candidateEpisodeCount: input.candidateEpisodeCount,
      candidateMarketCount: input.markets.length,
      meanImpliedYesProbability: null,
      meanTargetSideProbability: null,
      observedYesSettlementRate: null,
      observedTargetSideSettlementRate: null,
      calibrationGap: null,
      signedCalibrationGap: null,
      brierScore: null,
      logLoss: null,
      marketLevelSignedCalibrationGap: null,
      descriptiveObservationSignedGap: null,
      executable: {
        executableCandidateCount: 0,
        evaluatedExecutableCandidateCount: 0,
        executableEntryAvailableCount: 0,
        unavailableExecutablePriceCount: 0,
        grossReturnCents: null,
        feeAdjustedReturnCents: null,
        winRate: null,
        averageEntryPriceCents: null,
        medianEntryPriceCents: null,
        maximumDrawdownCents: null,
        cumulativeReturnCents: null,
      },
      settlementCoverage: {
        candidateMarketCount: input.markets.length,
        settledCandidateMarketCount: 0,
        joinedCandidateMarketCount: 0,
        unresolvedCandidateMarketCount: input.markets.length,
        settlementCoverageShare: null,
        excludedByReason: {},
      },
    },
    funnel: [],
    gatePassCounts: {
      validBook: 0,
      synchronizedBook: 0,
      btcJoinAvailable: 0,
      volatilityAvailable: 0,
      highVolatility: 0,
      probabilityBand: 0,
      timeRemainingBand: 0,
      qualifyingObservation: input.qualifyingObservationCount,
    },
    featureCompatibility: {
      probabilityMeasureAvailable: true,
      volatilityMeasureAvailable: true,
      timeRemainingAvailable: true,
      incompatibleFeatures: [],
    },
    summary: {
      interpretationClassification: "insufficient-forward-events",
      recommendedNextAction: "collect-additional-clean-forward-captures",
      rationale: "stub",
    },
    disclaimer: "stub",
  };
}

function baseConfig(dirs: readonly string[]): CalibrationFadeCrossRunValidationConfig {
  return {
    captureRunDirs: dirs,
    operatorProvidedRunOrder: dirs,
    hypothesisConfigPath: DEFAULT_CALIBRATION_FADE_HYPOTHESIS_CONFIG_PATH,
    importsDir: "data/imports",
    maximumBtcJoinAgeMs: 5000,
    marketsOutputPath: "data/research-results/calibration-fade-cross-run-markets.jsonl",
    runsOutputPath: "data/research-results/calibration-fade-cross-run-runs.jsonl",
    appearancesOutputPath: "data/research-results/calibration-fade-cross-run-appearances.jsonl",
  };
}

describe("parseCalibrationFadeCrossRunValidationArgv", () => {
  it("requires at least two capture run dirs", () => {
    expect(() =>
      parseCalibrationFadeCrossRunValidationArgv(["--capture-run-dir", RUN1]),
    ).toThrow(CalibrationFadeCrossRunValidationError);
  });

  it("rejects duplicate run IDs", () => {
    expect(() =>
      parseCalibrationFadeCrossRunValidationArgv([
        "--capture-run-dir",
        RUN1,
        "--capture-run-dir",
        RUN1,
      ]),
    ).toThrow(/Duplicate/);
  });

  it("accepts repeated --capture-run-dir", () => {
    const parsed = parseCalibrationFadeCrossRunValidationArgv([
      "--capture-run-dir",
      RUN2,
      "--capture-run-dir",
      RUN1,
    ]);
    expect(parsed.config.captureRunDirs).toHaveLength(2);
    expect(parsed.config.operatorProvidedRunOrder[0]).toContain("2026-07-12");
  });
});

describe("computeRunSetHash", () => {
  it("is stable across CLI order", () => {
    const left = computeRunSetHash({
      captureRunDirs: [RUN1, RUN2],
      hypothesisId: HYPOTHESIS_ID,
      hypothesisVersion: "v1",
      hypothesisConfigurationHash: HYPOTHESIS_HASH,
    });
    const right = computeRunSetHash({
      captureRunDirs: [RUN2, RUN1],
      hypothesisId: HYPOTHESIS_ID,
      hypothesisVersion: "v1",
      hypothesisConfigurationHash: HYPOTHESIS_HASH,
    });
    expect(left).toBe(right);
  });

  it("is stable across Windows path separators", () => {
    const left = computeRunSetHash({
      captureRunDirs: [RUN1, RUN2],
      hypothesisId: HYPOTHESIS_ID,
      hypothesisVersion: "v1",
      hypothesisConfigurationHash: HYPOTHESIS_HASH,
    });
    const right = computeRunSetHash({
      captureRunDirs: [
        RUN1.replaceAll("/", "\\"),
        RUN2.replaceAll("/", "\\"),
      ],
      hypothesisId: HYPOTHESIS_ID,
      hypothesisVersion: "v1",
      hypothesisConfigurationHash: HYPOTHESIS_HASH,
    });
    expect(left).toBe(right);
  });

  it("changes when a run is added", () => {
    const base = computeRunSetHash({
      captureRunDirs: [RUN1, RUN2],
      hypothesisId: HYPOTHESIS_ID,
      hypothesisVersion: "v1",
      hypothesisConfigurationHash: HYPOTHESIS_HASH,
    });
    const extended = computeRunSetHash({
      captureRunDirs: [RUN1, RUN2, RUN3],
      hypothesisId: HYPOTHESIS_ID,
      hypothesisVersion: "v1",
      hypothesisConfigurationHash: HYPOTHESIS_HASH,
    });
    expect(extended).not.toBe(base);
  });

  it("changes when a run is removed", () => {
    const base = computeRunSetHash({
      captureRunDirs: [RUN1, RUN2, RUN3],
      hypothesisId: HYPOTHESIS_ID,
      hypothesisVersion: "v1",
      hypothesisConfigurationHash: HYPOTHESIS_HASH,
    });
    const reduced = computeRunSetHash({
      captureRunDirs: [RUN1, RUN2],
      hypothesisId: HYPOTHESIS_ID,
      hypothesisVersion: "v1",
      hypothesisConfigurationHash: HYPOTHESIS_HASH,
    });
    expect(reduced).not.toBe(base);
  });

  it("changes when hypothesis identity changes", () => {
    const base = computeRunSetHash({
      captureRunDirs: [RUN1, RUN2],
      hypothesisId: HYPOTHESIS_ID,
      hypothesisVersion: "v1",
      hypothesisConfigurationHash: HYPOTHESIS_HASH,
    });
    const changed = computeRunSetHash({
      captureRunDirs: [RUN1, RUN2],
      hypothesisId: HYPOTHESIS_ID,
      hypothesisVersion: "v1",
      hypothesisConfigurationHash: "ffffffff",
    });
    expect(changed).not.toBe(base);
  });

  it("changes when a material source artifact fingerprint changes", () => {
    const baseIdentities = [
      {
        selectedRunId: "2026-07-11T11-07-38-871Z",
        captureRunDir: RUN1,
        artifacts: [
          {
            path: `${RUN1}/top-of-book.jsonl`,
            role: "top-of-book",
            sizeBytes: 100,
            mtimeMs: 1,
          },
        ],
      },
      {
        selectedRunId: "2026-07-12T10-18-27-409Z",
        captureRunDir: RUN2,
        artifacts: [
          {
            path: `${RUN2}/top-of-book.jsonl`,
            role: "top-of-book",
            sizeBytes: 200,
            mtimeMs: 2,
          },
        ],
      },
    ];
    const changedIdentities = [
      baseIdentities[0]!,
      {
        ...baseIdentities[1]!,
        artifacts: [
          {
            path: `${RUN2}/top-of-book.jsonl`,
            role: "top-of-book",
            sizeBytes: 999,
            mtimeMs: 2,
          },
        ],
      },
    ];
    const base = computeRunSetHash({
      captureRunDirs: [RUN1, RUN2],
      hypothesisId: HYPOTHESIS_ID,
      hypothesisVersion: "v1",
      hypothesisConfigurationHash: HYPOTHESIS_HASH,
      sourceIdentities: baseIdentities,
    });
    const changed = computeRunSetHash({
      captureRunDirs: [RUN1, RUN2],
      hypothesisId: HYPOTHESIS_ID,
      hypothesisVersion: "v1",
      hypothesisConfigurationHash: HYPOTHESIS_HASH,
      sourceIdentities: changedIdentities,
    });
    expect(changed).not.toBe(base);
  });

  it("does not change when only artifactGeneratedAt differs", () => {
    const identities = [
      {
        selectedRunId: "2026-07-11T11-07-38-871Z",
        captureRunDir: RUN1,
        artifacts: [
          {
            path: `${RUN1}/top-of-book.jsonl`,
            role: "top-of-book",
            sizeBytes: 100,
            mtimeMs: 1,
          },
        ],
      },
    ];
    const left = computeRunSetHash({
      captureRunDirs: [RUN1, RUN2],
      hypothesisId: HYPOTHESIS_ID,
      hypothesisVersion: "v1",
      hypothesisConfigurationHash: HYPOTHESIS_HASH,
      sourceIdentities: identities,
    });
    const right = computeRunSetHash({
      captureRunDirs: [RUN1, RUN2],
      hypothesisId: HYPOTHESIS_ID,
      hypothesisVersion: "v1",
      hypothesisConfigurationHash: HYPOTHESIS_HASH,
      sourceIdentities: identities,
    });
    expect(left).toBe(right);
  });
});

describe("parseCalibrationFadeCrossRunValidationArgv path guards", () => {
  it("rejects duplicate normalized paths with different separators", () => {
    expect(() =>
      parseCalibrationFadeCrossRunValidationArgv([
        "--capture-run-dir",
        RUN1,
        "--capture-run-dir",
        RUN1.replaceAll("/", "\\"),
      ]),
    ).toThrow(/Duplicate/);
  });
});

describe("deduplicateCandidateMarkets", () => {
  it("selects earliest causal entry and rejects later better price", () => {
    const result = deduplicateCandidateMarkets({
      appearances: [
        {
          market: marketRecord({
            entryTimestamp: "2026-07-11T19:00:00.000Z",
            noAskCents: 20,
          }),
          selectedRunId: "run-b",
          selectedRunDirectory: RUN2,
          hypothesisConfigurationHash: HYPOTHESIS_HASH,
          targetOutcomeSide: "no",
        },
        {
          market: marketRecord({
            entryTimestamp: "2026-07-11T18:00:00.000Z",
            noAskCents: 43,
          }),
          selectedRunId: "run-a",
          selectedRunDirectory: RUN1,
          hypothesisConfigurationHash: HYPOTHESIS_HASH,
          targetOutcomeSide: "no",
        },
      ],
    });

    expect(result.uniqueCandidateMarketCount).toBe(1);
    expect(result.duplicateCandidateAppearanceCount).toBe(1);
    expect(result.uniqueMarkets[0]!.selectedCanonicalEntry.noAskCents).toBe(43);
    expect(result.uniqueMarkets[0]!.selectedCanonicalEntry.selectedRunId).toBe("run-a");
  });

  it("marks conflicting settlements", () => {
    const result = deduplicateCandidateMarkets({
      appearances: [
        {
          market: marketRecord({ settledOutcome: "yes" }),
          selectedRunId: "run-a",
          selectedRunDirectory: RUN1,
          hypothesisConfigurationHash: HYPOTHESIS_HASH,
          targetOutcomeSide: "no",
        },
        {
          market: marketRecord({ settledOutcome: "no" }),
          selectedRunId: "run-b",
          selectedRunDirectory: RUN2,
          hypothesisConfigurationHash: HYPOTHESIS_HASH,
          targetOutcomeSide: "no",
        },
      ],
    });
    expect(result.conflictingCandidateMarketCount).toBe(1);
    expect(result.uniqueMarkets[0]!.evaluated).toBe(false);
  });
});

describe("analyzeCalibrationFadeCrossRun real-run-shaped fixture", () => {
  it("aggregates two runs including a zero-candidate run", async () => {
    const mutableSingleRunPath = "data/research-results/calibration-fade-forward-validation.json";
    const io = createMemoryCalibrationFadeCrossRunValidationIo(
      {
        [DEFAULT_CALIBRATION_FADE_HYPOTHESIS_CONFIG_PATH]: freezeSpecContent(),
        "data/research-results/hypothesis-candidates.json": hypothesisCandidatesFixture(),
        [mutableSingleRunPath]: JSON.stringify({ shouldNeverBeRead: true }),
        [RUN1]: "",
        [RUN2]: "",
      },
      [RUN1, RUN2],
    );

    const analyzePerRun = vi.fn(async (input: { config: { captureRunDir: string } }) => {
      if (io.fileExists(mutableSingleRunPath)) {
        // Prove mutable single-run output exists but is ignored by aggregation path.
        expect(io.readFile(mutableSingleRunPath)).toContain("shouldNeverBeRead");
      }
      if (input.config.captureRunDir.includes("2026-07-11")) {
        const markets = [marketRecord({})];
        return {
          report: stubReport({
            runId: "2026-07-11T11-07-38-871Z",
            runDir: RUN1,
            recordsScanned: 52_418,
            qualifyingObservationCount: 80,
            candidateEpisodeCount: 2,
            markets,
            captureHealthSource: "native-capture-health",
            captureVerdict: "capture-research-ready",
            runDurationSeconds: 28_800,
          }),
          eventLines: [],
          marketLines: markets.map((market) => JSON.stringify(market)),
        };
      }
      return {
        report: stubReport({
          runId: "2026-07-12T10-18-27-409Z",
          runDir: RUN2,
          recordsScanned: 44_870,
          qualifyingObservationCount: 0,
          candidateEpisodeCount: 0,
          markets: [],
          captureHealthSource: "run-scoped-capture-health-audit",
          captureVerdict: "capture-research-ready",
          runDurationSeconds: 28_655,
        }),
        eventLines: [],
        marketLines: [],
      };
    });

    // Force loaded freeze hash to match stub reports by patching analyze path expectations:
    // loadFrozenHypothesisSpec computes hash from content; stub reports use HYPOTHESIS_HASH.
    // Align stub hash to whatever loadFrozenHypothesisSpec produces.
    const { loadFrozenHypothesisSpec } = await import(
      "@/lib/data/research/calibrationFadeForwardValidation"
    );
    const loaded = loadFrozenHypothesisSpec({
      io,
      hypothesisConfigPath: DEFAULT_CALIBRATION_FADE_HYPOTHESIS_CONFIG_PATH,
    });
    const actualHash = loaded.spec.configurationHash;

    analyzePerRun.mockImplementation(async (input: { config: { captureRunDir: string } }) => {
      if (input.config.captureRunDir.includes("2026-07-11")) {
        const markets = [marketRecord({})];
        return {
          report: stubReport({
            runId: "2026-07-11T11-07-38-871Z",
            runDir: RUN1,
            recordsScanned: 52_418,
            qualifyingObservationCount: 80,
            candidateEpisodeCount: 2,
            markets,
            captureHealthSource: "native-capture-health",
            captureVerdict: "capture-research-ready",
            runDurationSeconds: 28_800,
            hypothesisConfigurationHash: actualHash,
          }),
          eventLines: [],
          marketLines: markets.map((market) => JSON.stringify(market)),
        };
      }
      return {
        report: stubReport({
          runId: "2026-07-12T10-18-27-409Z",
          runDir: RUN2,
          recordsScanned: 44_870,
          qualifyingObservationCount: 0,
          candidateEpisodeCount: 0,
          markets: [],
          captureHealthSource: "run-scoped-capture-health-audit",
          captureVerdict: "capture-research-ready",
          runDurationSeconds: 28_655,
          hypothesisConfigurationHash: actualHash,
        }),
        eventLines: [],
        marketLines: [],
      };
    });

    const { report } = await analyzeCalibrationFadeCrossRun({
      generatedAt: "2026-07-19T12:00:00.000Z",
      outputPath: "data/research-results/calibration-fade-cross-run-validation.json",
      htmlOutputPath: "data/reports/calibration-fade-cross-run-validation.html",
      config: baseConfig([RUN1, RUN2]),
      io,
      analyzePerRun: analyzePerRun as never,
    });

    expect(analyzePerRun).toHaveBeenCalledTimes(2);
    expect(report.selectedRunCount).toBe(2);
    expect(report.researchReadyRunCount).toBe(2);
    expect(report.totalRecordsScanned).toBe(97_288);
    expect(report.totalCaptureDurationSeconds).toBe(57_455);
    expect(report.totalQualifyingObservationCount).toBe(80);
    expect(report.totalCandidateEpisodeCount).toBe(2);
    expect(report.rawCandidateMarketAppearanceCount).toBe(1);
    expect(report.uniqueCandidateMarketCount).toBe(1);
    expect(report.executableEntryAvailableCount).toBe(1);
    expect(report.settlementJoinedCount).toBe(1);
    expect(report.evaluatedExecutableCandidateCount).toBe(1);
    expect(report.executable.grossReturnCents).toBe(-43);
    expect(report.executable.feeAdjustedReturnCents).toBe(-44);
    expect(report.executable.winRate).toBe(0);
    expect(report.classification).toBe("insufficient-forward-events");
    expect(report.interpretationClassification).toBe("insufficient-forward-events");
    expect(report.recommendedNextAction).toBe("collect-additional-clean-forward-captures");
    expect(report.settlementCoverageShare).toBe(1);
    expect(report.runSetHash.length).toBeGreaterThan(0);
    expect(report.perRunSummaries.some((run) => run.selectedRunId.includes("2026-07-12"))).toBe(
      true,
    );
    expect(report.recommendedBackfillRunIds).toEqual([]);
    expect(report.leaveOneRunOut.applicable).toBe(false);
  });

  it("counts overlapping markets once and attributes return to earliest run", async () => {
    const io = createMemoryCalibrationFadeCrossRunValidationIo(
      {
        [DEFAULT_CALIBRATION_FADE_HYPOTHESIS_CONFIG_PATH]: freezeSpecContent(),
        "data/research-results/hypothesis-candidates.json": hypothesisCandidatesFixture(),
        [`${RUN1}/top-of-book.jsonl`]: "{}",
        [`${RUN2}/top-of-book.jsonl`]: "{}",
      },
      [RUN1, RUN2],
    );
    const { loadFrozenHypothesisSpec } = await import(
      "@/lib/data/research/calibrationFadeForwardValidation"
    );
    const actualHash = loadFrozenHypothesisSpec({
      io,
      hypothesisConfigPath: DEFAULT_CALIBRATION_FADE_HYPOTHESIS_CONFIG_PATH,
    }).spec.configurationHash;

    const analyzePerRun = vi.fn(async (input: { config: { captureRunDir: string } }) => {
      const runId = input.config.captureRunDir.split("/").pop()!;
      const markets = [
        marketRecord({
          entryTimestamp:
            runId.includes("2026-07-11")
              ? "2026-07-11T18:00:00.000Z"
              : "2026-07-12T18:00:00.000Z",
          noAskCents: runId.includes("2026-07-11") ? 43 : 20,
          grossReturnCents: runId.includes("2026-07-11") ? -43 : -20,
          feeAdjustedReturnCents: runId.includes("2026-07-11") ? -44 : -21,
        }),
      ];
      return {
        report: stubReport({
          runId,
          runDir: input.config.captureRunDir,
          recordsScanned: 1000,
          qualifyingObservationCount: 1,
          candidateEpisodeCount: 1,
          markets,
          captureHealthSource: "native-capture-health",
          captureVerdict: "capture-research-ready",
          runDurationSeconds: 1000,
          hypothesisConfigurationHash: actualHash,
        }),
        eventLines: [],
        marketLines: markets.map((market) => JSON.stringify(market)),
      };
    });

    const { report } = await analyzeCalibrationFadeCrossRun({
      generatedAt: "2026-07-19T12:00:00.000Z",
      outputPath: "out.json",
      htmlOutputPath: "out.html",
      config: baseConfig([RUN1, RUN2]),
      io,
      analyzePerRun: analyzePerRun as never,
    });

    expect(report.rawCandidateMarketAppearanceCount).toBe(2);
    expect(report.duplicateCandidateAppearanceCount).toBe(1);
    expect(report.uniqueCandidateMarketCount).toBe(1);
    expect(report.executable.grossReturnCents).toBe(-43);
    expect(report.executable.feeAdjustedReturnCents).toBe(-44);
    const run1 = report.perRunSummaries.find((run) => run.selectedRunId.includes("2026-07-11"));
    const run2 = report.perRunSummaries.find((run) => run.selectedRunId.includes("2026-07-12"));
    expect(run1?.feeAdjustedReturnCents).toBe(-44);
    expect(run2?.feeAdjustedReturnCents).toBeNull();
    expect(run2?.uniqueCandidateMarketsIntroduced).toBe(0);
  });

  it("fails closed on hypothesis hash mismatch", async () => {
    const io = createMemoryCalibrationFadeCrossRunValidationIo(
      {
        [DEFAULT_CALIBRATION_FADE_HYPOTHESIS_CONFIG_PATH]: freezeSpecContent(),
        "data/research-results/hypothesis-candidates.json": hypothesisCandidatesFixture(),
      },
      [RUN1, RUN2],
    );

    const analyzePerRun = vi.fn(async (input: { config: { captureRunDir: string } }) => {
      const markets = input.config.captureRunDir.includes("2026-07-11")
        ? [marketRecord({})]
        : [];
      return {
        report: stubReport({
          runId: input.config.captureRunDir.split("/").pop()!,
          runDir: input.config.captureRunDir,
          recordsScanned: 100,
          qualifyingObservationCount: markets.length,
          candidateEpisodeCount: markets.length,
          markets,
          captureHealthSource: "native-capture-health",
          captureVerdict: "capture-research-ready",
          runDurationSeconds: 1000,
          hypothesisConfigurationHash: "deadbeef",
        }),
        eventLines: [],
        marketLines: markets.map((market) => JSON.stringify(market)),
      };
    });

    const { report } = await analyzeCalibrationFadeCrossRun({
      generatedAt: "2026-07-19T12:00:00.000Z",
      outputPath: "out.json",
      htmlOutputPath: "out.html",
      config: baseConfig([RUN1, RUN2]),
      io,
      analyzePerRun: analyzePerRun as never,
    });

    expect(report.classification).toBe("run-set-incompatible");
    expect(report.recommendedNextAction).toBe("repair-run-set-hypothesis-identity");
  });

  it("rejects the July 20 gappy run set instead of asking for more data", async () => {
    const io = createMemoryCalibrationFadeCrossRunValidationIo(
      {
        [DEFAULT_CALIBRATION_FADE_HYPOTHESIS_CONFIG_PATH]: freezeSpecContent(),
        "data/research-results/hypothesis-candidates.json": hypothesisCandidatesFixture(),
      },
      [RUN1, RUN2],
    );
    const { loadFrozenHypothesisSpec } = await import(
      "@/lib/data/research/calibrationFadeForwardValidation"
    );
    const actualHash = loadFrozenHypothesisSpec({
      io,
      hypothesisConfigPath: DEFAULT_CALIBRATION_FADE_HYPOTHESIS_CONFIG_PATH,
    }).spec.configurationHash;

    const analyzePerRun = vi.fn(async (input: { config: { captureRunDir: string } }) => {
      if (input.config.captureRunDir.includes("2026-07-11")) {
        // July 20 regression shape: gappy audit verdict with zero candidates.
        return {
          report: stubReport({
            runId: "2026-07-11T11-07-38-871Z",
            runDir: RUN1,
            recordsScanned: 45_055,
            qualifyingObservationCount: 0,
            candidateEpisodeCount: 0,
            markets: [],
            captureHealthSource: "run-scoped-capture-health-audit",
            captureVerdict: "capture-gappy",
            runDurationSeconds: 28_800,
            validBookShare: 0.8276,
            sequenceGapCount: 3_404_777,
            hypothesisConfigurationHash: actualHash,
          }),
          eventLines: [],
          marketLines: [],
        };
      }
      return {
        report: stubReport({
          runId: "2026-07-12T10-18-27-409Z",
          runDir: RUN2,
          recordsScanned: 44_870,
          qualifyingObservationCount: 0,
          candidateEpisodeCount: 0,
          markets: [],
          captureHealthSource: "run-scoped-capture-health-audit",
          captureVerdict: "capture-research-ready",
          runDurationSeconds: 28_655,
          hypothesisConfigurationHash: actualHash,
        }),
        eventLines: [],
        marketLines: [],
      };
    });

    const { report } = await analyzeCalibrationFadeCrossRun({
      generatedAt: "2026-07-20T12:00:00.000Z",
      outputPath: "out.json",
      htmlOutputPath: "out.html",
      config: baseConfig([RUN1, RUN2]),
      io,
      analyzePerRun: analyzePerRun as never,
    });

    expect(report.researchReadyRunCount).toBe(1);
    expect(report.classification).toBe("observation-quality-inconclusive");
    expect(report.recommendedNextAction).toBe("repair-or-replace-invalid-forward-runs");
    expect(report.classification).not.toBe("insufficient-forward-events");
    expect(report.invalidSelectedRuns).toEqual([
      {
        selectedRunId: "2026-07-11T11-07-38-871Z",
        failedHealthReason:
          "Capture health verdict is capture-gappy; capture-research-ready is required.",
        contributedCandidates: false,
        excludedFromOutcomeEvaluation: true,
      },
    ]);
  });

  it("fails closed on malformed candidate market rows with run and line attribution", async () => {
    const io = createMemoryCalibrationFadeCrossRunValidationIo(
      {
        [DEFAULT_CALIBRATION_FADE_HYPOTHESIS_CONFIG_PATH]: freezeSpecContent(),
        "data/research-results/hypothesis-candidates.json": hypothesisCandidatesFixture(),
      },
      [RUN1, RUN2],
    );
    const { loadFrozenHypothesisSpec } = await import(
      "@/lib/data/research/calibrationFadeForwardValidation"
    );
    const actualHash = loadFrozenHypothesisSpec({
      io,
      hypothesisConfigPath: DEFAULT_CALIBRATION_FADE_HYPOTHESIS_CONFIG_PATH,
    }).spec.configurationHash;

    const analyzePerRun = vi.fn(async (input: { config: { captureRunDir: string } }) => {
      const isRun1 = input.config.captureRunDir.includes("2026-07-11");
      const markets = isRun1 ? [marketRecord({})] : [];
      return {
        report: stubReport({
          runId: isRun1 ? "2026-07-11T11-07-38-871Z" : "2026-07-12T10-18-27-409Z",
          runDir: input.config.captureRunDir,
          recordsScanned: 1000,
          qualifyingObservationCount: markets.length,
          candidateEpisodeCount: markets.length,
          markets,
          captureHealthSource: "run-scoped-capture-health-audit",
          captureVerdict: "capture-research-ready",
          runDurationSeconds: 1000,
          hypothesisConfigurationHash: actualHash,
        }),
        eventLines: [],
        marketLines: isRun1
          ? [JSON.stringify(marketRecord({})), "{ this is not json"]
          : [],
      };
    });

    const { report } = await analyzeCalibrationFadeCrossRun({
      generatedAt: "2026-07-20T12:00:00.000Z",
      outputPath: "out.json",
      htmlOutputPath: "out.html",
      config: baseConfig([RUN1, RUN2]),
      io,
      analyzePerRun: analyzePerRun as never,
    });

    expect(report.candidateParsingErrorCount).toBe(1);
    expect(report.classification).toBe("observation-quality-inconclusive");
    expect(report.recommendedNextAction).toBe("repair-or-replace-invalid-forward-runs");
    expect(
      report.warnings.some(
        (warning) =>
          warning.includes("[2026-07-11T11-07-38-871Z]")
          && warning.includes("malformed candidate market rows")
          && warning.includes("2")
          && !warning.includes("this is not json"),
      ),
    ).toBe(true);
    const run1 = report.perRunSummaries.find((run) => run.selectedRunId.includes("2026-07-11"));
    expect(run1?.candidateParsingErrorCount).toBe(1);
  });

  it("ignores blank candidate JSONL rows without failing closed", async () => {
    const io = createMemoryCalibrationFadeCrossRunValidationIo(
      {
        [DEFAULT_CALIBRATION_FADE_HYPOTHESIS_CONFIG_PATH]: freezeSpecContent(),
        "data/research-results/hypothesis-candidates.json": hypothesisCandidatesFixture(),
      },
      [RUN1, RUN2],
    );
    const { loadFrozenHypothesisSpec } = await import(
      "@/lib/data/research/calibrationFadeForwardValidation"
    );
    const actualHash = loadFrozenHypothesisSpec({
      io,
      hypothesisConfigPath: DEFAULT_CALIBRATION_FADE_HYPOTHESIS_CONFIG_PATH,
    }).spec.configurationHash;

    const analyzePerRun = vi.fn(async (input: { config: { captureRunDir: string } }) => {
      const isRun1 = input.config.captureRunDir.includes("2026-07-11");
      const markets = isRun1 ? [marketRecord({})] : [];
      return {
        report: stubReport({
          runId: isRun1 ? "2026-07-11T11-07-38-871Z" : "2026-07-12T10-18-27-409Z",
          runDir: input.config.captureRunDir,
          recordsScanned: 1000,
          qualifyingObservationCount: markets.length,
          candidateEpisodeCount: markets.length,
          markets,
          captureHealthSource: "run-scoped-capture-health-audit",
          captureVerdict: "capture-research-ready",
          runDurationSeconds: 1000,
          hypothesisConfigurationHash: actualHash,
        }),
        eventLines: [],
        marketLines: isRun1 ? ["", "   ", JSON.stringify(marketRecord({}))] : [],
      };
    });

    const { report } = await analyzeCalibrationFadeCrossRun({
      generatedAt: "2026-07-20T12:00:00.000Z",
      outputPath: "out.json",
      htmlOutputPath: "out.html",
      config: baseConfig([RUN1, RUN2]),
      io,
      analyzePerRun: analyzePerRun as never,
    });

    expect(report.candidateParsingErrorCount).toBe(0);
    expect(report.rawCandidateMarketAppearanceCount).toBe(1);
    expect(report.classification).toBe("insufficient-forward-events");
  });

  it("preserves invalid selected runs in the ledger instead of silently subsetting", async () => {
    const io = createMemoryCalibrationFadeCrossRunValidationIo(
      {
        [DEFAULT_CALIBRATION_FADE_HYPOTHESIS_CONFIG_PATH]: freezeSpecContent(),
        "data/research-results/hypothesis-candidates.json": hypothesisCandidatesFixture(),
      },
      [RUN1, RUN2],
    );
    const { loadFrozenHypothesisSpec } = await import(
      "@/lib/data/research/calibrationFadeForwardValidation"
    );
    const actualHash = loadFrozenHypothesisSpec({
      io,
      hypothesisConfigPath: DEFAULT_CALIBRATION_FADE_HYPOTHESIS_CONFIG_PATH,
    }).spec.configurationHash;

    const analyzePerRun = vi.fn(async (input: { config: { captureRunDir: string } }) => {
      if (input.config.captureRunDir.includes("2026-07-12")) {
        throw new CalibrationFadeForwardValidationError(
          "Run-scoped capture-health-audit verdict is capture-gappy; capture-research-ready required.",
        );
      }
      const markets = [marketRecord({})];
      return {
        report: stubReport({
          runId: "2026-07-11T11-07-38-871Z",
          runDir: RUN1,
          recordsScanned: 1000,
          qualifyingObservationCount: 1,
          candidateEpisodeCount: 1,
          markets,
          captureHealthSource: "run-scoped-capture-health-audit",
          captureVerdict: "capture-research-ready",
          runDurationSeconds: 1000,
          hypothesisConfigurationHash: actualHash,
        }),
        eventLines: [],
        marketLines: markets.map((market) => JSON.stringify(market)),
      };
    });

    const { report } = await analyzeCalibrationFadeCrossRun({
      generatedAt: "2026-07-20T12:00:00.000Z",
      outputPath: "out.json",
      htmlOutputPath: "out.html",
      config: baseConfig([RUN1, RUN2]),
      io,
      analyzePerRun: analyzePerRun as never,
    });

    expect(report.selectedRunCount).toBe(2);
    const failedRun = report.perRunSummaries.find((run) =>
      run.selectedRunId.includes("2026-07-12"),
    );
    expect(failedRun).toBeDefined();
    expect(failedRun?.researchReady).toBe(false);
    expect(failedRun?.failedHealthReason).toContain("capture-gappy");
    expect(failedRun?.contributedCandidates).toBe(false);
    expect(failedRun?.excludedFromOutcomeEvaluation).toBe(true);
    expect(report.invalidSelectedRuns.map((run) => run.selectedRunId)).toEqual([
      "2026-07-12T10-18-27-409Z",
    ]);
    expect(report.classification).toBe("observation-quality-inconclusive");
    expect(report.recommendedNextAction).toBe("repair-or-replace-invalid-forward-runs");
    expect(
      report.runFunnel.find((stage) => stage.stageId === "successfully-analyzed-runs")?.count,
    ).toBe(1);
    expect(
      report.runFunnel.find((stage) => stage.stageId === "selected-runs")?.count,
    ).toBe(2);
  });

  it("keeps failed selected runs in their original operator position", async () => {
    const io = createMemoryCalibrationFadeCrossRunValidationIo(
      {
        [DEFAULT_CALIBRATION_FADE_HYPOTHESIS_CONFIG_PATH]: freezeSpecContent(),
        "data/research-results/hypothesis-candidates.json": hypothesisCandidatesFixture(),
      },
      [RUN1, RUN2, RUN3],
    );
    const { loadFrozenHypothesisSpec } = await import(
      "@/lib/data/research/calibrationFadeForwardValidation"
    );
    const actualHash = loadFrozenHypothesisSpec({
      io,
      hypothesisConfigPath: DEFAULT_CALIBRATION_FADE_HYPOTHESIS_CONFIG_PATH,
    }).spec.configurationHash;

    // The FIRST operator-selected run fails health validation.
    const analyzePerRun = vi.fn(async (input: { config: { captureRunDir: string } }) => {
      if (input.config.captureRunDir.includes("2026-07-11")) {
        throw new CalibrationFadeForwardValidationError(
          "Run-scoped capture-health-audit verdict is capture-gappy; capture-research-ready required.",
        );
      }
      const runId = input.config.captureRunDir.split("/").pop()!;
      return {
        report: stubReport({
          runId,
          runDir: input.config.captureRunDir,
          recordsScanned: 1000,
          qualifyingObservationCount: 0,
          candidateEpisodeCount: 0,
          markets: [],
          captureHealthSource: "run-scoped-capture-health-audit",
          captureVerdict: "capture-research-ready",
          runDurationSeconds: 1000,
          hypothesisConfigurationHash: actualHash,
        }),
        eventLines: [],
        marketLines: [],
      };
    });

    const { report } = await analyzeCalibrationFadeCrossRun({
      generatedAt: "2026-07-20T12:00:00.000Z",
      outputPath: "out.json",
      htmlOutputPath: "out.html",
      config: baseConfig([RUN1, RUN2, RUN3]),
      io,
      analyzePerRun: analyzePerRun as never,
    });

    expect(report.selectedRunCount).toBe(3);
    expect(report.perRunSummaries.map((run) => run.selectedRunId)).toEqual([
      "2026-07-11T11-07-38-871Z",
      "2026-07-12T10-18-27-409Z",
      "2026-07-13T00-00-00-000Z",
    ]);
    expect(report.perRunSummaries[0]?.researchReady).toBe(false);
    expect(report.perRunSummaries[0]?.failedHealthReason).toContain("capture-gappy");
  });

  it("fails closed on a syntactically valid candidate row with an invalid shape", async () => {
    const io = createMemoryCalibrationFadeCrossRunValidationIo(
      {
        [DEFAULT_CALIBRATION_FADE_HYPOTHESIS_CONFIG_PATH]: freezeSpecContent(),
        "data/research-results/hypothesis-candidates.json": hypothesisCandidatesFixture(),
      },
      [RUN1, RUN2],
    );
    const { loadFrozenHypothesisSpec } = await import(
      "@/lib/data/research/calibrationFadeForwardValidation"
    );
    const actualHash = loadFrozenHypothesisSpec({
      io,
      hypothesisConfigPath: DEFAULT_CALIBRATION_FADE_HYPOTHESIS_CONFIG_PATH,
    }).spec.configurationHash;

    const analyzePerRun = vi.fn(async (input: { config: { captureRunDir: string } }) => {
      const isRun1 = input.config.captureRunDir.includes("2026-07-11");
      const markets = isRun1 ? [marketRecord({})] : [];
      return {
        report: stubReport({
          runId: isRun1 ? "2026-07-11T11-07-38-871Z" : "2026-07-12T10-18-27-409Z",
          runDir: input.config.captureRunDir,
          recordsScanned: 1000,
          qualifyingObservationCount: markets.length,
          candidateEpisodeCount: markets.length,
          markets,
          captureHealthSource: "run-scoped-capture-health-audit",
          captureVerdict: "capture-research-ready",
          runDurationSeconds: 1000,
          hypothesisConfigurationHash: actualHash,
        }),
        eventLines: [],
        marketLines: isRun1
          ? [
              JSON.stringify(marketRecord({})),
              "{}",
              JSON.stringify({ marketTicker: "X", entryTimestamp: "not-a-date" }),
            ]
          : [],
      };
    });

    const { report } = await analyzeCalibrationFadeCrossRun({
      generatedAt: "2026-07-20T12:00:00.000Z",
      outputPath: "out.json",
      htmlOutputPath: "out.html",
      config: baseConfig([RUN1, RUN2]),
      io,
      analyzePerRun: analyzePerRun as never,
    });

    expect(report.candidateParsingErrorCount).toBe(2);
    expect(report.classification).toBe("observation-quality-inconclusive");
    expect(report.recommendedNextAction).toBe("repair-or-replace-invalid-forward-runs");
    const run1 = report.perRunSummaries.find((run) => run.selectedRunId.includes("2026-07-11"));
    expect(run1?.candidateParsingErrorCount).toBe(2);
    // Line attribution without payload dumping.
    expect(
      report.warnings.some(
        (warning) =>
          warning.includes("[2026-07-11T11-07-38-871Z]")
          && warning.includes("lines 2, 3")
          && !warning.includes("not-a-date"),
      ),
    ).toBe(true);
    // The valid row still contributes; the run remains in the ledger.
    expect(report.rawCandidateMarketAppearanceCount).toBe(1);
    expect(report.selectedRunCount).toBe(2);
  });

  it("blocks formal use when a ready verdict lacks verified provenance", async () => {
    const io = createMemoryCalibrationFadeCrossRunValidationIo(
      {
        [DEFAULT_CALIBRATION_FADE_HYPOTHESIS_CONFIG_PATH]: freezeSpecContent(),
        "data/research-results/hypothesis-candidates.json": hypothesisCandidatesFixture(),
      },
      [RUN1, RUN2],
    );
    const { loadFrozenHypothesisSpec } = await import(
      "@/lib/data/research/calibrationFadeForwardValidation"
    );
    const actualHash = loadFrozenHypothesisSpec({
      io,
      hypothesisConfigPath: DEFAULT_CALIBRATION_FADE_HYPOTHESIS_CONFIG_PATH,
    }).spec.configurationHash;

    const analyzePerRun = vi.fn(async (input: { config: { captureRunDir: string } }) => {
      const isRun1 = input.config.captureRunDir.includes("2026-07-11");
      return {
        report: stubReport({
          runId: isRun1 ? "2026-07-11T11-07-38-871Z" : "2026-07-12T10-18-27-409Z",
          runDir: input.config.captureRunDir,
          recordsScanned: 1000,
          qualifyingObservationCount: 0,
          candidateEpisodeCount: 0,
          markets: [],
          captureHealthSource: "run-scoped-capture-health-audit",
          captureVerdict: "capture-research-ready",
          // Ready verdict whose audit freshness could not be verified.
          researchReadyVerified: !isRun1,
          runDurationSeconds: 1000,
          hypothesisConfigurationHash: actualHash,
        }),
        eventLines: [],
        marketLines: [],
      };
    });

    const { report } = await analyzeCalibrationFadeCrossRun({
      generatedAt: "2026-07-20T12:00:00.000Z",
      outputPath: "out.json",
      htmlOutputPath: "out.html",
      config: baseConfig([RUN1, RUN2]),
      io,
      analyzePerRun: analyzePerRun as never,
    });

    expect(report.researchReadyRunCount).toBe(1);
    expect(report.classification).toBe("observation-quality-inconclusive");
    expect(report.recommendedNextAction).toBe("repair-or-replace-invalid-forward-runs");
    const run1 = report.perRunSummaries.find((run) => run.selectedRunId.includes("2026-07-11"));
    expect(run1?.researchReady).toBe(false);
    expect(run1?.failedHealthReason).toContain("provenance or freshness");
  });
});

function crossRunSpec(minimumMarkets = 5) {
  return {
    ...(JSON.parse(freezeSpecContent()) as object),
    configurationHash: "x",
    calibrationDirection: "over",
    minimumEvidenceRequirements: {
      minimumIndependentCandidateMarkets: minimumMarkets,
      minimumSettlementCoverageShare: 0.8,
      minimumValidBookShare: 0.9,
      minimumBtcJoinCoverageShare: 0.9,
      materialRejectionCalibrationGap: 0.05,
      materialSupportCalibrationGap: 0.03,
      materialExecutableNetReturnCents: 1,
    },
  } as never;
}

function runSummary(
  overrides: Partial<import("./calibrationFadeCrossRunValidationTypes").CrossRunRunSummary> = {},
): import("./calibrationFadeCrossRunValidationTypes").CrossRunRunSummary {
  return {
    selectedRunId: "a",
    selectedRunDirectory: RUN1,
    captureHealthSource: "run-scoped-capture-health-audit",
    captureVerdict: "capture-research-ready",
    researchReadyVerified: true,
    researchReady: true,
    failedHealthReason: null,
    contributedCandidates: false,
    excludedFromOutcomeEvaluation: false,
    candidateParsingErrorCount: 0,
    runDurationSeconds: 100,
    recordsScanned: 10,
    btcRecordsScanned: 1,
    qualifyingObservationCount: 0,
    candidateEpisodeCount: 0,
    rawCandidateMarketAppearanceCount: 0,
    uniqueCandidateMarketsIntroduced: 0,
    duplicateCandidateAppearanceCount: 0,
    executableEntryAvailableCount: 0,
    settlementJoinedCount: 0,
    evaluatedExecutableCandidateCount: 0,
    grossReturnCents: null,
    feeAdjustedReturnCents: null,
    interpretationClassification: "insufficient-forward-events",
    recommendedNextAction: "collect-additional-clean-forward-captures",
    warnings: [],
    hypothesisConfigurationHash: "x",
    ...overrides,
  };
}

function crossRunCoverage(count = 1) {
  return {
    candidateMarketCount: count,
    settledCandidateMarketCount: count,
    joinedCandidateMarketCount: count,
    unresolvedCandidateMarketCount: 0,
    settlementCoverageShare: 1,
    excludedByReason: {},
  };
}

function crossRunCalibration(
  overrides: Partial<Parameters<typeof classifyCalibrationFadeCrossRun>[0]["calibration"]> = {},
) {
  return {
    qualifyingObservationCount: 0,
    candidateEpisodeCount: 0,
    candidateMarketCount: 1,
    meanImpliedYesProbability: null,
    meanTargetSideProbability: null,
    observedYesSettlementRate: null,
    observedTargetSideSettlementRate: null,
    calibrationGap: null,
    signedCalibrationGap: null,
    brierScore: null,
    logLoss: null,
    marketLevelSignedCalibrationGap: null,
    descriptiveObservationSignedGap: null,
    ...overrides,
  };
}

function crossRunExecutable(
  overrides: Partial<Parameters<typeof classifyCalibrationFadeCrossRun>[0]["executable"]> = {},
) {
  return {
    executableCandidateCount: 0,
    evaluatedExecutableCandidateCount: 0,
    executableEntryAvailableCount: 0,
    unavailableExecutablePriceCount: 0,
    grossReturnCents: null,
    feeAdjustedReturnCents: null,
    winRate: null,
    averageEntryPriceCents: null,
    medianEntryPriceCents: null,
    maximumDrawdownCents: null,
    cumulativeReturnCents: null,
    ...overrides,
  };
}

describe("classifyCalibrationFadeCrossRun", () => {
  it("maps insufficient markets to collect-additional-clean-forward-captures", () => {
    const result = classifyCalibrationFadeCrossRun({
      spec: crossRunSpec(5),
      provenanceAvailable: true,
      runSetIncompatible: false,
      perRunSummaries: [
        runSummary({ selectedRunId: "a", captureHealthSource: "native-capture-health" }),
        runSummary({ selectedRunId: "b", selectedRunDirectory: RUN2 }),
      ],
      uniqueCandidateMarketCount: 1,
      settlementCoverage: crossRunCoverage(1),
      calibration: crossRunCalibration(),
      executable: crossRunExecutable(),
    });
    expect(result.classification).toBe("insufficient-forward-events");
  });

  it("precedes outcome rejection with observation-quality when a selected run is degraded", () => {
    const result = classifyCalibrationFadeCrossRun({
      spec: crossRunSpec(1),
      provenanceAvailable: true,
      runSetIncompatible: false,
      perRunSummaries: [
        runSummary({
          selectedRunId: "a",
          captureHealthSource: "native-capture-health",
          captureVerdict: "capture-degraded",
          researchReady: false,
          failedHealthReason: "Capture health verdict is capture-degraded; capture-research-ready is required.",
          excludedFromOutcomeEvaluation: true,
          interpretationClassification: "observation-quality-inconclusive",
          recommendedNextAction: "repair-or-replace-invalid-forward-runs",
        }),
        runSummary({ selectedRunId: "b", selectedRunDirectory: RUN2 }),
      ],
      uniqueCandidateMarketCount: 10,
      settlementCoverage: crossRunCoverage(10),
      calibration: crossRunCalibration({
        candidateMarketCount: 10,
        meanImpliedYesProbability: 0.9,
        meanTargetSideProbability: 0.1,
        observedYesSettlementRate: 0.2,
        observedTargetSideSettlementRate: 0.8,
        calibrationGap: 0.7,
        signedCalibrationGap: 0.7,
        marketLevelSignedCalibrationGap: -0.2,
      }),
      executable: crossRunExecutable({
        executableCandidateCount: 10,
        evaluatedExecutableCandidateCount: 10,
        executableEntryAvailableCount: 10,
        grossReturnCents: -100,
        feeAdjustedReturnCents: -110,
        winRate: 0,
        averageEntryPriceCents: 40,
        medianEntryPriceCents: 40,
        maximumDrawdownCents: 110,
        cumulativeReturnCents: -110,
      }),
    });
    expect(result.classification).toBe("observation-quality-inconclusive");
    expect(result.recommendedNextAction).toBe("repair-or-replace-invalid-forward-runs");
  });

  it("does not treat an unverified capture-research-ready verdict as research-ready", () => {
    const result = classifyCalibrationFadeCrossRun({
      spec: crossRunSpec(1),
      provenanceAvailable: true,
      runSetIncompatible: false,
      perRunSummaries: [
        runSummary({
          selectedRunId: "a",
          captureVerdict: "capture-research-ready",
          researchReadyVerified: false,
          researchReady: false,
        }),
      ],
      uniqueCandidateMarketCount: 10,
      settlementCoverage: crossRunCoverage(10),
      calibration: crossRunCalibration({ candidateMarketCount: 10 }),
      executable: crossRunExecutable(),
    });
    expect(result.classification).toBe("observation-quality-inconclusive");
    expect(result.recommendedNextAction).toBe("repair-or-replace-invalid-forward-runs");
    expect(result.rationale).toContain("provenance or freshness");
  });

  it("does not treat a null native verdict as research-ready", () => {
    const result = classifyCalibrationFadeCrossRun({
      spec: crossRunSpec(5),
      provenanceAvailable: true,
      runSetIncompatible: false,
      perRunSummaries: [
        runSummary({
          selectedRunId: "2026-07-11T11-07-38-871Z",
          captureHealthSource: "native-capture-health",
          captureVerdict: null,
          researchReady: false,
          failedHealthReason:
            "No verified capture-research-ready health source; native capture health alone is unverified.",
          runDurationSeconds: 28_800,
          recordsScanned: 52_418,
        }),
        runSummary({
          selectedRunId: "2026-07-12T10-18-27-409Z",
          selectedRunDirectory: RUN2,
          runDurationSeconds: 28_655,
          recordsScanned: 44_870,
        }),
      ],
      uniqueCandidateMarketCount: 1,
      settlementCoverage: crossRunCoverage(1),
      calibration: crossRunCalibration(),
      executable: crossRunExecutable({
        executableCandidateCount: 1,
        evaluatedExecutableCandidateCount: 1,
        executableEntryAvailableCount: 1,
        grossReturnCents: -43,
        feeAdjustedReturnCents: -44,
        winRate: 0,
        averageEntryPriceCents: 43,
        medianEntryPriceCents: 43,
        maximumDrawdownCents: 44,
        cumulativeReturnCents: -44,
      }),
    });
    expect(result.classification).toBe("observation-quality-inconclusive");
    expect(result.recommendedNextAction).toBe("repair-or-replace-invalid-forward-runs");
  });

  it("classifies the July 20 zero-candidate gappy run set as observation-quality-inconclusive", () => {
    const result = classifyCalibrationFadeCrossRun({
      spec: crossRunSpec(5),
      provenanceAvailable: true,
      runSetIncompatible: false,
      perRunSummaries: [
        runSummary({
          selectedRunId: "2026-07-20T00-00-00-000Z",
          captureHealthSource: "run-scoped-capture-health-audit",
          captureVerdict: "capture-gappy",
          researchReady: false,
          failedHealthReason:
            "Capture health verdict is capture-gappy; capture-research-ready is required.",
          excludedFromOutcomeEvaluation: true,
          runDurationSeconds: 28_800,
          recordsScanned: 45_055,
          btcRecordsScanned: 5_755,
        }),
      ],
      uniqueCandidateMarketCount: 0,
      settlementCoverage: crossRunCoverage(0),
      calibration: crossRunCalibration({ candidateMarketCount: 0 }),
      executable: crossRunExecutable(),
    });
    expect(result.classification).toBe("observation-quality-inconclusive");
    expect(result.recommendedNextAction).toBe("repair-or-replace-invalid-forward-runs");
    expect(result.rationale).toContain("capture-gappy");
  });

  it("fails closed on malformed candidate rows before support/reject classification", () => {
    const result = classifyCalibrationFadeCrossRun({
      spec: crossRunSpec(1),
      provenanceAvailable: true,
      runSetIncompatible: false,
      candidateParsingErrorCount: 2,
      perRunSummaries: [runSummary({ candidateParsingErrorCount: 2 })],
      uniqueCandidateMarketCount: 10,
      settlementCoverage: crossRunCoverage(10),
      calibration: crossRunCalibration({
        candidateMarketCount: 10,
        marketLevelSignedCalibrationGap: 0.05,
      }),
      executable: crossRunExecutable({
        evaluatedExecutableCandidateCount: 10,
        feeAdjustedReturnCents: 20,
      }),
    });
    expect(result.classification).toBe("observation-quality-inconclusive");
    expect(result.recommendedNextAction).toBe("repair-or-replace-invalid-forward-runs");
    expect(result.rationale).toContain("malformed candidate market rows");
  });

  it("reaches calibration-only support when executable evidence is unavailable", () => {
    const result = classifyCalibrationFadeCrossRun({
      spec: crossRunSpec(1),
      provenanceAvailable: true,
      runSetIncompatible: false,
      perRunSummaries: [runSummary({})],
      uniqueCandidateMarketCount: 5,
      settlementCoverage: crossRunCoverage(5),
      calibration: crossRunCalibration({
        candidateMarketCount: 5,
        marketLevelSignedCalibrationGap: 0.05,
      }),
      executable: crossRunExecutable({
        evaluatedExecutableCandidateCount: 0,
        feeAdjustedReturnCents: null,
      }),
    });
    expect(result.classification).toBe("cross-run-supports-calibration-effect");
    expect(result.recommendedNextAction).toBe(
      "build-executable-calibration-fade-candidate-dataset",
    );
  });

  it("contradicts executability only on evaluated negative executable evidence", () => {
    const result = classifyCalibrationFadeCrossRun({
      spec: crossRunSpec(1),
      provenanceAvailable: true,
      runSetIncompatible: false,
      perRunSummaries: [runSummary({})],
      uniqueCandidateMarketCount: 5,
      settlementCoverage: crossRunCoverage(5),
      calibration: crossRunCalibration({
        candidateMarketCount: 5,
        marketLevelSignedCalibrationGap: 0.05,
      }),
      executable: crossRunExecutable({
        evaluatedExecutableCandidateCount: 5,
        feeAdjustedReturnCents: -44,
      }),
    });
    expect(result.classification).toBe("cross-run-contradicts-executability");
  });

  it("supports executable fade on evaluated positive executable evidence", () => {
    const result = classifyCalibrationFadeCrossRun({
      spec: crossRunSpec(1),
      provenanceAvailable: true,
      runSetIncompatible: false,
      perRunSummaries: [runSummary({})],
      uniqueCandidateMarketCount: 5,
      settlementCoverage: crossRunCoverage(5),
      calibration: crossRunCalibration({
        candidateMarketCount: 5,
        marketLevelSignedCalibrationGap: 0.05,
      }),
      executable: crossRunExecutable({
        evaluatedExecutableCandidateCount: 5,
        feeAdjustedReturnCents: 10,
      }),
    });
    expect(result.classification).toBe("cross-run-supports-executable-fade");
  });
});

describe("publishResearchArtifactsAtomically", () => {
  it("restores prior artifacts on later publish failure", () => {
    const files: Record<string, string> = {
      "a.json": "old-a",
      "b.json": "old-b",
    };
    const io = {
      writeFile: (path: string, data: string) => {
        if (path.includes(".tmp") && path.includes("b.json")) {
          throw new Error("publish failed");
        }
        files[path] = data;
      },
      fileExists: (path: string) => path in files,
      unlinkFile: (path: string) => {
        delete files[path];
      },
      renameFile: (from: string, to: string) => {
        files[to] = files[from] ?? "";
        delete files[from];
      },
    };

    expect(() =>
      publishResearchArtifactsAtomically(io, [
        { outputPath: "a.json", data: "new-a" },
        { outputPath: "b.json", data: "new-b" },
      ]),
    ).toThrow("publish failed");
    expect(files["a.json"]).toBe("old-a");
    expect(files["b.json"]).toBe("old-b");
  });
});

describe("no cherry-picking guards", () => {
  it("does not expose parameter-scan or best-subset helpers", async () => {
    const mod = await import("./index");
    expect("scanVolatilityThresholds" in mod).toBe(false);
    expect("selectBestRunSubset" in mod).toBe(false);
    expect("scanAlternateVolatilityBands" in mod).toBe(false);
    expect("optimizeHypothesisThresholds" in mod).toBe(false);

    const forwardMod = await import("@/lib/data/research/calibrationFadeForwardValidation");
    expect("scanVolatilityThresholds" in forwardMod).toBe(false);
    expect("selectBestRunSubset" in forwardMod).toBe(false);
  });
});
