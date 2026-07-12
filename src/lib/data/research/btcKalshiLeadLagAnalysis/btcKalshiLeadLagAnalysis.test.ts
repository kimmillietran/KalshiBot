import { describe, expect, it } from "vitest";

import {
  analyzeBtcKalshiLeadLagForRun,
  classifyLeadLagInterpretation,
  computeBtcReturnAtTime,
  computeForwardResponses,
  createBtcKalshiLeadLagAnalysisConfig,
  createMemoryBtcKalshiLeadLagIo,
  detectBtcTriggers,
  findLastBtcAtOrBefore,
  joinBtcCausally,
  parseBtcKalshiLeadLagAnalysisArgv,
  resolveMarketContractSemantics,
  RESPONSE_WINDOWS_MS,
  serializeBtcKalshiLeadLagAnalysisHtml,
  validateSelectedRunDirectory,
  BtcKalshiLeadLagAnalysisError,
} from "./index";
import type { BtcSpotPoint } from "./causalBtcJoin";
import type { QuoteSnapshot } from "./btcKalshiLeadLagAnalysisTypes";
import { crossedMagnitudeBoundary, resolveBtcMagnitudeBin } from "./leadLagBins";
import { basisPointsChange, resolveQuoteRetentionWindowMs } from "./leadLagUtils";

const RUN_DIR = "data/live-capture/forward-quotes/run-lead-lag";
const MARKET_A = "KXBTC15M-26JUL111200-00";
const MARKET_B = "KXBTC15M-26JUL111215-15";
const BASE_MS = Date.parse("2026-07-11T12:00:00.000Z");

function isoAt(offsetMs: number): string {
  return new Date(BASE_MS + offsetMs).toISOString();
}

function topOfBookLine(input: {
  marketTicker: string;
  offsetMs: number;
  yesBid?: number | null;
  yesAsk?: number | null;
  noBid?: number | null;
  noAsk?: number | null;
  bookState?: string;
  sequence?: number;
  yesBidSize?: number | null;
  noBidSize?: number | null;
  exchangeTimestampMs?: number;
}) {
  return JSON.stringify({
    runId: "run-lead-lag",
    marketTicker: input.marketTicker,
    eventTicker: input.marketTicker.slice(0, -3),
    seriesTicker: "KXBTC15M",
    receivedAtLocal: isoAt(input.offsetMs),
    exchangeTimestampMs: input.exchangeTimestampMs ?? BASE_MS + input.offsetMs,
    sequence: input.sequence ?? 1,
    bookState: input.bookState ?? "valid",
    yesBestBidCents: input.yesBid ?? 50,
    yesBestAskCents: input.yesAsk ?? 52,
    noBestBidCents: input.noBid ?? 48,
    noBestAskCents: input.noAsk ?? 50,
    yesBestBidSize: input.yesBidSize ?? 10,
    noBestBidSize: input.noBidSize ?? 10,
  });
}

function btcLine(offsetMs: number, priceUsd: number) {
  return JSON.stringify({
    runId: "run-lead-lag",
    source: "coinbase",
    receivedAtLocal: isoAt(offsetMs),
    exchangeTimestampMs: BASE_MS + offsetMs,
    priceUsd,
  });
}

