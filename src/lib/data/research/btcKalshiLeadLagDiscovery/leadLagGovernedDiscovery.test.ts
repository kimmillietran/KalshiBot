import { describe, expect, it } from "vitest";

import { createMemoryBtcKalshiLeadLagIo } from "../btcKalshiLeadLagAnalysis";
import { joinBtcCausally, findLastBtcAtOrBefore } from "../btcKalshiLeadLagAnalysis/causalBtcJoin";
import type { BtcSpotPoint } from "../btcKalshiLeadLagAnalysis/causalBtcJoin";
import type { LeadLagEventRecord } from "../btcKalshiLeadLagAnalysis/btcKalshiLeadLagAnalysisTypes";
import { RESPONSE_WINDOWS_MS } from "../btcKalshiLeadLagAnalysis/btcKalshiLeadLagAnalysisTypes";

import {
  aggregateLeadLagDiscoveryCells,
  declareLeadLagSearchUniverse,
} from "./aggregateLeadLagDiscoveryCells";
import {
  buildLeadLagResearchSplitManifest,
  classifyLeadLagContamination,
} from "./buildLeadLagResearchSplitManifest";
import {
  buildLeadLagGovernedDiscoveryReport,
} from "./buildLeadLagGovernedDiscoveryReport";
import { createTrainOnlyDiscoveryIo } from "./createTrainOnlyDiscoveryIo";
import {
  LEAD_LAG_DISCOVERY_HYPOTHESIS_COUNT,
  LEAD_LAG_STRUCTURAL_CELL_COUNT,
  LeadLagGovernedDiscoveryError,
  type LeadLagDiscoveryIo,
} from "./leadLagDiscoveryTypes";
import { rankLeadLagDiscoveryCandidates } from "./rankLeadLagDiscoveryCandidates";
import { parseLeadLagGovernedDiscoveryArgv } from "./parseLeadLagGovernedDiscoveryArgv";

const TRAIN = "data/live-capture/forward-quotes/2026-09-08T07-46-44-416Z";
const VALIDATION = "data/live-capture/forward-quotes/2026-09-09T06-39-04-259Z";
const HOLDOUT = "data/live-capture/forward-quotes/2026-09-09T20-37-36-719Z";
const TRAIN_ID = "2026-09-08T07-46-44-416Z";
const VALIDATION_ID = "2026-09-09T06-39-04-259Z";
const HOLDOUT_ID = "2026-09-09T20-37-36-719Z";
const MARKET_A = "KXBTC15M-26SEP081200-00";
const BASE_MS = Date.parse("2026-09-08T12:00:00.000Z");

function isoAt(offsetMs: number): string {
  return new Date(BASE_MS + offsetMs).toISOString();
}

function topOfBookLine(input: {
  runId: string;
  marketTicker: string;
  offsetMs: number;
  yesBid?: number;
  yesAsk?: number;
  sequence?: number;
}): string {
  return JSON.stringify({
    runId: input.runId,
    marketTicker: input.marketTicker,
    eventTicker: input.marketTicker.slice(0, -3),
    seriesTicker: "KXBTC15M",
    receivedAtLocal: isoAt(input.offsetMs),
    exchangeTimestampMs: BASE_MS + input.offsetMs,
    sequence: input.sequence ?? 1,
    bookState: "valid",
    yesBestBidCents: input.yesBid ?? 50,
    yesBestAskCents: input.yesAsk ?? 52,
    noBestBidCents: 48,
    noBestAskCents: 50,
    yesBestBidSize: 10,
    noBestBidSize: 10,
  });
}

function btcLine(runId: string, offsetMs: number, priceUsd: number): string {
  return JSON.stringify({
    runId,
    source: "coinbase",
    receivedAtLocal: isoAt(offsetMs),
    exchangeTimestampMs: BASE_MS + offsetMs,
    priceUsd,
  });
}

