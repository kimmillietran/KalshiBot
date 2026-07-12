import { describe, expect, it } from "vitest";

import { fnv1a32, stableStringify } from "@/lib/trading/config/hashConfig";
import { publishResearchArtifactsAtomically } from "./publishResearchArtifactsAtomically";

import { analyzeCalibrationFadeForwardForRun } from "./analyzeCalibrationFadeForwardForRun";
import { buildBtcCandlesUpToTimestamp, resolveCausalBtcPrice } from "./buildBtcCandlesCausal";
import { classifyCalibrationFadeInterpretation } from "./classifyCalibrationFadeInterpretation";
import { createMemoryCalibrationFadeForwardValidationIo } from "./createCalibrationFadeForwardValidationIo";
import { loadFrozenHypothesisSpec } from "./loadFrozenHypothesisSpec";
import {
  CalibrationFadeForwardValidationError,
  DEFAULT_CALIBRATION_FADE_HYPOTHESIS_CONFIG_PATH,
} from "./calibrationFadeForwardValidationTypes";
import { parseCalibrationFadeForwardValidationArgv } from "./parseCalibrationFadeForwardValidationArgv";
import type { FrozenHypothesisSpec } from "./calibrationFadeForwardValidationTypes";

const RUN_DIR = "data/live-capture/forward-quotes/run-calibration-fade";
const MARKET_A = "KXBTC15M-26JUL111200-00";
const MARKET_B = "KXBTC15M-26JUL111215-15";
const BASE_MS = Date.parse("2026-07-11T12:00:00.000Z");

function isoAt(offsetMs: number): string {
  return new Date(BASE_MS + offsetMs).toISOString();
}

function freezeSpecContent(): string {
  return JSON.stringify({
    hypothesisId: "atlas-volatilityProbabilityTime-vol-high-coarse-prob-1-coarse-time-early-over",
    hypothesisVersion: "v1",
    description: "test freeze",
    canonicalSourceArtifacts: ["data/research-results/hypothesis-candidates.json"],
    sourceCandidateId: "atlas-volatilityProbabilityTime-vol-high-coarse-prob-1-coarse-time-early-over",
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
      minimumIndependentCandidateMarkets: 2,
      minimumSettlementCoverageShare: 0.5,
      minimumValidBookShare: 0.9,
      minimumBtcJoinCoverageShare: 0.9,
      materialRejectionCalibrationGap: 0.05,
      materialSupportCalibrationGap: 0.03,
      materialExecutableNetReturnCents: 1,
    },
    classificationRules: { precedence: ["insufficient-forward-events"] },
  });
}

function hypothesisCandidatesFixture() {
  return JSON.stringify({
    candidates: [
      {
        candidateId: "atlas-volatilityProbabilityTime-vol-high-coarse-prob-1-coarse-time-early-over",
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

function buildRegressionFixture() {
  const btcPrices = [100_000, 102_000, 99_000, 104_000, 98_000, 106_000, 97_000, 108_000, 96_000, 110_000, 95_000, 112_000, 94_000, 115_000, 93_000, 118_000];
  const btcSpots = btcPrices.map((priceUsd, index) => btcLine(index * 60_000, priceUsd));
  const topOfBook = [
    topOfBookLine({ marketTicker: MARKET_A, offsetMs: 0, yesBid: 20, yesAsk: 22 }),
    topOfBookLine({ marketTicker: MARKET_A, offsetMs: 720_000, yesBid: 48, yesAsk: 52, noAsk: 50 }),
    topOfBookLine({ marketTicker: MARKET_A, offsetMs: 780_000, yesBid: 48, yesAsk: 52, noAsk: 50 }),
    topOfBookLine({ marketTicker: MARKET_A, offsetMs: 840_000, yesBid: 55, yesAsk: 57, noAsk: null }),
    topOfBookLine({ marketTicker: MARKET_B, offsetMs: 720_000, yesBid: 48, yesAsk: 52, noAsk: 51 }),
  ];

  return {
    dirs: [RUN_DIR, "data/imports", `data/imports/KXBTC15M/${MARKET_A}`, `data/imports/KXBTC15M/${MARKET_B}`],
    files: {
      [DEFAULT_CALIBRATION_FADE_HYPOTHESIS_CONFIG_PATH]: freezeSpecContent(),
      "data/research-results/hypothesis-candidates.json": hypothesisCandidatesFixture(),
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
      [`${RUN_DIR}/btc-spot.jsonl`]: btcSpots.join("\n"),
      "data/research-results/capture-health-audit.json": JSON.stringify({
        selectedRunId: "run-calibration-fade",
        summary: {
          verdict: "capture-research-ready",
          runDurationSeconds: 3600,
          bookState: { validBookShare: 0.99, reconnectCount: 0, sequenceGapCount: 0 },
          btcJoin: { joinCoverageShare: 1 },
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
    },
  };
}

describe("loadFrozenHypothesisSpec", () => {
  it("loads canonical candidate and stable freeze hash", () => {
    const withoutHash = JSON.parse(freezeSpecContent());
    const expectedHash = fnv1a32(stableStringify(withoutHash));
    const io = createMemoryCalibrationFadeForwardValidationIo({
      [DEFAULT_CALIBRATION_FADE_HYPOTHESIS_CONFIG_PATH]: freezeSpecContent(),
      "data/research-results/hypothesis-candidates.json": hypothesisCandidatesFixture(),
    });
    const loaded = loadFrozenHypothesisSpec({ io });
    expect(loaded.spec.configurationHash).toBe(expectedHash);
    expect(loaded.historicalBenchmark.discoveryObservationCount).toBe(273);
    expect(loaded.provenanceAvailable).toBe(true);
  });

  it("fails on missing source artifact provenance", () => {
    const io = createMemoryCalibrationFadeForwardValidationIo({
      [DEFAULT_CALIBRATION_FADE_HYPOTHESIS_CONFIG_PATH]: freezeSpecContent(),
    });
    const loaded = loadFrozenHypothesisSpec({ io });
    expect(loaded.provenanceAvailable).toBe(false);
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
});

describe("classifyCalibrationFadeInterpretation", () => {
  const spec = JSON.parse(freezeSpecContent()) as FrozenHypothesisSpec;
  spec.configurationHash = "test";

  it("classifies insufficient forward events", () => {
    const result = classifyCalibrationFadeInterpretation({
      spec,
      provenanceAvailable: true,
      featureIncompatible: false,
      candidateMarketCount: 1,
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
        runDurationSeconds: 3600,
        validBookShare: 0.99,
        btcJoinCoverageShare: 1,
        bidSizeCoverageShare: null,
        reconnectCount: 0,
        sequenceGapCount: 0,
        suspectedSystemSleepSeconds: 0,
        captureVerdict: "capture-research-ready",
        reconciliationVerdict: null,
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
      },
      executable: {
        executableCandidateCount: 0,
        unavailableExecutablePriceCount: 1,
        grossReturnCents: null,
        feeAdjustedReturnCents: null,
        winRate: null,
        averageEntryPriceCents: null,
        medianEntryPriceCents: null,
        maximumDrawdownCents: null,
        cumulativeReturnCents: null,
      },
    });
    expect(result.interpretationClassification).toBe("insufficient-forward-events");
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
