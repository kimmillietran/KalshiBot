import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { buildCoarseProbabilityAxisDefinitions } from "@/lib/data/research/dimensions";
import { fnv1a32, stableStringify } from "@/lib/trading/config/hashConfig";
import { publishResearchArtifactsAtomically } from "./publishResearchArtifactsAtomically";

import { analyzeCalibrationFadeForwardForRun, evaluateOpenMarket } from "./analyzeCalibrationFadeForwardForRun";
import { buildBtcCandlesUpToTimestamp, resolveCausalBtcPrice } from "./buildBtcCandlesCausal";
import { buildValidatedCausalVolatilityWindow } from "./buildValidatedCausalVolatilityWindow";
import {
  CANONICAL_CALIBRATION_FADE_CLASSIFICATION_PRECEDENCE,
  classifyCalibrationFadeInterpretation,
} from "./classifyCalibrationFadeInterpretation";
import {
  createCalibrationFadeForwardValidationIo,
  createMemoryCalibrationFadeForwardValidationIo,
} from "./createCalibrationFadeForwardValidationIo";
import { deriveProvenanceManifestPath, loadFrozenHypothesisSpec } from "./loadFrozenHypothesisSpec";
import { loadSelectedRunCalibrationFadeContext } from "./loadSelectedRunCalibrationFadeContext";
import {
  CalibrationFadeForwardValidationError,
  CALIBRATION_FADE_FIRST_FORWARD_BOUNDARY_CLAIM,
  CALIBRATION_FADE_FIRST_FORWARD_BOUNDARY_VERIFICATION_BASIS,
  CALIBRATION_FADE_PROVENANCE_MANIFEST_SCHEMA,
  CALIBRATION_FADE_PROVENANCE_MANIFEST_VERSION,
  CALIBRATION_FADE_PROVENANCE_VERIFICATION_MODEL,
  DEFAULT_CALIBRATION_FADE_HYPOTHESIS_CONFIG_PATH,
} from "./calibrationFadeForwardValidationTypes";
import { parseCalibrationFadeForwardValidationArgv } from "./parseCalibrationFadeForwardValidationArgv";
import {
  probabilityInAuthoritativeBand,
  resolveFrozenEligibilityBands,
} from "./resolveFrozenEligibilityBands";
import type {
  CalibrationFadeForwardValidationConfig,
  CalibrationFadeForwardValidationIo,
  CalibrationFadeProvenanceStatus,
  FrozenHypothesisSpec,
} from "./calibrationFadeForwardValidationTypes";

const RUN_DIR = "data/live-capture/forward-quotes/run-calibration-fade";
const MARKET_A = "KXBTC15M-26JUL111200-00";
const MARKET_B = "KXBTC15M-26JUL111215-15";
const HYPOTHESIS_ID =
  "atlas-volatilityProbabilityTime-vol-high-coarse-prob-1-coarse-time-early-over";
const BASE_MS = Date.parse("2026-07-11T12:00:00.000Z");
const PROVENANCE_PATH = deriveProvenanceManifestPath(DEFAULT_CALIBRATION_FADE_HYPOTHESIS_CONFIG_PATH);

/**
 * Known vectors. These are the semantic normalized-spec hashes recorded by the
 * committed provenance manifest; they are hardcoded here on purpose so a silent
 * change to the freeze document or to the hashing path fails this suite.
 */
const COMMITTED_FREEZE_CONFIGURATION_HASH = "0bda8f23";
const ORIGINAL_FREEZE_CONFIGURATION_HASH = "76336405";
const ORIGINAL_FREEZE_COMMIT_SHA = "f2598cf960472f368cd6ad25f67d4c97a3b3956e";
const ORIGINAL_FREEZE_COMMIT_TIMESTAMP = "2026-07-12T01:54:04-07:00";
const ORIGINAL_FREEZE_DESCRIPTION =
  "High (>=60% annualized BTC realized volatility) × YES implied probability [0.3, 0.7) "
  + "× < 15 minutes remaining; overconfident NO fade (buy NO at executable ask, hold to settlement).";
const ORIGINAL_FROZEN_PROBABILITY_BOUNDS = { minInclusive: 0.3, maxExclusive: 0.7 } as const;
/** Pre-correction precedence exactly as committed in the original freeze document. */
const ORIGINAL_FREEZE_CLASSIFICATION_PRECEDENCE = [
  "hypothesis-provenance-unavailable",
  "forward-feature-incompatible",
  "insufficient-forward-events",
  "settlement-coverage-incomplete",
  "observation-quality-inconclusive",
  "forward-rejects-hypothesis",
  "forward-inconclusive",
  "forward-contradicts-executability",
  "forward-supports-calibration-effect",
  "forward-supports-executable-fade",
] as const;
const PROBABILITY_BAND_CORRECTION_ID = "probability-band-reconciliation-to-coarse-prob-1";

function isoAt(offsetMs: number): string {
  return new Date(BASE_MS + offsetMs).toISOString();
}

function nested(parent: Record<string, unknown>, key: string): Record<string, unknown> {
  return parent[key] as Record<string, unknown>;
}

function freezeSpecContent(overrides: Record<string, unknown> = {}): string {
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
      probability: { bucketId: "coarse-prob-1", minInclusive: 1 / 3, maxExclusive: 2 / 3 },
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
      minimumIndependentCandidateMarkets: 2,
      minimumSettlementCoverageShare: 0.5,
      minimumValidBookShare: 0.9,
      minimumBtcJoinCoverageShare: 0.9,
      materialRejectionCalibrationGap: 0.05,
      materialSupportCalibrationGap: 0.03,
      materialExecutableNetReturnCents: 1,
    },
    classificationRules: { precedence: [...CANONICAL_CALIBRATION_FADE_CLASSIFICATION_PRECEDENCE] },
    ...overrides,
  });
}

/**
 * A complete, valid reviewed manifest for the synthetic freeze fixture. Fixtures
 * carry no integrity divergence, so originalConfigHash equals resolvedConfigHash
 * and integrityCorrections is legitimately empty.
 */
function provenanceManifestObject(resolvedConfigHash: string): Record<string, unknown> {
  return {
    schema: CALIBRATION_FADE_PROVENANCE_MANIFEST_SCHEMA,
    version: CALIBRATION_FADE_PROVENANCE_MANIFEST_VERSION,
    verificationModel: CALIBRATION_FADE_PROVENANCE_VERIFICATION_MODEL,
    hypothesisId: HYPOTHESIS_ID,
    sourceCandidateId: HYPOTHESIS_ID,
    configPath: DEFAULT_CALIBRATION_FADE_HYPOTHESIS_CONFIG_PATH,
    originalFreezeCommitSha: ORIGINAL_FREEZE_COMMIT_SHA,
    originalFreezeCommitTimestamp: ORIGINAL_FREEZE_COMMIT_TIMESTAMP,
    originalConfigHash: resolvedConfigHash,
    resolvedConfigHash,
    firstForwardEvaluationBoundary: {
      claim: CALIBRATION_FADE_FIRST_FORWARD_BOUNDARY_CLAIM,
      verificationBasis: CALIBRATION_FADE_FIRST_FORWARD_BOUNDARY_VERIFICATION_BASIS,
      runtimeVerified: false,
    },
    conclusion: "defensible-with-manifest",
    ruleFreezeEvidence: {
      kind: "repository-history",
      description:
        `Frozen config was introduced in commit ${ORIGINAL_FREEZE_COMMIT_SHA} before the first forward `
        + "capture epoch. Git is not executed at evaluation time; this reviewed manifest records freeze identity.",
      runtimeGitExecuted: false,
      originalProbabilityBounds: {
        minInclusive: ORIGINAL_FROZEN_PROBABILITY_BOUNDS.minInclusive,
        maxExclusive: ORIGINAL_FROZEN_PROBABILITY_BOUNDS.maxExclusive,
      },
      resolvedProbabilityBounds: {
        minInclusive: 1 / 3,
        maxExclusive: 2 / 3,
        bucketId: "coarse-prob-1",
      },
    },
    historicalBenchmarkAvailability: "unavailable",
    missingArtifacts: ["data/research-results/hypothesis-candidates.json"],
    limitations: ["Historical discovery artifacts absent in fixture."],
    integrityCorrections: [],
  };
}

/** The full probability-band reconciliation record, used for hash-divergence fixtures. */
function probabilityBandCorrection(input: {
  originalConfigHash: string;
  resolvedConfigHash: string;
}): Record<string, unknown> {
  return {
    id: PROBABILITY_BAND_CORRECTION_ID,
    kind: "integrity-correction",
    summary: "Reconcile explicit probability bounds to the registered coarse-prob-1 exact middle thirds.",
    rationale: "The frozen bucket identity was always coarse-prob-1; this is not post-hoc optimization.",
    originalConfigHash: input.originalConfigHash,
    resolvedConfigHash: input.resolvedConfigHash,
    originalProbabilityBounds: {
      minInclusive: ORIGINAL_FROZEN_PROBABILITY_BOUNDS.minInclusive,
      maxExclusive: ORIGINAL_FROZEN_PROBABILITY_BOUNDS.maxExclusive,
    },
    resolvedProbabilityBounds: {
      minInclusive: 1 / 3,
      maxExclusive: 2 / 3,
      bucketId: "coarse-prob-1",
    },
  };
}

function provenanceManifestContent(resolvedConfigHash: string, overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({ ...provenanceManifestObject(resolvedConfigHash), ...overrides });
}

/**
 * The freeze document alone determines the configuration hash, so the hash is
 * read back without needing a manifest at all.
 */
function configurationHashForFreeze(content: string): string {
  const io = createMemoryCalibrationFadeForwardValidationIo({
    [DEFAULT_CALIBRATION_FADE_HYPOTHESIS_CONFIG_PATH]: content,
  });
  return loadFrozenHypothesisSpec({ io }).spec.configurationHash;
}

