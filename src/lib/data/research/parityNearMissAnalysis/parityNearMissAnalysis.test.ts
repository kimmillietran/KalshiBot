import { describe, expect, it } from "vitest";

import { DEFAULT_STATIC_PARITY_FRICTION_CONFIG } from "../staticParityScan/staticParityScanTypes";
import { fnv1a32, stableStringify } from "@/lib/trading/config/hashConfig";

import { analyzeParityNearMissForRun } from "./analyzeParityNearMissForRun";
import { BoundedNearMissRanking } from "./boundedNearMissRanking";
import {
  classifyParityNearMissInterpretation,
  NARROW_NEAR_MISS_CENTS,
} from "./classifyParityNearMissInterpretation";
import { computeObservedGrossEdgeCents, computeParityShortfalls } from "./computeParityShortfalls";
import { createMemoryParityNearMissIo } from "./createParityNearMissAnalysisIo";
import {
  buildRuleConfiguration,
  createEmptyGateCounts,
  evaluateParityObservationGates,
  resolveDistanceBucket,
} from "./evaluateParityObservationGates";
import { loadSelectedRunContext, validateSelectedRunDirectory } from "./loadSelectedRunContext";
import { parseParityNearMissAnalysisArgv } from "./parseParityNearMissAnalysisArgv";
import {
  createEmptyIndependentGatePassCounts,
  createEmptySequentialFunnel,
  SEQUENTIAL_FUNNEL_STAGE_ORDER,
  updateSequentialFunnel,
} from "./parityGateSemantics";
import { ParityNearMissAnalysisError } from "./parityNearMissAnalysisTypes";
import { createParityNearMissAnalysisConfig } from "./parityNearMissAnalysisConfig";
import { evaluateQuoteStaleness, normalizeExchangeTimestampMs } from "./resolveQuoteStaleness";
import { serializeParityNearMissAnalysisHtml } from "./serializeParityNearMissAnalysisHtml";

const RUN_DIR = "data/live-capture/forward-quotes/run-near-miss";
const MARKET = "KXBTC15M-TEST";

function topOfBookLine(input: {
  receivedAtLocal: string;
  yesBid?: number | null;
  noBid?: number | null;
  yesBidSize?: number | null;
  noBidSize?: number | null;
  yesAsk?: number | null;
  noAsk?: number | null;
  bookState?: string;
  sequence?: number;
  exchangeTimestampMs?: number;
  isParityUsable?: boolean;
  economicBookState?: string;
}) {
  const record: Record<string, unknown> = {
    runId: "run-near-miss",
    marketTicker: MARKET,
    receivedAtLocal: input.receivedAtLocal,
    bookState: input.bookState ?? "valid",
    sequence: input.sequence,
    exchangeTimestampMs: input.exchangeTimestampMs,
  };

  if (input.yesBid !== undefined) {
    record.yesBestBidCents = input.yesBid;
  } else {
    record.yesBestBidCents = 50;
  }
  if (input.noBid !== undefined) {
    record.noBestBidCents = input.noBid;
  } else {
    record.noBestBidCents = 50;
  }

  if (input.yesBidSize !== undefined) {
    record.yesBestBidSize = input.yesBidSize;
  } else {
    record.yesBestBidSize = 10;
  }
  if (input.noBidSize !== undefined) {
    record.noBestBidSize = input.noBidSize;
  } else {
    record.noBestBidSize = 10;
  }
  if (input.yesAsk !== undefined) {
    record.yesBestAskCents = input.yesAsk;
  }
  if (input.noAsk !== undefined) {
    record.noBestAskCents = input.noAsk;
  }
  if (input.isParityUsable !== undefined) {
    record.isParityUsable = input.isParityUsable;
  }
  if (input.economicBookState !== undefined) {
    record.economicBookState = input.economicBookState;
  }

  return JSON.stringify(record);
}

function buildFixtureFiles() {
  return {
    [`${RUN_DIR}/capture-health.json`]: JSON.stringify({
      runId: "run-near-miss",
      config: { durationSeconds: 3600 },
      capture: { topOfBookRecordCount: 6 },
      orderbook: { validTopOfBookRecords: 6, sequenceGapCount: 2 },
      watchdog: { recoveryAttemptCount: 0 },
    }),
    [`${RUN_DIR}/market-metadata.jsonl`]: `${JSON.stringify({
      marketTicker: MARKET,
      closeTime: "2026-07-11T12:00:00.000Z",
    })}\n`,
    [`${RUN_DIR}/btc-spot.jsonl`]: `${JSON.stringify({
      receivedAtLocal: "2026-07-11T11:00:00.000Z",
      priceUsd: 100000,
    })}\n`,
    [`${RUN_DIR}/top-of-book.jsonl`]: [
      topOfBookLine({
        receivedAtLocal: "2026-07-11T11:00:01.000Z",
        yesBid: 50,
        noBid: 51,
        sequence: 1,
        exchangeTimestampMs: Date.parse("2026-07-11T11:00:01.000Z"),
      }),
      topOfBookLine({
        receivedAtLocal: "2026-07-11T11:00:02.000Z",
        yesBid: 53,
        noBid: 50,
        sequence: 2,
        exchangeTimestampMs: Date.parse("2026-07-11T11:00:02.000Z"),
      }),
      topOfBookLine({
        receivedAtLocal: "2026-07-11T11:00:03.000Z",
        yesBid: 56,
        noBid: 50,
        yesBidSize: null,
        noBidSize: null,
        sequence: 3,
        exchangeTimestampMs: Date.parse("2026-07-11T11:00:03.000Z"),
      }),
      topOfBookLine({
        receivedAtLocal: "2026-07-11T11:00:04.000Z",
        yesBid: 56,
        noBid: 50,
        sequence: 4,
        exchangeTimestampMs: Date.parse("2026-07-11T11:00:04.000Z"),
      }),
      topOfBookLine({
        receivedAtLocal: "2026-07-11T11:00:05.000Z",
        yesBid: 50,
        noBid: 51,
        sequence: 5,
        exchangeTimestampMs: Date.parse("2026-07-11T11:00:05.000Z"),
      }),
      topOfBookLine({
        receivedAtLocal: "2026-07-11T11:00:06.000Z",
        yesBid: 50,
        noBid: 51,
        sequence: 6,
        exchangeTimestampMs: Date.parse("2026-07-11T11:00:06.000Z"),
      }),
    ].join("\n"),
    "data/research-results/capture-health-audit.json": JSON.stringify({
      captureRunDir: RUN_DIR,
      selectedRunId: "run-near-miss",
      sourceRunIds: ["run-near-miss"],
      analysisVersion: "capture-health-audit-v1",
      inputArtifactIdentities: [],
      summary: {
        verdict: "capture-research-ready",
        recommendedNextAction: "proceed-offline-microstructure-research",
        runDurationSeconds: 3600,
        topOfBookCount: 6,
        btcSpotCount: 1,
        bookState: { validBookShare: 0.99, sequenceGapCount: 2, reconnectCount: 0 },
        btcJoin: { joinCoverageShare: 1 },
        continuity: { p90TopOfBookGapMs: 1000 },
      },
    }),
    "data/research-results/capture-health-reconciliation.json": JSON.stringify({
      generatedAt: "2026-07-11T12:00:00.000Z",
      analysisScope: "selected-run",
      selectedRunId: "run-near-miss",
      sourceRunIds: ["run-near-miss"],
      summary: {
        selectedRunId: "run-near-miss",
        overallVerdict: "capture-research-ready",
      },
      durations: { configuredDurationSeconds: 3600 },
      suspension: { suspectedSystemSleepSeconds: 0 },
      validBookMetrics: [
        { metricId: "rawTopOfBookValidShare", value: 0.99 },
      ],
    }),
    "data/research-results/bid-size-coverage-audit.json": JSON.stringify({
      selectedRunId: "run-near-miss",
      sourceRunIds: ["run-near-miss"],
      comparison: {
        bidSizeCoverageShare: 0.95,
        topOfBookBidSizeCoverageShare: 0.95,
      },
    }),
  };
}