function researchReadyAudit(runId: string, captureRunDir: string, tob: string, spot: string): string {
  const tobCount = tob.split("\n").filter(Boolean).length;
  const spotCount = spot.split("\n").filter(Boolean).length;
  return JSON.stringify({
    generatedAt: "2026-09-10T00:00:00.000Z",
    analysisVersion: "selected-run-capture-health-v1",
    selectedRunId: runId,
    captureRunDir,
    sourceRunIds: [runId],
    recordsScanned: tobCount,
    summary: {
      verdict: "capture-research-ready",
      recommendedNextAction: "continue-forward-research",
      runDurationSeconds: runId === HOLDOUT_ID ? 14_400 : 28_800,
      topOfBookCount: tobCount,
      btcSpotCount: spotCount,
      bookState: { validBookShare: 1, sequenceGapCount: 0, reconnectCount: 0 },
      btcJoin: { joinCoverageShare: 1 },
      continuity: { p90TopOfBookGapMs: 250 },
    },
    inputArtifactIdentities: [
      {
        path: `${captureRunDir}/top-of-book.jsonl`,
        role: "top-of-book",
        sizeBytes: Buffer.byteLength(tob, "utf8"),
        mtimeMs: Buffer.byteLength(tob, "utf8"),
        recordCount: tobCount,
      },
      {
        path: `${captureRunDir}/btc-spot.jsonl`,
        role: "btc-spot",
        sizeBytes: Buffer.byteLength(spot, "utf8"),
        mtimeMs: Buffer.byteLength(spot, "utf8"),
        recordCount: spotCount,
      },
    ],
  });
}

function buildRunFiles(runId: string, captureRunDir: string): Record<string, string> {
  const topOfBook = [
    topOfBookLine({ runId, marketTicker: MARKET_A, offsetMs: 0, yesBid: 50, yesAsk: 52 }),
    topOfBookLine({ runId, marketTicker: MARKET_A, offsetMs: 1_000, yesBid: 50, yesAsk: 52, sequence: 2 }),
    topOfBookLine({ runId, marketTicker: MARKET_A, offsetMs: 5_000, yesBid: 53, yesAsk: 55, sequence: 3 }),
    topOfBookLine({ runId, marketTicker: MARKET_A, offsetMs: 6_000, yesBid: 54, yesAsk: 56, sequence: 4 }),
    topOfBookLine({ runId, marketTicker: MARKET_A, offsetMs: 10_000, yesBid: 55, yesAsk: 57, sequence: 5 }),
    topOfBookLine({ runId, marketTicker: MARKET_A, offsetMs: 15_000, yesBid: 56, yesAsk: 58, sequence: 6 }),
    topOfBookLine({ runId, marketTicker: MARKET_A, offsetMs: 30_000, yesBid: 57, yesAsk: 59, sequence: 7 }),
    topOfBookLine({ runId, marketTicker: MARKET_A, offsetMs: 60_000, yesBid: 58, yesAsk: 60, sequence: 8 }),
  ].join("\n");

  const btcSpots = [
    btcLine(runId, 0, 100_000),
    btcLine(runId, 4_000, 100_000),
    btcLine(runId, 5_000, 100_080),
    btcLine(runId, 10_000, 100_100),
    btcLine(runId, 15_000, 100_120),
    btcLine(runId, 30_000, 100_150),
    btcLine(runId, 60_000, 100_200),
  ].join("\n");

  return {
    [`${captureRunDir}/capture-health.json`]: JSON.stringify({
      runId,
      verdict: "degraded-capture",
      config: { durationSeconds: runId === HOLDOUT_ID ? 14_400 : 28_800 },
      startedAt: isoAt(0),
      endedAt: isoAt(runId === HOLDOUT_ID ? 14_400_000 : 28_800_000),
      capture: { topOfBookRecordCount: 8 },
      orderbook: { validTopOfBookRecords: 8, sequenceGapCount: 0 },
    }),
    [`${captureRunDir}/capture-health-audit.json`]: researchReadyAudit(
      runId,
      captureRunDir,
      topOfBook,
      btcSpots,
    ),
    [`${captureRunDir}/capture-run-status.json`]: JSON.stringify({ runId, status: "completed" }),
    [`${captureRunDir}/market-metadata.jsonl`]: JSON.stringify({
      runId,
      marketTicker: MARKET_A,
      seriesTicker: "KXBTC15M",
      closeTime: isoAt(900_000),
      floor_strike: 100_000,
    }),
    [`${captureRunDir}/top-of-book.jsonl`]: topOfBook,
    [`${captureRunDir}/btc-spot.jsonl`]: btcSpots,
  };
}

