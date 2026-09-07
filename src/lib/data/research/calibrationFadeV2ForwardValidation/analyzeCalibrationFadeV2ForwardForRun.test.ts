import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { fnv1a32, stableStringify } from "@/lib/trading/config/hashConfig";
import { createMemoryCalibrationFadeForwardValidationIo } from "../calibrationFadeForwardValidation/createCalibrationFadeForwardValidationIo";
import {
  DEFAULT_CALIBRATION_FADE_FORWARD_VALIDATION_OUTPUT_PATH,
} from "../calibrationFadeForwardValidation/calibrationFadeForwardValidationTypes";
import {
  CALIBRATION_FADE_V2_FREEZE_COMMIT_SHA,
  CALIBRATION_FADE_V2_FREEZE_TIMESTAMP,
  CALIBRATION_FADE_V2_HYPOTHESIS_ID,
  DEFAULT_CALIBRATION_FADE_V2_HYPOTHESIS_CONFIG_PATH,
  DEFAULT_CALIBRATION_FADE_V2_PROVENANCE_PATH,
  loadCalibrationFadeV2HypothesisSpec,
  V2_REQUIRED_PROVIDER,
  V2_REQUIRED_PROVIDER_INSTRUMENT,
  V2_REQUIRED_SOURCE_RECORD_TYPE,
} from "../calibrationFadeV2Preregistration";

import { analyzeCalibrationFadeV2ForwardForRun } from "./analyzeCalibrationFadeV2ForwardForRun";
import {
  V2_CANDLE_CLOSE_OFFSET_MS,
  type CalibrationFadeV2EvidenceMode,
  type CalibrationFadeV2ForwardValidationIo,
} from "./calibrationFadeV2ForwardValidationTypes";
import { resolveCalibrationFadeV2OutputPaths } from "./resolveCalibrationFadeV2OutputPaths";
import { assertCompleteV2EvidenceIdentity } from "./serializeCalibrationFadeV2ForwardValidation";

const V2_CONFIG_TEXT = readFileSync(DEFAULT_CALIBRATION_FADE_V2_HYPOTHESIS_CONFIG_PATH, "utf8");
const V2_PROVENANCE_TEXT = readFileSync(DEFAULT_CALIBRATION_FADE_V2_PROVENANCE_PATH, "utf8");
const FREEZE_MS = Date.parse(CALIBRATION_FADE_V2_FREEZE_TIMESTAMP);
const POST_FREEZE_1MS = new Date(FREEZE_MS + 1).toISOString();
const AUG4_START = "2026-08-04T10:33:33.601Z";
const MARKET = "KXBTC15M-26SEP071200-00";
const QUOTE_MS = Date.parse("2026-09-07T12:00:00.000Z");
const OPEN0_MS = QUOTE_MS - 11 * 60_000;
const WARMUP_QUOTE_MS = Date.parse("2026-09-06T23:00:05.000Z");
const WARMUP_OPEN0_MS = Date.parse("2026-09-06T22:49:00.000Z");

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function highVolClose(index: number): number {
  return 100_000 + (index % 2 === 0 ? 1 : -1) * (2_000 + index * 150);
}

function runDir(runId: string): string {
  return `data/live-capture/forward-quotes/${runId}`;
}

function candleRecord(input: {
  openTimeMs: number;
  close: number;
  observedAtMs: number;
  firstObservedAtMs?: number;
  retrievalMethod?: string;
}): string {
  return JSON.stringify({
    source: "coinbase-exchange-rest-candles",
    provider: V2_REQUIRED_PROVIDER,
    productId: V2_REQUIRED_PROVIDER_INSTRUMENT,
    sourceRecordType: V2_REQUIRED_SOURCE_RECORD_TYPE,
    granularityMs: 60_000,
    candleOpenTime: iso(input.openTimeMs),
    candleCloseTime: iso(input.openTimeMs + V2_CANDLE_CLOSE_OFFSET_MS),
    open: input.close,
    high: input.close + 10,
    low: input.close - 10,
    close: input.close,
    volume: 1,
    observedAtLocal: iso(input.observedAtMs),
    firstObservedAtLocal: iso(input.firstObservedAtMs ?? input.observedAtMs),
    retrievalMethod: input.retrievalMethod ?? "synthetic-fixture",
  });
}