function buildRealRunShapedFixtureFiles() {
  const lines: string[] = [];
  for (let index = 0; index < 40; index += 1) {
    const second = String(index % 60).padStart(2, "0");
    lines.push(
      topOfBookLine({
        receivedAtLocal: `2026-07-11T11:00:${second}.000Z`,
        yesBid: 50,
        noBid: 50,
        sequence: index + 1,
        exchangeTimestampMs: Date.parse(`2026-07-11T11:00:${second}.000Z`),
      }),
    );
  }
  lines.push(
    topOfBookLine({
      receivedAtLocal: "2026-07-11T11:01:00.000Z",
      yesBid: 50,
      noBid: null,
      sequence: 41,
      exchangeTimestampMs: Date.parse("2026-07-11T11:01:00.000Z"),
    }),
  );
  lines.push(
    topOfBookLine({
      receivedAtLocal: "2026-07-11T11:01:01.000Z",
      yesBid: 55,
      noBid: 50,
      yesAsk: 54,
      noAsk: 51,
      isParityUsable: true,
      sequence: 43,
      exchangeTimestampMs: Date.parse("2026-07-11T11:01:01.000Z"),
    }),
  );
  lines.push(
    topOfBookLine({
      receivedAtLocal: "2026-07-11T11:01:02.000Z",
      yesBid: 50,
      noBid: 50,
      bookState: "invalid",
      sequence: 44,
      exchangeTimestampMs: Date.parse("2026-07-11T11:01:02.000Z"),
    }),
  );
  lines.push(
    topOfBookLine({
      receivedAtLocal: "2026-07-11T11:01:03.000Z",
      yesBid: 50,
      noBid: 51,
      yesBidSize: null,
      noBidSize: null,
      sequence: 45,
      exchangeTimestampMs: Date.parse("2026-07-11T11:01:03.000Z"),
    }),
  );

  return {
    ...buildFixtureFiles(),
    [`${RUN_DIR}/capture-health.json`]: JSON.stringify({
      runId: "run-near-miss",
      config: { durationSeconds: 28800 },
      capture: { topOfBookRecordCount: lines.length },
      orderbook: { validTopOfBookRecords: lines.length - 1, sequenceGapCount: 64047 },
      watchdog: { recoveryAttemptCount: 0 },
    }),
    [`${RUN_DIR}/top-of-book.jsonl`]: lines.join("\n"),
    "data/research-results/capture-health-audit.json": JSON.stringify({
      captureRunDir: RUN_DIR,
      selectedRunId: "run-near-miss",
      sourceRunIds: ["run-near-miss"],
      analysisVersion: "capture-health-audit-v1",
      inputArtifactIdentities: [],
      summary: {
        verdict: "capture-research-ready",
        recommendedNextAction: "proceed-offline-microstructure-research",
        runDurationSeconds: 28800,
        topOfBookCount: lines.length,
        btcSpotCount: 1,
        bookState: { validBookShare: 0.9919, sequenceGapCount: 64047, reconnectCount: 0 },
        btcJoin: { joinCoverageShare: 1 },
        continuity: { p90TopOfBookGapMs: 1000 },
      },
    }),
    "data/research-results/capture-health-reconciliation.json": JSON.stringify({
      selectedRunId: "run-near-miss",
      sourceRunIds: ["run-near-miss"],
      summary: { selectedRunId: "run-near-miss", overallVerdict: "capture-research-ready" },
      durations: { configuredDurationSeconds: 28800 },
      suspension: { suspectedSystemSleepSeconds: 0 },
      validBookMetrics: [{ metricId: "rawTopOfBookValidShare", value: 0.9919 }],
    }),
    "data/research-results/bid-size-coverage-audit.json": JSON.stringify({
      selectedRunId: "run-near-miss",
      sourceRunIds: ["run-near-miss"],
      comparison: { bidSizeCoverageShare: 0.9561791750925255 },
    }),
  };
}

function buildNoEvaluableRecordsFixtureFiles() {
  const files = buildFixtureFiles();
  files[`${RUN_DIR}/top-of-book.jsonl`] = [
    topOfBookLine({
      receivedAtLocal: "2026-07-11T11:00:01.000Z",
      yesBid: 50,
      noBid: null,
      sequence: 1,
    }),
    topOfBookLine({
      receivedAtLocal: "2026-07-11T11:00:02.000Z",
      yesBid: null,
      noBid: 51,
      sequence: 2,
    }),
  ].join("\n");
  return files;
}