function createDiscoveryIo(files: Record<string, string>): LeadLagDiscoveryIo {
  const base = createMemoryBtcKalshiLeadLagIo(files, [TRAIN, VALIDATION, HOLDOUT]);
  return {
    ...base,
    fileByteLength: (path: string) => Buffer.byteLength(base.readFile(path), "utf8"),
  };
}

function buildFixtureFiles(): Record<string, string> {
  return {
    ...buildRunFiles(TRAIN_ID, TRAIN),
    ...buildRunFiles(VALIDATION_ID, VALIDATION),
    ...buildRunFiles(HOLDOUT_ID, HOLDOUT),
  };
}

function makeSyntheticEvent(overrides: Partial<LeadLagEventRecord> = {}): LeadLagEventRecord {
  return {
    eventId: "e1",
    selectedRunId: TRAIN_ID,
    marketTicker: MARKET_A,
    triggerTimestamp: isoAt(5_000),
    triggerTimestampMs: BASE_MS + 5_000,
    btcMoveHorizonMs: 5_000,
    btcReturnBps: 8,
    btcMagnitudeBin: "5-to-10-bps",
    btcDirection: "up",
    btcPriceAtTrigger: 100_080,
    marketThresholdUsd: 100_000,
    distanceFromThresholdBps: 8,
    btcAboveThreshold: true,
    thresholdCrossingDuringWindow: false,
    timeRemainingMs: 800_000,
    timeRemainingBin: "10-to-15-minutes",
    impliedProbabilityBin: "50-to-70-percent",
    yesBidAtTrigger: 50,
    yesAskAtTrigger: 52,
    yesMidAtTrigger: 51,
    spreadAtTrigger: 2,
    sizeAtTrigger: 10,
    bookValidAtTrigger: true,
    bookSynchronizedAtTrigger: true,
    quoteAgeMsAtTrigger: 0,
    btcSampleAgeMs: 0,
    contractDirectionResolved: true,
    responses: RESPONSE_WINDOWS_MS.map((responseWindowMs) => ({
      responseWindowMs,
      targetResponseTimeMs: BASE_MS + 5_000 + responseWindowMs,
      actualMatchedResponseTimeMs: BASE_MS + 5_000 + responseWindowMs,
      responseMatchErrorMs: 0,
      yesBidChangeCents: 2,
      yesAskChangeCents: 2,
      yesMidChangeCents: 2,
      noBidChangeCents: -2,
      noAskChangeCents: -2,
      spreadChangeCents: 0,
      sizeChange: 0,
      bookValid: true,
      bookSynchronized: true,
      quoteAgeMs: 0,
      marketStillOpen: true,
      timeRemainingMs: 800_000 - responseWindowMs,
      expectedKalshiDirection: "up",
      actualKalshiDirection: "up",
      directionallyCorrect: true,
      signedYesBidResponseCents: 2,
      signedYesAskResponseCents: 2,
      signedYesMidResponseCents: 2,
      absoluteResponseCents: 2,
      responseLatencyMs: responseWindowMs,
      noResponseWithinWindow: false,
      responseReversal: false,
      maximumAdverseResponseCents: 0,
      maximumFavorableResponseCents: 2,
      lagResponseState: "directionally-correct-response",
    })),
    dataQualityCaveats: [],
    ...overrides,
  };
}

describe("M12.8a lead-lag search universe", () => {
  it("preserves the exact multiplicity universe (4800 × 2 directions)", () => {
    const universe = declareLeadLagSearchUniverse();
    expect(universe.structuralCellCount).toBe(LEAD_LAG_STRUCTURAL_CELL_COUNT);
    expect(universe.structuralCellCount).toBe(4_800);
    expect(universe.hypothesisCount).toBe(LEAD_LAG_DISCOVERY_HYPOTHESIS_COUNT);
    expect(universe.hypothesisCount).toBe(9_600);
    expect(universe.btcReturnHorizonsMs).toEqual([5_000, 15_000, 30_000, 60_000]);
    expect(universe.responseWindowsMs).toHaveLength(8);
    expect(universe.magnitudeBins).toHaveLength(5);
    expect(universe.timeRemainingBins).toHaveLength(5);
    expect(universe.impliedProbabilityBins).toHaveLength(6);
  });
});

