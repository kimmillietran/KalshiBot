import { describe, expect, it } from "vitest";

import { createMemoryBtcKalshiLeadLagIo } from "../btcKalshiLeadLagAnalysis";
import type { LeadLagEventRecord } from "../btcKalshiLeadLagAnalysis/btcKalshiLeadLagAnalysisTypes";
import { RESPONSE_WINDOWS_MS } from "../btcKalshiLeadLagAnalysis/btcKalshiLeadLagAnalysisTypes";
import type {
  LeadLagDiscoveryCandidate,
  LeadLagGovernedDiscoveryReport,
} from "../btcKalshiLeadLagDiscovery/leadLagDiscoveryTypes";
import { LEAD_LAG_DISCOVERY_HYPOTHESIS_COUNT } from "../btcKalshiLeadLagDiscovery/leadLagDiscoveryTypes";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import { createValidationOnlyLeadLagIo } from "./createValidationOnlyLeadLagIo";
import {
  evaluateFrozenCandidatesOnValidationEvents,
  lockHoldoutCandidateFromSurvivors,
} from "./evaluateLeadLagValidationCandidates";
import {
  hashValidationContract,
  loadLeadLagDiscoveryReportForValidation,
} from "./loadDiscoveryForValidation";
import { buildLeadLagValidationReport } from "./buildLeadLagValidationReport";
import {
  DEFAULT_LEAD_LAG_VALIDATION_CONTRACT,
  LeadLagValidationError,
  type LeadLagFrozenCandidateDefinition,
  type LeadLagValidationIo,
} from "./leadLagValidationTypes";
import { parseLeadLagValidationArgv } from "./parseLeadLagValidationArgv";