function buildGrossOnlyNearMissFixtureFiles() {
  const files = buildFixtureFiles();
  files[`${RUN_DIR}/top-of-book.jsonl`] = [
    topOfBookLine({
      receivedAtLocal: "2026-07-11T11:00:01.000Z",
      yesBid: 50,
      noBid: 50,
      sequence: 1,
      exchangeTimestampMs: Date.parse("2026-07-11T11:00:01.000Z"),
    }),
    topOfBookLine({
      receivedAtLocal: "2026-07-11T11:00:02.000Z",
      yesBid: 50,
      noBid: 50,
      sequence: 2,
      exchangeTimestampMs: Date.parse("2026-07-11T11:00:02.000Z"),
    }),
  ].join("\n");
  return files;
}

function buildQualifiedGrossFixtureFiles() {
  const files = buildFixtureFiles();
  files[`${RUN_DIR}/top-of-book.jsonl`] = [
    topOfBookLine({
      receivedAtLocal: "2026-07-11T11:00:01.000Z",
      yesBid: 56,
      noBid: 50,
      sequence: 1,
      exchangeTimestampMs: Date.parse("2026-07-11T11:00:01.000Z"),
    }),
  ].join("\n");
  return files;
}

function buildRegressionFixtureFiles() {
  const lines: string[] = [];
  for (let index = 0; index < 20; index += 1) {
    const second = String(index).padStart(2, "0");
    lines.push(
      topOfBookLine({
        receivedAtLocal: `2026-07-11T11:00:${second}.000Z`,
        yesBid: 50,
        noBid: 50,
        sequence: index + 1,
        exchangeTimestampMs: Date.parse(`2026-07-11T11:00:${second}.000Z`),
      }),
    );
  }
  lines.push(
    topOfBookLine({
      receivedAtLocal: "2026-07-11T11:00:20.000Z",
      yesBid: 50,
      noBid: null,
      sequence: 21,
      exchangeTimestampMs: Date.parse("2026-07-11T11:00:20.000Z"),
    }),
  );
  lines.push(
    topOfBookLine({
      receivedAtLocal: "2026-07-11T11:00:21.000Z",
      yesBid: 55,
      noBid: 50,
      yesAsk: 54,
      noAsk: 51,
      isParityUsable: true,
      sequence: 22,
      exchangeTimestampMs: Date.parse("2026-07-11T11:00:21.000Z"),
    }),
  );

  return {
    ...buildFixtureFiles(),
    [`${RUN_DIR}/capture-health.json`]: JSON.stringify({
      runId: "run-near-miss",
      config: { durationSeconds: 28800 },
      capture: { topOfBookRecordCount: 22 },
      orderbook: { validTopOfBookRecords: 21, sequenceGapCount: 64047 },
      watchdog: { recoveryAttemptCount: 0 },
    }),
    [`${RUN_DIR}/top-of-book.jsonl`]: lines.join("\n"),
    "data/research-results/capture-health-audit.json": JSON.stringify({
      captureRunDir: RUN_DIR,
      selectedRunId: "run-near-miss",
      sourceRunIds: ["run-near-miss"],
      analysisVersion: "capture-health-audit-v1",
      inputArtifactIdentities: [],
      summary: {
        verdict: "capture-research-ready",
        recommendedNextAction: "proceed-offline-microstructure-research",
        runDurationSeconds: 28800,
        topOfBookCount: 22,
        btcSpotCount: 1,
        bookState: { validBookShare: 0.9919, sequenceGapCount: 64047, reconnectCount: 0 },
        btcJoin: { joinCoverageShare: 1 },
        continuity: { p90TopOfBookGapMs: 1000 },
      },
    }),
    "data/research-results/capture-health-reconciliation.json": JSON.stringify({
      selectedRunId: "run-near-miss",
      sourceRunIds: ["run-near-miss"],
      summary: { selectedRunId: "run-near-miss", overallVerdict: "capture-research-ready" },
      durations: { configuredDurationSeconds: 28800 },
      suspension: { suspectedSystemSleepSeconds: 0 },
      validBookMetrics: [{ metricId: "rawTopOfBookValidShare", value: 0.9919 }],
    }),
    "data/research-results/bid-size-coverage-audit.json": JSON.stringify({
      selectedRunId: "run-near-miss",
      sourceRunIds: ["run-near-miss"],
      comparison: { bidSizeCoverageShare: 0.9561791750925255 },
    }),
  };
}

describe("computeParityShortfalls", () => {
  const friction = DEFAULT_STATIC_PARITY_FRICTION_CONFIG;

  it("computes negative distance when observed edge exceeds threshold", () => {
    const result = computeParityShortfalls(56, 50, friction);
    expect(result.observedGrossEdgeCents).toBe(6);
    expect(result.grossDistanceToQualification).toBe(-4);
    expect(resolveDistanceBucket(result.grossDistanceToQualification, true)).toBe("qualified");
  });

  it("computes zero distance at exact threshold", () => {
    const result = computeParityShortfalls(51, 51, friction);
    expect(result.observedGrossEdgeCents).toBe(2);
    expect(result.grossDistanceToQualification).toBe(0);
  });

  it("computes one-cent shortfall one cent below threshold", () => {
    const result = computeParityShortfalls(50, 51, friction);
    expect(result.observedGrossEdgeCents).toBe(1);
    expect(result.grossDistanceToQualification).toBe(1);
  });

  it("computes full shortfall when observed edge is zero", () => {
    const result = computeParityShortfalls(50, 50, friction);
    expect(result.observedGrossEdgeCents).toBe(0);
    expect(result.grossDistanceToQualification).toBe(2);
  });

  it("computes larger shortfall for negative observed edge", () => {
    const result = computeParityShortfalls(49, 50, friction);
    expect(result.observedGrossEdgeCents).toBe(-1);
    expect(result.grossDistanceToQualification).toBe(3);
    expect(resolveDistanceBucket(result.grossDistanceToQualification, true)).toBe("2-to-5-cents");
  });

  it("still populates fee and buffer shortfalls for non-positive gross edge", () => {
    const result = computeParityShortfalls(50, 50, friction);
    expect(result.feeAdjustedDistanceToQualification).toBe(5);
    expect(result.bufferAdjustedDistanceToQualification).toBe(6);
  });

  it("aligns fee shortfall with the positive net-edge gate", () => {
    const result = computeParityShortfalls(55, 50, friction);
    expect(result.estimatedNetEdgeCents).toBe(1);
    expect(result.feeAdjustedDistanceToQualification).toBe(0);
  });
});