describe("M12.8a split + contamination", () => {
  it("builds a deterministic split manifest and changes identity when roles swap", () => {
    const io = createDiscoveryIo(buildFixtureFiles());
    const splitA = buildLeadLagResearchSplitManifest({
      io,
      trainCaptureRunDir: TRAIN,
      validationCaptureRunDir: VALIDATION,
      holdoutCaptureRunDir: HOLDOUT,
    });
    const splitB = buildLeadLagResearchSplitManifest({
      io,
      trainCaptureRunDir: VALIDATION,
      validationCaptureRunDir: TRAIN,
      holdoutCaptureRunDir: HOLDOUT,
    });
    expect(splitA.splitVersion).toBe("lead-lag-research-split-v1");
    expect(splitA.train.contaminationClassification).toBe("clean-for-lead-lag-discovery-role");
    expect(splitA.validation.contaminationClassification).toBe("clean-for-lead-lag-discovery-role");
    expect(splitA.holdout.contaminationClassification).toBe("clean-for-lead-lag-discovery-role");
    expect(splitA.splitManifestHash).not.toBe(splitB.splitManifestHash);
    expect(splitA.confirmatoryReuseForbidden).toBe(true);
  });

  it("rejects previously-inspected validation/holdout as clean OOS", () => {
    const files = buildFixtureFiles();
    files["data/research-results/btc-kalshi-lead-lag-analysis.json"] = JSON.stringify({
      selectedRunId: VALIDATION_ID,
      summary: { interpretationClassification: "measurable-lead-lag-response" },
    });
    const io = createDiscoveryIo(files);
    expect(() =>
      buildLeadLagResearchSplitManifest({
        io,
        trainCaptureRunDir: TRAIN,
        validationCaptureRunDir: VALIDATION,
        holdoutCaptureRunDir: HOLDOUT,
      })
    ).toThrow(/previously inspected/);
  });

  it("classifies missing evidence as clean when no lead-lag outcome artifacts exist", () => {
    const io = createDiscoveryIo(buildFixtureFiles());
    const result = classifyLeadLagContamination({ io, runId: HOLDOUT_ID });
    expect(result.classification).toBe("clean-for-lead-lag-discovery-role");
  });
});

describe("M12.8a train-only IO isolation", () => {
  it("allows train reads and blocks validation/holdout capture paths", async () => {
    const io = createDiscoveryIo(buildFixtureFiles());
    const trainOnly = createTrainOnlyDiscoveryIo({
      baseIo: io,
      trainCaptureRunDir: TRAIN,
      quarantinedCaptureRunDirs: [VALIDATION, HOLDOUT],
    });
    expect(trainOnly.fileExists(`${TRAIN}/btc-spot.jsonl`)).toBe(true);
    expect(() => trainOnly.readFile(`${VALIDATION}/btc-spot.jsonl`)).toThrow(
      LeadLagGovernedDiscoveryError,
    );
    await expect(
      trainOnly.iterateJsonl(`${HOLDOUT}/top-of-book.jsonl`, {
        onLine: () => "continue",
      }),
    ).rejects.toThrow(LeadLagGovernedDiscoveryError);
  });
});