const TRAIN = "data/live-capture/forward-quotes/2026-09-08T07-46-44-416Z";
const VALIDATION = "data/live-capture/forward-quotes/2026-09-09T06-39-04-259Z";
const HOLDOUT = "data/live-capture/forward-quotes/2026-09-09T20-37-36-719Z";
const TRAIN_ID = "2026-09-08T07-46-44-416Z";
const VALIDATION_ID = "2026-09-09T06-39-04-259Z";
const HOLDOUT_ID = "2026-09-09T20-37-36-719Z";
const DISCOVERY_HASH = "a4b5fd8a50bd04207f1041846f30a4f7d9f07bf34b03ddf12e293a2278520a24";
const SPLIT_HASH = "c0a38fee02c5bcbc9b6dd7d61ec1d5f3ea5397c965842af6e90cb686ab4d43c6";
const MARKET_A = "KXBTC15M-26SEP091200-00";
const BASE_MS = Date.parse("2026-09-09T12:00:00.000Z");

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
      runDurationSeconds: 28_800,
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
  const topOfBook = Array.from({ length: 20 }, (_, index) =>
    topOfBookLine({
      runId,
      marketTicker: MARKET_A,
      offsetMs: index * 5_000,
      yesBid: 50 + index,
      yesAsk: 52 + index,
      sequence: index + 1,
    })).join("\n");
  const btcSpots = Array.from({ length: 20 }, (_, index) =>
    btcLine(runId, index * 5_000, 100_000 + index * 80)).join("\n");

  return {
    [`${captureRunDir}/capture-health.json`]: JSON.stringify({
      runId,
      verdict: "degraded-capture",
      config: { durationSeconds: 28_800 },
      startedAt: isoAt(0),
      endedAt: isoAt(28_800_000),
      capture: { topOfBookRecordCount: 20 },
      orderbook: { validTopOfBookRecords: 20, sequenceGapCount: 0 },
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

function frozenCandidate(
  overrides: Partial<LeadLagFrozenCandidateDefinition> & Pick<
    LeadLagFrozenCandidateDefinition,
    "hypothesisId" | "direction" | "discoveryRank"
  >,
): LeadLagFrozenCandidateDefinition {
  const parts = overrides.hypothesisId.split("|");
  return {
    candidateId: overrides.hypothesisId,
    hypothesisId: overrides.hypothesisId,
    discoveryRank: overrides.discoveryRank,
    direction: overrides.direction,
    btcMoveHorizonMs: Number(parts[0]),
    responseWindowMs: Number(parts[1]),
    btcMagnitudeBin: parts[2]!,
    timeRemainingBin: parts[3]!,
    impliedProbabilityBin: parts[4]!,
    trainEligibleMarketTriggerCount: 18,
    trainIndependentMarketCount: 10,
    trainIndependentMarketDayCount: 10,
    trainMedianSignedMidResponseCents: 5,
    trainExecutableObservabilityShare: 0.9,
    trainUniqueBtcTriggerCount: 18,
    ...overrides,
  };
}

function makeDiscoveryCandidate(
  definition: LeadLagFrozenCandidateDefinition,
): LeadLagDiscoveryCandidate {
  return {
    cellId: [
      definition.btcMoveHorizonMs,
      definition.responseWindowMs,
      definition.btcMagnitudeBin,
      definition.timeRemainingBin,
      definition.impliedProbabilityBin,
    ].join("|"),
    hypothesisId: definition.hypothesisId,
    btcMoveHorizonMs: definition.btcMoveHorizonMs,
    responseWindowMs: definition.responseWindowMs,
    btcMagnitudeBin: definition.btcMagnitudeBin,
    timeRemainingBin: definition.timeRemainingBin,
    impliedProbabilityBin: definition.impliedProbabilityBin,
    direction: definition.direction,
    eligibleMarketTriggerCount: definition.trainEligibleMarketTriggerCount,
    uniqueBtcTriggerCount: definition.trainUniqueBtcTriggerCount,
    independentMarketCount: definition.trainIndependentMarketCount,
    independentMarketDayCount: definition.trainIndependentMarketDayCount,
    medianSignedMidResponseCents: definition.trainMedianSignedMidResponseCents,
    meanSignedMidResponseCents: definition.trainMedianSignedMidResponseCents,
    directionalResponseShare: 0.7,
    medianSignedExecutableAskResponseCents: definition.trainMedianSignedMidResponseCents,
    executableObservabilityShare: definition.trainExecutableObservabilityShare,
    midpointResponseDistinctFromExecutable: true,
    rank: definition.discoveryRank,
    rankingScore: 10 - definition.discoveryRank,
    rankingReasons: ["fixture"],
  };
}

function makeDiscoveryReport(
  candidates: LeadLagFrozenCandidateDefinition[],
): LeadLagGovernedDiscoveryReport {
  return {
    generatedAt: "2026-09-10T00:00:00.000Z",
    analysisVersion: "m12.8a-btc-kalshi-lead-lag-governed-discovery-v1",
    disclaimer: "fixture",
    discoveryIsolationStatus: "train-only-discovery",
    discoveryIsolation: {
      status: "train-only-discovery",
      reason: "fixture",
    },
    confirmatoryReuseForbidden: true,
    discoveryStatus: "candidates-shortlisted",
    discoveryIdentityHash: DISCOVERY_HASH,
    splitManifestHash: SPLIT_HASH,
    splitManifest: {
      splitVersion: "lead-lag-research-split-v1",
      createdForAnalysisVersion: "m12.8a-btc-kalshi-lead-lag-governed-discovery-v1",
      confirmatoryReuseForbidden: true,
      train: {
        runId: TRAIN_ID,
        captureRunDir: TRAIN,
        role: "train",
        exploratoryRole: "exploratory-design-data-not-confirmatory",
        confirmatoryReuseForbidden: true,
        contaminationClassification: "clean-for-lead-lag-discovery-role",
        contaminationEvidence: [],
        captureHealthContentHash: "t",
        captureHealthAuditContentHash: "t",
        captureRunStatusContentHash: "t",
        nativeCaptureVerdict: "degraded-capture",
        researchAuditVerdict: "capture-research-ready",
        durationHours: 8,
        topOfBookByteLength: 1,
        btcSpotByteLength: 1,
        btcSpotIdentityHash: "t",
        topOfBookIdentityHash: "t",
        identityHash: "train-identity",
      },
      validation: {
        runId: VALIDATION_ID,
        captureRunDir: VALIDATION,
        role: "validation",
        exploratoryRole: "exploratory-design-data-not-confirmatory",
        confirmatoryReuseForbidden: true,
        contaminationClassification: "clean-for-lead-lag-discovery-role",
        contaminationEvidence: [],
        captureHealthContentHash: "v",
        captureHealthAuditContentHash: "v",
        captureRunStatusContentHash: "v",
        nativeCaptureVerdict: "degraded-capture",
        researchAuditVerdict: "capture-research-ready",
        durationHours: 8,
        topOfBookByteLength: 1,
        btcSpotByteLength: 1,
        btcSpotIdentityHash: "v",
        topOfBookIdentityHash: "v",
        identityHash: "validation-identity",
      },
      holdout: {
        runId: HOLDOUT_ID,
        captureRunDir: HOLDOUT,
        role: "holdout",
        exploratoryRole: "exploratory-design-data-not-confirmatory",
        confirmatoryReuseForbidden: true,
        contaminationClassification: "clean-for-lead-lag-discovery-role",
        contaminationEvidence: [],
        captureHealthContentHash: "h",
        captureHealthAuditContentHash: "h",
        captureRunStatusContentHash: "h",
        nativeCaptureVerdict: "degraded-capture",
        researchAuditVerdict: "capture-research-ready",
        durationHours: 4,
        topOfBookByteLength: 1,
        btcSpotByteLength: 1,
        btcSpotIdentityHash: "h",
        topOfBookIdentityHash: "h",
        identityHash: "holdout-identity",
      },
      splitManifestHash: SPLIT_HASH,
      warnings: [],
    },
    trainArtifactIdentities: {} as LeadLagGovernedDiscoveryReport["trainArtifactIdentities"],
    searchUniverse: {
      btcReturnHorizonsMs: [5_000, 15_000, 30_000, 60_000],
      responseWindowsMs: [...RESPONSE_WINDOWS_MS],
      magnitudeBins: [],
      timeRemainingBins: [],
      impliedProbabilityBins: [],
      responseDirections: ["follow-btc", "reverse-btc"],
      structuralCellCount: 4_800,
      hypothesisCount: LEAD_LAG_DISCOVERY_HYPOTHESIS_COUNT,
      multiplicityDeclaration: "9600 hypotheses examined",
    },
    rankingConfig: {
      rankingVersion: "m12.8a-lead-lag-discovery-ranking-v1",
      maxShortlistSize: 5,
      minEligibleMarketTriggers: 15,
      minIndependentMarkets: 3,
      minIndependentMarketDays: 1,
      minAbsMedianMidResponseCents: 0.5,
      minExecutableObservabilityShare: 0.05,
      requireDeclaredDirection: true,
    },
    leadLagAnalysisConfigurationHash: "cfg",
    trainCaptureHealth: {
      selectedRunId: TRAIN_ID,
      nativeCaptureVerdict: "degraded-capture",
      researchAuditVerdict: "capture-research-ready",
      validBookShare: 1,
      btcJoinCoverageShare: 1,
      bidSizeCoverageShare: null,
      runDurationSeconds: 28_800,
      reconnectCount: 0,
      sequenceGapCount: 0,
      captureHealthSource: "native-capture-health",
    },
    incidence: {
      trainCaptureHours: 8,
      recordsScanned: 1,
      btcRecordsScanned: 1,
      btcTriggerCount: 1,
      btcTriggersPerHour: 1,
      eligibleMarketTriggerCount: 1,
      eligibleMarketTriggersPerHour: 1,
      uniqueMarketCount: 1,
      uniqueMarketsPerHour: 1,
      independentMarketDayCount: 1,
      suppressedOverlappingTriggerCount: 0,
      dependenceNotes: [],
    },
    evaluatedCellCount: LEAD_LAG_DISCOVERY_HYPOTHESIS_COUNT,
    retainedLosingCellCount: LEAD_LAG_DISCOVERY_HYPOTHESIS_COUNT - candidates.length,
    candidates: candidates.map(makeDiscoveryCandidate),
    candidateRankingMethodology: [],
    multiplicityDeclaration: "9600 hypotheses examined",
    quarantine: {
      validationOutcomesAnalyzed: false,
      holdoutOutcomesAnalyzed: false,
      promotionArtifactCreated: false,
      preregistrationArtifactCreated: false,
      frozenHypothesisCreated: false,
      captureStarted: false,
    },
    outputPaths: {
      outputPath: `data/research-results/btc-kalshi-lead-lag/discovery/${DISCOVERY_HASH}/lead-lag-governed-discovery.json`,
      htmlOutputPath: "x",
      cellsOutputPath: "x",
      splitManifestPath: "x",
      trainAnalysisOutputPath: "x",
      trainEventsOutputPath: "x",
    },
    warnings: [],
  } as LeadLagGovernedDiscoveryReport;
}

function makeEvent(input: {
  hypothesisParts: {
    horizon: number;
    window: number;
    magnitude: string;
    time: string;
    prob: string;
  };
  marketTicker: string;
  triggerOffsetMs: number;
  signedMid: number;
  signedAsk?: number;
  directionallyCorrect?: boolean;
}): LeadLagEventRecord {
  return {
    eventId: `${input.marketTicker}-${input.triggerOffsetMs}`,
    selectedRunId: VALIDATION_ID,
    marketTicker: input.marketTicker,
    triggerTimestamp: isoAt(input.triggerOffsetMs),
    triggerTimestampMs: BASE_MS + input.triggerOffsetMs,
    btcMoveHorizonMs: input.hypothesisParts.horizon as 5_000,
    btcReturnBps: 8,
    btcMagnitudeBin: input.hypothesisParts.magnitude as "5-to-10-bps",
    btcDirection: "up",
    btcPriceAtTrigger: 100_080,
    marketThresholdUsd: 100_000,
    distanceFromThresholdBps: 8,
    btcAboveThreshold: true,
    thresholdCrossingDuringWindow: false,
    timeRemainingMs: 600_000,
    timeRemainingBin: input.hypothesisParts.time as "5-to-10-minutes",
    impliedProbabilityBin: input.hypothesisParts.prob as "50-to-70-percent",
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
      targetResponseTimeMs: BASE_MS + input.triggerOffsetMs + responseWindowMs,
      actualMatchedResponseTimeMs: BASE_MS + input.triggerOffsetMs + responseWindowMs,
      responseMatchErrorMs: 0,
      yesBidChangeCents: input.signedMid,
      yesAskChangeCents: input.signedAsk ?? input.signedMid,
      yesMidChangeCents: input.signedMid,
      noBidChangeCents: null,
      noAskChangeCents: null,
      spreadChangeCents: 0,
      sizeChange: 0,
      bookValid: true,
      bookSynchronized: true,
      quoteAgeMs: 0,
      marketStillOpen: true,
      timeRemainingMs: 600_000,
      expectedKalshiDirection: "up",
      actualKalshiDirection: input.signedMid >= 0 ? "up" : "down",
      directionallyCorrect:
        responseWindowMs === input.hypothesisParts.window
          ? (input.directionallyCorrect ?? input.signedMid > 0)
          : true,
      signedYesBidResponseCents: input.signedMid,
      signedYesAskResponseCents: input.signedAsk ?? input.signedMid,
      signedYesMidResponseCents: input.signedMid,
      absoluteResponseCents: Math.abs(input.signedMid),
      responseLatencyMs: responseWindowMs,
      noResponseWithinWindow: false,
      responseReversal: false,
      maximumAdverseResponseCents: 0,
      maximumFavorableResponseCents: Math.abs(input.signedMid),
      lagResponseState: "directionally-correct-response",
    })),
    dataQualityCaveats: [],
  };
}