function defaultCandles(open0Ms: number, observedAtMs: number): string {
  return Array.from({ length: 11 }, (_, index) =>
    candleRecord({
      openTimeMs: open0Ms + index * 60_000,
      close: highVolClose(index),
      observedAtMs,
    }),
  ).join("\n");
}

function highVolSpot(endMs: number): string {
  const lines: string[] = [];
  for (let timestampMs = endMs - 15 * 60_000; timestampMs <= endMs; timestampMs += 1_000) {
    const minute = Math.floor(timestampMs / 60_000);
    const priceUsd = 100_000 + (minute % 2 === 0 ? 1 : -1) * (2_000 + minute * 150);
    lines.push(
      JSON.stringify({
        receivedAtLocal: iso(timestampMs),
        exchangeTimestampMs: timestampMs,
        priceUsd,
      }),
    );
  }
  return lines.join("\n");
}

function flatSpot(timestampMs: number): string {
  return JSON.stringify({
    receivedAtLocal: iso(timestampMs),
    exchangeTimestampMs: timestampMs,
    priceUsd: 100_000,
  });
}

function topOfBook(timestampMs: number): string {
  return JSON.stringify({
    marketTicker: MARKET,
    seriesTicker: "KXBTC15M",
    receivedAtLocal: iso(timestampMs),
    exchangeTimestampMs: timestampMs,
    bookState: "valid",
    yesBestBidCents: 48,
    yesBestAskCents: 52,
    noBestBidCents: 46,
    noBestAskCents: 50,
  });
}

function healthAudit(runId: string, captureRunDir: string): string {
  return JSON.stringify({
    selectedRunId: runId,
    captureRunDir,
    sourceRunIds: [runId],
    analysisVersion: "capture-health-audit-v1",
    inputArtifactIdentities: [],
    summary: {
      verdict: "capture-research-ready",
      recommendedNextAction: "proceed-offline-microstructure-research",
      runDurationSeconds: 3600,
      topOfBookCount: 1,
      btcSpotCount: 1,
      bookState: { validBookShare: 0.99, reconnectCount: 0, sequenceGapCount: 0 },
      btcJoin: { joinCoverageShare: 1 },
      continuity: { p90TopOfBookGapMs: 1000 },
    },
  });
}

function fixtureFiles(input: {
  runId: string;
  startedAt: string;
  candles?: string | null;
  spots?: string;
  quotes?: string;
  quoteMs?: number;
}): { dirs: string[]; files: Record<string, string> } {
  const captureRunDir = runDir(input.runId);
  const quoteMs = input.quoteMs ?? QUOTE_MS;
  const files: Record<string, string> = {
    [DEFAULT_CALIBRATION_FADE_V2_HYPOTHESIS_CONFIG_PATH]: V2_CONFIG_TEXT,
    [DEFAULT_CALIBRATION_FADE_V2_PROVENANCE_PATH]: V2_PROVENANCE_TEXT,
    [`${captureRunDir}/capture-health.json`]: JSON.stringify({
      runId: input.runId,
      startedAt: input.startedAt,
      config: { durationSeconds: 3600 },
      connection: {
        captureEndReason: "duration-complete",
        terminalFailureReason: null,
        completedNormally: true,
      },
      orderbook: { validTopOfBookRecords: 1, reconnectCount: 0, sequenceGapCount: 0 },
    }),
    [`${captureRunDir}/capture-health-audit.json`]: healthAudit(input.runId, captureRunDir),
    [`${captureRunDir}/market-metadata.jsonl`]: JSON.stringify({
      marketTicker: MARKET,
      closeTime: iso(quoteMs + 600_000),
    }),
    [`${captureRunDir}/top-of-book.jsonl`]: input.quotes ?? topOfBook(quoteMs),
    [`${captureRunDir}/btc-spot.jsonl`]: input.spots ?? flatSpot(quoteMs - 1_000),
  };
  if (input.candles !== null) {
    files[`${captureRunDir}/btc-candles-1m.jsonl`] =
      input.candles ?? defaultCandles(OPEN0_MS, quoteMs - 1_000);
  }
  return { dirs: [captureRunDir, "data/imports"], files };
}