describe("M12.8a cell aggregation + ranking", () => {
  it("retains the full hypothesis universe including losing cells", () => {
    const cells = aggregateLeadLagDiscoveryCells([makeSyntheticEvent()]);
    expect(cells).toHaveLength(LEAD_LAG_DISCOVERY_HYPOTHESIS_COUNT);
    const populated = cells.filter((cell) => cell.eligibleMarketTriggerCount > 0);
    expect(populated.length).toBe(RESPONSE_WINDOWS_MS.length * 2);
    expect(cells.some((cell) => cell.direction === "follow-btc")).toBe(true);
    expect(cells.some((cell) => cell.direction === "reverse-btc")).toBe(true);
  });

  it("does not treat multiple response windows as independent within one cell", () => {
    const cells = aggregateLeadLagDiscoveryCells([makeSyntheticEvent()]);
    const fiveSecond = cells.find(
      (cell) =>
        cell.responseWindowMs === 5_000
        && cell.direction === "follow-btc"
        && cell.btcMoveHorizonMs === 5_000
        && cell.btcMagnitudeBin === "5-to-10-bps"
        && cell.timeRemainingBin === "10-to-15-minutes"
        && cell.impliedProbabilityBin === "50-to-70-percent",
    );
    expect(fiveSecond?.eligibleMarketTriggerCount).toBe(1);
    expect(fiveSecond?.uniqueBtcTriggerCount).toBe(1);
  });

  it("distinguishes independent markets from raw event counts", () => {
    const events = [
      makeSyntheticEvent({ eventId: "e1", marketTicker: `${MARKET_A}-A` }),
      makeSyntheticEvent({
        eventId: "e2",
        marketTicker: `${MARKET_A}-B`,
        triggerTimestampMs: BASE_MS + 5_000,
      }),
    ];
    // Force same structural bins
    for (const event of events) {
      event.btcMagnitudeBin = "5-to-10-bps";
      event.timeRemainingBin = "10-to-15-minutes";
      event.impliedProbabilityBin = "50-to-70-percent";
      event.btcMoveHorizonMs = 5_000;
    }
    const cells = aggregateLeadLagDiscoveryCells(events);
    const cell = cells.find(
      (entry) =>
        entry.responseWindowMs === 5_000
        && entry.direction === "follow-btc"
        && entry.btcMoveHorizonMs === 5_000
        && entry.btcMagnitudeBin === "5-to-10-bps"
        && entry.timeRemainingBin === "10-to-15-minutes"
        && entry.impliedProbabilityBin === "50-to-70-percent",
    );
    expect(cell?.eligibleMarketTriggerCount).toBe(2);
    expect(cell?.uniqueBtcTriggerCount).toBe(1);
    expect(cell?.independentMarketCount).toBe(2);
  });

  it("ranks deterministically and ignores filesystem ordering", () => {
    const cells = aggregateLeadLagDiscoveryCells(
      Array.from({ length: 20 }, (_, index) =>
        makeSyntheticEvent({
          eventId: `e-${index}`,
          marketTicker: `KXBTC15M-M${index}`,
          triggerTimestampMs: BASE_MS + 5_000 + index * 60_000,
        })),
    );
    const a = rankLeadLagDiscoveryCandidates({ cells });
    const b = rankLeadLagDiscoveryCandidates({
      cells: [...cells].reverse(),
    });
    expect(a.candidates.map((c) => c.hypothesisId)).toEqual(
      b.candidates.map((c) => c.hypothesisId),
    );
  });

  it("allows no-promising-candidate when discovery floor is not cleared", () => {
    const cells = aggregateLeadLagDiscoveryCells([makeSyntheticEvent()]);
    const ranked = rankLeadLagDiscoveryCandidates({ cells });
    expect(ranked.status).toBe("no-promising-candidate");
    expect(ranked.candidates).toHaveLength(0);
  });

  it("distinguishes midpoint response from executable observability fields", () => {
    const cells = aggregateLeadLagDiscoveryCells([makeSyntheticEvent()]);
    const cell = cells.find((entry) => entry.eligibleMarketTriggerCount > 0)!;
    expect(cell.midpointResponseDistinctFromExecutable).toBe(true);
    expect(cell.medianSignedMidResponseCents).not.toBeNull();
    expect(cell.medianSignedExecutableAskResponseCents).not.toBeNull();
  });
});

describe("M12.8a causal join regression", () => {
  it("keeps BTC join backward-only with no future leakage", () => {
    const points: BtcSpotPoint[] = [
      { timestampMs: 1_000, receivedAtLocal: isoAt(1_000), priceUsd: 100 },
      { timestampMs: 5_000, receivedAtLocal: isoAt(5_000), priceUsd: 101 },
      { timestampMs: 9_000, receivedAtLocal: isoAt(9_000), priceUsd: 102 },
    ];
    expect(findLastBtcAtOrBefore(points, 4_999)?.priceUsd).toBe(100);
    expect(joinBtcCausally(points, 4_999, 5_000).priceUsd).toBe(100);
    expect(joinBtcCausally(points, 8_000, 2_000).joined).toBe(false);
  });
});

