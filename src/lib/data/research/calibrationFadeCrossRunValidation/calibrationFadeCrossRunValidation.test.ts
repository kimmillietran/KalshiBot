import { describe, expect, it, vi } from "vitest";

import { publishResearchArtifactsAtomically } from "@/lib/data/research/calibrationFadeForwardValidation";
import type {
  CalibrationFadeForwardValidationReport,
  CalibrationFadeMarketRecord,
} from "@/lib/data/research/calibrationFadeForwardValidation/calibrationFadeForwardValidationTypes";
import { DEFAULT_CALIBRATION_FADE_HYPOTHESIS_CONFIG_PATH } from "@/lib/data/research/calibrationFadeForwardValidation";

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
  captureVerdict: string;
  runDurationSeconds: number;
  hypothesisConfigurationHash?: string;
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
      validBookShare: 0.99,
      btcJoinCoverageShare: 1,
      bidSizeCoverageShare: null,
      reconnectCount: 0,
      sequenceGapCount: 0,
      suspectedSystemSleepSeconds: 0,
      captureVerdict: input.captureVerdict,
      reconciliationVerdict: null,
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
    expect(report.recommendedNextAction).toBe("collect-additional-clean-forward-captures");
    expect(report.perRunSummaries.some((run) => run.selectedRunId.includes("2026-07-12"))).toBe(
      true,
    );
    expect(report.recommendedBackfillRunIds).toEqual([]);
    expect(report.leaveOneRunOut.applicable).toBe(false);
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
});

describe("classifyCalibrationFadeCrossRun", () => {
  it("maps insufficient markets to collect-additional-clean-forward-captures", () => {
    const result = classifyCalibrationFadeCrossRun({
      spec: {
        ...(JSON.parse(freezeSpecContent()) as object),
        configurationHash: "x",
        minimumEvidenceRequirements: {
          minimumIndependentCandidateMarkets: 5,
          minimumSettlementCoverageShare: 0.8,
          minimumValidBookShare: 0.9,
          minimumBtcJoinCoverageShare: 0.9,
          materialRejectionCalibrationGap: 0.05,
          materialSupportCalibrationGap: 0.03,
          materialExecutableNetReturnCents: 1,
        },
      } as never,
      provenanceAvailable: true,
      runSetIncompatible: false,
      perRunSummaries: [
        {
          selectedRunId: "a",
          selectedRunDirectory: RUN1,
          captureHealthSource: "native-capture-health",
          captureVerdict: "capture-research-ready",
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
        },
        {
          selectedRunId: "b",
          selectedRunDirectory: RUN2,
          captureHealthSource: "run-scoped-capture-health-audit",
          captureVerdict: "capture-research-ready",
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
        },
      ],
      uniqueCandidateMarketCount: 1,
      settlementCoverage: {
        candidateMarketCount: 1,
        settledCandidateMarketCount: 1,
        joinedCandidateMarketCount: 1,
        unresolvedCandidateMarketCount: 0,
        settlementCoverageShare: 1,
        excludedByReason: {},
      },
      calibration: {
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
      },
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
    });
    expect(result.classification).toBe("insufficient-forward-events");
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
  it("does not expose parameter-scan helpers", async () => {
    const mod = await import("./index");
    expect("scanVolatilityThresholds" in mod).toBe(false);
    expect("selectBestRunSubset" in mod).toBe(false);
  });
});
