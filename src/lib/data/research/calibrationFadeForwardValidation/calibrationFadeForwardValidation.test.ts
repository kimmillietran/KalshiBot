import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { buildCoarseProbabilityAxisDefinitions } from "@/lib/data/research/dimensions";
import { publishResearchArtifactsAtomically } from "./publishResearchArtifactsAtomically";

import { analyzeCalibrationFadeForwardForRun, evaluateOpenMarket } from "./analyzeCalibrationFadeForwardForRun";
import { buildBtcCandlesUpToTimestamp, resolveCausalBtcPrice } from "./buildBtcCandlesCausal";
import { buildValidatedCausalVolatilityWindow } from "./buildValidatedCausalVolatilityWindow";
import { classifyCalibrationFadeInterpretation } from "./classifyCalibrationFadeInterpretation";
import { createMemoryCalibrationFadeForwardValidationIo } from "./createCalibrationFadeForwardValidationIo";
import { deriveProvenanceManifestPath, loadFrozenHypothesisSpec } from "./loadFrozenHypothesisSpec";
import { loadSelectedRunCalibrationFadeContext } from "./loadSelectedRunCalibrationFadeContext";
import {
  CalibrationFadeForwardValidationError,
  CALIBRATION_FADE_PROVENANCE_MANIFEST_SCHEMA,
  CALIBRATION_FADE_PROVENANCE_MANIFEST_VERSION,
  DEFAULT_CALIBRATION_FADE_HYPOTHESIS_CONFIG_PATH,
} from "./calibrationFadeForwardValidationTypes";
import { parseCalibrationFadeForwardValidationArgv } from "./parseCalibrationFadeForwardValidationArgv";
import {
  probabilityInAuthoritativeBand,
  resolveFrozenEligibilityBands,
} from "./resolveFrozenEligibilityBands";
import type { FrozenHypothesisSpec } from "./calibrationFadeForwardValidationTypes";

const RUN_DIR = "data/live-capture/forward-quotes/run-calibration-fade";
const MARKET_A = "KXBTC15M-26JUL111200-00";
const MARKET_B = "KXBTC15M-26JUL111215-15";
const HYPOTHESIS_ID =
  "atlas-volatilityProbabilityTime-vol-high-coarse-prob-1-coarse-time-early-over";
const BASE_MS = Date.parse("2026-07-11T12:00:00.000Z");
const PROVENANCE_PATH = deriveProvenanceManifestPath(DEFAULT_CALIBRATION_FADE_HYPOTHESIS_CONFIG_PATH);

function isoAt(offsetMs: number): string {
  return new Date(BASE_MS + offsetMs).toISOString();
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
    classificationRules: { precedence: ["insufficient-forward-events"] },
    ...overrides,
  });
}

function provenanceManifestContent(resolvedConfigHash: string, overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schema: CALIBRATION_FADE_PROVENANCE_MANIFEST_SCHEMA,
    version: CALIBRATION_FADE_PROVENANCE_MANIFEST_VERSION,
    hypothesisId: HYPOTHESIS_ID,
    sourceCandidateId: HYPOTHESIS_ID,
    configPath: DEFAULT_CALIBRATION_FADE_HYPOTHESIS_CONFIG_PATH,
    originalFreezeCommitSha: "f2598cf960472f368cd6ad25f67d4c97a3b3956e",
    originalFreezeCommitTimestamp: "2026-07-12T01:54:04-07:00",
    originalConfigHash: "76336405",
    resolvedConfigHash,
    firstForwardEvaluationBoundary: "before first forward capture",
    conclusion: "defensible-with-manifest",
    ruleFreezeEvidence: {
      kind: "repository-history",
      description: "test rule freeze evidence",
    },
    historicalBenchmarkAvailability: "unavailable",
    missingArtifacts: ["data/research-results/hypothesis-candidates.json"],
    limitations: ["Historical discovery artifacts absent in fixture."],
    integrityCorrections: [
      {
        id: "probability-band-reconciliation-to-coarse-prob-1",
        kind: "integrity-correction",
      },
    ],
    ...overrides,
  });
}

