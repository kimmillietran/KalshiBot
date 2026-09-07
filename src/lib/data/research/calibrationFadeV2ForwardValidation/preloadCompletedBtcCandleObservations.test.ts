import { describe, expect, it } from "vitest";

import { createMemoryCalibrationFadeForwardValidationIo } from "../calibrationFadeForwardValidation/createCalibrationFadeForwardValidationIo";
import {
  V2_REQUIRED_PROVIDER,
  V2_REQUIRED_PROVIDER_INSTRUMENT,
  V2_REQUIRED_SOURCE_RECORD_TYPE,
} from "../calibrationFadeV2Preregistration";

import { V2_CANDLE_CLOSE_OFFSET_MS } from "./calibrationFadeV2ForwardValidationTypes";
import {
  defaultInRunCandlePath,
  isDefaultInRunCandlePath,
  preloadCompletedBtcCandleObservations,
  requireExplicitCandleRunId,
} from "./preloadCompletedBtcCandleObservations";

const CAPTURE_RUN_DIR = "data/live-capture/forward-quotes/run-A";
const DEFAULT_PATH = `${CAPTURE_RUN_DIR}/btc-candles-1m.jsonl`;
const OVERRIDE_PATH = "data/tmp/other-run-candles.jsonl";
const OPEN0 = Date.parse("2026-09-07T11:49:00.000Z");

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function candle(input: { minuteIndex: number; runId?: string | null }): Record<string, unknown> {
  const openTimeMs = OPEN0 + input.minuteIndex * 60_000;
  const close = 100_000 + input.minuteIndex;
  return {
    source: "coinbase-exchange-rest-candles",
    provider: V2_REQUIRED_PROVIDER,
    productId: V2_REQUIRED_PROVIDER_INSTRUMENT,
    sourceRecordType: V2_REQUIRED_SOURCE_RECORD_TYPE,
    granularityMs: 60_000,
    candleOpenTime: iso(openTimeMs),
    candleCloseTime: iso(openTimeMs + V2_CANDLE_CLOSE_OFFSET_MS),
    open: close,
    high: close + 10,
    low: close - 10,
    close,
    volume: 1,
    observedAtLocal: iso(openTimeMs + V2_CANDLE_CLOSE_OFFSET_MS),
    firstObservedAtLocal: iso(openTimeMs + V2_CANDLE_CLOSE_OFFSET_MS),
    retrievalMethod: "synthetic-fixture",
    ...(input.runId ? { runId: input.runId } : {}),
  };
}

async function load(input: {
  records: readonly Record<string, unknown>[];
  evidenceMode: "diagnostic" | "confirmatory";
  expectedRunId: string;
  requireExplicitRunId: boolean;
  candlesPath?: string;
}) {
  const path = input.candlesPath ?? DEFAULT_PATH;
  const io = createMemoryCalibrationFadeForwardValidationIo({
    [path]: input.records.map((record) => JSON.stringify(record)).join("\n"),
  });
  return preloadCompletedBtcCandleObservations({
    io,
    captureRunDir: CAPTURE_RUN_DIR,
    candlesPath: path,
    evidenceMode: input.evidenceMode,
    expectedRunId: input.expectedRunId,
    requireExplicitRunId: input.requireExplicitRunId,
  });
}

describe("preloadCompletedBtcCandleObservations run provenance", () => {
  it("treats the default in-run artifact path as the only diagnostic omitted-runId exception", () => {
    expect(defaultInRunCandlePath(CAPTURE_RUN_DIR)).toBe(DEFAULT_PATH);
    expect(isDefaultInRunCandlePath(DEFAULT_PATH, CAPTURE_RUN_DIR)).toBe(true);
    expect(isDefaultInRunCandlePath(DEFAULT_PATH, `${CAPTURE_RUN_DIR}/`)).toBe(true);
    expect(isDefaultInRunCandlePath(OVERRIDE_PATH, CAPTURE_RUN_DIR)).toBe(false);
    expect(requireExplicitCandleRunId({
      evidenceMode: "confirmatory",
      candlesPath: DEFAULT_PATH,
      captureRunDir: CAPTURE_RUN_DIR,
    })).toBe(true);
    expect(requireExplicitCandleRunId({
      evidenceMode: "diagnostic",
      candlesPath: DEFAULT_PATH,
      captureRunDir: CAPTURE_RUN_DIR,
    })).toBe(false);
    expect(requireExplicitCandleRunId({
      evidenceMode: "diagnostic",
      candlesPath: OVERRIDE_PATH,
      captureRunDir: CAPTURE_RUN_DIR,
    })).toBe(true);
  });

  it("accepts matching explicit runIds", async () => {
    const index = await load({
      records: [candle({ minuteIndex: 0, runId: "run-A" })],
      evidenceMode: "confirmatory",
      expectedRunId: "run-A",
      requireExplicitRunId: true,
    });
    expect(index.observations).toHaveLength(1);
    expect(index.observations[0]?.runId).toBe("run-A");
  });

  it("rejects the first incompatible runId without admitting later rows", async () => {
    await expect(
      load({
        records: [
          candle({ minuteIndex: 0, runId: "run-A" }),
          candle({ minuteIndex: 1, runId: "run-B" }),
          candle({ minuteIndex: 2, runId: "run-A" }),
        ],
        evidenceMode: "diagnostic",
        expectedRunId: "run-A",
        requireExplicitRunId: false,
      }),
    ).rejects.toThrow(/record=2.*expectedRunId=run-A.*actualRunId="run-B"/);
  });

  it("rejects confirmatory rows that omit runId", async () => {
    await expect(
      load({
        records: [candle({ minuteIndex: 0 })],
        evidenceMode: "confirmatory",
        expectedRunId: "run-A",
        requireExplicitRunId: true,
      }),
    ).rejects.toThrow(/missing an explicit runId required for this load/);
  });

  it("accepts diagnostic default-path rows that omit runId", async () => {
    const index = await load({
      records: [candle({ minuteIndex: 0 })],
      evidenceMode: "diagnostic",
      expectedRunId: "run-A",
      requireExplicitRunId: false,
    });
    expect(index.observations[0]?.runId).toBeNull();
  });

  it("rejects override-path rows that omit runId even in diagnostic mode", async () => {
    await expect(
      load({
        records: [candle({ minuteIndex: 0 })],
        evidenceMode: "diagnostic",
        expectedRunId: "run-A",
        requireExplicitRunId: true,
        candlesPath: OVERRIDE_PATH,
      }),
    ).rejects.toThrow(/missing an explicit runId required for this load/);
  });
});