function createIo(files: Record<string, string>): LeadLagValidationIo {
  const base = createMemoryBtcKalshiLeadLagIo(files, [TRAIN, VALIDATION, HOLDOUT]);
  return {
    ...base,
    fileByteLength: (path) => Buffer.byteLength(base.readFile(path), "utf8"),
  };
}

const C1 = frozenCandidate({
  hypothesisId: "60000|60000|5-to-10-bps|5-to-10-minutes|50-to-70-percent|reverse-btc",
  direction: "reverse-btc",
  discoveryRank: 1,
  trainMedianSignedMidResponseCents: 8,
});
const C2 = frozenCandidate({
  hypothesisId: "30000|60000|5-to-10-bps|5-to-10-minutes|70-to-90-percent|reverse-btc",
  direction: "reverse-btc",
  discoveryRank: 2,
  trainMedianSignedMidResponseCents: 6.75,
});
const C3 = frozenCandidate({
  hypothesisId: "30000|30000|5-to-10-bps|5-to-10-minutes|70-to-90-percent|reverse-btc",
  direction: "reverse-btc",
  discoveryRank: 3,
  trainMedianSignedMidResponseCents: 5,
});
const C4 = frozenCandidate({
  hypothesisId: "15000|60000|5-to-10-bps|10-to-15-minutes|50-to-70-percent|follow-btc",
  direction: "follow-btc",
  discoveryRank: 4,
  trainMedianSignedMidResponseCents: 3.5,
});
const C5 = frozenCandidate({
  hypothesisId: "5000|60000|5-to-10-bps|10-to-15-minutes|50-to-70-percent|follow-btc",
  direction: "follow-btc",
  discoveryRank: 5,
  trainMedianSignedMidResponseCents: 3,
});