function configurationHashForFreeze(content: string): string {
  const io = createMemoryCalibrationFadeForwardValidationIo({
    [DEFAULT_CALIBRATION_FADE_HYPOTHESIS_CONFIG_PATH]: content,
    [PROVENANCE_PATH]: provenanceManifestContent("00000000"),
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

/** Dense causal BTC samples (<= maximumSourceGapMs) with high realized volatility. */
function denseHighVolBtcSpots(options?: { endOffsetMs?: number; stepMs?: number }): string {
  const endOffsetMs = options?.endOffsetMs ?? 15 * 60_000;
  const stepMs = options?.stepMs ?? 1_000;
  const lines: string[] = [];
  for (let offsetMs = 0; offsetMs <= endOffsetMs; offsetMs += stepMs) {
    const minute = Math.floor(offsetMs / 60_000);
    const priceUsd = 100_000 + (minute % 2 === 0 ? 1 : -1) * (2_000 + minute * 150);
    lines.push(btcLine(offsetMs, priceUsd));
  }
  return lines.join("\n");
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
  function denseOscillatingPoints(endMs: number, stepMs = 1_000) {
    const points = [];
    for (let timestampMs = 0; timestampMs <= endMs; timestampMs += stepMs) {
      const minute = Math.floor(timestampMs / 60_000);
      points.push({
        timestampMs,
        receivedAtLocal: new Date(timestampMs).toISOString(),
        priceUsd: 100_000 + (minute % 2 === 0 ? 1 : -1) * (2_000 + minute * 150),
      });
    }
    return points;
  }

  it("requires 11 consecutive bars and rejects gaps / invalid prices", () => {
    const ok = buildValidatedCausalVolatilityWindow({
      points: denseOscillatingPoints(11 * 60_000),
      timestampMs: 11 * 60_000,
      barIntervalMs: 60_000,
      lookbackBars: 10,
      maximumSourceGapMs: 5_000,
    });
    expect(ok.available).toBe(true);
    expect(ok.barCount).toBe(11);
    expect(ok.annualizedVolatility).not.toBeNull();

    const tenBars = buildValidatedCausalVolatilityWindow({
      points: denseOscillatingPoints(9 * 60_000),
      timestampMs: 9 * 60_000,
      barIntervalMs: 60_000,
      lookbackBars: 10,
      maximumSourceGapMs: 5_000,
    });
    expect(tenBars.available).toBe(false);
    expect(tenBars.rejectionReason).toMatch(/insufficient/);

    const withMissingMinute = denseOscillatingPoints(11 * 60_000).filter(
      (point) => point.timestampMs < 5 * 60_000 || point.timestampMs >= 6 * 60_000,
    );
    const missingMinute = buildValidatedCausalVolatilityWindow({
      points: withMissingMinute,
      timestampMs: 11 * 60_000,
      barIntervalMs: 60_000,
      lookbackBars: 10,
      maximumSourceGapMs: 5_000,
    });
    expect(missingMinute.available).toBe(false);
    expect(missingMinute.rejectionReason).toMatch(/missing-minute-bucket|source-gap-exceeded/);

    const sourceGapPass = denseOscillatingPoints(11 * 60_000, 5_000);
    const passGap = buildValidatedCausalVolatilityWindow({
      points: sourceGapPass,
      timestampMs: 11 * 60_000,
      barIntervalMs: 60_000,
      lookbackBars: 10,
      maximumSourceGapMs: 5_000,
    });
    expect(passGap.available).toBe(true);

    const sourceGapFail = denseOscillatingPoints(11 * 60_000, 5_001);
    const failGap = buildValidatedCausalVolatilityWindow({
      points: sourceGapFail,
      timestampMs: 11 * 60_000,
      barIntervalMs: 60_000,
      lookbackBars: 10,
      maximumSourceGapMs: 5_000,
    });
    expect(failGap.available).toBe(false);
    expect(failGap.rejectionReason).toBe("source-gap-exceeded");

    const invalidPrice = denseOscillatingPoints(11 * 60_000);
    invalidPrice[30] = { ...invalidPrice[30]!, priceUsd: 0 };
    expect(
      buildValidatedCausalVolatilityWindow({
        points: invalidPrice,
        timestampMs: 11 * 60_000,
        barIntervalMs: 60_000,
        lookbackBars: 10,
        maximumSourceGapMs: 5_000,
      }).rejectionReason,
    ).toBe("invalid-source-price");

    // Regression: previously a 60s-only sparse series could still yield an estimate.
    const sparseLegacy = Array.from({ length: 12 }, (_, index) => ({
      timestampMs: index * 60_000,
      receivedAtLocal: new Date(index * 60_000).toISOString(),
      priceUsd: 100_000 + (index % 2 === 0 ? 2_000 : -2_000) * (index + 1),
    }));
    const sparse = buildValidatedCausalVolatilityWindow({
      points: sparseLegacy,
      timestampMs: 11 * 60_000,
      barIntervalMs: 60_000,
      lookbackBars: 10,
      maximumSourceGapMs: 5_000,
    });
    expect(sparse.available).toBe(false);
    expect(sparse.rejectionReason).toBe("source-gap-exceeded");
  });

  it("keeps in-progress minute bar policy and ignores future points", () => {
    const points = denseOscillatingPoints(12 * 60_000);
    const insideMinute = buildValidatedCausalVolatilityWindow({
      points,
      timestampMs: 11 * 60_000 + 30_000,
      barIntervalMs: 60_000,
      lookbackBars: 10,
      maximumSourceGapMs: 5_000,
    });
    expect(insideMinute.available).toBe(true);
    expect(insideMinute.includesInProgressMinuteBar).toBe(true);
    expect(insideMinute.windowEndMs).toBe(11 * 60_000);

    const onBoundary = buildValidatedCausalVolatilityWindow({
      points: denseOscillatingPoints(11 * 60_000),
      timestampMs: 11 * 60_000,
      barIntervalMs: 60_000,
      lookbackBars: 10,
      maximumSourceGapMs: 5_000,
    });
    expect(onBoundary.available).toBe(true);
    expect(onBoundary.includesInProgressMinuteBar).toBe(true);
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
