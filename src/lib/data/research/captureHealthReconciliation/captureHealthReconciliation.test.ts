import { describe, expect, it, vi } from "vitest";

import { createMemoryJsonlIo } from "@/lib/data/research/jsonl";

import {
  analyzeCaptureIntegrity,
  computeDurationMetrics,
  createCaptureHealthReconciliationConfig,
  detectHostSuspension,
  documentCounterSemantics,
  evaluateResearchSuitability,
  parseCaptureHealthReconciliationArgv,
  reconcileValidBookMetrics,
  validateRunScopedArtifacts,
  CaptureHealthReconciliationError,
} from "./index";
import { attributeConnectionEvents } from "./attributeConnectionEvents";
import type { CaptureHealthReconciliationIo } from "./captureHealthReconciliationTypes";
import type { ParsedTopOfBookRecord } from "@/lib/data/research/captureHealthAudit/captureHealthAuditTypes";

function createReconciliationMemoryIo(
  files: Record<string, string> = {},
  dirs: string[] = [],
): CaptureHealthReconciliationIo {
  const dirSet = new Set(dirs.map((dir) => dir.replaceAll("\\", "/")));
  const jsonl = createMemoryJsonlIo(files);

  return {
    ...jsonl,
    fileExists: (path) => {
      const normalized = path.replaceAll("\\", "/");
      return jsonl.fileExists(path) || dirSet.has(normalized);
    },
    isDirectory: (path) => dirSet.has(path.replaceAll("\\", "/")),
  };
}

function btcSpotLine(receivedAtLocal: string): string {
  return JSON.stringify({
    runId: "run-1",
    source: "coinbase",
    receivedAtLocal,
    exchangeTimestampMs: Date.parse(receivedAtLocal),
    priceUsd: 100_000,
  });
}

function topOfBookRecord(input: {
  receivedAtLocal: string;
  bookState?: string;
}): ParsedTopOfBookRecord {
  const receivedAtMs = Date.parse(input.receivedAtLocal);
  return {
    lineNumber: 1,
    runId: "run-1",
    marketTicker: "KXBTC15M-TEST",
    eventTicker: "KXBTC15M-EVENT",
    seriesTicker: "KXBTC15M",
    receivedAtLocal: input.receivedAtLocal,
    receivedAtMs,
    exchangeTimestampMs: receivedAtMs,
    sequence: 1,
    bookState: input.bookState ?? "valid",
    yesBestBidCents: 45,
    yesBestAskCents: 50,
    yesSpreadCents: 5,
    noSpreadCents: 5,
    rawMessageType: "orderbook_delta",
  };
}

function buildRunDir(runId: string): string {
  return `data/live-capture/forward-quotes/${runId}`;
}