describe("evaluateParityObservationGates", () => {
  const rule = buildRuleConfiguration(
    createParityNearMissAnalysisConfig({ captureRunDir: RUN_DIR }),
  );

  it("uses positive distance as shortfall below gross threshold", () => {
    const receivedAtMs = Date.parse("2026-07-11T11:00:01.000Z");
    const metrics = evaluateParityObservationGates(
      {
        marketTicker: MARKET,
        receivedAtLocal: "2026-07-11T11:00:01.000Z",
        receivedAtMs,
        bookState: "valid",
        yesBestBidCents: 50,
        noBestBidCents: 51,
        yesBestBidSize: 10,
        noBestBidSize: 10,
        exchangeTimestampMs: receivedAtMs,
        btcSpotPriceUsd: 100000,
      },
      rule,
    );

    expect(metrics.bidOnlyParityValue).toBe(1);
    expect(metrics.grossDistanceToQualification).toBe(1);
    expect(metrics.grossParityPass).toBe(false);
    expect(metrics.firstRejectingGate).toBe("gross-parity-shortfall");
    expect(resolveDistanceBucket(metrics.grossDistanceToQualification, true)).toBe("0.5-to-1-cent");
  });

  it("marks fee/buffer shortfall when gross passes but net edge is insufficient", () => {
    const metrics = evaluateParityObservationGates(
      {
        marketTicker: MARKET,
        receivedAtLocal: "2026-07-11T11:00:02.000Z",
        receivedAtMs: Date.parse("2026-07-11T11:00:02.000Z"),
        bookState: "valid",
        yesBestBidCents: 53,
        noBestBidCents: 50,
        yesBestBidSize: 10,
        noBestBidSize: 10,
        btcSpotPriceUsd: 100000,
      },
      rule,
    );

    expect(metrics.grossParityPass).toBe(true);
    expect(metrics.feePass).toBe(false);
    expect(metrics.feeAdjustedDistanceToQualification).toBe(2);
    expect(metrics.bufferPass).toBe(false);
    expect(metrics.allRejectingGates).toContain("buffer-adjusted-shortfall");
  });

  it("rejects missing executable size", () => {
    const receivedAtMs = Date.parse("2026-07-11T11:00:03.000Z");
    const metrics = evaluateParityObservationGates(
      {
        marketTicker: MARKET,
        receivedAtLocal: "2026-07-11T11:00:03.000Z",
        receivedAtMs,
        bookState: "valid",
        yesBestBidCents: 56,
        noBestBidCents: 50,
        yesBestBidSize: null,
        noBestBidSize: null,
        exchangeTimestampMs: receivedAtMs,
      },
      rule,
    );

    expect(metrics.sizePass).toBe(false);
    expect(metrics.firstRejectingGate).toBe("missing-executable-size");
  });

  it("does not duplicate missing executable-size rejection when a side is absent", () => {
    const receivedAtMs = Date.parse("2026-07-11T11:00:06.000Z");
    const metrics = evaluateParityObservationGates(
      {
        marketTicker: MARKET,
        receivedAtLocal: "2026-07-11T11:00:06.000Z",
        receivedAtMs,
        bookState: "valid",
        yesBestBidCents: 56,
        noBestBidCents: null,
        yesBestBidSize: 10,
        noBestBidSize: null,
        exchangeTimestampMs: receivedAtMs,
      },
      rule,
    );

    expect(metrics.allRejectingGates.filter((gate) => gate === "missing-executable-size")).toHaveLength(1);
  });

  it("rejects impossible bid prices from sequential qualification and shortfalls", () => {
    const receivedAtMs = Date.parse("2026-07-11T11:00:08.000Z");
    const metrics = evaluateParityObservationGates(
      {
        marketTicker: MARKET,
        receivedAtLocal: "2026-07-11T11:00:08.000Z",
        receivedAtMs,
        bookState: "valid",
        yesBestBidCents: 150,
        noBestBidCents: 50,
        yesBestBidSize: 10,
        noBestBidSize: 10,
        exchangeTimestampMs: receivedAtMs,
        btcSpotPriceUsd: 100000,
      },
      rule,
    );

    expect(metrics.firstRejectingGate).toBe("invalid-book");
    expect(metrics.allRejectingGates).toContain("invalid-book");
    expect(metrics.grossDistanceToQualification).toBeNull();
    expect(metrics.bufferPass).toBe(false);
  });

  it("treats missing BTC join as quality annotation rather than a rejection gate", () => {
    const receivedAtMs = Date.parse("2026-07-11T11:00:09.000Z");
    const metrics = evaluateParityObservationGates(
      {
        marketTicker: MARKET,
        receivedAtLocal: "2026-07-11T11:00:09.000Z",
        receivedAtMs,
        bookState: "valid",
        yesBestBidCents: 56,
        noBestBidCents: 50,
        yesBestBidSize: 10,
        noBestBidSize: 10,
        exchangeTimestampMs: receivedAtMs,
        btcSpotPriceUsd: null,
      },
      rule,
    );

    expect(metrics.btcJoinAvailable).toBe(false);
    expect(metrics.allRejectingGates).not.toContain("missing-btc-join");
    expect(metrics.metricUnavailableReasons.btcSpotPriceUsd).toBe("btc spot join unavailable");
    expect(metrics.firstRejectingGate).toBeNull();
  });

  it("recomputes economic fields when legacy economicBookState labels are unknown", () => {
    const receivedAtMs = Date.parse("2026-07-11T11:00:07.000Z");
    const metrics = evaluateParityObservationGates(
      {
        marketTicker: MARKET,
        receivedAtLocal: "2026-07-11T11:00:07.000Z",
        receivedAtMs,
        bookState: "valid",
        yesBestBidCents: 55,
        yesBestAskCents: 54,
        noBestBidCents: 50,
        noBestAskCents: 51,
        yesBestBidSize: 10,
        noBestBidSize: 10,
        exchangeTimestampMs: receivedAtMs,
        economicBookState: "crossed-yes-book",
        isParityUsable: true,
      },
      rule,
    );

    expect(metrics.bookSynchronized).toBe(false);
    expect(metrics.firstRejectingGate).toBe("unsynchronized-book");
  });
});