function buildRegressionFixtureFiles() {
  const topOfBook = [
    topOfBookLine({ marketTicker: MARKET_A, offsetMs: 0, yesBid: 50, yesAsk: 52 }),
    topOfBookLine({ marketTicker: MARKET_A, offsetMs: 1_000, yesBid: 50, yesAsk: 52 }),
    topOfBookLine({ marketTicker: MARKET_A, offsetMs: 2_000, yesBid: 52, yesAsk: 54, sequence: 2 }),
    topOfBookLine({ marketTicker: MARKET_A, offsetMs: 6_000, yesBid: 48, yesAsk: 50, sequence: 3 }),
    topOfBookLine({ marketTicker: MARKET_A, offsetMs: 10_000, yesBid: 50, yesAsk: 52, sequence: 4 }),
    topOfBookLine({
      marketTicker: MARKET_A,
      offsetMs: 12_000,
      yesBid: 50,
      yesAsk: 52,
      bookState: "gap-detected",
      sequence: 5,
    }),
    topOfBookLine({
      marketTicker: MARKET_B,
      offsetMs: 0,
      yesBid: 40,
      yesAsk: 42,
      sequence: 1,
    }),
    topOfBookLine({
      marketTicker: MARKET_B,
      offsetMs: 65_000,
      yesBid: 55,
      yesAsk: 57,
      sequence: 2,
    }),
  ];

  const btcSpots = [
    btcLine(0, 100_000),
    btcLine(4_000, 100_000),
    btcLine(5_000, 100_060),
    btcLine(10_000, 100_060),
    btcLine(15_000, 99_940),
    btcLine(20_000, 99_940),
    btcLine(30_000, 100_100),
    btcLine(60_000, 100_250),
  ];

  return {
    [`${RUN_DIR}/capture-health.json`]: JSON.stringify({
      runId: "run-lead-lag",
      config: { durationSeconds: 3600 },
      capture: { topOfBookRecordCount: topOfBook.length },
      orderbook: { validTopOfBookRecords: topOfBook.length - 1, sequenceGapCount: 1 },
    }),
    [`${RUN_DIR}/market-metadata.jsonl`]: [
      JSON.stringify({
        runId: "run-lead-lag",
        marketTicker: MARKET_A,
        seriesTicker: "KXBTC15M",
        closeTime: isoAt(900_000),
        floor_strike: 100_000,
      }),
      JSON.stringify({
        runId: "run-lead-lag",
        marketTicker: MARKET_B,
        seriesTicker: "KXBTC15M",
        closeTime: isoAt(60_000),
        floor_strike: 100_000,
      }),
    ].join("\n"),
    [`${RUN_DIR}/top-of-book.jsonl`]: topOfBook.join("\n"),
    [`${RUN_DIR}/btc-spot.jsonl`]: btcSpots.join("\n"),
    "data/research-results/capture-health-audit.json": JSON.stringify({
      selectedRunId: "run-lead-lag",
      sourceRunIds: ["run-lead-lag"],
      summary: {
        verdict: "capture-research-ready",
        runDurationSeconds: 3600,
        bookState: { validBookShare: 0.99, sequenceGapCount: 1, reconnectCount: 0 },
        btcJoin: { joinCoverageShare: 1 },
      },
    }),
    "data/research-results/capture-health-reconciliation.json": JSON.stringify({
      selectedRunId: "other-run",
      sourceRunIds: ["other-run"],
      summary: { selectedRunId: "other-run" },
    }),
    "data/research-results/btc-kalshi-lead-lag-events.jsonl": "",
    "data/research-results/btc-kalshi-lead-lag-analysis.json": "",
  };
}

describe("causalBtcJoin", () => {
  const points: BtcSpotPoint[] = [
    { timestampMs: 1_000, receivedAtLocal: isoAt(1_000), priceUsd: 100 },
    { timestampMs: 5_000, receivedAtLocal: isoAt(5_000), priceUsd: 101 },
    { timestampMs: 9_000, receivedAtLocal: isoAt(9_000), priceUsd: 102 },
  ];

  it("uses latest BTC sample at or before Kalshi timestamp", () => {
    expect(findLastBtcAtOrBefore(points, 6_000)?.priceUsd).toBe(101);
    expect(findLastBtcAtOrBefore(points, 5_000)?.priceUsd).toBe(101);
  });

  it("never uses a future BTC sample", () => {
    expect(findLastBtcAtOrBefore(points, 4_999)?.priceUsd).toBe(100);
    expect(findLastBtcAtOrBefore(points, 4_999)?.timestampMs).toBeLessThanOrEqual(4_999);
  });

  it("rejects stale joins beyond maximum age", () => {
    const join = joinBtcCausally(points, 8_000, 2_000);
    expect(join.joined).toBe(false);
    expect(join.stale).toBe(true);
  });

  it("joins exactly at timestamp match", () => {
    const join = joinBtcCausally(points, 5_000, 5_000);
    expect(join.joined).toBe(true);
    expect(join.priceUsd).toBe(101);
    expect(join.sampleAgeMs).toBe(0);
  });

  it("handles missing BTC sample", () => {
    expect(findLastBtcAtOrBefore(points, 500)).toBeNull();
    expect(joinBtcCausally(points, 500, 5_000).joined).toBe(false);
  });
});