describe("captureHealthReconciliation", () => {
  describe("computeDurationMetrics", () => {
    it("derives configured duration from durationMinutes", () => {
      const metrics = computeDurationMetrics({
        topOfBookRecords: [
          topOfBookRecord({ receivedAtLocal: "2026-07-11T00:00:00.000Z" }),
          topOfBookRecord({ receivedAtLocal: "2026-07-11T06:00:00.000Z" }),
        ],
        captureHealth: {
          config: { durationMinutes: 360 },
          startedAt: "2026-07-11T00:54:49.082Z",
          endedAt: "2026-07-11T06:54:49.082Z",
        },
        suspectedHostSuspensionSeconds: 2_640,
      });

      expect(metrics.configuredDurationSeconds).toBe(21_600);
      expect(metrics.processWallClockSeconds).toBe(21_600);
      expect(metrics.eventWallClockSpanSeconds).toBe(21_600);
      expect(metrics.activeObservationSeconds).toBe(18_960);
      expect(metrics.usableObservationSeconds).toBe(18_960);
    });

    it("leaves unknown durations null with warnings when inputs are missing", () => {
      const metrics = computeDurationMetrics({
        topOfBookRecords: [],
        captureHealth: null,
        suspectedHostSuspensionSeconds: 0,
      });

      expect(metrics.processWallClockSeconds).toBeNull();
      expect(metrics.eventWallClockSpanSeconds).toBeNull();
      expect(metrics.warnings.length).toBeGreaterThan(0);
    });

    it("does not classify clean observed valid time as unknown blind time", () => {
      const metrics = computeDurationMetrics({
        topOfBookRecords: [
          topOfBookRecord({ receivedAtLocal: "2026-07-11T00:00:00.000Z" }),
          topOfBookRecord({ receivedAtLocal: "2026-07-11T00:01:00.000Z" }),
        ],
        captureHealth: {
          config: { durationSeconds: 60 },
          startedAt: "2026-07-11T00:00:00.000Z",
          endedAt: "2026-07-11T00:01:00.000Z",
        },
        suspectedHostSuspensionSeconds: 0,
      });

      expect(metrics.eventWallClockSpanSeconds).toBe(60);
      expect(metrics.usableObservationSeconds).toBe(60);
      expect(metrics.resynchronizationSeconds).toBe(0);
      expect(metrics.unknownBlindSeconds).toBe(0);
    });
  });

  describe("reconcileValidBookMetrics", () => {
    it("exposes distinct metrics for raw and aggregate populations", () => {
      const records = [
        topOfBookRecord({ receivedAtLocal: "2026-07-11T00:00:00.000Z", bookState: "valid" }),
        topOfBookRecord({ receivedAtLocal: "2026-07-11T00:00:01.000Z", bookState: "valid" }),
        topOfBookRecord({ receivedAtLocal: "2026-07-11T00:00:02.000Z", bookState: "gap-detected" }),
      ];

      const metrics = reconcileValidBookMetrics({
        topOfBookRecords: records,
        aggregateForwardReadinessValidShare: 0.6237,
      });

      const raw = metrics.find((metric) => metric.metricId === "rawTopOfBookValidShare");
      const aggregate = metrics.find(
        (metric) => metric.metricId === "aggregateForwardReadinessValidShare",
      );

      expect(raw?.value).toBeCloseTo(0.6667, 4);
      expect(raw?.numerator).toBe(2);
      expect(raw?.denominator).toBe(3);
      expect(aggregate?.value).toBeCloseTo(0.6237, 4);
      expect(aggregate?.population).toContain("multi-run aggregate");
    });
  });

  describe("detectHostSuspension", () => {
    it("does not flag normal five-second heartbeat cadence", async () => {
      const btcPath = "data/run/btc-spot.jsonl";
      const lines = [
        "2026-07-11T00:00:00.000Z",
        "2026-07-11T00:00:05.000Z",
        "2026-07-11T00:00:10.000Z",
      ]
        .map(btcSpotLine)
        .join("\n");

      const io = createReconciliationMemoryIo({ [btcPath]: `${lines}\n` });
      const result = await detectHostSuspension({
        io,
        btcSpotPath: btcPath,
        config: createCaptureHealthReconciliationConfig({ captureRunDir: "data/run" }),
      });

      expect(result.suspectedSystemSleepEventCount).toBe(0);
      expect(result.heartbeatGapCount).toBe(0);
    });

    it("detects probable host suspension for multi-minute gaps modeled after the known run", async () => {
      const btcPath = "data/run/btc-spot.jsonl";
      const lines = [
        "2026-07-11T05:02:45.069Z",
        "2026-07-11T05:26:44.102Z",
        "2026-07-11T05:46:18.565Z",
      ]
        .map(btcSpotLine)
        .join("\n");

      const io = createReconciliationMemoryIo({ [btcPath]: `${lines}\n` });
      const result = await detectHostSuspension({
        io,
        btcSpotPath: btcPath,
        config: createCaptureHealthReconciliationConfig({ captureRunDir: "data/run" }),
      });

      expect(result.suspectedSystemSleepEventCount).toBe(2);
      expect(result.suspectedSystemSleepSeconds).toBeGreaterThan(2_500);
      expect(result.intervals.some((interval) => interval.classification === "probable-host-suspension")).toBe(
        true,
      );
    });

    it("treats brief polling jitter below warning threshold as non-suspension", async () => {
      const btcPath = "data/run/btc-spot.jsonl";
      const lines = ["2026-07-11T00:00:00.000Z", "2026-07-11T00:00:12.000Z"]
        .map(btcSpotLine)
        .join("\n");

      const io = createReconciliationMemoryIo({ [btcPath]: `${lines}\n` });
      const result = await detectHostSuspension({
        io,
        btcSpotPath: btcPath,
        config: createCaptureHealthReconciliationConfig({ captureRunDir: "data/run" }),
      });

      expect(result.suspectedSystemSleepEventCount).toBe(0);
      expect(result.heartbeatGapCount).toBe(0);
    });
  });

  describe("attributeConnectionEvents", () => {
    it("buckets events and splits inside/outside suspension windows", async () => {
      const runDir = buildRunDir("attr-run");
      const btcPath = `${runDir}/btc-spot.jsonl`;
      const records = [
        topOfBookRecord({ receivedAtLocal: "2026-07-11T05:00:00.000Z" }),
        topOfBookRecord({ receivedAtLocal: "2026-07-11T05:10:00.000Z", bookState: "gap-detected" }),
        topOfBookRecord({ receivedAtLocal: "2026-07-11T06:00:00.000Z" }),
      ];

      const suspension = await detectHostSuspension({
        io: createReconciliationMemoryIo({
          [btcPath]: [
            btcSpotLine("2026-07-11T05:02:45.069Z"),
            btcSpotLine("2026-07-11T05:46:18.565Z"),
          ].join("\n"),
        }),
        btcSpotPath: btcPath,
        config: createCaptureHealthReconciliationConfig({
          captureRunDir: runDir,
          timelineBucketMs: 60 * 60 * 1000,
        }),
      });

      const attribution = await attributeConnectionEvents({
        io: createReconciliationMemoryIo({}, [runDir]),
        config: createCaptureHealthReconciliationConfig({
          captureRunDir: runDir,
          timelineBucketMs: 60 * 60 * 1000,
        }),
        topOfBookRecords: records,
        captureHealth: {
          connection: { reconnectCount: 10 },
          orderbook: { sequenceGapCount: 100, reconnectCount: 5 },
        },
        rawWsPath: null,
        btcSpotPath: null,
        suspensionIntervals: suspension.intervals,
      });

      expect(attribution.reconnectCount).toBe(10);
      expect(attribution.sequenceGapCount).toBe(100);
      expect(attribution.sequenceGapEpisodeCount).toBe(1);
      expect(attribution.eventsInsideSuspensionWindows).toBeGreaterThan(0);
      expect(attribution.eventsOutsideSuspensionWindows).toBeGreaterThan(0);
      expect(attribution.timelineBuckets.length).toBeGreaterThan(0);
    });
  });

  describe("documentCounterSemantics", () => {
    it("documents reconnect and sequence-gap counter semantics", () => {
      const semantics = documentCounterSemantics({
        connection: { reconnectCount: 2927 },
        orderbook: { sequenceGapCount: 68282, reconnectCount: 0 },
      });

      expect(semantics.find((item) => item.fieldName === "reconnectCount")?.reportedValue).toBe(2927);
      expect(semantics.find((item) => item.fieldName === "sequenceGapCount")?.reportedValue).toBe(68282);
      expect(
        semantics.find((item) => item.fieldName === "sequenceGapCount")?.semanticDefinition,
      ).toContain("applyDelta returned gap");
    });
  });

  describe("validateRunScopedArtifacts", () => {
    it("warns when artifact sourceRunIds do not match selected run", () => {
      const io = createReconciliationMemoryIo({
        "data/research-results/static-parity-scan.json": JSON.stringify({
          generatedAt: "2026-07-10T00:00:00.000Z",
          analysisScope: "aggregate",
          sourceRunIds: ["other-run"],
        }),
      });

      const checks = validateRunScopedArtifacts({
        io,
        selectedRunId: "target-run",
        artifactPaths: ["data/research-results/static-parity-scan.json"],
        evaluatedAt: "2026-07-11T00:00:00.000Z",
        staleAfterHours: 72,
      });

      expect(checks[0]?.matchesSelectedRun).toBe(false);
      expect(checks[0]?.warnings.some((warning) => warning.includes("sourceRunIds"))).toBe(true);
    });

    it("flags stale artifacts", () => {
      const io = createReconciliationMemoryIo({
        "data/research-results/static-parity-scan.json": JSON.stringify({
          generatedAt: "2026-06-01T00:00:00.000Z",
          analysisScope: "selected-run",
          selectedRunId: "target-run",
          sourceRunIds: ["target-run"],
        }),
      });

      const checks = validateRunScopedArtifacts({
        io,
        selectedRunId: "target-run",
        artifactPaths: ["data/research-results/static-parity-scan.json"],
        evaluatedAt: "2026-07-11T00:00:00.000Z",
        staleAfterHours: 72,
      });

      expect(checks[0]?.stale).toBe(true);
    });
  });

  describe("evaluateResearchSuitability", () => {
    it("keeps clean all-valid runs suitable for zero-candidate interpretation", () => {
      const topOfBookRecords = [
        topOfBookRecord({ receivedAtLocal: "2026-07-11T00:00:00.000Z" }),
        topOfBookRecord({ receivedAtLocal: "2026-07-11T00:01:00.000Z" }),
      ];
      const durations = computeDurationMetrics({
        topOfBookRecords,
        captureHealth: {
          config: { durationSeconds: 60 },
          startedAt: "2026-07-11T00:00:00.000Z",
          endedAt: "2026-07-11T00:01:00.000Z",
        },
        suspectedHostSuspensionSeconds: 0,
      });

      const assessment = evaluateResearchSuitability({
        durations,
        validBookMetrics: reconcileValidBookMetrics({
          topOfBookRecords,
          aggregateForwardReadinessValidShare: null,
        }),
        suspension: {
          suspectedSystemSleepEventCount: 0,
          suspectedSystemSleepSeconds: 0,
          longestHeartbeatGapMs: null,
          heartbeatGapCount: 0,
          intervals: [],
          warnings: [],
        },
        connection: {
          reconnectCount: 0,
          sequenceGapCount: 0,
          sequenceGapEpisodeCount: 0,
          eventsInsideSuspensionWindows: 0,
          eventsOutsideSuspensionWindows: 0,
          timelineBuckets: [],
          counterSemantics: [],
        },
        downstreamArtifacts: [],
        throttleMs: 1000,
      });

      expect(assessment.continuousMicrostructureSuitability).toBe("ready");
      expect(assessment.transientEventDetectionSuitability).toBe("ready-with-warnings");
      expect(assessment.zeroCandidateInterpretation).toBe(
        "zero-candidates-on-clean-observation",
      );
    });

    it("does not mark transient detection ready when blind windows are material", () => {
      const assessment = evaluateResearchSuitability({
        durations: {
          configuredDurationSeconds: 21_600,
          processWallClockSeconds: 21_600,
          eventWallClockSpanSeconds: 21_600,
          activeObservationSeconds: 18_000,
          usableObservationSeconds: 17_000,
          suspectedHostSuspensionSeconds: 3_600,
          webSocketDisconnectedSeconds: null,
          resynchronizationSeconds: 600,
          unknownBlindSeconds: 4_200,
          definitions: {} as never,
          warnings: [],
        },
        validBookMetrics: reconcileValidBookMetrics({
          topOfBookRecords: Array.from({ length: 100 }, (_, index) =>
            topOfBookRecord({
              receivedAtLocal: `2026-07-11T00:00:${String(index % 60).padStart(2, "0")}.000Z`,
              bookState: "valid",
            }),
          ),
          aggregateForwardReadinessValidShare: null,
        }),
        suspension: {
          suspectedSystemSleepEventCount: 1,
          suspectedSystemSleepSeconds: 3_600,
          longestHeartbeatGapMs: 2_640_000,
          heartbeatGapCount: 1,
          intervals: [],
          warnings: [],
        },
        connection: {
          reconnectCount: 10,
          sequenceGapCount: 100,
          sequenceGapEpisodeCount: 2,
          eventsInsideSuspensionWindows: 5,
          eventsOutsideSuspensionWindows: 95,
          timelineBuckets: [],
          counterSemantics: [],
        },
        downstreamArtifacts: [],
        throttleMs: 1000,
      });

      expect(assessment.transientEventDetectionSuitability).not.toBe("ready");
      expect(assessment.zeroCandidateInterpretation).toBe(
        "zero-candidates-with-material-blind-windows",
      );
    });
  });

  describe("parseCaptureHealthReconciliationArgv", () => {
    it("requires explicit capture run directory", () => {
      expect(() => parseCaptureHealthReconciliationArgv([])).toThrow(
        CaptureHealthReconciliationError,
      );
    });

    it("parses capture run directory and output paths", () => {
      const parsed = parseCaptureHealthReconciliationArgv([
        "--capture-run-dir",
        "data/live-capture/forward-quotes/run-1",
        "--output",
        "out/reconciliation.json",
      ]);

      expect(parsed.config.captureRunDir).toBe("data/live-capture/forward-quotes/run-1");
      expect(parsed.outputPath).toBe("out/reconciliation.json");
    });
  });

  describe("analyzeCaptureIntegrity", () => {
    it("fails clearly for unknown run directories", async () => {
      const io = createReconciliationMemoryIo({}, []);

      await expect(
        analyzeCaptureIntegrity({
          io,
          config: createCaptureHealthReconciliationConfig({
            captureRunDir: "data/live-capture/forward-quotes/missing-run",
          }),
          generatedAt: "2026-07-11T00:00:00.000Z",
          reconciliationOutputPath: "out/reconciliation.json",
          reconciliationHtmlOutputPath: "out/reconciliation.html",
          timelineOutputPath: "out/timeline.json",
          timelineHtmlOutputPath: "out/timeline.html",
        }),
      ).rejects.toThrow("Capture run directory not found");
    });

    it("produces selected-run scoped reconciliation and timeline reports", async () => {
      const runId = "reconcile-run";
      const runDir = buildRunDir(runId);
      const topPath = `${runDir}/top-of-book.jsonl`;
      const btcPath = `${runDir}/btc-spot.jsonl`;
      const healthPath = `${runDir}/capture-health.json`;

      const topLines = [
        topOfBookRecord({ receivedAtLocal: "2026-07-11T00:00:00.000Z" }),
        topOfBookRecord({ receivedAtLocal: "2026-07-11T00:00:01.000Z", bookState: "gap-detected" }),
        topOfBookRecord({ receivedAtLocal: "2026-07-11T00:00:02.000Z" }),
      ]
        .map((record) =>
          JSON.stringify({
            runId,
            marketTicker: record.marketTicker,
            eventTicker: record.eventTicker,
            seriesTicker: record.seriesTicker,
            receivedAtLocal: record.receivedAtLocal,
            exchangeTimestampMs: record.exchangeTimestampMs,
            sequence: record.sequence,
            bookState: record.bookState,
            yesBestBidCents: record.yesBestBidCents,
            yesBestAskCents: record.yesBestAskCents,
            yesSpreadCents: record.yesSpreadCents,
            noSpreadCents: record.noSpreadCents,
            rawMessageType: record.rawMessageType,
          }),
        )
        .join("\n");

      const io = createReconciliationMemoryIo(
        {
          [topPath]: `${topLines}\n`,
          [btcPath]: `${btcSpotLine("2026-07-11T00:00:00.000Z")}\n${btcSpotLine("2026-07-11T00:00:05.000Z")}\n`,
          [healthPath]: JSON.stringify({
            runId,
            startedAt: "2026-07-11T00:00:00.000Z",
            endedAt: "2026-07-11T00:10:00.000Z",
            config: {
              durationMinutes: 10,
              topOfBookThrottleMs: 1000,
            },
            connection: { reconnectCount: 3 },
            orderbook: { sequenceGapCount: 12 },
          }),
        },
        [runDir],
      );

      const result = await analyzeCaptureIntegrity({
        io,
        config: createCaptureHealthReconciliationConfig({ captureRunDir: runDir }),
        generatedAt: "2026-07-11T12:00:00.000Z",
        reconciliationOutputPath: "out/reconciliation.json",
        reconciliationHtmlOutputPath: "out/reconciliation.html",
        timelineOutputPath: "out/timeline.json",
        timelineHtmlOutputPath: "out/timeline.html",
      });

      expect(result.reconciliation.summary.selectedRunId).toBe(runId);
      expect(result.reconciliation.summary.sourceRunIds).toEqual([runId]);
      expect(result.reconciliation.validBookMetrics.length).toBeGreaterThan(0);
      expect(result.timeline.connectionAttribution.timelineBuckets.length).toBeGreaterThan(0);
    });

    it("streams raw JSONL via io.streamJsonl for timeline bucketing", async () => {
      const runId = "stream-run";
      const runDir = buildRunDir(runId);
      const rawPath = `${runDir}/raw-kalshi-ws.jsonl`;
      const topPath = `${runDir}/top-of-book.jsonl`;
      const healthPath = `${runDir}/capture-health.json`;

      const rawLines = Array.from({ length: 50 }, (_, index) =>
        JSON.stringify({
          receivedAtLocal: `2026-07-11T00:00:${String(index).padStart(2, "0")}.000Z`,
          type: "orderbook_delta",
        }),
      ).join("\n");

      const baseIo = createReconciliationMemoryIo(
        {
          [rawPath]: `${rawLines}\n`,
          [topPath]: `${JSON.stringify({
            marketTicker: "KXBTC15M-TEST",
            receivedAtLocal: "2026-07-11T00:00:00.000Z",
            bookState: "valid",
            yesBestBidCents: 45,
            yesBestAskCents: 50,
            yesSpreadCents: 5,
            noSpreadCents: 5,
          })}\n`,
          [healthPath]: JSON.stringify({ runId, config: { durationMinutes: 1 } }),
        },
        [runDir],
      );

      const streamJsonl = vi.fn(baseIo.streamJsonl);
      const io: CaptureHealthReconciliationIo = {
        ...baseIo,
        streamJsonl,
      };

      const result = await analyzeCaptureIntegrity({
        io,
        config: createCaptureHealthReconciliationConfig({ captureRunDir: runDir }),
        generatedAt: "2026-07-11T12:00:00.000Z",
        reconciliationOutputPath: "out/reconciliation.json",
        reconciliationHtmlOutputPath: "out/reconciliation.html",
        timelineOutputPath: "out/timeline.json",
        timelineHtmlOutputPath: "out/timeline.html",
      });

      expect(streamJsonl).toHaveBeenCalled();
      expect(
        result.timeline.connectionAttribution.timelineBuckets.some(
          (bucket) => bucket.rawWsMessageCount > 0,
        ),
      ).toBe(true);
    });
  });
});