describe("evaluateQuoteStaleness", () => {
  const receivedAtMs = Date.parse("2026-07-11T11:00:05.000Z");

  it("passes fresh known age", () => {
    const result = evaluateQuoteStaleness({
      receivedAtMs,
      exchangeTimestampMs: receivedAtMs - 500,
      stalenessBoundMs: 5000,
    });
    expect(result.stalenessPass).toBe(true);
    expect(result.quoteAgeStatus).toBe("known");
  });

  it("fails stale known age", () => {
    const result = evaluateQuoteStaleness({
      receivedAtMs,
      exchangeTimestampMs: receivedAtMs - 120_000,
      stalenessBoundMs: 5000,
    });
    expect(result.stalenessPass).toBe(false);
    expect(result.stalenessReject).toBe(true);
  });

  it("normalizes epoch seconds to milliseconds", () => {
    const exchangeSeconds = Math.floor(receivedAtMs / 1000);
    const result = evaluateQuoteStaleness({
      receivedAtMs,
      exchangeTimestampMs: exchangeSeconds,
      stalenessBoundMs: 5000,
    });
    expect(result.stalenessPass).toBe(true);
    expect(normalizeExchangeTimestampMs(exchangeSeconds)).toBe(exchangeSeconds * 1000);
  });

  it("treats unknown age as not passing", () => {
    const result = evaluateQuoteStaleness({
      receivedAtMs,
      exchangeTimestampMs: null,
      stalenessBoundMs: 5000,
    });
    expect(result.stalenessPass).toBeNull();
    expect(result.quoteAgeStatus).toBe("unknown");
  });

  it("treats negative age as fresh", () => {
    const result = evaluateQuoteStaleness({
      receivedAtMs,
      exchangeTimestampMs: receivedAtMs + 1000,
      stalenessBoundMs: 5000,
    });
    expect(result.stalenessPass).toBe(true);
    expect(result.quoteAgeStatus).toBe("negative");
  });
});

describe("parityGateSemantics", () => {
  it("never increases between sequential funnel stages", () => {
    const funnel = createEmptySequentialFunnel();
    updateSequentialFunnel(funnel, {
      bookValid: true,
      bookSynchronized: true,
      bothSidesPresent: true,
      stalenessPass: true,
      sizePass: true,
      grossParityPass: false,
      feePass: false,
      bufferPass: false,
    });

    for (let index = 1; index < SEQUENTIAL_FUNNEL_STAGE_ORDER.length; index += 1) {
      const previous = funnel[SEQUENTIAL_FUNNEL_STAGE_ORDER[index - 1]!];
      const current = funnel[SEQUENTIAL_FUNNEL_STAGE_ORDER[index]!];
      expect(current).toBeLessThanOrEqual(previous);
    }
  });
});

describe("BoundedNearMissRanking", () => {
  it("keeps only the closest positive distances", () => {
    const ranking = new BoundedNearMissRanking(2, "gross");
    const base = {
      timeRemainingMs: null,
      yesBidCents: 50,
      noBidCents: 51,
      yesBidSize: 1,
      noBidSize: 1,
      observedEdgeCents: 1,
      requiredEdgeCents: 2,
      bookValid: true,
      bookSynchronized: true,
      quoteAgeMs: 100,
      firstRejectingGate: "gross-parity-shortfall" as const,
      allRejectingGates: ["gross-parity-shortfall"] as const,
      integrityCaveat: null,
    };
    ranking.consider({
      recordIndex: 1,
      marketTicker: MARKET,
      timestamp: "a",
      ...base,
      shortfallCents: 5,
      distance: 5,
    });
    ranking.consider({
      recordIndex: 2,
      marketTicker: MARKET,
      timestamp: "b",
      ...base,
      shortfallCents: 1,
      distance: 1,
    });
    ranking.consider({
      recordIndex: 3,
      marketTicker: MARKET,
      timestamp: "c",
      ...base,
      shortfallCents: 2,
      distance: 2,
    });

    expect(ranking.toRankedEntries().map((entry) => entry.timestamp)).toEqual(["b", "c"]);
  });

  it("excludes qualified rows", () => {
    const ranking = new BoundedNearMissRanking(3, "gross");
    ranking.consider({
      recordIndex: 1,
      marketTicker: MARKET,
      timestamp: "qualified",
      timeRemainingMs: null,
      yesBidCents: 56,
      noBidCents: 50,
      yesBidSize: 1,
      noBidSize: 1,
      observedEdgeCents: 6,
      requiredEdgeCents: 2,
      shortfallCents: -4,
      distance: -4,
      bookValid: true,
      bookSynchronized: true,
      quoteAgeMs: 0,
      firstRejectingGate: null,
      allRejectingGates: [],
      integrityCaveat: null,
    });
    expect(ranking.toRankedEntries()).toHaveLength(0);
  });

  it("returns empty rankings when limit is zero or invalid", () => {
    const ranking = new BoundedNearMissRanking(0, "gross");
    ranking.consider({
      recordIndex: 1,
      marketTicker: MARKET,
      timestamp: "near-miss",
      timeRemainingMs: null,
      yesBidCents: 50,
      noBidCents: 50,
      yesBidSize: 1,
      noBidSize: 1,
      observedEdgeCents: 0,
      requiredEdgeCents: 2,
      shortfallCents: 2,
      distance: 2,
      bookValid: true,
      bookSynchronized: true,
      quoteAgeMs: 0,
      firstRejectingGate: "gross-parity-shortfall",
      allRejectingGates: ["gross-parity-shortfall"],
      integrityCaveat: null,
    });

    expect(ranking.toRankedEntries()).toEqual([]);
  });
});