describe("computeBtcReturns", () => {
  const points: BtcSpotPoint[] = [
    { timestampMs: 0, receivedAtLocal: isoAt(0), priceUsd: 100_000 },
    { timestampMs: 5_000, receivedAtLocal: isoAt(5_000), priceUsd: 100_050 },
    { timestampMs: 15_000, receivedAtLocal: isoAt(15_000), priceUsd: 99_900 },
    { timestampMs: 30_000, receivedAtLocal: isoAt(30_000), priceUsd: 100_200 },
    { timestampMs: 60_000, receivedAtLocal: isoAt(60_000), priceUsd: 100_400 },
  ];

  it("computes fixed-horizon returns with basis-point sign convention", () => {
    const fiveSecond = computeBtcReturnAtTime(points, 5_000, 5_000);
    expect(fiveSecond?.btcReturnBps).toBeCloseTo(5, 1);
    expect(fiveSecond?.btcDirection).toBe("up");

    const fifteenSecond = computeBtcReturnAtTime(points, 15_000, 15_000);
    expect(fifteenSecond?.btcReturnBps).toBeLessThan(0);
    expect(fifteenSecond?.btcDirection).toBe("down");
  });

  it("covers 30-second and 60-second horizons", () => {
    expect(computeBtcReturnAtTime(points, 30_000, 30_000)).not.toBeNull();
    expect(computeBtcReturnAtTime(points, 60_000, 60_000)).not.toBeNull();
  });

  it("uses positive basis points for upward moves", () => {
    expect(basisPointsChange(100_000, 100_100)).toBe(10);
  });
});

describe("resolveMarketContractSemantics", () => {
  it("maps KXBTC15M above-threshold contracts", () => {
    const semantics = resolveMarketContractSemantics({
      marketTicker: MARKET_A,
      seriesTicker: "KXBTC15M",
      eventTicker: "KXBTC15M-26JUL111200",
      closeTimeMs: BASE_MS + 900_000,
      metadataRecord: { floor_strike: 100_000 },
    });
    expect(semantics.comparisonDirection).toBe("above-threshold");
    expect(semantics.exclusionReason).toBeNull();
  });

  it("excludes unsupported series tickers", () => {
    const semantics = resolveMarketContractSemantics({
      marketTicker: "OTHER-TEST",
      seriesTicker: "OTHER",
      eventTicker: null,
      closeTimeMs: null,
      metadataRecord: null,
    });
    expect(semantics.comparisonDirection).toBeNull();
    expect(semantics.exclusionReason).toContain("unsupported-series");
  });
});

describe("triggerDetection", () => {
  it("retains first threshold crossing and suppresses overlapping events", () => {
    const points: BtcSpotPoint[] = [
      { timestampMs: 0, receivedAtLocal: isoAt(0), priceUsd: 100_000 },
      { timestampMs: 5_000, receivedAtLocal: isoAt(5_000), priceUsd: 100_060 },
      { timestampMs: 6_000, receivedAtLocal: isoAt(6_000), priceUsd: 100_120 },
      { timestampMs: 7_000, receivedAtLocal: isoAt(7_000), priceUsd: 100_180 },
    ];
    const result = detectBtcTriggers({
      points,
      horizonsMs: [5_000],
      triggerCooldownMs: 30_000,
    });
    expect(result.triggers.length).toBeGreaterThan(0);
    expect(crossedMagnitudeBoundary(0, 8, 5)).toBe(true);
    expect(resolveBtcMagnitudeBin(8)).toBe("5-to-10-bps");
  });

  it("suppresses repeated crossings inside the cooldown window", () => {
    const points: BtcSpotPoint[] = [
      { timestampMs: 0, receivedAtLocal: isoAt(0), priceUsd: 100_000 },
      { timestampMs: 5_000, receivedAtLocal: isoAt(5_000), priceUsd: 100_060 },
      { timestampMs: 5_500, receivedAtLocal: isoAt(5_500), priceUsd: 100_000 },
      { timestampMs: 6_000, receivedAtLocal: isoAt(6_000), priceUsd: 100_060 },
    ];
    const result = detectBtcTriggers({
      points,
      horizonsMs: [5_000],
      triggerCooldownMs: 30_000,
    });
    expect(result.suppressedOverlappingTriggerCount).toBeGreaterThan(0);
    expect(result.triggers).toHaveLength(1);
  });
});

describe("quote retention window", () => {
  it("bounds retained quote timestamps around trigger and response horizons", () => {
    const window = resolveQuoteRetentionWindowMs({
      triggerTimestampsMs: [10_000, 40_000],
      maximumBtcHorizonMs: 60_000,
      maximumResponseWindowMs: 60_000,
      responseMatchToleranceMs: 1_500,
    });
    expect(window?.startMs).toBe(10_000 - 60_000 - 5_000);
    expect(window?.endMs).toBe(40_000 + 60_000 + 1_500);
  });
});

