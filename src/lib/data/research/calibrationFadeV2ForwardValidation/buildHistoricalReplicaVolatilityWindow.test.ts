import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { estimateRealizedVolatility } from "@/lib/data/strategies/fairValueDiffusion/fairValueDiffusionModel";
import type { EvaluationCandleSnapshot } from "@/types/domain/trading";
import { volatilityInAuthoritativeBand } from "../calibrationFadeForwardValidation/resolveFrozenEligibilityBands";
import { createMemoryCalibrationFadeForwardValidationIo } from "../calibrationFadeForwardValidation/createCalibrationFadeForwardValidationIo";
import {
  V2_REQUIRED_PROVIDER,
  V2_REQUIRED_PROVIDER_INSTRUMENT,
  V2_REQUIRED_SOURCE_RECORD_TYPE,
} from "../calibrationFadeV2Preregistration";

import { buildHistoricalReplicaVolatilityWindow } from "./buildHistoricalReplicaVolatilityWindow";
import {
  V2_CANDLE_CLOSE_OFFSET_MS,
  V2_REQUIRED_CLOSE_COUNT,
  V2_REQUIRED_LOOKBACK_BARS,
  type ClosedMinuteObservation,
} from "./calibrationFadeV2ForwardValidationTypes";
import {
  preloadCompletedBtcCandleObservations,
  type CompletedCandleObservationIndex,
  type MinuteRevisionHistory,
} from "./preloadCompletedBtcCandleObservations";

const RUN_DIR = "data/live-capture/forward-quotes/run-v2-window";
const CANDLES_PATH = `${RUN_DIR}/btc-candles-1m.jsonl`;
const OPEN0 = Date.parse("2026-09-07T11:49:00.000Z");

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function highVolClose(index: number): number {
  return 100_000 + (index % 2 === 0 ? 1 : -1) * (2_000 + index * 150);
}

function observation(input: {
  minuteIndex: number;
  close?: number;
  observedAtMs: number;
  firstObservedAtMs?: number;
  retrievalMethod?: ClosedMinuteObservation["retrievalMethod"];
}): Record<string, unknown> {
  const openTimeMs = OPEN0 + input.minuteIndex * 60_000;
  const closeTimeMs = openTimeMs + V2_CANDLE_CLOSE_OFFSET_MS;
  const close = input.close ?? highVolClose(input.minuteIndex);
  return {
    source: "coinbase-exchange-rest-candles",
    provider: V2_REQUIRED_PROVIDER,
    productId: V2_REQUIRED_PROVIDER_INSTRUMENT,
    sourceRecordType: V2_REQUIRED_SOURCE_RECORD_TYPE,
    granularityMs: 60_000,
    candleOpenTime: iso(openTimeMs),
    candleCloseTime: iso(closeTimeMs),
    open: close,
    high: close + 10,
    low: close - 10,
    close,
    volume: 1,
    observedAtLocal: iso(input.observedAtMs),
    firstObservedAtLocal: iso(input.firstObservedAtMs ?? input.observedAtMs),
    retrievalMethod: input.retrievalMethod ?? "synthetic-fixture",
  };
}

async function loadIndex(records: readonly Record<string, unknown>[]): Promise<CompletedCandleObservationIndex> {
  const io = createMemoryCalibrationFadeForwardValidationIo({
    [CANDLES_PATH]: records.map((record) => JSON.stringify(record)).join("\n"),
  });
  return preloadCompletedBtcCandleObservations({
    io,
    captureRunDir: RUN_DIR,
    evidenceMode: "diagnostic",
  });
}

function closesToCandles(closes: readonly number[]): EvaluationCandleSnapshot[] {
  return closes.map((close, index) => {
    const openTimeMs = OPEN0 + index * 60_000;
    return {
      timestamp: openTimeMs + V2_CANDLE_CLOSE_OFFSET_MS,
      open: close,
      high: close + 10,
      low: close - 10,
      close,
    };
  });
}