describe("M12.8a governed discovery end-to-end", () => {
  it("runs train-only discovery, never analyzes validation/holdout, and creates no promotion/freeze artifacts", async () => {
    const files = buildFixtureFiles();
    const io = createDiscoveryIo(files);

    const report = await buildLeadLagGovernedDiscoveryReport({
      io,
      trainCaptureRunDir: TRAIN,
      validationCaptureRunDir: VALIDATION,
      holdoutCaptureRunDir: HOLDOUT,
      generatedAt: "2026-09-10T00:00:00.000Z",
    });

    expect(report.discoveryIsolationStatus).toBe("train-only-discovery");
    expect(report.discoveryIsolation.reason).toMatch(/validation\/holdout/i);
    expect(report.quarantine.validationOutcomesAnalyzed).toBe(false);
    expect(report.quarantine.holdoutOutcomesAnalyzed).toBe(false);
    expect(report.quarantine.promotionArtifactCreated).toBe(false);
    expect(report.quarantine.preregistrationArtifactCreated).toBe(false);
    expect(report.quarantine.frozenHypothesisCreated).toBe(false);
    expect(report.quarantine.captureStarted).toBe(false);
    expect(report.evaluatedCellCount).toBe(LEAD_LAG_DISCOVERY_HYPOTHESIS_COUNT);
    expect(report.incidence.trainCaptureHours).toBe(8);
    expect(report.incidence.recordsScanned).toBeGreaterThan(0);
    expect(report.splitManifest.train.runId).toBe(TRAIN_ID);
    expect(report.splitManifest.validation.runId).toBe(VALIDATION_ID);
    expect(report.splitManifest.holdout.runId).toBe(HOLDOUT_ID);
    expect(report.splitManifestHash).toBe(report.splitManifest.splitManifestHash);
    expect(report.outputPaths.outputPath).toContain(report.discoveryIdentityHash);
    expect(report.outputPaths.outputPath).not.toContain("latest");
    expect(report.quarantine.validationOutcomesAnalyzed).toBe(false);
    expect(report.quarantine.holdoutOutcomesAnalyzed).toBe(false);
    // No validation/holdout aggregate result tables in the discovery report body.
    expect("validationResults" in report).toBe(false);
    expect("holdoutResults" in report).toBe(false);
    expect("oosPValues" in report).toBe(false);

    const writtenKeys = Object.keys(files);
    expect(writtenKeys.some((key) => key.includes("candidate-promotions"))).toBe(false);
    expect(writtenKeys.some((key) => key.includes("preregistration"))).toBe(false);
    expect(writtenKeys.some((key) => /hypotheses\/.*\.json$/.test(key))).toBe(false);
    expect(writtenKeys.some((key) => key.includes(TRAIN_ID) && key.includes("top-of-book"))).toBe(
      true,
    );
  });

  it("changes discovery identity when train capture identity changes", async () => {
    const filesA = buildFixtureFiles();
    const reportA = await buildLeadLagGovernedDiscoveryReport({
      io: createDiscoveryIo(filesA),
      trainCaptureRunDir: TRAIN,
      validationCaptureRunDir: VALIDATION,
      holdoutCaptureRunDir: HOLDOUT,
      generatedAt: "2026-09-10T00:00:00.000Z",
    });

    const filesB = buildFixtureFiles();
    filesB[`${TRAIN}/capture-health.json`] = JSON.stringify({
      ...JSON.parse(filesB[`${TRAIN}/capture-health.json`]!),
      note: "identity-perturbation",
    });
    const reportB = await buildLeadLagGovernedDiscoveryReport({
      io: createDiscoveryIo(filesB),
      trainCaptureRunDir: TRAIN,
      validationCaptureRunDir: VALIDATION,
      holdoutCaptureRunDir: HOLDOUT,
      generatedAt: "2026-09-10T00:00:00.000Z",
    });

    expect(reportA.discoveryIdentityHash).not.toBe(reportB.discoveryIdentityHash);
  });

  it("parses required split path argv without latest/mtime flags", () => {
    const parsed = parseLeadLagGovernedDiscoveryArgv([
      "--train-capture-run-dir",
      TRAIN,
      "--validation-capture-run-dir",
      VALIDATION,
      "--holdout-capture-run-dir",
      HOLDOUT,
    ]);
    expect(parsed.trainCaptureRunDir).toBe(TRAIN);
    expect(parsed.validationCaptureRunDir).toBe(VALIDATION);
    expect(parsed.holdoutCaptureRunDir).toBe(HOLDOUT);
  });
});