describe("M12.8b validation contract + discovery binding", () => {
  it("requires exact discovery identity and frozen shortlist", () => {
    const report = makeDiscoveryReport([C1, C2, C3, C4, C5]);
    const path = `data/research-results/btc-kalshi-lead-lag/discovery/${DISCOVERY_HASH}/lead-lag-governed-discovery.json`;
    const io = createIo({ [path]: `${stableStringify(report)}\n` });
    const loaded = loadLeadLagDiscoveryReportForValidation({
      io,
      discoveryIdentityHash: DISCOVERY_HASH,
      expectedSplitManifestHash: SPLIT_HASH,
    });
    expect(loaded.frozenCandidates).toHaveLength(5);
    expect(loaded.frozenCandidates.map((c) => c.hypothesisId)).toEqual([
      C1.hypothesisId,
      C2.hypothesisId,
      C3.hypothesisId,
      C4.hypothesisId,
      C5.hypothesisId,
    ]);
  });

  it("fails closed on discovery identity mismatch", () => {
    const report = makeDiscoveryReport([C1]);
    const path = `data/research-results/btc-kalshi-lead-lag/discovery/${DISCOVERY_HASH}/lead-lag-governed-discovery.json`;
    const io = createIo({ [path]: `${stableStringify(report)}\n` });
    expect(() =>
      loadLeadLagDiscoveryReportForValidation({
        io,
        discoveryIdentityHash: "wrong-hash",
        discoveryReportPath: path,
      })
    ).toThrow(/identity mismatch|Missing discovery/);
  });

  it("changes contract hash when thresholds change", () => {
    const a = hashValidationContract(DEFAULT_LEAD_LAG_VALIDATION_CONTRACT);
    const b = hashValidationContract({
      ...DEFAULT_LEAD_LAG_VALIDATION_CONTRACT,
      minEligibleMarketTriggers: 99,
    });
    expect(a).not.toBe(b);
  });
});