describe("classifyParityNearMissInterpretation", () => {
  const healthyQuality = {
    selectedRunId: "run",
    runDurationSeconds: 3600,
    validBookShare: 0.99,
    btcJoinCoverageShare: 1,
    bidSizeCoverageShare: 0.95,
    reconnectCount: 0,
    suspectedSystemSleepSeconds: 0,
    sequenceGapCount: 10,
    captureVerdict: "capture-research-ready",
    reconciliationVerdict: "capture-research-ready",
  };

  it("classifies zero positive edge plus narrow shortfall", () => {
    const summary = classifyParityNearMissInterpretation({
      recordsScanned: 100,
      recordsEligible: 95,
      sequentialFunnel: {
        ...createEmptySequentialFunnel(),
        loaded: 100,
        validBook: 95,
        synchronizedBook: 90,
        bothSidesPresent: 90,
        stalenessPass: 88,
        executableSize: 85,
        grossThreshold: 0,
        feeThreshold: 0,
        bufferThreshold: 0,
        finalCandidate: 0,
      },
      independentGatePassCounts: createEmptyIndependentGatePassCounts(),
      gateCounts: createEmptyGateCounts(),
      closestGrossNearMiss: 0.5,
      closestFeeAdjustedNearMiss: null,
      closestBufferNearMiss: null,
      grossNearMissCount: 90,
      feeAdjustedNearMissCount: 90,
      bufferNearMissCount: 90,
      selectedRunQuality: healthyQuality,
    });

    expect(summary.interpretationClassification).toBe("no-signal-with-narrow-near-misses");
    expect(summary.closestGrossNearMissCents).toBe(0.5);
    expect(0.5).toBeLessThanOrEqual(NARROW_NEAR_MISS_CENTS);
  });

  it("classifies zero positive edge plus large shortfall", () => {
    const summary = classifyParityNearMissInterpretation({
      recordsScanned: 100,
      recordsEligible: 95,
      sequentialFunnel: {
        ...createEmptySequentialFunnel(),
        loaded: 100,
        grossThreshold: 0,
        finalCandidate: 0,
      },
      independentGatePassCounts: createEmptyIndependentGatePassCounts(),
      gateCounts: createEmptyGateCounts(),
      closestGrossNearMiss: 5,
      closestFeeAdjustedNearMiss: null,
      closestBufferNearMiss: null,
      grossNearMissCount: 90,
      feeAdjustedNearMissCount: 90,
      bufferNearMissCount: 90,
      selectedRunQuality: healthyQuality,
    });

    expect(summary.interpretationClassification).toBe("no-signal-far-from-threshold");
  });

  it("does not classify zero gross edge as execution-gates-binding", () => {
    const gateCounts = createEmptyGateCounts();
    gateCounts.allRejectionsByGate["stale-quote"] = 50;
    gateCounts.allRejectionsByGate["missing-executable-size"] = 40;

    const summary = classifyParityNearMissInterpretation({
      recordsScanned: 100,
      recordsEligible: 95,
      sequentialFunnel: {
        ...createEmptySequentialFunnel(),
        loaded: 100,
        grossThreshold: 0,
        finalCandidate: 0,
      },
      independentGatePassCounts: createEmptyIndependentGatePassCounts(),
      gateCounts,
      closestGrossNearMiss: 2,
      closestFeeAdjustedNearMiss: null,
      closestBufferNearMiss: null,
      grossNearMissCount: 90,
      feeAdjustedNearMissCount: 90,
      bufferNearMissCount: 90,
      selectedRunQuality: healthyQuality,
    });

    expect(summary.interpretationClassification).not.toBe("execution-gates-binding");
  });

  it("classifies gross-qualified observations eliminated by execution gates", () => {
    const independentGatePassCounts = createEmptyIndependentGatePassCounts();
    independentGatePassCounts.grossThresholdPass = 10;
    const gateCounts = createEmptyGateCounts();
    gateCounts.allRejectionsByGate["missing-executable-size"] = 6;

    const summary = classifyParityNearMissInterpretation({
      recordsScanned: 100,
      recordsEligible: 95,
      sequentialFunnel: {
        ...createEmptySequentialFunnel(),
        loaded: 100,
        validBook: 95,
        synchronizedBook: 95,
        bothSidesPresent: 95,
        stalenessPass: 95,
        executableSize: 4,
        grossThreshold: 4,
        feeThreshold: 4,
        bufferThreshold: 0,
        finalCandidate: 0,
      },
      independentGatePassCounts,
      gateCounts,
      closestGrossNearMiss: null,
      closestFeeAdjustedNearMiss: null,
      closestBufferNearMiss: null,
      grossNearMissCount: 0,
      feeAdjustedNearMissCount: 0,
      bufferNearMissCount: 0,
      selectedRunQuality: healthyQuality,
    });

    expect(summary.interpretationClassification).toBe("execution-gates-binding");
  });
});

describe("loadSelectedRunContext", () => {
  it("hydrates matching run quality and preserves numeric zero", () => {
    const context = loadSelectedRunContext({
      io: createMemoryParityNearMissIo(buildFixtureFiles()),
      captureRunDir: RUN_DIR,
    });

    expect(context.selectedRunQuality.runDurationSeconds).toBe(3600);
    expect(context.selectedRunQuality.validBookShare).toBe(0.99);
    expect(context.selectedRunQuality.btcJoinCoverageShare).toBe(1);
    expect(context.selectedRunQuality.bidSizeCoverageShare).toBe(0.95);
    expect(context.selectedRunQuality.reconnectCount).toBe(0);
    expect(context.selectedRunQuality.suspectedSystemSleepSeconds).toBe(0);
    expect(context.selectedRunQuality.sequenceGapCount).toBe(2);
    expect(context.selectedRunQuality.captureVerdict).toBe("capture-research-ready");
  });

  it("warns when reconciliation artifact run identity mismatches", () => {
    const files = buildFixtureFiles();
    files["data/research-results/capture-health-reconciliation.json"] = JSON.stringify({
      selectedRunId: "other-run",
      sourceRunIds: ["other-run"],
      summary: { selectedRunId: "other-run" },
    });

    const context = loadSelectedRunContext({
      io: createMemoryParityNearMissIo(files),
      captureRunDir: RUN_DIR,
    });

    expect(context.warnings.some((warning) => warning.includes("reconciliation"))).toBe(true);
    expect(context.selectedRunQuality.suspectedSystemSleepSeconds).toBeNull();
  });
});