describe("buildHistoricalReplicaVolatilityWindow", () => {
  it("matches estimateRealizedVolatility on a known 11-close series and uses lookback=10", async () => {
    const closes = Array.from({ length: 11 }, (_, index) => highVolClose(index));
    const expected = estimateRealizedVolatility(closesToCandles(closes), V2_REQUIRED_LOOKBACK_BARS);
    expect(expected).not.toBeNull();
    expect(V2_REQUIRED_LOOKBACK_BARS).toBe(10);
    expect(V2_REQUIRED_CLOSE_COUNT).toBe(11);

    const quoteMs = OPEN0 + 11 * 60_000;
    const records = closes.map((close, minuteIndex) =>
      observation({
        minuteIndex,
        close,
        observedAtMs: OPEN0 + minuteIndex * 60_000 + V2_CANDLE_CLOSE_OFFSET_MS + 1_000,
      }),
    );
    const index = await loadIndex(records);
    const window = buildHistoricalReplicaVolatilityWindow({ index, timestampMs: quoteMs });
    expect(window.available).toBe(true);
    expect(window.annualizedVolatility).toBe(expected!.annualizedVol);
    expect(window.candles).toHaveLength(11);
  });

  it("treats vol-high at exactly 0.60 as eligible under the frozen band", () => {
    expect(
      volatilityInAuthoritativeBand(0.6, { bucketId: "vol-high", minInclusive: 0.6, maxExclusive: null }),
    ).toBe(true);
    expect(
      volatilityInAuthoritativeBand(0.599999, {
        bucketId: "vol-high",
        minInclusive: 0.6,
        maxExclusive: null,
      }),
    ).toBe(false);
  });

  it("uses a candle observed before T and rejects one observed after T", async () => {
    const records = Array.from({ length: 11 }, (_, minuteIndex) =>
      observation({
        minuteIndex,
        observedAtMs: OPEN0 + minuteIndex * 60_000 + 70_000,
      }),
    );
    const lateOnly = [
      ...records.slice(0, 10),
      observation({
        minuteIndex: 10,
        observedAtMs: OPEN0 + 11 * 60_000 + 5_000,
      }),
    ];
    const quoteMs = OPEN0 + 11 * 60_000 + 1_000;
    const usable = buildHistoricalReplicaVolatilityWindow({
      index: await loadIndex(records),
      timestampMs: quoteMs,
    });
    const notYet = buildHistoricalReplicaVolatilityWindow({
      index: await loadIndex(lateOnly),
      timestampMs: quoteMs,
    });
    expect(usable.available).toBe(true);
    expect(notYet.available).toBe(false);
    expect(notYet.rejectionReason).toBe("insufficient-completed-minutes");
  });

  it("does not treat closeTime <= T as sufficient without observation time", async () => {
    const records = Array.from({ length: 11 }, (_, minuteIndex) =>
      observation({
        minuteIndex,
        observedAtMs: OPEN0 + 12 * 60_000,
      }),
    );
    const quoteMs = OPEN0 + 11 * 60_000;
    const window = buildHistoricalReplicaVolatilityWindow({
      index: await loadIndex(records),
      timestampMs: quoteMs,
    });
    expect(window.available).toBe(false);
    expect(records.every((record) => Date.parse(String(record.candleCloseTime)) < quoteMs)).toBe(true);
  });

  it("excludes the in-progress / current exchange minute", async () => {
    const records = Array.from({ length: 12 }, (_, minuteIndex) =>
      observation({
        minuteIndex,
        observedAtMs: OPEN0 + minuteIndex * 60_000 + 1_000,
      }),
    );
    const quoteMs = OPEN0 + 11 * 60_000 + 30_000;
    const window = buildHistoricalReplicaVolatilityWindow({
      index: await loadIndex(records),
      timestampMs: quoteMs,
    });
    expect(window.available).toBe(true);
    const currentOpen = OPEN0 + 11 * 60_000;
    expect(window.selectedOpenTimeMs).not.toContain(currentOpen);
    expect(window.selectedOpenTimeMs.at(-1)).toBe(OPEN0 + 10 * 60_000);
  });

  it("allows a startup-backfilled candle only after firstObservedAtLocal", async () => {
    const firstObservedAtMs = OPEN0 + 11 * 60_000 + 2_000;
    const records = Array.from({ length: 11 }, (_, minuteIndex) =>
      observation({
        minuteIndex,
        observedAtMs: firstObservedAtMs,
        firstObservedAtMs,
        retrievalMethod: "startup-backfill",
      }),
    );
    const index = await loadIndex(records);
    const before = buildHistoricalReplicaVolatilityWindow({
      index,
      timestampMs: firstObservedAtMs - 1,
    });
    const after = buildHistoricalReplicaVolatilityWindow({
      index,
      timestampMs: firstObservedAtMs + 1,
    });
    expect(before.available).toBe(false);
    expect(after.available).toBe(true);
  });

  it("uses revision A between A and B, then B after B, without rewriting the earlier result", async () => {
    const base = Array.from({ length: 10 }, (_, minuteIndex) =>
      observation({
        minuteIndex,
        observedAtMs: OPEN0 + minuteIndex * 60_000 + 70_000,
      }),
    );
    const observedA = OPEN0 + 10 * 60_000 + 62_000;
    const observedB = OPEN0 + 10 * 60_000 + 70_000;
    const records = [
      ...base,
      observation({ minuteIndex: 10, close: 101_000, observedAtMs: observedA }),
      observation({ minuteIndex: 10, close: 109_000, observedAtMs: observedB }),
    ];
    const index = await loadIndex(records);
    const midQuote = observedA + 1_000;
    const lateQuote = observedB + 1_000;
    const first = buildHistoricalReplicaVolatilityWindow({ index, timestampMs: midQuote });
    const second = buildHistoricalReplicaVolatilityWindow({ index, timestampMs: lateQuote });
    const firstAgain = buildHistoricalReplicaVolatilityWindow({ index, timestampMs: midQuote });
    expect(first.available).toBe(true);
    expect(second.available).toBe(true);
    expect(first.candles.at(-1)?.close).toBe(101_000);
    expect(second.candles.at(-1)?.close).toBe(109_000);
    expect(firstAgain.candles.at(-1)?.close).toBe(101_000);
    expect(firstAgain.annualizedVolatility).toBe(first.annualizedVolatility);
  });

  it("collapses an identical duplicate without corrupting the window", async () => {
    const records = [
      ...Array.from({ length: 11 }, (_, minuteIndex) =>
        observation({
          minuteIndex,
          observedAtMs: OPEN0 + minuteIndex * 60_000 + 70_000,
        }),
      ),
      observation({
        minuteIndex: 10,
        observedAtMs: OPEN0 + 10 * 60_000 + 80_000,
      }),
    ];
    const window = buildHistoricalReplicaVolatilityWindow({
      index: await loadIndex(records),
      timestampMs: OPEN0 + 12 * 60_000,
    });
    expect(window.available).toBe(true);
    expect(window.selectedOpenTimeMs).toHaveLength(11);
    expect(new Set(window.selectedOpenTimeMs).size).toBe(11);
  });

  it("fails closed on a same-open timing-identity conflict", () => {
    const openTimeMs = OPEN0;
    const history: MinuteRevisionHistory = {
      openTimeMs,
      closeTimeMs: openTimeMs + V2_CANDLE_CLOSE_OFFSET_MS,
      timingConflict: true,
      observations: [],
    };
    const index: CompletedCandleObservationIndex = {
      candlesPath: CANDLES_PATH,
      observations: [],
      byOpenTimeMs: new Map([[openTimeMs, history]]),
      minutesByCloseTimeMs: [history],
    };
    const window = buildHistoricalReplicaVolatilityWindow({
      index,
      timestampMs: openTimeMs + 120_000,
    });
    expect(window.available).toBe(false);
    expect(window.rejectionReason).toBe("timing-identity-conflict");
  });

  it("omits a missing minute, does not interpolate, and allows 11 non-consecutive minutes", async () => {
    const selectedMinutes = [0, 1, 2, 3, 4, 6, 7, 8, 9, 10, 12];
    const records = selectedMinutes.map((minuteIndex) =>
      observation({
        minuteIndex,
        observedAtMs: OPEN0 + minuteIndex * 60_000 + 70_000,
      }),
    );
    const window = buildHistoricalReplicaVolatilityWindow({
      index: await loadIndex(records),
      timestampMs: OPEN0 + 13 * 60_000,
    });
    expect(window.available).toBe(true);
    expect(window.selectedOpenTimeMs).toEqual(selectedMinutes.map((minuteIndex) => OPEN0 + minuteIndex * 60_000));
    expect(window.selectedOpenTimeMs).not.toContain(OPEN0 + 5 * 60_000);
    expect(window.candles).toHaveLength(11);
  });

  it("returns unavailable when fewer than 11 distinct usable minutes exist", async () => {
    const records = Array.from({ length: 10 }, (_, minuteIndex) =>
      observation({
        minuteIndex,
        observedAtMs: OPEN0 + minuteIndex * 60_000 + 70_000,
      }),
    );
    const window = buildHistoricalReplicaVolatilityWindow({
      index: await loadIndex(records),
      timestampMs: OPEN0 + 12 * 60_000,
    });
    expect(window.available).toBe(false);
    expect(window.rejectionReason).toBe("insufficient-completed-minutes");
  });

  it("does not apply a 5-second adjacency / maximumSourceGapMs rule", () => {
    const source = readFileSync(
      new URL("./buildHistoricalReplicaVolatilityWindow.ts", import.meta.url),
      "utf8",
    );
    expect(source).not.toMatch(/maximumSourceGapMs/);
    expect(source).not.toMatch(/5000/);
    expect(source).not.toMatch(/btc-spot|preloadBtcSpot|resolveCausalBtcPrice/);
    expect(source).not.toMatch(/buildValidatedCausalVolatilityWindow/);
  });
});