describe("M12.8b holdout quarantine", () => {
  it("allows validation reads and blocks holdout outcome paths", async () => {
    const files = {
      ...buildRunFiles(VALIDATION_ID, VALIDATION),
      ...buildRunFiles(HOLDOUT_ID, HOLDOUT),
    };
    const io = createIo(files);
    const validationOnly = createValidationOnlyLeadLagIo({
      baseIo: io,
      validationCaptureRunDir: VALIDATION,
      holdoutCaptureRunDir: HOLDOUT,
    });
    expect(validationOnly.fileExists(`${VALIDATION}/btc-spot.jsonl`)).toBe(true);
    expect(() => validationOnly.readFile(`${HOLDOUT}/top-of-book.jsonl`)).toThrow(
      LeadLagValidationError,
    );
    await expect(
      validationOnly.iterateJsonl(`${HOLDOUT}/btc-spot.jsonl`, { onLine: () => "continue" }),
    ).rejects.toThrow(LeadLagValidationError);
  });
});

describe("M12.8b candidate evaluation", () => {
  const parts = {
    horizon: 15_000,
    window: 60_000,
    magnitude: "5-to-10-bps",
    time: "10-to-15-minutes",
    prob: "50-to-70-percent",
  };

  it("same-sign reproduction can validate; neighboring cells do not enter", () => {
    const events = Array.from({ length: 10 }, (_, index) =>
      makeEvent({
        hypothesisParts: parts,
        marketTicker: `KXBTC15M-M${index}`,
        triggerOffsetMs: index * 120_000,
        signedMid: 2,
        signedAsk: 2,
      }));
    // Neighboring bin noise should be ignored.
    events.push(
      makeEvent({
        hypothesisParts: { ...parts, magnitude: "10-to-20-bps" },
        marketTicker: "KXBTC15M-NEIGHBOR",
        triggerOffsetMs: 1_000_000,
        signedMid: 50,
      }),
    );

    const results = evaluateFrozenCandidatesOnValidationEvents({
      events,
      frozenCandidates: [C4],
      discoveryIdentityHash: DISCOVERY_HASH,
      contract: DEFAULT_LEAD_LAG_VALIDATION_CONTRACT,
    });
    expect(results).toHaveLength(1);
    expect(results[0]!.validationEventCount).toBe(10);
    expect(results[0]!.validationStatus).toBe("validated");
    expect(results[0]!.directionalConsistency).toBe("same-sign");
  });

  it("opposite-sign validation fails", () => {
    const events = Array.from({ length: 10 }, (_, index) =>
      makeEvent({
        hypothesisParts: parts,
        marketTicker: `KXBTC15M-M${index}`,
        triggerOffsetMs: index * 120_000,
        signedMid: -3,
        signedAsk: -3,
        directionallyCorrect: false,
      }));
    const results = evaluateFrozenCandidatesOnValidationEvents({
      events,
      frozenCandidates: [C4],
      discoveryIdentityHash: DISCOVERY_HASH,
      contract: DEFAULT_LEAD_LAG_VALIDATION_CONTRACT,
    });
    expect(results[0]!.validationStatus).toBe("validation-failed");
    expect(results[0]!.directionalConsistency).toBe("opposite-sign");
  });

  it("insufficient n is distinct from directional failure", () => {
    const events = [
      makeEvent({
        hypothesisParts: parts,
        marketTicker: MARKET_A,
        triggerOffsetMs: 0,
        signedMid: 2,
      }),
    ];
    const results = evaluateFrozenCandidatesOnValidationEvents({
      events,
      frozenCandidates: [C4],
      discoveryIdentityHash: DISCOVERY_HASH,
      contract: DEFAULT_LEAD_LAG_VALIDATION_CONTRACT,
    });
    expect(results[0]!.validationStatus).toBe("underpowered-for-validation");
  });

  it("zero incidence is insufficient-validation-incidence", () => {
    const results = evaluateFrozenCandidatesOnValidationEvents({
      events: [],
      frozenCandidates: [C4],
      discoveryIdentityHash: DISCOVERY_HASH,
      contract: DEFAULT_LEAD_LAG_VALIDATION_CONTRACT,
    });
    expect(results[0]!.validationStatus).toBe("insufficient-validation-incidence");
  });

  it("direction cannot flip: reverse candidate uses negated signed mid", () => {
    const reverseParts = {
      horizon: 60_000,
      window: 60_000,
      magnitude: "5-to-10-bps",
      time: "5-to-10-minutes",
      prob: "50-to-70-percent",
    };
    // Raw follow-signed mid is negative; reverse direction flips to positive → same-sign vs train +8.
    const events = Array.from({ length: 10 }, (_, index) =>
      makeEvent({
        hypothesisParts: reverseParts,
        marketTicker: `KXBTC15M-R${index}`,
        triggerOffsetMs: index * 120_000,
        signedMid: -4,
        signedAsk: -4,
        directionallyCorrect: false,
      }));
    const results = evaluateFrozenCandidatesOnValidationEvents({
      events,
      frozenCandidates: [C1],
      discoveryIdentityHash: DISCOVERY_HASH,
      contract: DEFAULT_LEAD_LAG_VALIDATION_CONTRACT,
    });
    expect(results[0]!.midpointResponseCents).toBe(4);
    expect(results[0]!.validationStatus).toBe("validated");
  });

  it("losing discovery candidate cannot re-enter via neighboring cell", () => {
    const results = evaluateFrozenCandidatesOnValidationEvents({
      events: [
        makeEvent({
          hypothesisParts: {
            horizon: 5_000,
            window: 1_000,
            magnitude: "40-bps-or-greater",
            time: "0-to-1-minute",
            prob: "0-to-10-percent",
          },
          marketTicker: MARKET_A,
          triggerOffsetMs: 0,
          signedMid: 99,
        }),
      ],
      frozenCandidates: [C1, C2, C3, C4, C5],
      discoveryIdentityHash: DISCOVERY_HASH,
      contract: DEFAULT_LEAD_LAG_VALIDATION_CONTRACT,
    });
    expect(results.every((result) => result.validationEventCount === 0)).toBe(true);
  });

  it("multiple survivors use deterministic tie-break that does not max observed effect", () => {
    const mkSurvivor = (
      definition: LeadLagFrozenCandidateDefinition,
      n: number,
      mid: number,
    ) =>
      evaluateFrozenCandidatesOnValidationEvents({
        events: Array.from({ length: n }, (_, index) =>
          makeEvent({
            hypothesisParts: {
              horizon: definition.btcMoveHorizonMs,
              window: definition.responseWindowMs,
              magnitude: definition.btcMagnitudeBin,
              time: definition.timeRemainingBin,
              prob: definition.impliedProbabilityBin,
            },
            marketTicker: `KXBTC15M-${definition.discoveryRank}-${index}`,
            triggerOffsetMs: index * 120_000 + definition.discoveryRank * 10,
            signedMid: definition.direction === "reverse-btc" ? -mid : mid,
            signedAsk: definition.direction === "reverse-btc" ? -mid : mid,
            directionallyCorrect: definition.direction === "follow-btc",
          })),
        frozenCandidates: [definition],
        discoveryIdentityHash: DISCOVERY_HASH,
        contract: DEFAULT_LEAD_LAG_VALIDATION_CONTRACT,
      })[0]!;

    // C5 has larger effect but smaller n; C4 has more independent sample support.
    const largeEffectSmallN = mkSurvivor(C5, 8, 20);
    const smallerEffectLargerN = mkSurvivor(C4, 12, 2);
    expect(largeEffectSmallN.validationStatus).toBe("validated");
    expect(smallerEffectLargerN.validationStatus).toBe("validated");
    const locked = lockHoldoutCandidateFromSurvivors({
      survivors: [largeEffectSmallN, smallerEffectLargerN],
    });
    expect(locked?.hypothesisId).toBe(C4.hypothesisId);
    expect(locked?.lockReason.join(" ")).toMatch(/not maximum observed effect/i);
  });

  it("zero survivors returns null locked candidate", () => {
    expect(lockHoldoutCandidateFromSurvivors({ survivors: [] })).toBeNull();
  });
});