describe("analyzeParityNearMissForRun", () => {
  it("fails clearly for unknown run directories", () => {
    const io = createMemoryParityNearMissIo({});
    expect(() => validateSelectedRunDirectory(io, "missing/run")).toThrow(ParityNearMissAnalysisError);
  });

  it("requires explicit --capture-run-dir and does not default to latest", () => {
    expect(() => parseParityNearMissAnalysisArgv([])).toThrow(
      "Missing required --capture-run-dir.",
    );
  });

  it("preserves default near-miss limit when CLI flag is omitted", () => {
    const parsed = parseParityNearMissAnalysisArgv([
      "--capture-run-dir",
      RUN_DIR,
    ]);

    expect(parsed.config.nearMissLimit).toBe(25);
  });

  it("produces selected-run scoped report with funnel, rankings, and rule hash", async () => {
    const io = createMemoryParityNearMissIo(buildFixtureFiles());
    const report = await analyzeParityNearMissForRun({
      generatedAt: "2026-07-11T12:00:00.000Z",
      outputPath: "data/research-results/parity-near-miss-analysis.json",
      htmlOutputPath: "data/reports/parity-near-miss-analysis.html",
      config: createParityNearMissAnalysisConfig({
        captureRunDir: RUN_DIR,
        nearMissLimit: 5,
      }),
      io,
    });

    expect(report.analysisScope).toBe("selected-run");
    expect(report.selectedRunId).toBe("run-near-miss");
    expect(report.recordsScanned).toBe(6);
    expect(report.sequentialQualificationFunnel.loaded).toBe(6);
    expect(report.summary.candidateCount).toBe(1);
    expect(report.nearMissRankings.gross.length).toBeGreaterThan(0);
    expect(report.nearMissRankings.gross[0]?.shortfallCents).toBe(1);
    expect(report.distanceDistributions.gross["0.5-to-1-cent"]).toBeGreaterThan(0);
    expect(report.ruleConfigurationHash).toMatch(/^parity-near-miss-v1-/);
    expect(report.selectedRunQuality.sequenceGapCount).toBe(2);
    expect(serializeParityNearMissAnalysisHtml(report)).toContain("Sequential qualification funnel");
  });

  it("regression fixture surfaces execution-gate binding from independent gross evidence", async () => {
    const report = await analyzeParityNearMissForRun({
      generatedAt: "2026-07-11T12:00:00.000Z",
      outputPath: "data/research-results/parity-near-miss-analysis.json",
      htmlOutputPath: "data/reports/parity-near-miss-analysis.html",
      config: createParityNearMissAnalysisConfig({ captureRunDir: RUN_DIR }),
      io: createMemoryParityNearMissIo(buildRegressionFixtureFiles()),
    });

    expect(report.summary.closestGrossNearMissCents).toBe(2);
    expect(report.summary.grossNearMissCount).toBeGreaterThan(0);
    expect(report.distanceDistributions.gross["1-to-2-cents"]).toBeGreaterThan(0);
    expect(report.independentGatePassCounts.grossThresholdPass).toBeGreaterThan(
      report.sequentialQualificationFunnel.grossThreshold,
    );
    expect(report.summary.interpretationClassification).toBe("execution-gates-binding");
    expect(report.stalenessSummary.knownFreshCount).toBeGreaterThan(15);
    expect(report.stalenessSummary.knownStaleCount).toBe(0);
    expect(report.selectedRunQuality.runDurationSeconds).toBe(28800);
    expect(report.selectedRunQuality.validBookShare).toBe(0.9919);
    expect(report.selectedRunQuality.btcJoinCoverageShare).toBe(1);
    expect(report.selectedRunQuality.bidSizeCoverageShare).toBe(0.9561791750925255);
    expect(report.selectedRunQuality.reconnectCount).toBe(0);
    expect(report.selectedRunQuality.suspectedSystemSleepSeconds).toBe(0);

    for (let index = 1; index < SEQUENTIAL_FUNNEL_STAGE_ORDER.length; index += 1) {
      const previous = report.sequentialQualificationFunnel[SEQUENTIAL_FUNNEL_STAGE_ORDER[index - 1]!];
      const current = report.sequentialQualificationFunnel[SEQUENTIAL_FUNNEL_STAGE_ORDER[index]!];
      expect(current).toBeLessThanOrEqual(previous);
    }
  });

  it("uses bid-size audit comparison coverage when classifying selected-run quality", async () => {
    const files = buildFixtureFiles();
    files[`${RUN_DIR}/top-of-book.jsonl`] = [
      topOfBookLine({ receivedAtLocal: "2026-07-11T11:00:01.000Z", yesBid: 50, noBid: 51, sequence: 1 }),
      topOfBookLine({ receivedAtLocal: "2026-07-11T11:00:02.000Z", yesBid: 50, noBid: 51, sequence: 2 }),
    ].join("\n");
    files["data/research-results/bid-size-coverage-audit.json"] = JSON.stringify({
      selectedRunId: "run-near-miss",
      sourceRunIds: ["run-near-miss"],
      comparison: { bidSizeCoverageShare: 0.1 },
    });

    const report = await analyzeParityNearMissForRun({
      generatedAt: "2026-07-11T12:00:00.000Z",
      outputPath: "data/research-results/parity-near-miss-analysis.json",
      htmlOutputPath: "data/reports/parity-near-miss-analysis.html",
      config: createParityNearMissAnalysisConfig({ captureRunDir: RUN_DIR }),
      io: createMemoryParityNearMissIo(files),
    });

    expect(report.selectedRunQuality.bidSizeCoverageShare).toBe(0.1);
    expect(report.summary.interpretationClassification).toBe("observation-quality-inconclusive");
    expect(report.summary.recommendedNextAction).toBe("fix-observation-integrity");
  });

  it("requires staleness pass for final candidate counts", async () => {
    const files = buildFixtureFiles();
    files[`${RUN_DIR}/top-of-book.jsonl`] = [
      topOfBookLine({
        receivedAtLocal: "2026-07-11T11:00:04.000Z",
        yesBid: 56,
        noBid: 50,
        exchangeTimestampMs: Date.parse("2026-07-11T11:00:04.000Z") - 120_000,
        sequence: 1,
      }),
      topOfBookLine({
        receivedAtLocal: "2026-07-11T11:00:05.000Z",
        yesBid: 56,
        noBid: 50,
        exchangeTimestampMs: Date.parse("2026-07-11T11:00:05.000Z"),
        sequence: 2,
      }),
    ].join("\n");

    const report = await analyzeParityNearMissForRun({
      generatedAt: "2026-07-11T12:00:00.000Z",
      outputPath: "data/research-results/parity-near-miss-analysis.json",
      htmlOutputPath: "data/reports/parity-near-miss-analysis.html",
      config: createParityNearMissAnalysisConfig({ captureRunDir: RUN_DIR }),
      io: createMemoryParityNearMissIo(files),
    });

    expect(report.sequentialQualificationFunnel.bufferThreshold).toBe(1);
    expect(report.summary.candidateCount).toBe(1);
    expect(report.qualificationFunnel.finalCandidates).toBe(1);
    expect(report.stalenessSummary.knownStaleCount).toBe(1);
    expect(report.stalenessSummary.knownFreshCount).toBe(1);
  });

  it("does not count buffer-threshold rows blocked by executable size as final candidates", async () => {
    const receivedAtMs = Date.parse("2026-07-11T11:00:04.000Z");
    const files = buildFixtureFiles();
    files[`${RUN_DIR}/top-of-book.jsonl`] = [
      topOfBookLine({
        receivedAtLocal: "2026-07-11T11:00:04.000Z",
        yesBid: 56,
        noBid: 50,
        yesBidSize: null,
        noBidSize: null,
        exchangeTimestampMs: receivedAtMs,
        sequence: 1,
      }),
    ].join("\n");

    const report = await analyzeParityNearMissForRun({
      generatedAt: "2026-07-11T12:00:00.000Z",
      outputPath: "data/research-results/parity-near-miss-analysis.json",
      htmlOutputPath: "data/reports/parity-near-miss-analysis.html",
      config: createParityNearMissAnalysisConfig({ captureRunDir: RUN_DIR }),
      io: createMemoryParityNearMissIo(files),
    });

    expect(report.independentGatePassCounts.bufferThresholdPass).toBe(1);
    expect(report.independentGatePassCounts.finalCandidatePass).toBe(0);
    expect(report.sequentialQualificationFunnel.bufferThreshold).toBe(0);
    expect(report.sequentialQualificationFunnel.finalCandidate).toBe(0);
    expect(report.qualificationFunnel.finalCandidates).toBe(0);
    expect(report.summary.candidateCount).toBe(0);
    expect(report.summary.interpretationClassification).toBe("execution-gates-binding");
    expect(report.gateCounts.episodesReachingStage.bufferEpisode).toBe(0);
    expect(report.gateCounts.allRejectionsByGate["missing-executable-size"]).toBe(1);
  });

  it("keeps rule configuration hash stable for unchanged defaults", () => {
    const config = createParityNearMissAnalysisConfig({ captureRunDir: RUN_DIR });
    const hashA = `parity-near-miss-v1-${fnv1a32(stableStringify(buildRuleConfiguration(config)))}`;
    const hashB = `parity-near-miss-v1-${fnv1a32(stableStringify(buildRuleConfiguration(config)))}`;
    expect(hashA).toBe(hashB);
  });

  it("completes real-run-shaped fixture with zero candidates and populated gross rankings", async () => {
    const report = await analyzeParityNearMissForRun({
      generatedAt: "2026-07-11T12:00:00.000Z",
      outputPath: "data/research-results/parity-near-miss-analysis.json",
      htmlOutputPath: "data/reports/parity-near-miss-analysis.html",
      config: createParityNearMissAnalysisConfig({ captureRunDir: RUN_DIR }),
      io: createMemoryParityNearMissIo(buildRealRunShapedFixtureFiles()),
    });

    expect(report.summary.candidateCount).toBe(0);
    expect(report.summary.grossNearMissCount).toBeGreaterThan(0);
    expect(report.summary.closestGrossNearMissCents).toBeGreaterThan(0);
    expect(report.nearMissRankings.gross.length).toBeGreaterThan(0);
    expect(serializeParityNearMissAnalysisHtml(report)).toContain("Closest gross near misses");
  });

  it("keeps gross rankings while executable ranking stays empty when size always passes", async () => {
    const report = await analyzeParityNearMissForRun({
      generatedAt: "2026-07-11T12:00:00.000Z",
      outputPath: "data/research-results/parity-near-miss-analysis.json",
      htmlOutputPath: "data/reports/parity-near-miss-analysis.html",
      config: createParityNearMissAnalysisConfig({ captureRunDir: RUN_DIR }),
      io: createMemoryParityNearMissIo(buildGrossOnlyNearMissFixtureFiles()),
    });

    expect(report.nearMissRankings.gross.length).toBeGreaterThan(0);
    expect(report.nearMissRankings.executable).toEqual([]);
    expect(report.summary.closestGrossNearMissCents).toBe(2);
  });

  it("leaves fee-adjusted ranking empty when gross already qualifies", async () => {
    const report = await analyzeParityNearMissForRun({
      generatedAt: "2026-07-11T12:00:00.000Z",
      outputPath: "data/research-results/parity-near-miss-analysis.json",
      htmlOutputPath: "data/reports/parity-near-miss-analysis.html",
      config: createParityNearMissAnalysisConfig({ captureRunDir: RUN_DIR }),
      io: createMemoryParityNearMissIo(buildQualifiedGrossFixtureFiles()),
    });

    expect(report.nearMissRankings.gross).toEqual([]);
    expect(report.nearMissRankings.feeAdjusted).toEqual([]);
    expect(report.nearMissRankings.bufferAdjusted).toEqual([]);
  });

  it("handles no evaluable records without crashing", async () => {
    const report = await analyzeParityNearMissForRun({
      generatedAt: "2026-07-11T12:00:00.000Z",
      outputPath: "data/research-results/parity-near-miss-analysis.json",
      htmlOutputPath: "data/reports/parity-near-miss-analysis.html",
      config: createParityNearMissAnalysisConfig({ captureRunDir: RUN_DIR }),
      io: createMemoryParityNearMissIo(buildNoEvaluableRecordsFixtureFiles()),
    });

    expect(report.summary.closestGrossNearMissCents).toBeNull();
    expect(report.nearMissRankings.gross).toEqual([]);
    expect(report.nearMissRankings.feeAdjusted).toEqual([]);
    expect(report.nearMissRankings.bufferAdjusted).toEqual([]);
    expect(report.nearMissRankings.executable).toEqual([]);
    expect(report.nearMissRankings.grossEpisodes).toEqual([]);
    expect(report.nearMissRankings.bufferEpisodes).toEqual([]);
    expect(report.recordsEligible).toBeGreaterThan(0);
    expect(report.summary.closestGrossNearMissCents).toBeNull();
  });

  it("renders HTML when ranking categories are empty", async () => {
    const report = await analyzeParityNearMissForRun({
      generatedAt: "2026-07-11T12:00:00.000Z",
      outputPath: "data/research-results/parity-near-miss-analysis.json",
      htmlOutputPath: "data/reports/parity-near-miss-analysis.html",
      config: createParityNearMissAnalysisConfig({ captureRunDir: RUN_DIR }),
      io: createMemoryParityNearMissIo(buildQualifiedGrossFixtureFiles()),
    });

    const html = serializeParityNearMissAnalysisHtml(report);
    expect(html).toContain("No near misses in this category.");
    expect(html).toContain("Closest gross near miss");
  });
});

describe("computeObservedGrossEdgeCents", () => {
  it("matches yes plus no minus 100", () => {
    expect(computeObservedGrossEdgeCents(50, 51)).toBe(1);
    expect(computeObservedGrossEdgeCents(50, 50)).toBe(0);
    expect(computeObservedGrossEdgeCents(49, 50)).toBe(-1);
  });
});