function analyze(input: {
  runId: string;
  evidenceMode: CalibrationFadeV2EvidenceMode;
  io: CalibrationFadeV2ForwardValidationIo;
}) {
  const captureRunDir = runDir(input.runId);
  const paths = resolveCalibrationFadeV2OutputPaths({
    evidenceMode: input.evidenceMode,
    captureRunDir,
  });
  return analyzeCalibrationFadeV2ForwardForRun({
    generatedAt: "2026-09-07T18:00:00.000Z",
    paths,
    config: {
      captureRunDir,
      evidenceMode: input.evidenceMode,
      hypothesisConfigPath: DEFAULT_CALIBRATION_FADE_V2_HYPOTHESIS_CONFIG_PATH,
      provenancePath: DEFAULT_CALIBRATION_FADE_V2_PROVENANCE_PATH,
      importsDir: "data/imports",
      maximumBtcJoinAgeMs: 5000,
      candlesPath: null,
    },
    io: input.io,
  });
}

describe("analyzeCalibrationFadeV2ForwardForRun evidence and identity", () => {
  it("keeps the committed frozen v2 config and freeze identity unchanged", () => {
    const spec = JSON.parse(V2_CONFIG_TEXT) as {
      hypothesisVersion: string;
      volatilityDefinition: { maximumSourceGapMs: unknown; sourceRecordType: string };
    };
    const provenance = JSON.parse(V2_PROVENANCE_TEXT) as {
      v2FreezeCommitSha: string;
      v2FreezeCommitTimestamp: string;
    };
    expect(spec.hypothesisVersion).toBe("v2");
    expect(spec.volatilityDefinition.maximumSourceGapMs).toBeNull();
    expect(spec.volatilityDefinition.sourceRecordType).toBe("exchange-completed-1m-ohlc");
    expect(provenance.v2FreezeCommitSha).toBe(CALIBRATION_FADE_V2_FREEZE_COMMIT_SHA);
    expect(provenance.v2FreezeCommitTimestamp).toBe(CALIBRATION_FADE_V2_FREEZE_TIMESTAMP);
    expect(CALIBRATION_FADE_V2_FREEZE_COMMIT_SHA).toBe("1c5ef9da3ef5e48af26c05b850183b0e8d4290d0");
  });

  it("rejects confirmatory evaluation of a pre-freeze run", async () => {
    const fixture = fixtureFiles({
      runId: "run-v2-pre-freeze",
      startedAt: AUG4_START,
      candles: null,
    });
    const io = createMemoryCalibrationFadeForwardValidationIo(fixture.files, fixture.dirs);
    await expect(analyze({ runId: "run-v2-pre-freeze", evidenceMode: "confirmatory", io })).rejects.toThrow(
      /not strictly after the immutable v2 freeze/,
    );
  });

  it("rejects confirmatory evaluation at the exact freeze timestamp", async () => {
    const fixture = fixtureFiles({
      runId: "run-v2-exact-freeze",
      startedAt: CALIBRATION_FADE_V2_FREEZE_TIMESTAMP,
      candles: null,
    });
    const io = createMemoryCalibrationFadeForwardValidationIo(fixture.files, fixture.dirs);
    await expect(
      analyze({ runId: "run-v2-exact-freeze", evidenceMode: "confirmatory", io }),
    ).rejects.toThrow(/not strictly after the immutable v2 freeze/);
  });

  it("treats a run starting 1ms after freeze as confirmatory-eligible", async () => {
    const fixture = fixtureFiles({
      runId: "run-v2-1ms",
      startedAt: POST_FREEZE_1MS,
      candles: defaultCandles(OPEN0_MS, QUOTE_MS - 1_000),
    });
    const io = createMemoryCalibrationFadeForwardValidationIo(fixture.files, fixture.dirs);
    const { report, evidenceIdentity } = await analyze({
      runId: "run-v2-1ms",
      evidenceMode: "confirmatory",
      io,
    });
    expect(report.confirmatoryEligibility).toBe(true);
    expect(evidenceIdentity.confirmatoryEligibility).toBe(true);
    expect(evidenceIdentity.evidenceMode).toBe("confirmatory");
    expect(evidenceIdentity.confirmatoryIneligibilityReason).toBeNull();
  });

  it("fails closed on a malformed capture startedAt", async () => {
    const fixture = fixtureFiles({
      runId: "run-v2-bad-start",
      startedAt: "not-a-timestamp",
    });
    const io = createMemoryCalibrationFadeForwardValidationIo(fixture.files, fixture.dirs);
    await expect(
      analyze({ runId: "run-v2-bad-start", evidenceMode: "diagnostic", io }),
    ).rejects.toThrow(/Malformed capture startedAt/);
  });

  it("stamps diagnostic mode permanently and never claims confirmatory", async () => {
    const fixture = fixtureFiles({
      runId: "run-v2-diagnostic",
      startedAt: POST_FREEZE_1MS,
    });
    const io = createMemoryCalibrationFadeForwardValidationIo(fixture.files, fixture.dirs);
    const { report } = await analyze({
      runId: "run-v2-diagnostic",
      evidenceMode: "diagnostic",
      io,
    });
    expect(report.evidenceMode).toBe("diagnostic");
    expect(report.evidenceIdentity.evidenceMode).toBe("diagnostic");
    expect(report.evidenceIdentity.confirmatoryIneligibilityReason).toBe(
      "diagnostic-evaluation-does-not-claim-confirmatory",
    );
    expect(report.outputPath).toContain("/calibration-fade-v2/diagnostic/");
    expect(report.outputPath).not.toBe(DEFAULT_CALIBRATION_FADE_FORWARD_VALIDATION_OUTPUT_PATH);
  });

  it("fails closed when evidenceMode is missing", async () => {
    const fixture = fixtureFiles({
      runId: "run-v2-missing-mode",
      startedAt: POST_FREEZE_1MS,
    });
    const io = createMemoryCalibrationFadeForwardValidationIo(fixture.files, fixture.dirs);
    await expect(
      analyzeCalibrationFadeV2ForwardForRun({
        generatedAt: "2026-09-07T18:00:00.000Z",
        paths: resolveCalibrationFadeV2OutputPaths({
          evidenceMode: "diagnostic",
          captureRunDir: runDir("run-v2-missing-mode"),
        }),
        config: {
          captureRunDir: runDir("run-v2-missing-mode"),
          evidenceMode: "" as CalibrationFadeV2EvidenceMode,
          hypothesisConfigPath: DEFAULT_CALIBRATION_FADE_V2_HYPOTHESIS_CONFIG_PATH,
          provenancePath: DEFAULT_CALIBRATION_FADE_V2_PROVENANCE_PATH,
          importsDir: "data/imports",
          maximumBtcJoinAgeMs: 5000,
          candlesPath: null,
        },
        io,
      }),
    ).rejects.toThrow(/evidenceMode is required/);
  });

  it("includes the required evidence identity tuple on every JSON result", async () => {
    const fixture = fixtureFiles({
      runId: "run-v2-identity",
      startedAt: POST_FREEZE_1MS,
    });
    const io = createMemoryCalibrationFadeForwardValidationIo(fixture.files, fixture.dirs);
    const { report, evidenceIdentity } = await analyze({
      runId: "run-v2-identity",
      evidenceMode: "confirmatory",
      io,
    });
    assertCompleteV2EvidenceIdentity(evidenceIdentity);
    expect(report.hypothesisId).toBe(CALIBRATION_FADE_V2_HYPOTHESIS_ID);
    expect(report.hypothesisVersion).toBe("v2");
    expect(report.hypothesisConfigurationHash).toBe(evidenceIdentity.configurationHash);
    expect(report.freezeCommitSha).toBe(CALIBRATION_FADE_V2_FREEZE_COMMIT_SHA);
    expect(report.sourceRecordType).toBe(V2_REQUIRED_SOURCE_RECORD_TYPE);
    expect(report.sourceContractId).toBe(V2_REQUIRED_SOURCE_RECORD_TYPE);
    expect(report.captureRunId).toBe("run-v2-identity");
    expect(report.captureStartedAt).toBe(POST_FREEZE_1MS);
    expect(report.evidenceMode).toBe("confirmatory");
    expect(report.featureCompatibility.spotUsedForVolatility).toBe(false);
  });

  it("shares v1 hypothesis lineage but remains distinct by version, hash, and source contract", () => {
    const io = createMemoryCalibrationFadeForwardValidationIo({
      [DEFAULT_CALIBRATION_FADE_V2_HYPOTHESIS_CONFIG_PATH]: V2_CONFIG_TEXT,
    });
    const { spec } = loadCalibrationFadeV2HypothesisSpec({ io });
    const v2Hash = fnv1a32(stableStringify(spec));
    expect(spec.hypothesisId).toBe(
      "atlas-volatilityProbabilityTime-vol-high-coarse-prob-1-coarse-time-early-over",
    );
    expect(spec.hypothesisVersion).toBe("v2");
    expect(spec.volatilityDefinition.sourceRecordType).toBe("exchange-completed-1m-ohlc");
    expect(v2Hash).not.toBe("0bda8f23");
  });
});