describe("forwardResponse", () => {
  const triggerQuote: QuoteSnapshot = {
    timestampMs: BASE_MS,
    receivedAtLocal: isoAt(0),
    yesBidCents: 50,
    yesAskCents: 52,
    noBidCents: 48,
    noAskCents: 50,
    yesMidCents: 51,
    noMidCents: 49,
    spreadCents: 2,
    executableBuyYesCents: 52,
    executableSellYesCents: 50,
    bestDisplayedSize: 10,
    bookValid: true,
    bookSynchronized: true,
    quoteAgeMs: 100,
    sequence: 1,
  };

  const quotes: QuoteSnapshot[] = [
    triggerQuote,
    {
      ...triggerQuote,
      timestampMs: BASE_MS + 2_000,
      yesBidCents: 52,
      yesAskCents: 54,
      yesMidCents: 53,
      sequence: 2,
    },
  ];

  it("measures directionally correct upward response after BTC up", () => {
    const responses = computeForwardResponses({
      triggerTimestampMs: BASE_MS,
      triggerQuote,
      quotes,
      closeTimeMs: BASE_MS + 900_000,
      btcDirection: "up",
      comparisonDirection: "above-threshold",
      responseWindowsMs: RESPONSE_WINDOWS_MS,
      responseMatchToleranceMs: 1_500,
      stalenessBoundMs: 5_000,
    });
    const twoSecond = responses.find((response) => response.responseWindowMs === 2_000);
    expect(twoSecond?.directionallyCorrect).toBe(true);
    expect((twoSecond?.signedYesMidResponseCents ?? 0) > 0).toBe(true);
  });
});

describe("classifyLeadLagInterpretation", () => {
  const quality = {
    selectedRunId: "run",
    runDurationSeconds: 3600,
    validBookShare: 0.99,
    btcJoinCoverageShare: 1,
    bidSizeCoverageShare: 0.95,
    reconnectCount: 0,
    sequenceGapCount: 0,
    suspectedSystemSleepSeconds: 0,
    captureVerdict: "capture-research-ready",
    reconciliationVerdict: "capture-research-ready",
  };

  it("classifies insufficient data below minimum triggers", () => {
    const summary = classifyLeadLagInterpretation({
      triggerCount: 5,
      eligibleTriggerCount: 5,
      excludedTriggerCount: 0,
      minimumTriggersForClassification: 20,
      minimumEligibleTriggersForStrongClassification: 100,
      selectedRunQuality: quality,
      directionalResponseShare: null,
      consistentDirectionAcrossBins: false,
      executableSideVisible: false,
      thresholdCrossingEventShare: null,
      medianSignedResponseAt5Seconds: null,
    });
    expect(summary.interpretationClassification).toBe("insufficient-data");
  });
});

describe("parseBtcKalshiLeadLagAnalysisArgv", () => {
  it("requires explicit --capture-run-dir", () => {
    expect(() => parseBtcKalshiLeadLagAnalysisArgv([])).toThrow(
      "Missing required --capture-run-dir.",
    );
  });
});

describe("analyzeBtcKalshiLeadLagForRun", () => {
  it("rejects unknown run directories", () => {
    const io = createMemoryBtcKalshiLeadLagIo({});
    expect(() => validateSelectedRunDirectory(io, "missing/run")).toThrow(
      BtcKalshiLeadLagAnalysisError,
    );
  });

  it("regression fixture distinguishes immediate, delayed, wrong, and missing responses", async () => {
    const files = buildRegressionFixtureFiles();
    const io = createMemoryBtcKalshiLeadLagIo(files);
    const report = await analyzeBtcKalshiLeadLagForRun({
      generatedAt: "2026-07-11T12:30:00.000Z",
      outputPath: "data/research-results/btc-kalshi-lead-lag-analysis.json",
      htmlOutputPath: "data/reports/btc-kalshi-lead-lag-analysis.html",
      eventsOutputPath: "data/research-results/btc-kalshi-lead-lag-events.jsonl",
      config: createBtcKalshiLeadLagAnalysisConfig({
        captureRunDir: RUN_DIR,
        triggerCooldownMs: 30_000,
        minimumTriggersForClassification: 1,
      }),
      io,
    });

    expect(report.analysisScope).toBe("selected-run");
    expect(report.selectedRunId).toBe("run-lead-lag");
    expect(report.recordsScanned).toBeGreaterThan(0);
    expect(report.btcRecordsScanned).toBeGreaterThan(0);
    expect(report.triggerCount).toBeGreaterThan(0);
    expect(report.causalJoinQuality.btcJoinDirection).toBe("backward-only");
    expect(report.causalJoinQuality.futureLeakageGuardStatus).toBe("pass");
    expect(report.marketCoverage.marketsWithDirectionalSemantics).toBeGreaterThan(0);
    expect(serializeBtcKalshiLeadLagAnalysisHtml(report)).toContain(
      "BTC-to-Kalshi Lead-Lag Characterization",
    );
    expect(files["data/research-results/btc-kalshi-lead-lag-events.jsonl"]).toContain("eventId");
    expect(report.warnings.some((warning) => warning.includes("reconciliation"))).toBe(true);
  });
});