describe("M12.8b governed validation end-to-end", () => {
  it("reads validation run, never holdout outcomes, locks without promotion/freeze", async () => {
    const discovery = makeDiscoveryReport([C4]);
    const discoveryPath =
      `data/research-results/btc-kalshi-lead-lag/discovery/${DISCOVERY_HASH}/lead-lag-governed-discovery.json`;
    const files = {
      ...buildRunFiles(VALIDATION_ID, VALIDATION),
      ...buildRunFiles(HOLDOUT_ID, HOLDOUT),
      [discoveryPath]: `${stableStringify(discovery)}\n`,
    };
    const io = createIo(files);

    const report = await buildLeadLagValidationReport({
      io,
      discoveryIdentityHash: DISCOVERY_HASH,
      expectedSplitManifestHash: SPLIT_HASH,
      generatedAt: "2026-09-10T01:00:00.000Z",
    });

    expect(report.holdoutOutcomeAccessed).toBe(false);
    expect(report.holdoutRunId).toBe(HOLDOUT_ID);
    expect(report.validationRunId).toBe(VALIDATION_ID);
    expect(report.discoveryHypothesisCount).toBe(LEAD_LAG_DISCOVERY_HYPOTHESIS_COUNT);
    expect(report.quarantine.holdoutOutcomesAnalyzed).toBe(false);
    expect(report.quarantine.parameterRetuningOccurred).toBe(false);
    expect(report.quarantine.promotionArtifactCreated).toBe(false);
    expect(report.quarantine.preregistrationArtifactCreated).toBe(false);
    expect(report.quarantine.frozenHypothesisCreated).toBe(false);
    expect(report.quarantine.captureStarted).toBe(false);
    expect(report.quarantine.finalOosClaimCreated).toBe(false);
    expect(report.outputPaths.outputPath).toContain(report.validationIdentityHash);
    expect(report.outputPaths.outputPath).not.toContain("latest");
    expect("holdoutTriggerCount" in report).toBe(false);
    expect(Object.keys(files).some((key) => key.includes("candidate-promotions"))).toBe(false);
  });

  it("changes validation identity when discovery artifact or contract changes", async () => {
    const discoveryA = makeDiscoveryReport([C4]);
    const discoveryB = makeDiscoveryReport([
      frozenCandidate({
        ...C4,
        trainMedianSignedMidResponseCents: 9,
      }),
    ]);
    const discoveryPath =
      `data/research-results/btc-kalshi-lead-lag/discovery/${DISCOVERY_HASH}/lead-lag-governed-discovery.json`;

    const filesA = {
      ...buildRunFiles(VALIDATION_ID, VALIDATION),
      ...buildRunFiles(HOLDOUT_ID, HOLDOUT),
      [discoveryPath]: `${stableStringify(discoveryA)}\n`,
    };
    const reportA = await buildLeadLagValidationReport({
      io: createIo(filesA),
      discoveryIdentityHash: DISCOVERY_HASH,
      expectedSplitManifestHash: SPLIT_HASH,
      generatedAt: "2026-09-10T01:00:00.000Z",
    });

    const filesB = {
      ...buildRunFiles(VALIDATION_ID, VALIDATION),
      ...buildRunFiles(HOLDOUT_ID, HOLDOUT),
      [discoveryPath]: `${stableStringify(discoveryB)}\n`,
    };
    const reportB = await buildLeadLagValidationReport({
      io: createIo(filesB),
      discoveryIdentityHash: DISCOVERY_HASH,
      expectedSplitManifestHash: SPLIT_HASH,
      generatedAt: "2026-09-10T01:00:00.000Z",
    });
    expect(reportA.validationIdentityHash).not.toBe(reportB.validationIdentityHash);

    const reportC = await buildLeadLagValidationReport({
      io: createIo(filesA),
      discoveryIdentityHash: DISCOVERY_HASH,
      expectedSplitManifestHash: SPLIT_HASH,
      contract: {
        ...DEFAULT_LEAD_LAG_VALIDATION_CONTRACT,
        minEligibleMarketTriggers: 50,
      },
      generatedAt: "2026-09-10T01:00:00.000Z",
    });
    expect(reportC.validationIdentityHash).not.toBe(reportA.validationIdentityHash);
  });

  it("missing validation capture fails closed", async () => {
    const discovery = makeDiscoveryReport([C4]);
    const discoveryPath =
      `data/research-results/btc-kalshi-lead-lag/discovery/${DISCOVERY_HASH}/lead-lag-governed-discovery.json`;
    const io = createIo({
      [discoveryPath]: `${stableStringify(discovery)}\n`,
      ...buildRunFiles(HOLDOUT_ID, HOLDOUT),
    });
    await expect(
      buildLeadLagValidationReport({
        io,
        discoveryIdentityHash: DISCOVERY_HASH,
        expectedSplitManifestHash: SPLIT_HASH,
      }),
    ).rejects.toThrow(/Missing validation|failed closed|does not exist|Capture run/);
  });

  it("parses discovery identity argv without latest/mtime flags", () => {
    const parsed = parseLeadLagValidationArgv([
      "--discovery-identity",
      DISCOVERY_HASH,
      "--split-manifest-hash",
      SPLIT_HASH,
    ]);
    expect(parsed.discoveryIdentityHash).toBe(DISCOVERY_HASH);
    expect(parsed.expectedSplitManifestHash).toBe(SPLIT_HASH);
  });
});