function freezeFixtureFiles(extra: Record<string, string> = {}, freezeOverrides: Record<string, unknown> = {}): Record<string, string> {
  const freeze = freezeSpecContent(freezeOverrides);
  const hash = configurationHashForFreeze(freeze);
  return {
    [DEFAULT_CALIBRATION_FADE_HYPOTHESIS_CONFIG_PATH]: freeze,
    [PROVENANCE_PATH]: provenanceManifestContent(hash),
    "data/research-results/hypothesis-candidates.json": hypothesisCandidatesFixture(),
    ...extra,
  };
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

function topOfBookLine(input: {
  marketTicker: string;
  offsetMs: number;
  yesBid?: number;
  yesAsk?: number;
  noAsk?: number | null;
  bookState?: string;
}) {
  return JSON.stringify({
    marketTicker: input.marketTicker,
    seriesTicker: "KXBTC15M",
    receivedAtLocal: isoAt(input.offsetMs),
    exchangeTimestampMs: BASE_MS + input.offsetMs,
    bookState: input.bookState ?? "valid",
    yesBestBidCents: input.yesBid ?? 48,
    yesBestAskCents: input.yesAsk ?? 52,
    noBestBidCents: 46,
    noBestAskCents: input.noAsk ?? 50,
  });
}

function btcLine(offsetMs: number, priceUsd: number) {
  return JSON.stringify({
    receivedAtLocal: isoAt(offsetMs),
    exchangeTimestampMs: BASE_MS + offsetMs,
    priceUsd,
  });
}

/** Minute-oscillating price: deterministic and far above the vol-high floor. */
function priceAt(timestampMs: number): number {
  const minute = Math.floor(timestampMs / 60_000);
  return 100_000 + (minute % 2 === 0 ? 1 : -1) * (2_000 + minute * 150);
}

/** Dense causal BTC samples (<= maximumSourceGapMs) with high realized volatility. */
function denseHighVolBtcSpots(options?: { endOffsetMs?: number; stepMs?: number }): string {
  const endOffsetMs = options?.endOffsetMs ?? 15 * 60_000;
  const stepMs = options?.stepMs ?? 1_000;
  const lines: string[] = [];
  for (let offsetMs = 0; offsetMs <= endOffsetMs; offsetMs += stepMs) {
    lines.push(btcLine(offsetMs, priceAt(offsetMs)));
  }
  return lines.join("\n");
}

function analysisConfig(): CalibrationFadeForwardValidationConfig {
  return {
    captureRunDir: RUN_DIR,
    hypothesisConfigPath: DEFAULT_CALIBRATION_FADE_HYPOTHESIS_CONFIG_PATH,
    importsDir: "data/imports",
    maximumBtcJoinAgeMs: 5000,
    eventsOutputPath: "data/research-results/calibration-fade-forward-events.jsonl",
    marketsOutputPath: "data/research-results/calibration-fade-forward-markets.jsonl",
  };
}

function analyzeFixture(io: CalibrationFadeForwardValidationIo, generatedAt = "2026-07-12T08:00:00.000Z") {
  return analyzeCalibrationFadeForwardForRun({
    generatedAt,
    outputPath: "data/research-results/calibration-fade-forward-validation.json",
    htmlOutputPath: "data/reports/calibration-fade-forward-validation.html",
    config: analysisConfig(),
    io,
  });
}

function captureHealthAuditContent(topOfBookCount: number, btcSpotCount: number): string {
  return JSON.stringify({
    selectedRunId: "run-calibration-fade",
    captureRunDir: RUN_DIR,
    sourceRunIds: ["run-calibration-fade"],
    analysisVersion: "capture-health-audit-v1",
    inputArtifactIdentities: [],
    summary: {
      verdict: "capture-research-ready",
      recommendedNextAction: "proceed-offline-microstructure-research",
      runDurationSeconds: 3600,
      topOfBookCount,
      btcSpotCount,
      bookState: { validBookShare: 0.99, reconnectCount: 0, sequenceGapCount: 0 },
      btcJoin: { joinCoverageShare: 1 },
      continuity: { p90TopOfBookGapMs: 1000 },
    },
  });
}

/** Single-run capture fixture with explicit quote lines and BTC source content. */
function singleRunFixture(input: {
  topOfBookLines: readonly string[];
  btcSpots: string;
  marketTickers: readonly string[];
  closeTimeOffsetMs?: number;
}) {
  const metadata = input.marketTickers
    .map((marketTicker) =>
      JSON.stringify({ marketTicker, closeTime: isoAt(input.closeTimeOffsetMs ?? 1_200_000) }),
    )
    .join("\n");

  return {
    dirs: [RUN_DIR, "data/imports"],
    files: freezeFixtureFiles({
      [`${RUN_DIR}/capture-health.json`]: JSON.stringify({
        runId: "run-calibration-fade",
        config: { durationSeconds: 3600 },
        connection: {
          captureEndReason: "duration-complete",
          terminalFailureReason: null,
          completedNormally: true,
        },
        orderbook: {
          validTopOfBookRecords: input.topOfBookLines.length,
          reconnectCount: 0,
          sequenceGapCount: 0,
        },
      }),
      [`${RUN_DIR}/market-metadata.jsonl`]: metadata,
      [`${RUN_DIR}/top-of-book.jsonl`]: input.topOfBookLines.join("\n"),
      [`${RUN_DIR}/btc-spot.jsonl`]: input.btcSpots,
      [`${RUN_DIR}/capture-health-audit.json`]: captureHealthAuditContent(
        input.topOfBookLines.length,
        input.btcSpots.split("\n").length,
      ),
    }),
  };
}

function buildRegressionFixture() {
  const btcSpots = denseHighVolBtcSpots();
  const topOfBook = [
    topOfBookLine({ marketTicker: MARKET_A, offsetMs: 0, yesBid: 20, yesAsk: 22 }),
    topOfBookLine({ marketTicker: MARKET_A, offsetMs: 720_000, yesBid: 48, yesAsk: 52, noAsk: 50 }),
    topOfBookLine({ marketTicker: MARKET_A, offsetMs: 780_000, yesBid: 48, yesAsk: 52, noAsk: 50 }),
    topOfBookLine({ marketTicker: MARKET_A, offsetMs: 840_000, yesBid: 55, yesAsk: 57, noAsk: null }),
    topOfBookLine({ marketTicker: MARKET_B, offsetMs: 720_000, yesBid: 48, yesAsk: 52, noAsk: 51 }),
  ];

  return {
    dirs: [RUN_DIR, "data/imports", `data/imports/KXBTC15M/${MARKET_A}`, `data/imports/KXBTC15M/${MARKET_B}`],
    files: freezeFixtureFiles({
      [`${RUN_DIR}/capture-health.json`]: JSON.stringify({
        runId: "run-calibration-fade",
        config: { durationSeconds: 3600 },
        orderbook: { validTopOfBookRecords: 5, reconnectCount: 0, sequenceGapCount: 0 },
      }),
      [`${RUN_DIR}/market-metadata.jsonl`]: [
        JSON.stringify({ marketTicker: MARKET_A, closeTime: isoAt(1_200_000) }),
        JSON.stringify({ marketTicker: MARKET_B, closeTime: isoAt(1_200_000) }),
      ].join("\n"),
      [`${RUN_DIR}/top-of-book.jsonl`]: topOfBook.join("\n"),
      [`${RUN_DIR}/btc-spot.jsonl`]: btcSpots,
      [`${RUN_DIR}/capture-health-audit.json`]: JSON.stringify({
        selectedRunId: "run-calibration-fade",
        captureRunDir: RUN_DIR,
        sourceRunIds: ["run-calibration-fade"],
        analysisVersion: "capture-health-audit-v1",
        inputArtifactIdentities: [],
        summary: {
          verdict: "capture-research-ready",
          recommendedNextAction: "proceed-offline-microstructure-research",
          runDurationSeconds: 3600,
          topOfBookCount: 5,
          btcSpotCount: 16,
          bookState: { validBookShare: 0.99, reconnectCount: 0, sequenceGapCount: 0 },
          btcJoin: { joinCoverageShare: 1 },
          continuity: { p90TopOfBookGapMs: 1000 },
        },
      }),
      [`data/imports/KXBTC15M/${MARKET_A}/import-result.json`]: JSON.stringify({
        bronzeRecords: [
          {
            ticker: MARKET_A,
            contentType: "settlement",
            payload: { market: { result: "no", settlement_ts: isoAt(700_000) } },
          },
        ],
      }),
      [`data/imports/KXBTC15M/${MARKET_B}/import-result.json`]: JSON.stringify({
        bronzeRecords: [
          {
            ticker: MARKET_B,
            contentType: "settlement",
            payload: { market: { result: "yes", settlement_ts: isoAt(700_000) } },
          },
        ],
      }),
    }),
  };
}

describe("loadFrozenHypothesisSpec", () => {
  it("loads canonical candidate and stable freeze hash with valid provenance", () => {
    const files = freezeFixtureFiles();
    const io = createMemoryCalibrationFadeForwardValidationIo(files);
    const loaded = loadFrozenHypothesisSpec({ io });
    expect(loaded.spec.configurationHash).toBe(configurationHashForFreeze(freezeSpecContent()));
    expect(loaded.historicalBenchmark.discoveryObservationCount).toBe(273);
    expect(loaded.provenanceAvailable).toBe(true);
    expect(loaded.provenance.provenanceStatus).toBe("valid-manifest");
  });

  it("accepts rule-freeze provenance when discovery artifacts are absent", () => {
    const freeze = freezeSpecContent();
    const hash = configurationHashForFreeze(freeze);
    const io = createMemoryCalibrationFadeForwardValidationIo({
      [DEFAULT_CALIBRATION_FADE_HYPOTHESIS_CONFIG_PATH]: freeze,
      [PROVENANCE_PATH]: provenanceManifestContent(hash),
    });
    const loaded = loadFrozenHypothesisSpec({ io });
    expect(loaded.provenanceAvailable).toBe(true);
    expect(loaded.historicalBenchmark.discoveryObservationCount).toBeNull();
    expect(loaded.warnings.some((warning) => warning.includes("Missing canonical source artifact"))).toBe(true);
  });

  it("fails closed when provenance manifest is missing", () => {
    const io = createMemoryCalibrationFadeForwardValidationIo({
      [DEFAULT_CALIBRATION_FADE_HYPOTHESIS_CONFIG_PATH]: freezeSpecContent(),
    });
    const loaded = loadFrozenHypothesisSpec({ io });
    expect(loaded.provenanceAvailable).toBe(false);
    expect(loaded.provenance.provenanceStatus).toBe("missing-manifest");
  });

  it("fails closed on malformed provenance manifest", () => {
    const io = createMemoryCalibrationFadeForwardValidationIo({
      [DEFAULT_CALIBRATION_FADE_HYPOTHESIS_CONFIG_PATH]: freezeSpecContent(),
      [PROVENANCE_PATH]: "{not-json",
    });
    const loaded = loadFrozenHypothesisSpec({ io });
    expect(loaded.provenanceAvailable).toBe(false);
    expect(loaded.provenance.provenanceStatus).toBe("malformed-manifest");
  });

  it("fails closed on wrong hypothesis id in manifest", () => {
    const freeze = freezeSpecContent();
    const hash = configurationHashForFreeze(freeze);
    const io = createMemoryCalibrationFadeForwardValidationIo({
      [DEFAULT_CALIBRATION_FADE_HYPOTHESIS_CONFIG_PATH]: freeze,
      [PROVENANCE_PATH]: provenanceManifestContent(hash, { hypothesisId: "other-hypothesis" }),
    });
    const loaded = loadFrozenHypothesisSpec({ io });
    expect(loaded.provenanceAvailable).toBe(false);
    expect(loaded.provenance.provenanceStatus).toBe("mismatched-manifest");
  });

  it("fails closed on wrong source candidate id in manifest", () => {
    const freeze = freezeSpecContent();
    const hash = configurationHashForFreeze(freeze);
    const io = createMemoryCalibrationFadeForwardValidationIo({
      [DEFAULT_CALIBRATION_FADE_HYPOTHESIS_CONFIG_PATH]: freeze,
      [PROVENANCE_PATH]: provenanceManifestContent(hash, { sourceCandidateId: "other-candidate" }),
    });
    const loaded = loadFrozenHypothesisSpec({ io });
    expect(loaded.provenanceAvailable).toBe(false);
    expect(loaded.provenance.provenanceStatus).toBe("mismatched-manifest");
  });

  it("fails closed on wrong resolved config hash", () => {
    const freeze = freezeSpecContent();
    const io = createMemoryCalibrationFadeForwardValidationIo({
      [DEFAULT_CALIBRATION_FADE_HYPOTHESIS_CONFIG_PATH]: freeze,
      [PROVENANCE_PATH]: provenanceManifestContent("deadbeef"),
    });
    const loaded = loadFrozenHypothesisSpec({ io });
    expect(loaded.provenanceAvailable).toBe(false);
    expect(loaded.provenance.provenanceStatus).toBe("mismatched-manifest");
  });

  it("fails closed when manifest configPath certifies another path", () => {
    const freeze = freezeSpecContent();
    const hash = configurationHashForFreeze(freeze);
    const io = createMemoryCalibrationFadeForwardValidationIo({
      [DEFAULT_CALIBRATION_FADE_HYPOTHESIS_CONFIG_PATH]: freeze,
      [PROVENANCE_PATH]: provenanceManifestContent(hash, {
        configPath: "config/research/hypotheses/other.json",
      }),
    });
    const loaded = loadFrozenHypothesisSpec({ io });
    expect(loaded.provenanceAvailable).toBe(false);
    expect(loaded.provenance.provenanceStatus).toBe("mismatched-manifest");
  });

  it("never fabricates historical benchmark statistics when artifacts are missing", () => {
    const freeze = freezeSpecContent();
    const hash = configurationHashForFreeze(freeze);
    const io = createMemoryCalibrationFadeForwardValidationIo({
      [DEFAULT_CALIBRATION_FADE_HYPOTHESIS_CONFIG_PATH]: freeze,
      [PROVENANCE_PATH]: provenanceManifestContent(hash),
    });
    const loaded = loadFrozenHypothesisSpec({ io });
    expect(loaded.historicalBenchmark.discoveryObservationCount).toBeNull();
    expect(loaded.historicalBenchmark.discoveryCalibrationError).toBeNull();
    expect(loaded.historicalBenchmark.discoveryRobustnessScore).toBeNull();
  });

  it("loads available benchmark values when historical artifacts are present", () => {
    const files = freezeFixtureFiles();
    const io = createMemoryCalibrationFadeForwardValidationIo(files);
    const loaded = loadFrozenHypothesisSpec({ io });
    expect(loaded.provenanceAvailable).toBe(true);
    expect(loaded.historicalBenchmark.discoveryObservationCount).toBe(273);
    expect(loaded.historicalBenchmark.discoveryAverageImpliedProbability).toBeCloseTo(0.505);
  });

  it("rejects ambiguous candidate when source candidate id does not match", () => {
    const freeze = freezeSpecContent({
      sourceCandidateId: "\u0007tlas-volatilityProbabilityTime-vol-high-coarse-prob-1-coarse-time-early-over",
    });
    const hash = configurationHashForFreeze(freeze);
    const io = createMemoryCalibrationFadeForwardValidationIo({
      [DEFAULT_CALIBRATION_FADE_HYPOTHESIS_CONFIG_PATH]: freeze,
      [PROVENANCE_PATH]: provenanceManifestContent(hash, {
        sourceCandidateId: "\u0007tlas-volatilityProbabilityTime-vol-high-coarse-prob-1-coarse-time-early-over",
      }),
      "data/research-results/hypothesis-candidates.json": hypothesisCandidatesFixture(),
    });
    const loaded = loadFrozenHypothesisSpec({ io });
    expect(loaded.provenanceAvailable).toBe(true);
    expect(loaded.warnings.some((warning) => warning.includes("not found"))).toBe(true);
    expect(loaded.historicalBenchmark.discoveryObservationCount).toBeNull();
  });
});

describe("frozen configuration hash known vectors", () => {
  it("reproduces the committed freeze configuration hash through the production loader", () => {
    const loaded = loadFrozenHypothesisSpec({ io: createCalibrationFadeForwardValidationIo() });
    expect(loaded.spec.configurationHash).toBe(COMMITTED_FREEZE_CONFIGURATION_HASH);
    expect(loaded.provenanceAvailable).toBe(true);
    expect(loaded.provenance.provenanceStatus).toBe("valid-manifest");
    expect(loaded.provenance.verificationModel).toBe(CALIBRATION_FADE_PROVENANCE_VERIFICATION_MODEL);
    expect(loaded.provenance.resolvedConfigHash).toBe(COMMITTED_FREEZE_CONFIGURATION_HASH);
    expect(loaded.provenance.originalConfigHash).toBe(ORIGINAL_FREEZE_CONFIGURATION_HASH);
    expect(loaded.provenance.firstForwardEvaluationBoundary).toEqual({
      claim: CALIBRATION_FADE_FIRST_FORWARD_BOUNDARY_CLAIM,
      verificationBasis: CALIBRATION_FADE_FIRST_FORWARD_BOUNDARY_VERIFICATION_BASIS,
      runtimeVerified: false,
    });
  });

  it("reproduces the pre-correction freeze configuration hash recorded by the manifest", () => {
    const { spec } = loadFrozenHypothesisSpec({ io: createCalibrationFadeForwardValidationIo() });
    const normalized: Record<string, unknown> = { ...spec };
    delete normalized.configurationHash;

    // The only documented pre-correction differences: probability bounds,
    // classification precedence, and the description that quoted those bounds.
    const preCorrection = {
      ...normalized,
      description: ORIGINAL_FREEZE_DESCRIPTION,
      eligibilityRules: {
        ...spec.eligibilityRules,
        probability: {
          bucketId: spec.eligibilityRules.probability.bucketId,
          minInclusive: ORIGINAL_FROZEN_PROBABILITY_BOUNDS.minInclusive,
          maxExclusive: ORIGINAL_FROZEN_PROBABILITY_BOUNDS.maxExclusive,
        },
      },
      classificationRules: { precedence: [...ORIGINAL_FREEZE_CLASSIFICATION_PRECEDENCE] },
    };

    expect(fnv1a32(stableStringify(preCorrection))).toBe(ORIGINAL_FREEZE_CONFIGURATION_HASH);
  });

  it("rejects the pre-correction classification precedence", () => {
    const io = createMemoryCalibrationFadeForwardValidationIo({
      [DEFAULT_CALIBRATION_FADE_HYPOTHESIS_CONFIG_PATH]: freezeSpecContent({
        classificationRules: { precedence: [...ORIGINAL_FREEZE_CLASSIFICATION_PRECEDENCE] },
      }),
    });
    expect(() => loadFrozenHypothesisSpec({ io })).toThrow(
      /classificationRules\.precedence must exactly match the live classifier precedence/,
    );
  });
});

describe("parseFreezeDocument fail-closed validation", () => {
  function loadMutatedFreeze(mutate: (document: Record<string, unknown>) => void) {
    const document = JSON.parse(freezeSpecContent()) as Record<string, unknown>;
    mutate(document);
    const io = createMemoryCalibrationFadeForwardValidationIo({
      [DEFAULT_CALIBRATION_FADE_HYPOTHESIS_CONFIG_PATH]: JSON.stringify(document),
    });
    return () => loadFrozenHypothesisSpec({ io });
  }

  const cases: {
    name: string;
    mutate: (document: Record<string, unknown>) => void;
    message: RegExp;
  }[] = [
    {
      name: "missing probability minInclusive",
      mutate: (document) => {
        delete nested(nested(document, "eligibilityRules"), "probability").minInclusive;
      },
      message: /^eligibilityRules\.probability\.minInclusive is required$/,
    },
    {
      name: "missing probability maxExclusive",
      mutate: (document) => {
        delete nested(nested(document, "eligibilityRules"), "probability").maxExclusive;
      },
      message: /^eligibilityRules\.probability\.maxExclusive is required$/,
    },
    {
      name: "missing probability bucketId",
      mutate: (document) => {
        delete nested(nested(document, "eligibilityRules"), "probability").bucketId;
      },
      message: /^eligibilityRules\.probability\.bucketId is required$/,
    },
    {
      name: "missing volatility minInclusive",
      mutate: (document) => {
        delete nested(nested(document, "eligibilityRules"), "volatility").minInclusive;
      },
      message: /^eligibilityRules\.volatility\.minInclusive is required$/,
    },
    {
      name: "missing volatility maxExclusive",
      mutate: (document) => {
        delete nested(nested(document, "eligibilityRules"), "volatility").maxExclusive;
      },
      message: /^eligibilityRules\.volatility\.maxExclusive is required$/,
    },
    {
      name: "missing volatility bucketId",
      mutate: (document) => {
        delete nested(nested(document, "eligibilityRules"), "volatility").bucketId;
      },
      message: /^eligibilityRules\.volatility\.bucketId is required$/,
    },
    {
      name: "missing time-remaining maxExclusive",
      mutate: (document) => {
        delete nested(nested(document, "eligibilityRules"), "timeRemainingMs").maxExclusive;
      },
      message: /^eligibilityRules\.timeRemainingMs\.maxExclusive is required$/,
    },
    {
      name: "missing time-remaining bucketId",
      mutate: (document) => {
        delete nested(nested(document, "eligibilityRules"), "timeRemainingMs").bucketId;
      },
      message: /^eligibilityRules\.timeRemainingMs\.bucketId is required$/,
    },
    {
      name: "missing lookbackBars",
      mutate: (document) => {
        delete nested(document, "volatilityDefinition").lookbackBars;
      },
      message: /^volatilityDefinition\.lookbackBars is required$/,
    },
    {
      name: "fractional lookbackBars",
      mutate: (document) => {
        nested(document, "volatilityDefinition").lookbackBars = 10.5;
      },
      message: /^volatilityDefinition\.lookbackBars must be a safe integer; received 10\.5$/,
    },
    {
      name: "lookbackBars below the two-bar minimum",
      mutate: (document) => {
        nested(document, "volatilityDefinition").lookbackBars = 1;
      },
      message: /^volatilityDefinition\.lookbackBars must be >= 2; received 1$/,
    },
    {
      name: "missing maximumSourceGapMs",
      mutate: (document) => {
        delete nested(document, "volatilityDefinition").maximumSourceGapMs;
      },
      message: /^volatilityDefinition\.maximumSourceGapMs is required$/,
    },
    {
      name: "negative maximumSourceGapMs",
      mutate: (document) => {
        nested(document, "volatilityDefinition").maximumSourceGapMs = -1;
      },
      message: /^volatilityDefinition\.maximumSourceGapMs must be >= 0; received -1$/,
    },
    {
      name: "causalOnly declared false",
      mutate: (document) => {
        nested(document, "volatilityDefinition").causalOnly = false;
      },
      message: /^volatilityDefinition\.causalOnly must be true$/,
    },
    {
      name: "string where a number is required",
      mutate: (document) => {
        nested(nested(document, "eligibilityRules"), "probability").minInclusive = "0.3333333333333333";
      },
      message: /^eligibilityRules\.probability\.minInclusive must be a finite number$/,
    },
    {
      name: "string where a bar interval number is required",
      mutate: (document) => {
        nested(document, "volatilityDefinition").returnIntervalMs = "60000";
      },
      message: /^volatilityDefinition\.returnIntervalMs must be a finite number$/,
    },
    {
      name: "inverted probability interval",
      mutate: (document) => {
        const probability = nested(nested(document, "eligibilityRules"), "probability");
        probability.minInclusive = 2 / 3;
        probability.maxExclusive = 1 / 3;
      },
      message:
        /^eligibilityRules\.probability\.maxExclusive must be greater than eligibilityRules\.probability\.minInclusive$/,
    },
    {
      name: "unsupported probability measure",
      mutate: (document) => {
        nested(document, "probabilityMeasure").id = "yes-last-trade";
      },
      message: /^probabilityMeasure\.id must be one of \[yes-bid-ask-midpoint\]/,
    },
    {
      name: "unsupported volatility method",
      mutate: (document) => {
        nested(document, "volatilityDefinition").method = "ewma-annualized";
      },
      message: /^volatilityDefinition\.method must be one of \[realized-log-return-annualized\]/,
    },
    {
      name: "missing classification precedence",
      mutate: (document) => {
        delete nested(document, "classificationRules").precedence;
      },
      message: /^classificationRules\.precedence is required$/,
    },
    {
      name: "unknown classification in precedence",
      mutate: (document) => {
        nested(document, "classificationRules").precedence = [
          "forward-supports-time-travel",
          ...CANONICAL_CALIBRATION_FADE_CLASSIFICATION_PRECEDENCE.slice(1),
        ];
      },
      message:
        /^classificationRules\.precedence\[0\] must be a recognized calibration-fade interpretation classification$/,
    },
    {
      name: "duplicate classification in precedence",
      mutate: (document) => {
        nested(document, "classificationRules").precedence = [
          ...CANONICAL_CALIBRATION_FADE_CLASSIFICATION_PRECEDENCE,
          CANONICAL_CALIBRATION_FADE_CLASSIFICATION_PRECEDENCE[0],
        ];
      },
      message: /^classificationRules\.precedence\[10\] duplicates hypothesis-provenance-unavailable$/,
    },
    {
      name: "duplicate canonical source artifact",
      mutate: (document) => {
        document.canonicalSourceArtifacts = [
          "data/research-results/hypothesis-candidates.json",
          "data/research-results/hypothesis-candidates.json",
        ];
      },
      message: /^canonicalSourceArtifacts\[1\] duplicates data\/research-results\/hypothesis-candidates\.json$/,
    },
    {
      name: "missing hypothesis identity",
      mutate: (document) => {
        delete document.hypothesisId;
      },
      message: /^hypothesisId is required$/,
    },
  ];

  for (const marketEligibilityFlag of [
    "requireValidBook",
    "requireSynchronizedBook",
    "requireOpenMarket",
    "requireBtcJoin",
  ]) {
    cases.push({
      name: `missing marketEligibilityRules.${marketEligibilityFlag}`,
      mutate: (document) => {
        delete nested(document, "marketEligibilityRules")[marketEligibilityFlag];
      },
      message: new RegExp(`^marketEligibilityRules\\.${marketEligibilityFlag} is required$`),
    });
  }

  for (const testCase of cases) {
    it(`fails closed on ${testCase.name}`, () => {
      const load = loadMutatedFreeze(testCase.mutate);
      expect(load).toThrow(CalibrationFadeForwardValidationError);
      expect(load).toThrow(testCase.message);
    });
  }

  it("loads the committed freeze document", () => {
    const { spec } = loadFrozenHypothesisSpec({ io: createCalibrationFadeForwardValidationIo() });
    expect(spec.hypothesisId).toBe(HYPOTHESIS_ID);
    expect(spec.volatilityDefinition.causalOnly).toBe(true);
    expect(spec.classificationRules.precedence).toEqual([
      ...CANONICAL_CALIBRATION_FADE_CLASSIFICATION_PRECEDENCE,
    ]);
  });
});

describe("provenance manifest fail-closed validation", () => {
  function loadWithManifest(mutate: (manifest: Record<string, unknown>) => void) {
    const freeze = freezeSpecContent();
    const hash = configurationHashForFreeze(freeze);
    const manifest = provenanceManifestObject(hash);
    mutate(manifest);
    const io = createMemoryCalibrationFadeForwardValidationIo({
      [DEFAULT_CALIBRATION_FADE_HYPOTHESIS_CONFIG_PATH]: freeze,
      [PROVENANCE_PATH]: JSON.stringify(manifest),
    });
    return loadFrozenHypothesisSpec({ io });
  }

  const cases: {
    name: string;
    mutate: (manifest: Record<string, unknown>) => void;
    status: CalibrationFadeProvenanceStatus;
  }[] = [
    {
      name: "a non-hexadecimal freeze commit SHA",
      mutate: (manifest) => {
        manifest.originalFreezeCommitSha = "z2598cf960472f368cd6ad25f67d4c97a3b3956e";
      },
      status: "incomplete-manifest",
    },
    {
      name: "an abbreviated freeze commit SHA",
      mutate: (manifest) => {
        manifest.originalFreezeCommitSha = "f2598cf";
      },
      status: "incomplete-manifest",
    },
    {
      name: "an unparseable freeze commit timestamp",
      mutate: (manifest) => {
        manifest.originalFreezeCommitTimestamp = "2026-07-12 01:54:04";
      },
      status: "incomplete-manifest",
    },
    {
      name: "a freeze commit timestamp without an explicit UTC offset",
      mutate: (manifest) => {
        manifest.originalFreezeCommitTimestamp = "2026-07-12T01:54:04";
      },
      status: "incomplete-manifest",
    },
    {
      name: "a missing verification model",
      mutate: (manifest) => {
        delete manifest.verificationModel;
      },
      status: "incomplete-manifest",
    },
    {
      name: "an unsupported verification model",
      mutate: (manifest) => {
        manifest.verificationModel = "runtime-git-verified";
      },
      status: "unsupported-verification-model",
    },
    {
      name: "a missing first-forward boundary",
      mutate: (manifest) => {
        delete manifest.firstForwardEvaluationBoundary;
      },
      status: "incomplete-manifest",
    },
    {
      name: "a prose first-forward boundary instead of a structured claim",
      mutate: (manifest) => {
        manifest.firstForwardEvaluationBoundary = "before first forward capture";
      },
      status: "incomplete-manifest",
    },
    {
      name: "a first-forward boundary claiming runtime verification",
      mutate: (manifest) => {
        nested(manifest, "firstForwardEvaluationBoundary").runtimeVerified = true;
      },
      status: "incomplete-manifest",
    },
    {
      name: "an unrecognized first-forward verification basis",
      mutate: (manifest) => {
        nested(manifest, "firstForwardEvaluationBoundary").verificationBasis = "operator-assertion";
      },
      status: "incomplete-manifest",
    },
    {
      name: "a null rule-freeze evidence section",
      mutate: (manifest) => {
        manifest.ruleFreezeEvidence = null;
      },
      status: "incomplete-manifest",
    },
    {
      name: "an unrecognized rule-freeze evidence kind",
      mutate: (manifest) => {
        nested(manifest, "ruleFreezeEvidence").kind = "operator-memory";
      },
      status: "incomplete-manifest",
    },
    {
      name: "a missing rule-freeze evidence description",
      mutate: (manifest) => {
        delete nested(manifest, "ruleFreezeEvidence").description;
      },
      status: "incomplete-manifest",
    },
    {
      name: "rule-freeze evidence claiming runtime Git execution",
      mutate: (manifest) => {
        nested(manifest, "ruleFreezeEvidence").runtimeGitExecuted = true;
      },
      status: "incomplete-manifest",
    },
    {
      name: "wrong original probability bounds in rule-freeze evidence",
      mutate: (manifest) => {
        nested(nested(manifest, "ruleFreezeEvidence"), "originalProbabilityBounds").minInclusive = 0.25;
      },
      status: "incomplete-manifest",
    },
    {
      name: "wrong resolved probability bounds in rule-freeze evidence",
      mutate: (manifest) => {
        nested(nested(manifest, "ruleFreezeEvidence"), "resolvedProbabilityBounds").maxExclusive = 0.7;
      },
      status: "incomplete-manifest",
    },
    {
      name: "a wrong resolved probability bucket in rule-freeze evidence",
      mutate: (manifest) => {
        nested(nested(manifest, "ruleFreezeEvidence"), "resolvedProbabilityBounds").bucketId = "coarse-prob-2";
      },
      status: "incomplete-manifest",
    },
    {
      name: "an unknown historical benchmark availability",
      mutate: (manifest) => {
        manifest.historicalBenchmarkAvailability = "partial";
      },
      status: "incomplete-manifest",
    },
    {
      name: "a non-array missing-artifacts declaration",
      mutate: (manifest) => {
        manifest.missingArtifacts = "data/research-results/hypothesis-candidates.json";
      },
      status: "incomplete-manifest",
    },
    {
      name: "a duplicated missing-artifacts entry",
      mutate: (manifest) => {
        manifest.missingArtifacts = [
          "data/research-results/hypothesis-candidates.json",
          "data/research-results/hypothesis-candidates.json",
        ];
      },
      status: "incomplete-manifest",
    },
    {
      name: "a missing-artifacts entry outside the canonical source set",
      mutate: (manifest) => {
        manifest.missingArtifacts = ["data/research-results/not-canonical.json"];
      },
      status: "incomplete-manifest",
    },
    {
      name: "an empty correction list while the config hashes diverge",
      mutate: (manifest) => {
        manifest.originalConfigHash = ORIGINAL_FREEZE_CONFIGURATION_HASH;
        manifest.integrityCorrections = [];
      },
      status: "incomplete-manifest",
    },
    {
      name: "a correction whose hashes disagree with the manifest",
      mutate: (manifest) => {
        manifest.originalConfigHash = ORIGINAL_FREEZE_CONFIGURATION_HASH;
        manifest.integrityCorrections = [
          probabilityBandCorrection({
            originalConfigHash: "deadbeef",
            resolvedConfigHash: manifest.resolvedConfigHash as string,
          }),
        ];
      },
      status: "incomplete-manifest",
    },
    {
      name: "a correction with wrong original probability bounds",
      mutate: (manifest) => {
        manifest.originalConfigHash = ORIGINAL_FREEZE_CONFIGURATION_HASH;
        const correction = probabilityBandCorrection({
          originalConfigHash: ORIGINAL_FREEZE_CONFIGURATION_HASH,
          resolvedConfigHash: manifest.resolvedConfigHash as string,
        });
        nested(correction, "originalProbabilityBounds").maxExclusive = 0.65;
        manifest.integrityCorrections = [correction];
      },
      status: "incomplete-manifest",
    },
    {
      name: "a correction with a wrong resolved probability bucket",
      mutate: (manifest) => {
        manifest.originalConfigHash = ORIGINAL_FREEZE_CONFIGURATION_HASH;
        const correction = probabilityBandCorrection({
          originalConfigHash: ORIGINAL_FREEZE_CONFIGURATION_HASH,
          resolvedConfigHash: manifest.resolvedConfigHash as string,
        });
        nested(correction, "resolvedProbabilityBounds").bucketId = "coarse-prob-0";
        manifest.integrityCorrections = [correction];
      },
      status: "incomplete-manifest",
    },
    {
      name: "an unrecognized correction id",
      mutate: (manifest) => {
        manifest.integrityCorrections = [
          { ...probabilityBandCorrection({
            originalConfigHash: manifest.originalConfigHash as string,
            resolvedConfigHash: manifest.resolvedConfigHash as string,
          }), id: "threshold-retuning-from-forward-returns" },
        ];
      },
      status: "incomplete-manifest",
    },
    {
      name: "duplicated correction ids",
      mutate: (manifest) => {
        const correction = probabilityBandCorrection({
          originalConfigHash: manifest.originalConfigHash as string,
          resolvedConfigHash: manifest.resolvedConfigHash as string,
        });
        manifest.integrityCorrections = [correction, { ...correction }];
      },
      status: "incomplete-manifest",
    },
    {
      name: "an unacceptable conclusion",
      mutate: (manifest) => {
        manifest.conclusion = "defensible-without-manifest";
      },
      status: "unacceptable-conclusion",
    },
    {
      name: "an unsupported manifest version",
      mutate: (manifest) => {
        manifest.version = CALIBRATION_FADE_PROVENANCE_MANIFEST_VERSION + 1;
      },
      status: "unsupported-manifest-version",
    },
  ];

  for (const testCase of cases) {
    it(`reports ${testCase.name} as unavailable provenance`, () => {
      const loaded = loadWithManifest(testCase.mutate);
      expect(loaded.provenanceAvailable).toBe(false);
      expect(loaded.provenance.provenanceStatus).toBe(testCase.status);
      expect(loaded.provenance.verificationModel).toBeNull();
      expect(loaded.provenance.firstForwardEvaluationBoundary).toBeNull();
      expect(loaded.warnings.some((warning) => warning.includes(PROVENANCE_PATH))).toBe(true);
    });
  }

  it("accepts a fully documented probability-band reconciliation when config hashes diverge", () => {
    const loaded = loadWithManifest((manifest) => {
      manifest.originalConfigHash = ORIGINAL_FREEZE_CONFIGURATION_HASH;
      manifest.integrityCorrections = [
        probabilityBandCorrection({
          originalConfigHash: ORIGINAL_FREEZE_CONFIGURATION_HASH,
          resolvedConfigHash: manifest.resolvedConfigHash as string,
        }),
      ];
    });
    expect(loaded.provenanceAvailable).toBe(true);
    expect(loaded.provenance.provenanceStatus).toBe("valid-manifest");
    expect(loaded.provenance.integrityCorrections).toHaveLength(1);
  });

  it("accepts rule-freeze evidence that states in prose that Git is not executed", () => {
    const loaded = loadWithManifest((manifest) => {
      const evidence = nested(manifest, "ruleFreezeEvidence");
      delete evidence.runtimeGitExecuted;
      evidence.description = "Freeze identity is reviewed out of band; Git is not executed at evaluation time.";
    });
    expect(loaded.provenanceAvailable).toBe(true);
  });

  it("rejects rule-freeze evidence that neither declares nor states the no-runtime-Git policy", () => {
    const loaded = loadWithManifest((manifest) => {
      const evidence = nested(manifest, "ruleFreezeEvidence");
      delete evidence.runtimeGitExecuted;
      evidence.description = "Freeze identity was reviewed by the operator.";
    });
    expect(loaded.provenanceAvailable).toBe(false);
    expect(loaded.provenance.provenanceStatus).toBe("incomplete-manifest");
  });
});

describe("parseCalibrationFadeForwardValidationArgv", () => {
  it("requires explicit capture run dir", () => {
    expect(() => parseCalibrationFadeForwardValidationArgv([])).toThrow(
      CalibrationFadeForwardValidationError,
    );
  });
});

describe("causal BTC features", () => {
  const points = [
    { timestampMs: 0, receivedAtLocal: isoAt(0), priceUsd: 100_000 },
    { timestampMs: 60_000, receivedAtLocal: isoAt(60_000), priceUsd: 102_000 },
    { timestampMs: 120_000, receivedAtLocal: isoAt(120_000), priceUsd: 104_000 },
    { timestampMs: 180_000, receivedAtLocal: isoAt(180_000), priceUsd: 130_000 },
  ];

  it("never uses future BTC for joins", () => {
    expect(resolveCausalBtcPrice(points, 30_000, 120_000).priceUsd).toBe(100_000);
    expect(resolveCausalBtcPrice(points, 180_000, 5_000).priceUsd).toBe(130_000);
  });

  it("builds candles only up to timestamp", () => {
    const candles = buildBtcCandlesUpToTimestamp({
      points,
      timestampMs: 90_000,
      barIntervalMs: 60_000,
    });
    expect(candles.length).toBe(2);
  });
});

describe("loadSelectedRunCalibrationFadeContext", () => {
  it("rejects unknown capture run directories", () => {
    const io = createMemoryCalibrationFadeForwardValidationIo({});
    expect(() =>
      loadSelectedRunCalibrationFadeContext({
        io,
        captureRunDir: "data/live-capture/forward-quotes/missing-run",
      }),
    ).toThrow(CalibrationFadeForwardValidationError);
  });

  it("proceeds with matching run-scoped audit when native capture-health.json is missing", () => {
    const realRunDir = "data/live-capture/forward-quotes/2026-07-12T10-18-27-409Z";
    const topPath = `${realRunDir}/top-of-book.jsonl`;
    const btcPath = `${realRunDir}/btc-spot.jsonl`;
    const topContent = topOfBookLine({
      marketTicker: MARKET_A,
      offsetMs: 720_000,
      yesBid: 48,
      yesAsk: 52,
      noAsk: 50,
    });
    const btcContent = btcLine(0, 100_000);
    const topSize = Buffer.byteLength(topContent, "utf8");
    const btcSize = Buffer.byteLength(btcContent, "utf8");
    const io = createMemoryCalibrationFadeForwardValidationIo(
      {
        [topPath]: topContent,
        [btcPath]: btcContent,
        [`${realRunDir}/capture-health-audit.json`]: JSON.stringify({
          selectedRunId: "2026-07-12T10-18-27-409Z",
          captureRunDir: realRunDir,
          sourceRunIds: ["2026-07-12T10-18-27-409Z"],
          analysisVersion: "capture-health-audit-v1",
          inputArtifactIdentities: [
            {
              path: topPath,
              role: "top-of-book",
              sizeBytes: topSize,
              mtimeMs: topSize,
              recordCount: 1,
            },
            {
              path: btcPath,
              role: "btc-spot",
              sizeBytes: btcSize,
              mtimeMs: btcSize,
              recordCount: 1,
            },
          ],
          summary: {
            verdict: "capture-research-ready",
            recommendedNextAction: "proceed-offline-microstructure-research",
            runDurationSeconds: 28_655,
            topOfBookCount: 44_870,
            btcSpotCount: 5_726,
            bookState: { validBookShare: 0.9729, reconnectCount: 0, sequenceGapCount: 0 },
            btcJoin: { joinCoverageShare: 1 },
            continuity: { p90TopOfBookGapMs: 1049 },
          },
        }),
      },
      [realRunDir],
    );

    const context = loadSelectedRunCalibrationFadeContext({
      io,
      captureRunDir: realRunDir,
    });

    expect(context.selectedRunQuality.selectedRunId).toBe("2026-07-12T10-18-27-409Z");
    expect(context.selectedRunQuality.captureHealthSource).toBe("run-scoped-capture-health-audit");
    expect(context.selectedRunQuality.captureVerdict).toBe("capture-research-ready");
    expect(context.selectedRunQuality.runDurationSeconds).toBe(28_655);
    expect(context.selectedRunQuality.btcJoinCoverageShare).toBe(1);
    expect(context.selectedRunQuality.validBookShare).toBe(0.9729);
  });

  it("rejects degraded run-scoped audit when native health is missing", () => {
    const realRunDir = "data/live-capture/forward-quotes/degraded-audit-run";
    const io = createMemoryCalibrationFadeForwardValidationIo(
      {
        [`${realRunDir}/top-of-book.jsonl`]: "{}",
        [`${realRunDir}/btc-spot.jsonl`]: "{}",
        [`${realRunDir}/capture-health-audit.json`]: JSON.stringify({
          selectedRunId: "degraded-audit-run",
          captureRunDir: realRunDir,
          sourceRunIds: ["degraded-audit-run"],
          analysisVersion: "capture-health-audit-v1",
          inputArtifactIdentities: [],
          summary: {
            verdict: "capture-gappy",
            recommendedNextAction: "fix-capture-gaps",
            runDurationSeconds: 3600,
            topOfBookCount: 1,
            btcSpotCount: 1,
            bookState: { validBookShare: 0.5, reconnectCount: 0, sequenceGapCount: 100 },
            btcJoin: { joinCoverageShare: 0.5 },
            continuity: { p90TopOfBookGapMs: 5000 },
          },
        }),
      },
      [realRunDir],
    );

    expect(() =>
      loadSelectedRunCalibrationFadeContext({ io, captureRunDir: realRunDir }),
    ).toThrow(/capture-research-ready required/);
  });

  it("rejects mismatched run-scoped audit for selected run", () => {
    const realRunDir = "data/live-capture/forward-quotes/mismatch-audit-run";
    const io = createMemoryCalibrationFadeForwardValidationIo(
      {
        [`${realRunDir}/top-of-book.jsonl`]: "{}",
        [`${realRunDir}/btc-spot.jsonl`]: "{}",
        [`${realRunDir}/capture-health-audit.json`]: JSON.stringify({
          selectedRunId: "other-run",
          sourceRunIds: ["other-run"],
          summary: {
            verdict: "capture-research-ready",
            bookState: { validBookShare: 0.99, reconnectCount: 0, sequenceGapCount: 0 },
            btcJoin: { joinCoverageShare: 1 },
          },
        }),
      },
      [realRunDir],
    );

    expect(() =>
      loadSelectedRunCalibrationFadeContext({ io, captureRunDir: realRunDir }),
    ).toThrow(/Missing capture health source/);
  });
});

describe("analyzeCalibrationFadeForwardForRun", () => {
  it("deduplicates repeated qualifying snapshots and uses first entry", async () => {
    const fixture = buildRegressionFixture();
    const io = createMemoryCalibrationFadeForwardValidationIo(fixture.files, fixture.dirs);
    const { report, eventLines } = await analyzeCalibrationFadeForwardForRun({
      generatedAt: "2026-07-12T08:00:00.000Z",
      outputPath: "data/research-results/calibration-fade-forward-validation.json",
      htmlOutputPath: "data/reports/calibration-fade-forward-validation.html",
      config: {
        captureRunDir: RUN_DIR,
        hypothesisConfigPath: DEFAULT_CALIBRATION_FADE_HYPOTHESIS_CONFIG_PATH,
        importsDir: "data/imports",
        maximumBtcJoinAgeMs: 5000,
        eventsOutputPath: "data/research-results/calibration-fade-forward-events.jsonl",
        marketsOutputPath: "data/research-results/calibration-fade-forward-markets.jsonl",
      },
      io,
    });

    expect(report.analysisScope).toBe("selected-run");
    expect(report.sourceRunIds).toEqual(["run-calibration-fade"]);
    expect(report.qualifyingObservationCount).toBeGreaterThanOrEqual(3);
    expect(report.candidateEpisodeCount).toBe(2);
    expect(report.candidateMarketCount).toBe(2);
    expect(report.historicalBenchmark.discoveryObservationCount).toBe(273);
    expect(report.historicalBenchmark.discoveryUniqueTradingDays).toBe(37);
    expect(eventLines.some((line) => line.includes("market-entry"))).toBe(true);
  });

  it("reports a monotonic sequential funnel and independent gate pass counts", async () => {
    const fixture = buildRegressionFixture();
    const io = createMemoryCalibrationFadeForwardValidationIo(fixture.files, fixture.dirs);
    const { report } = await analyzeCalibrationFadeForwardForRun({
      generatedAt: "2026-07-12T08:00:00.000Z",
      outputPath: "data/research-results/calibration-fade-forward-validation.json",
      htmlOutputPath: "data/reports/calibration-fade-forward-validation.html",
      config: {
        captureRunDir: RUN_DIR,
        hypothesisConfigPath: DEFAULT_CALIBRATION_FADE_HYPOTHESIS_CONFIG_PATH,
        importsDir: "data/imports",
        maximumBtcJoinAgeMs: 5000,
        eventsOutputPath: "data/research-results/calibration-fade-forward-events.jsonl",
        marketsOutputPath: "data/research-results/calibration-fade-forward-markets.jsonl",
      },
      io,
    });

    const sequentialCounts = report.funnel.map((stage) => stage.count);
    for (let index = 1; index < sequentialCounts.length; index += 1) {
      expect(sequentialCounts[index]).toBeLessThanOrEqual(sequentialCounts[index - 1]!);
    }
    expect(report.gatePassCounts.validBook).toBeGreaterThanOrEqual(
      report.funnel.find((stage) => stage.stageId === "qualifying-observation")?.count ?? 0,
    );
    expect(
      report.funnel.find((stage) => stage.stageId === "qualifying-observation")?.count,
    ).toBe(report.qualifyingObservationCount);
  });

  it("counts executable entry available before settlement joins (real-run shape)", async () => {
    const btcSpots = denseHighVolBtcSpots();
    const io = createMemoryCalibrationFadeForwardValidationIo(
      freezeFixtureFiles({
        [`${RUN_DIR}/capture-health.json`]: JSON.stringify({
          runId: "run-calibration-fade",
          config: { durationSeconds: 3600 },
          orderbook: { validTopOfBookRecords: 1, reconnectCount: 0, sequenceGapCount: 0 },
        }),
        [`${RUN_DIR}/market-metadata.jsonl`]: JSON.stringify({
          marketTicker: MARKET_A,
          closeTime: isoAt(1_200_000),
        }),
        [`${RUN_DIR}/top-of-book.jsonl`]: topOfBookLine({
          marketTicker: MARKET_A,
          offsetMs: 720_000,
          yesBid: 55,
          yesAsk: 57,
          noAsk: 43,
        }),
        [`${RUN_DIR}/btc-spot.jsonl`]: btcSpots,
        [`${RUN_DIR}/capture-health-audit.json`]: JSON.stringify({
          selectedRunId: "run-calibration-fade",
          captureRunDir: RUN_DIR,
          sourceRunIds: ["run-calibration-fade"],
          analysisVersion: "capture-health-audit-v1",
          inputArtifactIdentities: [],
          summary: {
            verdict: "capture-research-ready",
            recommendedNextAction: "proceed-offline-microstructure-research",
            runDurationSeconds: 3600,
            topOfBookCount: 1,
            btcSpotCount: 16,
            bookState: { validBookShare: 0.99, reconnectCount: 0, sequenceGapCount: 0 },
            btcJoin: { joinCoverageShare: 1 },
            continuity: { p90TopOfBookGapMs: 1000 },
          },
        }),
      }),
      [RUN_DIR],
    );

    const { report, marketLines } = await analyzeCalibrationFadeForwardForRun({
      generatedAt: "2026-07-12T08:00:00.000Z",
      outputPath: "data/research-results/calibration-fade-forward-validation.json",
      htmlOutputPath: "data/reports/calibration-fade-forward-validation.html",
      config: {
        captureRunDir: RUN_DIR,
        hypothesisConfigPath: DEFAULT_CALIBRATION_FADE_HYPOTHESIS_CONFIG_PATH,
        importsDir: "data/imports",
        maximumBtcJoinAgeMs: 5000,
        eventsOutputPath: "data/research-results/calibration-fade-forward-events.jsonl",
        marketsOutputPath: "data/research-results/calibration-fade-forward-markets.jsonl",
      },
      io,
    });

    expect(report.candidateMarketCount).toBe(1);
    expect(report.forwardBenchmark.executable.executableEntryAvailableCount).toBe(1);
    expect(report.forwardBenchmark.executable.unavailableExecutablePriceCount).toBe(0);
    expect(report.forwardBenchmark.executable.evaluatedExecutableCandidateCount).toBe(0);
    expect(report.funnel.find((stage) => stage.stageId === "independent-market")?.count).toBe(1);
    expect(report.funnel.find((stage) => stage.stageId === "executable-entry")?.count).toBe(1);
    expect(report.funnel.find((stage) => stage.stageId === "settlement-joined")?.count).toBe(0);
    expect(report.funnel.find((stage) => stage.stageId === "evaluated-candidate")?.count).toBe(0);
    const marketRecord = JSON.parse(marketLines[0] ?? "{}") as {
      noAskCents: number;
      executableAvailable: boolean;
      settlementStatus: string;
    };
    expect(marketRecord.noAskCents).toBe(43);
    expect(marketRecord.executableAvailable).toBe(true);
    expect(marketRecord.settlementStatus).toBe("missing-source");
  });

  it("computes NO-entry settlement returns at 43 cents after settlement joins", async () => {
    const btcSpots = denseHighVolBtcSpots();
    const io = createMemoryCalibrationFadeForwardValidationIo(
      freezeFixtureFiles({
        [`${RUN_DIR}/capture-health.json`]: JSON.stringify({
          runId: "run-calibration-fade",
          config: { durationSeconds: 3600 },
          orderbook: { validTopOfBookRecords: 1, reconnectCount: 0, sequenceGapCount: 0 },
        }),
        [`${RUN_DIR}/market-metadata.jsonl`]: JSON.stringify({
          marketTicker: MARKET_A,
          closeTime: isoAt(1_200_000),
        }),
        [`${RUN_DIR}/top-of-book.jsonl`]: topOfBookLine({
          marketTicker: MARKET_A,
          offsetMs: 720_000,
          yesBid: 55,
          yesAsk: 57,
          noAsk: 43,
        }),
        [`${RUN_DIR}/btc-spot.jsonl`]: btcSpots,
        [`${RUN_DIR}/capture-health-audit.json`]: JSON.stringify({
          selectedRunId: "run-calibration-fade",
          captureRunDir: RUN_DIR,
          sourceRunIds: ["run-calibration-fade"],
          analysisVersion: "capture-health-audit-v1",
          inputArtifactIdentities: [],
          summary: {
            verdict: "capture-research-ready",
            recommendedNextAction: "proceed-offline-microstructure-research",
            runDurationSeconds: 3600,
            topOfBookCount: 1,
            btcSpotCount: 16,
            bookState: { validBookShare: 0.99, reconnectCount: 0, sequenceGapCount: 0 },
            btcJoin: { joinCoverageShare: 1 },
            continuity: { p90TopOfBookGapMs: 1000 },
          },
        }),
        [`data/imports/KXBTC15M/${MARKET_A}/import-result.json`]: JSON.stringify({
          metadata: { valid: true, settlementPresent: true },
          bronzeRecords: [
            {
              ticker: MARKET_A,
              contentType: "kalshi.historical.settlement",
              payload: { result: "no", settlement_ts: isoAt(700_000) },
            },
          ],
        }),
      }),
      [RUN_DIR, "data/imports", `data/imports/KXBTC15M/${MARKET_A}`],
    );

    const { report, marketLines } = await analyzeCalibrationFadeForwardForRun({
      generatedAt: "2026-07-12T08:00:00.000Z",
      outputPath: "data/research-results/calibration-fade-forward-validation.json",
      htmlOutputPath: "data/reports/calibration-fade-forward-validation.html",
      config: {
        captureRunDir: RUN_DIR,
        hypothesisConfigPath: DEFAULT_CALIBRATION_FADE_HYPOTHESIS_CONFIG_PATH,
        importsDir: "data/imports",
        maximumBtcJoinAgeMs: 5000,
        eventsOutputPath: "data/research-results/calibration-fade-forward-events.jsonl",
        marketsOutputPath: "data/research-results/calibration-fade-forward-markets.jsonl",
      },
      io,
    });

    expect(report.forwardBenchmark.executable.executableEntryAvailableCount).toBe(1);
    expect(report.forwardBenchmark.executable.evaluatedExecutableCandidateCount).toBe(1);
    expect(report.funnel.find((stage) => stage.stageId === "settlement-joined")?.count).toBe(1);
    expect(report.funnel.find((stage) => stage.stageId === "evaluated-candidate")?.count).toBe(1);

    const marketRecord = JSON.parse(marketLines[0] ?? "{}") as {
      noAskCents: number;
      grossReturnCents: number;
      feeAdjustedReturnCents: number;
      settledOutcome: string;
    };
    expect(marketRecord.noAskCents).toBe(43);
    expect(marketRecord.settledOutcome).toBe("no");
    expect(marketRecord.grossReturnCents).toBe(57);
    expect(marketRecord.feeAdjustedReturnCents).toBe(56);
  });

  it("rejects the July 20 zero-candidate gappy run instead of asking for more data", async () => {
    const fixture = buildRegressionFixture();
    const files = { ...fixture.files };
    // Zero-candidate shape: one valid book snapshot outside the probability band.
    files[`${RUN_DIR}/top-of-book.jsonl`] = topOfBookLine({
      marketTicker: MARKET_A,
      offsetMs: 720_000,
      yesBid: 20,
      yesAsk: 22,
    });
    files[`${RUN_DIR}/capture-health.json`] = JSON.stringify({
      runId: "run-calibration-fade",
      verdict: "capture-mvp-success",
      recommendedNextAction: "continue-capture",
      startedAt: "2026-07-20T00:00:00.000Z",
      endedAt: "2026-07-20T08:00:00.000Z",
      config: { durationSeconds: 28_800 },
      connection: {
        captureEndReason: "duration-complete",
        terminalFailureReason: null,
        completedNormally: true,
      },
      orderbook: { validTopOfBookRecords: 37_288, sequenceGapCount: 3_404_777 },
      capture: { topOfBookRecordCount: 45_055 },
    });
    files[`${RUN_DIR}/capture-health-audit.json`] = JSON.stringify({
      selectedRunId: "run-calibration-fade",
      captureRunDir: RUN_DIR,
      sourceRunIds: ["run-calibration-fade"],
      analysisVersion: "capture-health-audit-v1",
      inputArtifactIdentities: [],
      summary: {
        verdict: "capture-gappy",
        recommendedNextAction: "repair-capture-continuity",
        runDurationSeconds: 28_800,
        topOfBookCount: 45_055,
        btcSpotCount: 5_755,
        bookState: { validBookShare: 0.8276, reconnectCount: 0, sequenceGapCount: 3_404_777 },
        btcJoin: { joinCoverageShare: 1 },
        continuity: { p90TopOfBookGapMs: 1018, maxTopOfBookGapMs: 59_295 },
      },
    });
    const io = createMemoryCalibrationFadeForwardValidationIo(files, fixture.dirs);

    const { report } = await analyzeCalibrationFadeForwardForRun({
      generatedAt: "2026-07-20T09:00:00.000Z",
      outputPath: "data/research-results/calibration-fade-forward-validation.json",
      htmlOutputPath: "data/reports/calibration-fade-forward-validation.html",
      config: {
        captureRunDir: RUN_DIR,
        hypothesisConfigPath: DEFAULT_CALIBRATION_FADE_HYPOTHESIS_CONFIG_PATH,
        importsDir: "data/imports",
        maximumBtcJoinAgeMs: 5000,
        eventsOutputPath: "data/research-results/calibration-fade-forward-events.jsonl",
        marketsOutputPath: "data/research-results/calibration-fade-forward-markets.jsonl",
      },
      io,
    });

    expect(report.candidateMarketCount).toBe(0);
    expect(report.selectedRunQuality.captureVerdict).toBe("capture-gappy");
    expect(report.selectedRunQuality.validBookShare).toBe(0.8276);
    expect(report.selectedRunQuality.sequenceGapCount).toBe(3_404_777);
    expect(report.selectedRunQuality.runDurationSeconds).toBe(28_800);
    expect(report.summary.interpretationClassification).toBe("observation-quality-inconclusive");
    expect(report.summary.recommendedNextAction).toBe("repair-or-replace-invalid-forward-runs");
    expect(report.summary.interpretationClassification).not.toBe("insufficient-forward-events");
    expect(report.summary.recommendedNextAction).not.toBe(
      "collect-additional-clean-forward-captures",
    );
  });
});

describe("classifyCalibrationFadeInterpretation", () => {
  const spec = JSON.parse(freezeSpecContent()) as FrozenHypothesisSpec;
  spec.configurationHash = "test";

  function classifyInput(overrides: {
    candidateMarketCount?: number;
    quality?: Partial<Parameters<typeof classifyCalibrationFadeInterpretation>[0]["selectedRunQuality"]>;
    calibration?: Partial<Parameters<typeof classifyCalibrationFadeInterpretation>[0]["calibration"]>;
    executable?: Partial<Parameters<typeof classifyCalibrationFadeInterpretation>[0]["executable"]>;
  } = {}): Parameters<typeof classifyCalibrationFadeInterpretation>[0] {
    return {
      spec,
      provenanceAvailable: true,
      featureIncompatible: false,
      candidateMarketCount: overrides.candidateMarketCount ?? 1,
      settlementCoverage: {
        candidateMarketCount: 1,
        settledCandidateMarketCount: 1,
        joinedCandidateMarketCount: 1,
        unresolvedCandidateMarketCount: 0,
        settlementCoverageShare: 1,
        excludedByReason: {},
      },
      selectedRunQuality: {
        selectedRunId: "run",
        captureHealthSource: "native-capture-health",
        runDurationSeconds: 3600,
        validBookShare: 0.99,
        btcJoinCoverageShare: 1,
        bidSizeCoverageShare: null,
        reconnectCount: 0,
        sequenceGapCount: 0,
        suspectedSystemSleepSeconds: 0,
        captureVerdict: "capture-research-ready",
        reconciliationVerdict: null,
        nativeCaptureVerdict: "capture-mvp-success",
        captureEndReason: "duration-complete",
        terminalFailureReason: null,
        completedNormally: true,
        researchReadyVerified: true,
        auditFingerprintsVerified: true,
        ...overrides.quality,
      },
      calibration: {
        qualifyingObservationCount: 3,
        candidateEpisodeCount: 1,
        candidateMarketCount: 1,
        meanImpliedYesProbability: 0.5,
        meanTargetSideProbability: null,
        observedYesSettlementRate: null,
        observedTargetSideSettlementRate: null,
        calibrationGap: null,
        signedCalibrationGap: null,
        brierScore: null,
        logLoss: null,
        marketLevelSignedCalibrationGap: null,
        descriptiveObservationSignedGap: null,
        ...overrides.calibration,
      },
      executable: {
        executableCandidateCount: 0,
        evaluatedExecutableCandidateCount: 0,
        executableEntryAvailableCount: 0,
        unavailableExecutablePriceCount: 1,
        grossReturnCents: null,
        feeAdjustedReturnCents: null,
        winRate: null,
        averageEntryPriceCents: null,
        medianEntryPriceCents: null,
        maximumDrawdownCents: null,
        cumulativeReturnCents: null,
        ...overrides.executable,
      },
    };
  }

  it("classifies insufficient forward events", () => {
    const result = classifyCalibrationFadeInterpretation(classifyInput());
    expect(result.interpretationClassification).toBe("insufficient-forward-events");
  });

  it("puts capture-gappy observation quality before insufficient forward events (July 20 shape)", () => {
    const result = classifyCalibrationFadeInterpretation(
      classifyInput({
        candidateMarketCount: 0,
        quality: {
          captureVerdict: "capture-gappy",
          researchReadyVerified: false,
          runDurationSeconds: 28_800,
          validBookShare: 0.8276,
          sequenceGapCount: 3_404_777,
        },
      }),
    );
    expect(result.interpretationClassification).toBe("observation-quality-inconclusive");
    expect(result.recommendedNextAction).toBe("repair-or-replace-invalid-forward-runs");
    expect(result.rationale).toContain("capture-gappy");
  });

  it("does not treat a null capture verdict as research-ready", () => {
    const result = classifyCalibrationFadeInterpretation(
      classifyInput({
        quality: { captureVerdict: null, researchReadyVerified: false },
      }),
    );
    expect(result.interpretationClassification).toBe("observation-quality-inconclusive");
    expect(result.recommendedNextAction).toBe("repair-or-replace-invalid-forward-runs");
  });

  it("blocks formal use when the ready verdict is not verified", () => {
    const result = classifyCalibrationFadeInterpretation(
      classifyInput({
        quality: {
          captureVerdict: "capture-research-ready",
          researchReadyVerified: false,
          auditFingerprintsVerified: false,
        },
      }),
    );
    expect(result.interpretationClassification).toBe("observation-quality-inconclusive");
    expect(result.recommendedNextAction).toBe("repair-or-replace-invalid-forward-runs");
    expect(result.rationale).toContain("provenance or freshness");
  });

  it("treats a null required quality metric as unverified, not passing", () => {
    for (const quality of [
      { validBookShare: null },
      { btcJoinCoverageShare: null },
    ]) {
      const result = classifyCalibrationFadeInterpretation(classifyInput({ quality }));
      expect(result.interpretationClassification).toBe("observation-quality-inconclusive");
      expect(result.recommendedNextAction).toBe("fix-forward-observation-integrity");
    }
  });

  it("fails closed on terminal failure or abnormal completion", () => {
    for (const quality of [
      { terminalFailureReason: "ws-close-1006" },
      { completedNormally: false },
    ]) {
      const result = classifyCalibrationFadeInterpretation(classifyInput({ quality }));
      expect(result.interpretationClassification).toBe("observation-quality-inconclusive");
      expect(result.recommendedNextAction).toBe("fix-forward-observation-integrity");
    }
  });

  it("reaches calibration-only support when executable evidence is unavailable", () => {
    const result = classifyCalibrationFadeInterpretation(
      classifyInput({
        candidateMarketCount: 5,
        calibration: { marketLevelSignedCalibrationGap: 0.05 },
        executable: { evaluatedExecutableCandidateCount: 0, feeAdjustedReturnCents: null },
      }),
    );
    expect(result.interpretationClassification).toBe("forward-supports-calibration-effect");
    expect(result.recommendedNextAction).toBe(
      "build-executable-calibration-fade-candidate-dataset",
    );
  });

  it("contradicts executability only on evaluated negative executable evidence", () => {
    const result = classifyCalibrationFadeInterpretation(
      classifyInput({
        candidateMarketCount: 5,
        calibration: { marketLevelSignedCalibrationGap: 0.05 },
        executable: { evaluatedExecutableCandidateCount: 3, feeAdjustedReturnCents: -44 },
      }),
    );
    expect(result.interpretationClassification).toBe("forward-contradicts-executability");
  });

  it("supports executable fade on evaluated positive executable evidence", () => {
    const result = classifyCalibrationFadeInterpretation(
      classifyInput({
        candidateMarketCount: 5,
        calibration: { marketLevelSignedCalibrationGap: 0.05 },
        executable: { evaluatedExecutableCandidateCount: 3, feeAdjustedReturnCents: 10 },
      }),
    );
    expect(result.interpretationClassification).toBe("forward-supports-executable-fade");
  });
});

describe("frozen hypothesis integrity", () => {
  it("keeps frozen Hypothesis #3 identity and reconciles probability to exact thirds", () => {
    const raw = readFileSync(DEFAULT_CALIBRATION_FADE_HYPOTHESIS_CONFIG_PATH, "utf8");
    const frozen = JSON.parse(raw) as Record<string, unknown>;
    expect(frozen.hypothesisId).toBe(HYPOTHESIS_ID);
    expect(frozen.hypothesisVersion).toBe("v1");
    expect(frozen.calibrationDirection).toBe("over");
    expect(frozen.targetOutcomeSide).toBe("no");
    expect(frozen.minimumEvidenceRequirements).toEqual({
      minimumIndependentCandidateMarkets: 5,
      minimumSettlementCoverageShare: 0.8,
      minimumValidBookShare: 0.9,
      minimumBtcJoinCoverageShare: 0.9,
      materialRejectionCalibrationGap: 0.05,
      materialSupportCalibrationGap: 0.03,
      materialExecutableNetReturnCents: 1,
    });
    const probability = (frozen.eligibilityRules as Record<string, Record<string, number>>).probability;
    expect(probability.minInclusive).toBe(1 / 3);
    expect(probability.maxExclusive).toBe(2 / 3);
    expect(probability.minInclusive).not.toBe(0.3);
    expect(probability.maxExclusive).not.toBe(0.7);
    const registered = buildCoarseProbabilityAxisDefinitions().find((entry) => entry.bucketId === "coarse-prob-1")!;
    expect(probability.minInclusive).toBe(registered.minInclusive);
    expect(probability.maxExclusive).toBe(registered.maxExclusive);
  });
});

describe("authoritative probability band", () => {
  it("accepts exact middle-third boundaries and rejects outside", () => {
    const files = freezeFixtureFiles();
    const io = createMemoryCalibrationFadeForwardValidationIo(files);
    const { spec } = loadFrozenHypothesisSpec({ io });
    const bands = resolveFrozenEligibilityBands(spec);
    expect(probabilityInAuthoritativeBand(1 / 3 - 1e-12, bands.probability)).toBe(false);
    expect(probabilityInAuthoritativeBand(1 / 3, bands.probability)).toBe(true);
    expect(probabilityInAuthoritativeBand(0.5, bands.probability)).toBe(true);
    expect(probabilityInAuthoritativeBand(2 / 3 - 1e-12, bands.probability)).toBe(true);
    expect(probabilityInAuthoritativeBand(2 / 3, bands.probability)).toBe(false);
    expect(probabilityInAuthoritativeBand(0.7, bands.probability)).toBe(false);
  });

  it("fails closed when config bounds disagree with registered bucket", () => {
    const freeze = freezeSpecContent({
      eligibilityRules: {
        volatility: { bucketId: "vol-high", minInclusive: 0.6, maxExclusive: null },
        probability: { bucketId: "coarse-prob-1", minInclusive: 0.3, maxExclusive: 0.7 },
        timeRemainingMs: { bucketId: "coarse-time-early", minInclusive: 0, maxExclusive: 900000 },
      },
    });
    const hash = configurationHashForFreeze(freeze);
    const io = createMemoryCalibrationFadeForwardValidationIo({
      [DEFAULT_CALIBRATION_FADE_HYPOTHESIS_CONFIG_PATH]: freeze,
      [PROVENANCE_PATH]: provenanceManifestContent(hash),
    });
    const { spec } = loadFrozenHypothesisSpec({ io });
    expect(() => resolveFrozenEligibilityBands(spec)).toThrow(/Probability bounds disagree/);
  });
});

describe("requireOpenMarket semantics", () => {
  it("passes 14 minutes before close and fails at/after close or missing close", () => {
    const closeTimeMs = BASE_MS + 900_000;
    expect(
      evaluateOpenMarket({
        timestampMs: closeTimeMs - 14 * 60_000,
        closeTimeMs,
        requireOpenMarket: true,
      }),
    ).toMatchObject({ openMarket: true, timeRemainingMs: 14 * 60_000 });

    expect(
      evaluateOpenMarket({
        timestampMs: closeTimeMs,
        closeTimeMs,
        requireOpenMarket: true,
      }).openMarket,
    ).toBe(false);

    expect(
      evaluateOpenMarket({
        timestampMs: closeTimeMs + 1,
        closeTimeMs,
        requireOpenMarket: true,
      }),
    ).toMatchObject({ openMarket: false, timeRemainingMs: -1 });

    expect(
      evaluateOpenMarket({
        timestampMs: BASE_MS,
        closeTimeMs: null,
        requireOpenMarket: true,
      }).openMarket,
    ).toBe(false);

    expect(
      evaluateOpenMarket({
        timestampMs: BASE_MS,
        closeTimeMs: Number.NaN,
        requireOpenMarket: true,
      }).openMarket,
    ).toBe(false);

    expect(
      evaluateOpenMarket({
        timestampMs: closeTimeMs + 1,
        closeTimeMs,
        requireOpenMarket: false,
      }).openMarket,
    ).toBe(true);
  });

  it("does not clamp post-close quotes into the time band", async () => {
    const btcSpots = denseHighVolBtcSpots();
    const io = createMemoryCalibrationFadeForwardValidationIo(
      freezeFixtureFiles({
        [`${RUN_DIR}/capture-health.json`]: JSON.stringify({
          runId: "run-calibration-fade",
          config: { durationSeconds: 3600 },
          orderbook: { validTopOfBookRecords: 1, reconnectCount: 0, sequenceGapCount: 0 },
        }),
        [`${RUN_DIR}/market-metadata.jsonl`]: JSON.stringify({
          marketTicker: MARKET_A,
          closeTime: isoAt(600_000),
        }),
        [`${RUN_DIR}/top-of-book.jsonl`]: topOfBookLine({
          marketTicker: MARKET_A,
          offsetMs: 720_000,
          yesBid: 48,
          yesAsk: 52,
          noAsk: 50,
        }),
        [`${RUN_DIR}/btc-spot.jsonl`]: btcSpots,
        [`${RUN_DIR}/capture-health-audit.json`]: JSON.stringify({
          selectedRunId: "run-calibration-fade",
          captureRunDir: RUN_DIR,
          sourceRunIds: ["run-calibration-fade"],
          analysisVersion: "capture-health-audit-v1",
          inputArtifactIdentities: [],
          summary: {
            verdict: "capture-research-ready",
            recommendedNextAction: "proceed-offline-microstructure-research",
            runDurationSeconds: 3600,
            topOfBookCount: 1,
            btcSpotCount: 16,
            bookState: { validBookShare: 0.99, reconnectCount: 0, sequenceGapCount: 0 },
            btcJoin: { joinCoverageShare: 1 },
            continuity: { p90TopOfBookGapMs: 1000 },
          },
        }),
      }),
      [RUN_DIR],
    );

    const { report } = await analyzeCalibrationFadeForwardForRun({
      generatedAt: "2026-07-12T08:00:00.000Z",
      outputPath: "data/research-results/calibration-fade-forward-validation.json",
      htmlOutputPath: "data/reports/calibration-fade-forward-validation.html",
      config: {
        captureRunDir: RUN_DIR,
        hypothesisConfigPath: DEFAULT_CALIBRATION_FADE_HYPOTHESIS_CONFIG_PATH,
        importsDir: "data/imports",
        maximumBtcJoinAgeMs: 5000,
        eventsOutputPath: "data/research-results/calibration-fade-forward-events.jsonl",
        marketsOutputPath: "data/research-results/calibration-fade-forward-markets.jsonl",
      },
      io,
    });

    expect(report.candidateMarketCount).toBe(0);
    expect(report.gatePassCounts.openMarket).toBe(0);
    expect(report.qualifyingObservationCount).toBe(0);
  });
});

describe("validated causal volatility window", () => {
  const QUOTE_MS = 11 * 60_000;
  const WINDOW_START_MS = 60_000;

  type SpotPoint = { timestampMs: number; receivedAtLocal: string; priceUsd: number };

  function pointsAt(timestamps: readonly number[]): SpotPoint[] {
    return timestamps.map((timestampMs) => ({
      timestampMs,
      receivedAtLocal: new Date(timestampMs).toISOString(),
      priceUsd: priceAt(timestampMs),
    }));
  }

  function timestampRange(startMs: number, endMs: number, stepMs = 1_000): number[] {
    const timestamps: number[] = [];
    for (let timestampMs = startMs; timestampMs <= endMs; timestampMs += stepMs) {
      timestamps.push(timestampMs);
    }
    return timestamps;
  }

  function densePoints(startMs: number, endMs: number, stepMs = 1_000): SpotPoint[] {
    return pointsAt(timestampRange(startMs, endMs, stepMs));
  }

  function buildWindow(
    points: readonly SpotPoint[],
    timestampMs: number,
    overrides: Partial<{ barIntervalMs: number; lookbackBars: number; maximumSourceGapMs: number }> = {},
  ) {
    return buildValidatedCausalVolatilityWindow({
      points,
      timestampMs,
      barIntervalMs: 60_000,
      lookbackBars: 10,
      maximumSourceGapMs: 5_000,
      ...overrides,
    });
  }

  it("accepts exactly lookbackBars + 1 consecutive minute bars", () => {
    const window = buildWindow(densePoints(0, QUOTE_MS), QUOTE_MS);
    expect(window.available).toBe(true);
    expect(window.rejectionReason).toBeNull();
    expect(window.barCount).toBe(11);
    expect(window.windowStartMs).toBe(WINDOW_START_MS);
    expect(window.windowEndMs).toBe(QUOTE_MS);
    expect(window.sourcePointCount).toBe(601);
    expect(window.firstSelectedSourceTimestampMs).toBe(WINDOW_START_MS);
    expect(window.lastSelectedSourceTimestampMs).toBe(QUOTE_MS);
    expect(window.maximumObservedSourceGapMs).toBe(1_000);
    expect(window.futurePointCount).toBe(0);
    expect(window.duplicatePointCount).toBe(0);
    expect(window.includesInProgressMinuteBar).toBe(true);
    expect(window.annualizedVolatility).toBeGreaterThan(0.6);
  });

  it("rejects ten bars with insufficient-bars", () => {
    const window = buildWindow(densePoints(0, 9 * 60_000), 9 * 60_000);
    expect(window.available).toBe(false);
    expect(window.rejectionReason).toBe("insufficient-bars");
    expect(window.barCount).toBe(10);
    expect(window.windowStartMs).toBeNull();
  });

  it("rejects too few causal source points with insufficient-source-points", () => {
    const window = buildWindow(pointsAt([0, 60_000, 120_000, 180_000]), 180_000);
    expect(window.available).toBe(false);
    expect(window.rejectionReason).toBe("insufficient-source-points");
    expect(window.sourcePointCount).toBe(4);
    expect(window.barCount).toBe(0);
  });

  it("rejects an absent minute bucket with missing-minute-bucket", () => {
    const window = buildWindow(
      densePoints(0, QUOTE_MS).filter(
        (point) => point.timestampMs < 5 * 60_000 || point.timestampMs >= 6 * 60_000,
      ),
      QUOTE_MS,
    );
    expect(window.available).toBe(false);
    expect(window.rejectionReason).toBe("missing-minute-bucket");
    expect(window.barCount).toBe(11);
    expect(window.windowStartMs).toBe(0);
    // The consecutiveness violation is reported before any gap arithmetic runs.
    expect(window.maximumObservedSourceGapMs).toBeNull();
  });

  it("accepts a leading boundary gap of exactly maximumSourceGapMs behind the window", () => {
    const window = buildWindow(densePoints(0, QUOTE_MS, 5_000), QUOTE_MS);
    expect(window.available).toBe(true);
    expect(window.maximumObservedSourceGapMs).toBe(5_000);
    expect(window.firstSelectedSourceTimestampMs).toBe(WINDOW_START_MS);
  });

  it("accepts an internal source gap of exactly maximumSourceGapMs", () => {
    const points = pointsAt(
      timestampRange(0, QUOTE_MS).filter(
        (timestampMs) => timestampMs < 300_000 || timestampMs > 303_000,
      ),
    );
    const window = buildWindow(points, QUOTE_MS);
    expect(window.available).toBe(true);
    expect(window.maximumObservedSourceGapMs).toBe(5_000);
  });

  it("rejects an internal source gap of maximumSourceGapMs + 1", () => {
    const points = pointsAt([
      ...timestampRange(0, 299_000),
      304_001,
      ...timestampRange(305_000, QUOTE_MS),
    ]);
    const window = buildWindow(points, QUOTE_MS);
    expect(window.available).toBe(false);
    expect(window.rejectionReason).toBe("source-gap-exceeded");
    expect(window.maximumObservedSourceGapMs).toBe(5_001);
  });

  it("measures the leading boundary gap from the window start when no predecessor exists", () => {
    const accepted = buildWindow(
      pointsAt([65_000, ...timestampRange(66_000, QUOTE_MS)]),
      QUOTE_MS,
    );
    expect(accepted.available).toBe(true);
    expect(accepted.windowStartMs).toBe(WINDOW_START_MS);
    expect(accepted.firstSelectedSourceTimestampMs).toBe(65_000);
    expect(accepted.maximumObservedSourceGapMs).toBe(5_000);

    const rejected = buildWindow(
      pointsAt([65_001, ...timestampRange(66_000, QUOTE_MS)]),
      QUOTE_MS,
    );
    expect(rejected.available).toBe(false);
    expect(rejected.rejectionReason).toBe("source-gap-exceeded");
    expect(rejected.maximumObservedSourceGapMs).toBe(5_001);
  });

  it("measures the trailing gap from the last selected point to the quote", () => {
    const points = densePoints(0, QUOTE_MS);

    const accepted = buildWindow(points, QUOTE_MS + 5_000);
    expect(accepted.available).toBe(true);
    expect(accepted.lastSelectedSourceTimestampMs).toBe(QUOTE_MS);
    expect(accepted.windowEndMs).toBe(QUOTE_MS);
    expect(accepted.maximumObservedSourceGapMs).toBe(5_000);
    expect(accepted.includesInProgressMinuteBar).toBe(true);

    const rejected = buildWindow(points, QUOTE_MS + 6_000);
    expect(rejected.available).toBe(false);
    expect(rejected.rejectionReason).toBe("source-gap-exceeded");
    expect(rejected.maximumObservedSourceGapMs).toBe(6_000);
  });

  it("ignores invalid prices that fall behind the evaluated window", () => {
    const clean = buildWindow(densePoints(0, QUOTE_MS), QUOTE_MS);
    const points = densePoints(0, QUOTE_MS);
    points[0] = { ...points[0]!, priceUsd: 0 };
    points[30] = { ...points[30]!, priceUsd: Number.NaN };

    const window = buildWindow(points, QUOTE_MS);
    expect(window.available).toBe(true);
    expect(window.rejectionReason).toBeNull();
    expect(window.annualizedVolatility).toBe(clean.annualizedVolatility);
  });

  it("rejects an invalid price inside the evaluated window", () => {
    const points = densePoints(0, QUOTE_MS);
    points[300] = { ...points[300]!, priceUsd: 0 };

    const window = buildWindow(points, QUOTE_MS);
    expect(window.available).toBe(false);
    expect(window.rejectionReason).toBe("invalid-source-price");
    expect(window.barCount).toBe(11);
    expect(window.windowStartMs).toBe(WINDOW_START_MS);
  });

  it("rejects an invalid predecessor price used for the leading boundary gap", () => {
    const points = densePoints(0, QUOTE_MS);
    points[59] = { ...points[59]!, priceUsd: -1 };

    const window = buildWindow(points, QUOTE_MS);
    expect(window.available).toBe(false);
    expect(window.rejectionReason).toBe("invalid-source-price");
  });

  it("rejects a fully reversed source series", () => {
    const window = buildWindow(densePoints(0, QUOTE_MS).reverse(), QUOTE_MS);
    expect(window.available).toBe(false);
    expect(window.rejectionReason).toBe("non-ascending-timestamps");
    expect(window.barCount).toBe(0);
    expect(window.sourcePointCount).toBe(0);
  });

  it("rejects a single out-of-order source point instead of re-sorting", () => {
    const points = densePoints(0, QUOTE_MS);
    const swapped = points[100]!;
    points[100] = points[101]!;
    points[101] = swapped;

    const window = buildWindow(points, QUOTE_MS);
    expect(window.available).toBe(false);
    expect(window.rejectionReason).toBe("non-ascending-timestamps");
  });

  it("collapses exact duplicate points and rejects conflicting duplicates", () => {
    const withExactDuplicate = densePoints(0, QUOTE_MS);
    withExactDuplicate.splice(300, 0, { ...withExactDuplicate[300]! });
    const collapsed = buildWindow(withExactDuplicate, QUOTE_MS);
    expect(collapsed.available).toBe(true);
    expect(collapsed.duplicatePointCount).toBe(1);
    expect(collapsed.sourcePointCount).toBe(601);

    const withConflict = densePoints(0, QUOTE_MS);
    withConflict.splice(300, 0, { ...withConflict[300]!, priceUsd: 123_456 });
    const conflicting = buildWindow(withConflict, QUOTE_MS);
    expect(conflicting.available).toBe(false);
    expect(conflicting.rejectionReason).toBe("conflicting-duplicate-timestamp");
    expect(conflicting.duplicatePointCount).toBe(0);
  });

  it("rejects a future-only source series", () => {
    const window = buildWindow(densePoints(QUOTE_MS + 40_000, QUOTE_MS + 140_000), QUOTE_MS);
    expect(window.available).toBe(false);
    expect(window.rejectionReason).toBe("future-only-source");
    expect(window.futurePointCount).toBe(101);
    expect(window.sourcePointCount).toBe(0);
  });

  it("counts future points without letting them reach the window", () => {
    const window = buildWindow(densePoints(0, 12 * 60_000), QUOTE_MS);
    expect(window.available).toBe(true);
    expect(window.futurePointCount).toBe(60);
    expect(window.windowEndMs).toBe(QUOTE_MS);
    expect(window.barCount).toBe(11);
    expect(window.candles[10]!.close).toBe(priceAt(QUOTE_MS));
  });

  it("rejects invalid parameters before inspecting the source series", () => {
    const points = densePoints(0, QUOTE_MS);
    const cases: { overrides: Parameters<typeof buildWindow>[2]; timestampMs: number; reason: string }[] = [
      { overrides: {}, timestampMs: Number.NaN, reason: "invalid-quote-timestamp" },
      { overrides: { barIntervalMs: 0 }, timestampMs: QUOTE_MS, reason: "invalid-bar-interval" },
      { overrides: { barIntervalMs: 60_000.5 }, timestampMs: QUOTE_MS, reason: "invalid-bar-interval" },
      { overrides: { barIntervalMs: -60_000 }, timestampMs: QUOTE_MS, reason: "invalid-bar-interval" },
      { overrides: { lookbackBars: 1 }, timestampMs: QUOTE_MS, reason: "invalid-lookback" },
      { overrides: { lookbackBars: 10.5 }, timestampMs: QUOTE_MS, reason: "invalid-lookback" },
      { overrides: { maximumSourceGapMs: -1 }, timestampMs: QUOTE_MS, reason: "invalid-maximum-source-gap" },
      { overrides: { maximumSourceGapMs: 1.5 }, timestampMs: QUOTE_MS, reason: "invalid-maximum-source-gap" },
    ];

    for (const testCase of cases) {
      const window = buildWindow(points, testCase.timestampMs, testCase.overrides);
      expect(window.available).toBe(false);
      expect(window.rejectionReason).toBe(testCase.reason);
      expect(window.candles).toEqual([]);
      expect(window.windowStartMs).toBeNull();
      expect(window.sourcePointCount).toBe(0);
    }
  });

  it("produces an identical window regardless of how much extra history precedes it", () => {
    const short = buildWindow(densePoints(59_000, QUOTE_MS), QUOTE_MS);
    const long = buildWindow(densePoints(0, QUOTE_MS), QUOTE_MS);

    expect(short.available).toBe(true);
    expect(short.windowStartMs).toBe(long.windowStartMs);
    expect(short.windowEndMs).toBe(long.windowEndMs);
    expect(short.barCount).toBe(long.barCount);
    expect(short.sourcePointCount).toBe(long.sourcePointCount);
    expect(short.maximumObservedSourceGapMs).toBe(long.maximumObservedSourceGapMs);
    expect(short.annualizedVolatility).toBe(long.annualizedVolatility);
    expect(short.candles).toEqual(long.candles);
  });

  it("keeps the in-progress minute bar policy for quotes inside a minute", () => {
    const insideMinute = buildWindow(densePoints(0, 12 * 60_000), QUOTE_MS + 30_000);
    expect(insideMinute.available).toBe(true);
    expect(insideMinute.includesInProgressMinuteBar).toBe(true);
    expect(insideMinute.windowEndMs).toBe(QUOTE_MS);
    expect(insideMinute.lastSelectedSourceTimestampMs).toBe(QUOTE_MS + 30_000);
  });

  it("locksteps governed policies with CAUSAL_VOLATILITY_WINDOW_CONTRACT_SEMANTICS", async () => {
    const { CAUSAL_VOLATILITY_WINDOW_CONTRACT_SEMANTICS: semantics } = await import(
      "./buildValidatedCausalVolatilityWindow"
    );
    expect(semantics.quoteMinuteInclusionPolicy).toBe("include-in-progress-minute-when-sampled");
    expect(semantics.missingMinuteBehavior).toBe("reject-missing-minute-bucket-no-fill");
    expect(semantics.duplicateHandling).toContain("exact-timestamp-price-collapse");
    expect(semantics.orderingHandling).toContain("reject-non-ascending");
    expect(semantics.invalidPriceHandling).toContain("in-window-scope");
    expect(semantics.futureSampleHandling).toContain("exclude-points-after-quote");

    // 5000 passes / 5001 fails for adjacent gaps (start/internal/trailing covered above).
    expect(buildWindow(densePoints(0, QUOTE_MS, 5_000), QUOTE_MS).available).toBe(true);
    expect(
      buildWindow(
        pointsAt([...timestampRange(0, 299_000), 304_001, ...timestampRange(305_000, QUOTE_MS)]),
        QUOTE_MS,
      ).rejectionReason,
    ).toBe("source-gap-exceeded");

    // Duplicate / ordering / current-minute / future / invalid-price / missing-minute / no-fill.
    const withExact = densePoints(0, QUOTE_MS);
    withExact.splice(300, 0, { ...withExact[300]! });
    expect(buildWindow(withExact, QUOTE_MS).available).toBe(true);

    const reversed = densePoints(0, QUOTE_MS).reverse();
    expect(buildWindow(reversed, QUOTE_MS).rejectionReason).toBe("non-ascending-timestamps");

    const inside = buildWindow(densePoints(0, 12 * 60_000), QUOTE_MS + 30_000);
    expect(inside.includesInProgressMinuteBar).toBe(true);

    const withFuture = buildWindow(densePoints(0, 12 * 60_000), QUOTE_MS);
    expect(withFuture.available).toBe(true);
    expect(withFuture.futurePointCount).toBeGreaterThan(0);

    const earlyInvalid = densePoints(0, QUOTE_MS);
    earlyInvalid[0] = { ...earlyInvalid[0]!, priceUsd: 0 };
    expect(buildWindow(earlyInvalid, QUOTE_MS).available).toBe(true);

    const missingMinute = buildWindow(
      densePoints(0, QUOTE_MS).filter(
        (point) => point.timestampMs < 5 * 60_000 || point.timestampMs >= 6 * 60_000,
      ),
      QUOTE_MS,
    );
    expect(missingMinute.rejectionReason).toBe("missing-minute-bucket");
  });
});

describe("production volatility path", () => {
  it("qualifies dense causal windows and records only the pre-history rejection", async () => {
    const fixture = buildRegressionFixture();
    const io = createMemoryCalibrationFadeForwardValidationIo(fixture.files, fixture.dirs);
    const { report } = await analyzeFixture(io);

    expect(report.recordsScanned).toBe(5);
    expect(report.gatePassCounts.volatilityAvailable).toBe(4);
    // The earliest quote has only one causal BTC sample behind it.
    expect(report.volatilityWindowRejections).toEqual({ "insufficient-source-points": 1 });
    expect(report.featureCompatibility.volatilityMeasureAvailable).toBe(true);
  });

  it("reports feature incompatibility when the BTC source is only minute-spaced", async () => {
    const fixture = singleRunFixture({
      topOfBookLines: [
        topOfBookLine({ marketTicker: MARKET_A, offsetMs: 720_000, yesBid: 48, yesAsk: 52, noAsk: 50 }),
      ],
      btcSpots: denseHighVolBtcSpots({ stepMs: 60_000 }),
      marketTickers: [MARKET_A],
    });
    const io = createMemoryCalibrationFadeForwardValidationIo(fixture.files, fixture.dirs);
    const { report } = await analyzeFixture(io);

    expect(report.gatePassCounts.volatilityAvailable).toBe(0);
    expect(report.volatilityWindowRejections["source-gap-exceeded"]).toBe(1);
    expect(report.featureCompatibility.volatilityMeasureAvailable).toBe(false);
    expect(report.summary.interpretationClassification).toBe("forward-feature-incompatible");
    expect(report.summary.recommendedNextAction).toBe("build-causal-feature-equivalence-audit");
  });
});

describe("open-market episode breaks and funnel consistency", () => {
  const MARKET_E = "KXBTC15M-26JUL111230-30";

  async function analyzeEpisodeFixture() {
    const fixture = singleRunFixture({
      topOfBookLines: [
        topOfBookLine({ marketTicker: MARKET_E, offsetMs: 720_000, yesBid: 48, yesAsk: 52, noAsk: 50 }),
        topOfBookLine({ marketTicker: MARKET_E, offsetMs: 721_000, yesBid: 48, yesAsk: 52, noAsk: 50 }),
        topOfBookLine({ marketTicker: MARKET_E, offsetMs: 722_000, yesBid: 20, yesAsk: 22, noAsk: 79 }),
        topOfBookLine({ marketTicker: MARKET_E, offsetMs: 723_000, yesBid: 48, yesAsk: 52, noAsk: 50 }),
      ],
      btcSpots: denseHighVolBtcSpots(),
      marketTickers: [MARKET_E],
    });
    const io = createMemoryCalibrationFadeForwardValidationIo(fixture.files, fixture.dirs);
    return analyzeFixture(io);
  }

  it("breaks the episode on disqualification and still counts one market entry", async () => {
    const { report, eventLines } = await analyzeEpisodeFixture();

    expect(report.qualifyingObservationCount).toBe(3);
    expect(report.candidateEpisodeCount).toBe(2);
    expect(report.candidateMarketCount).toBe(1);

    const eventTypes = eventLines.map(
      (line) => (JSON.parse(line) as { eventType: string }).eventType,
    );
    expect(eventTypes.filter((eventType) => eventType === "qualifying-observation")).toHaveLength(3);
    expect(eventTypes.filter((eventType) => eventType === "episode-entry")).toHaveLength(2);
    expect(eventTypes.filter((eventType) => eventType === "market-entry")).toHaveLength(1);
    expect(
      report.warnings.some((warning) => warning.includes("Suppressed 1 repeated qualifying snapshots")),
    ).toBe(true);
  });

  it("keeps the funnel monotonic and consistent with the reported counts", async () => {
    const { report } = await analyzeEpisodeFixture();

    const counts = report.funnel.map((stage) => stage.count);
    for (let index = 1; index < counts.length; index += 1) {
      expect(counts[index]).toBeLessThanOrEqual(counts[index - 1]!);
    }

    const stageCount = (stageId: string) =>
      report.funnel.find((stage) => stage.stageId === stageId)?.count;
    expect(stageCount("records-loaded")).toBe(report.recordsScanned);
    expect(stageCount("qualifying-observation")).toBe(report.qualifyingObservationCount);
    expect(stageCount("candidate-episode")).toBe(report.candidateEpisodeCount);
    expect(stageCount("independent-market")).toBe(report.candidateMarketCount);
    expect(stageCount("probability-band")).toBe(3);
    expect(stageCount("executable-entry")).toBe(1);
    expect(stageCount("settlement-joined")).toBe(0);
    expect(stageCount("evaluated-candidate")).toBe(0);
  });
});

describe("classification with provenance and market counts", () => {
  function buildQualifyingMarketsFixture(marketCount: number, includeSettlements: boolean) {
    const btcSpots = denseHighVolBtcSpots();
    const markets = Array.from({ length: marketCount }, (_, index) => `MKT-${index}`);
    const topOfBook = markets.map((marketTicker) =>
      topOfBookLine({
        marketTicker,
        offsetMs: 720_000,
        yesBid: 48,
        yesAsk: 52,
        noAsk: 50,
      }),
    ).join("\n");
    const metadata = markets
      .map((marketTicker) => JSON.stringify({ marketTicker, closeTime: isoAt(1_200_000) }))
      .join("\n");
    const topPath = `${RUN_DIR}/top-of-book.jsonl`;
    const btcPath = `${RUN_DIR}/btc-spot.jsonl`;
    const topSize = Buffer.byteLength(topOfBook, "utf8");
    const btcSize = Buffer.byteLength(btcSpots, "utf8");

    const files = freezeFixtureFiles(
      {
        [`${RUN_DIR}/capture-health.json`]: JSON.stringify({
          runId: "run-calibration-fade",
          config: { durationSeconds: 3600 },
          connection: {
            captureEndReason: "duration-complete",
            terminalFailureReason: null,
            completedNormally: true,
          },
          orderbook: { validTopOfBookRecords: marketCount, reconnectCount: 0, sequenceGapCount: 0 },
        }),
        [`${RUN_DIR}/market-metadata.jsonl`]: metadata,
        [topPath]: topOfBook,
        [btcPath]: btcSpots,
        [`${RUN_DIR}/capture-health-audit.json`]: JSON.stringify({
          selectedRunId: "run-calibration-fade",
          captureRunDir: RUN_DIR,
          sourceRunIds: ["run-calibration-fade"],
          analysisVersion: "capture-health-audit-v1",
          inputArtifactIdentities: [
            {
              path: topPath,
              role: "top-of-book",
              sizeBytes: topSize,
              mtimeMs: topSize,
              recordCount: marketCount,
            },
            {
              path: btcPath,
              role: "btc-spot",
              sizeBytes: btcSize,
              mtimeMs: btcSize,
              recordCount: btcSpots.split("\n").length,
            },
          ],
          summary: {
            verdict: "capture-research-ready",
            recommendedNextAction: "proceed-offline-microstructure-research",
            runDurationSeconds: 3600,
            topOfBookCount: marketCount,
            btcSpotCount: btcSpots.split("\n").length,
            bookState: { validBookShare: 0.99, reconnectCount: 0, sequenceGapCount: 0 },
            btcJoin: { joinCoverageShare: 1 },
            continuity: { p90TopOfBookGapMs: 1000 },
          },
        }),
      },
      {
        minimumEvidenceRequirements: {
          minimumIndependentCandidateMarkets: 5,
          minimumSettlementCoverageShare: 0.8,
          minimumValidBookShare: 0.9,
          minimumBtcJoinCoverageShare: 0.9,
          materialRejectionCalibrationGap: 0.05,
          materialSupportCalibrationGap: 0.03,
          materialExecutableNetReturnCents: 1,
        },
      },
    );

    // Absent discovery artifacts for the provenance path under test.
    delete files["data/research-results/hypothesis-candidates.json"];

    const dirs = [RUN_DIR, "data/imports"];
    if (includeSettlements) {
      for (const marketTicker of markets) {
        dirs.push(`data/imports/KXBTC15M/${marketTicker}`);
        files[`data/imports/KXBTC15M/${marketTicker}/import-result.json`] = JSON.stringify({
          bronzeRecords: [
            {
              ticker: marketTicker,
              contentType: "settlement",
              payload: { market: { result: "no", settlement_ts: isoAt(700_000) } },
            },
          ],
        });
      }
    }

    return { files, dirs };
  }

  it("classifies insufficient-forward-events for 4 markets with valid manifest and no settlements", async () => {
    const fixture = buildQualifyingMarketsFixture(4, false);
    const io = createMemoryCalibrationFadeForwardValidationIo(fixture.files, fixture.dirs);
    const { report } = await analyzeCalibrationFadeForwardForRun({
      generatedAt: "2026-07-12T08:00:00.000Z",
      outputPath: "data/research-results/calibration-fade-forward-validation.json",
      htmlOutputPath: "data/reports/calibration-fade-forward-validation.html",
      config: {
        captureRunDir: RUN_DIR,
        hypothesisConfigPath: DEFAULT_CALIBRATION_FADE_HYPOTHESIS_CONFIG_PATH,
        importsDir: "data/imports",
        maximumBtcJoinAgeMs: 5000,
        eventsOutputPath: "data/research-results/calibration-fade-forward-events.jsonl",
        marketsOutputPath: "data/research-results/calibration-fade-forward-markets.jsonl",
      },
      io,
    });

    expect(report.provenance.provenanceAvailable).toBe(true);
    expect(report.historicalBenchmark.discoveryObservationCount).toBeNull();
    expect(report.candidateMarketCount).toBe(4);
    expect(report.summary.interpretationClassification).toBe("insufficient-forward-events");
  });

  it("classifies settlement-coverage-incomplete for 5 markets without settlements", async () => {
    const fixture = buildQualifyingMarketsFixture(5, false);
    const io = createMemoryCalibrationFadeForwardValidationIo(fixture.files, fixture.dirs);
    const { report } = await analyzeCalibrationFadeForwardForRun({
      generatedAt: "2026-07-12T08:00:00.000Z",
      outputPath: "data/research-results/calibration-fade-forward-validation.json",
      htmlOutputPath: "data/reports/calibration-fade-forward-validation.html",
      config: {
        captureRunDir: RUN_DIR,
        hypothesisConfigPath: DEFAULT_CALIBRATION_FADE_HYPOTHESIS_CONFIG_PATH,
        importsDir: "data/imports",
        maximumBtcJoinAgeMs: 5000,
        eventsOutputPath: "data/research-results/calibration-fade-forward-events.jsonl",
        marketsOutputPath: "data/research-results/calibration-fade-forward-markets.jsonl",
      },
      io,
    });

    expect(report.candidateMarketCount).toBe(5);
    expect(report.summary.interpretationClassification).toBe("settlement-coverage-incomplete");
  });

  it("classifies hypothesis-provenance-unavailable when manifest is invalid", async () => {
    const fixture = buildQualifyingMarketsFixture(4, false);
    fixture.files[PROVENANCE_PATH] = provenanceManifestContent("deadbeef");
    const io = createMemoryCalibrationFadeForwardValidationIo(fixture.files, fixture.dirs);
    const { report } = await analyzeCalibrationFadeForwardForRun({
      generatedAt: "2026-07-12T08:00:00.000Z",
      outputPath: "data/research-results/calibration-fade-forward-validation.json",
      htmlOutputPath: "data/reports/calibration-fade-forward-validation.html",
      config: {
        captureRunDir: RUN_DIR,
        hypothesisConfigPath: DEFAULT_CALIBRATION_FADE_HYPOTHESIS_CONFIG_PATH,
        importsDir: "data/imports",
        maximumBtcJoinAgeMs: 5000,
        eventsOutputPath: "data/research-results/calibration-fade-forward-events.jsonl",
        marketsOutputPath: "data/research-results/calibration-fade-forward-markets.jsonl",
      },
      io,
    });

    expect(report.summary.interpretationClassification).toBe("hypothesis-provenance-unavailable");
  });
});

describe("publishArtifactsAtomically", () => {
  it("restores prior artifacts when a later publish fails", () => {
    const files: Record<string, string> = {
      "data/research-results/a.json": "old-a",
      "data/research-results/b.json": "old-b",
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
        { outputPath: "data/research-results/a.json", data: "new-a" },
        { outputPath: "data/research-results/b.json", data: "new-b" },
      ]),
    ).toThrow("publish failed");
    expect(files["data/research-results/a.json"]).toBe("old-a");
    expect(files["data/research-results/b.json"]).toBe("old-b");
  });
});