describe("analyzeCalibrationFadeV2ForwardForRun candle source and spot isolation", () => {
  it("fails closed when the completed-candle artifact is absent, even if btc-spot exists", async () => {
    const fixture = fixtureFiles({
      runId: "run-v2-spot-only",
      startedAt: POST_FREEZE_1MS,
      candles: null,
      spots: highVolSpot(QUOTE_MS),
    });
    const io = createMemoryCalibrationFadeForwardValidationIo(fixture.files, fixture.dirs);
    await expect(
      analyze({ runId: "run-v2-spot-only", evidenceMode: "diagnostic", io }),
    ).rejects.toThrow(/completed-candle source unavailable|silent spot-tick fallback is forbidden/);
  });

  it("does not treat Aug-4-style diagnostic execution without candles as synthesizable from spot", async () => {
    const fixture = fixtureFiles({
      runId: "run-v2-aug4",
      startedAt: AUG4_START,
      candles: null,
      spots: highVolSpot(QUOTE_MS),
    });
    const io = createMemoryCalibrationFadeForwardValidationIo(fixture.files, fixture.dirs);
    await expect(analyze({ runId: "run-v2-aug4", evidenceMode: "diagnostic", io })).rejects.toThrow(
      /completed-candle source unavailable|silent spot-tick fallback is forbidden/,
    );
  });

  it("computes high candle volatility while flat spot is used only for BTC join", async () => {
    const fixture = fixtureFiles({
      runId: "run-v2-flat-spot",
      startedAt: POST_FREEZE_1MS,
      spots: flatSpot(QUOTE_MS - 1_000),
      candles: defaultCandles(OPEN0_MS, QUOTE_MS - 1_000),
    });
    const io = createMemoryCalibrationFadeForwardValidationIo(fixture.files, fixture.dirs);
    const { report } = await analyze({
      runId: "run-v2-flat-spot",
      evidenceMode: "confirmatory",
      io,
    });
    expect(report.featureCompatibility.spotUsedForVolatility).toBe(false);
    expect(report.gatePassCounts.btcJoinAvailable).toBeGreaterThan(0);
    expect(report.gatePassCounts.volatilityAvailable).toBeGreaterThan(0);
    expect(report.gatePassCounts.highVolatility).toBeGreaterThan(0);
    expect(report.warnings.some((warning) => warning.includes("btc-spot.jsonl was not a volatility source"))).toBe(
      true,
    );
  });

  it("does not abort the run when early quotes lack candle warmup", async () => {
    const early = QUOTE_MS - 10 * 60_000;
    const fixture = fixtureFiles({
      runId: "run-v2-warmup",
      startedAt: POST_FREEZE_1MS,
      quotes: [topOfBook(early), topOfBook(QUOTE_MS)].join("\n"),
    });
    const io = createMemoryCalibrationFadeForwardValidationIo(fixture.files, fixture.dirs);
    const { report } = await analyze({
      runId: "run-v2-warmup",
      evidenceMode: "diagnostic",
      io,
    });
    expect(report.recordsScanned).toBe(2);
    expect(report.volatilityWindowRejections["insufficient-completed-minutes"]).toBeGreaterThan(0);
    expect(report.gatePassCounts.volatilityAvailable).toBeGreaterThan(0);
  });

  it("allows pre-freeze candle closes as confirmatory warmup after post-freeze observation", async () => {
    const runStart = "2026-09-06T23:00:00.000Z";
    const candles = Array.from({ length: 11 }, (_, index) =>
      candleRecord({
        openTimeMs: WARMUP_OPEN0_MS + index * 60_000,
        close: highVolClose(index),
        observedAtMs: Date.parse(runStart),
        firstObservedAtMs: Date.parse(runStart),
        retrievalMethod: "startup-backfill",
      }),
    ).join("\n");
    const fixture = fixtureFiles({
      runId: "run-v2-backfill",
      startedAt: runStart,
      quoteMs: WARMUP_QUOTE_MS,
      candles,
      spots: flatSpot(WARMUP_QUOTE_MS - 500),
      quotes: topOfBook(WARMUP_QUOTE_MS),
    });
    const io = createMemoryCalibrationFadeForwardValidationIo(fixture.files, fixture.dirs);
    const { report } = await analyze({
      runId: "run-v2-backfill",
      evidenceMode: "confirmatory",
      io,
    });
    expect(report.confirmatoryEligibility).toBe(true);
    expect(report.gatePassCounts.volatilityAvailable).toBeGreaterThan(0);
    expect(Date.parse(candles.split("\n")[0] ? JSON.parse(candles.split("\n")[0]!).candleCloseTime : "")).toBeLessThan(
      FREEZE_MS,
    );
  });

  it("keeps a pre-freeze run non-confirmatory even when analyzed diagnostically", async () => {
    const fixture = fixtureFiles({
      runId: "run-v2-pre-freeze-diag",
      startedAt: AUG4_START,
      candles: defaultCandles(OPEN0_MS, QUOTE_MS - 1_000),
    });
    const io = createMemoryCalibrationFadeForwardValidationIo(fixture.files, fixture.dirs);
    const { report } = await analyze({
      runId: "run-v2-pre-freeze-diag",
      evidenceMode: "diagnostic",
      io,
    });
    expect(report.evidenceMode).toBe("diagnostic");
    expect(report.confirmatoryEligibility).toBe(false);
    expect(report.confirmatoryIneligibilityReason).toBe("run-start-not-strictly-after-v2-freeze");
  });

  it("proves the v2 vol builder cannot receive spot: join helpers stay outside the window module", () => {
    const analyzer = readFileSync(
      new URL("./analyzeCalibrationFadeV2ForwardForRun.ts", import.meta.url),
      "utf8",
    );
    const windowBuilder = readFileSync(
      new URL("./buildHistoricalReplicaVolatilityWindow.ts", import.meta.url),
      "utf8",
    );
    expect(analyzer).toMatch(/preloadBtcSpotSeries/);
    expect(analyzer).toMatch(/resolveCausalBtcPrice/);
    expect(analyzer).toMatch(/buildHistoricalReplicaVolatilityWindow\(\{\s*index: candleIndex,\s*timestampMs: quote\.timestampMs,/);
    expect(analyzer).not.toMatch(/buildValidatedCausalVolatilityWindow/);
    expect(windowBuilder).not.toMatch(/btc-spot|preloadBtcSpot|resolveCausalBtcPrice|maximumSourceGapMs/);
  });
});

describe("v1 runtime remains the spot-gap path", () => {
  it("leaves v1 analyzer wiring on maximumSourceGapMs from the frozen v1 spec", () => {
    const v1Analyzer = readFileSync(
      new URL("../calibrationFadeForwardValidation/analyzeCalibrationFadeForwardForRun.ts", import.meta.url),
      "utf8",
    );
    const v1Window = readFileSync(
      new URL("../calibrationFadeForwardValidation/buildValidatedCausalVolatilityWindow.ts", import.meta.url),
      "utf8",
    );
    expect(v1Analyzer).toMatch(/maximumSourceGapMs: spec\.volatilityDefinition\.maximumSourceGapMs/);
    expect(v1Window).toMatch(/maximumObservedSourceGapMs > maximumSourceGapMs/);
    expect(v1Window).toMatch(/sourceRecordType: "btc-spot-jsonl-points"/);
  });
});
