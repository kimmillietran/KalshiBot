import { describe, expect, it } from "vitest";

import {
  inferBarIntervalMs,
} from "@/lib/data/strategies/fairValueDiffusion/fairValueDiffusionModel";
import type { EvaluationCandleSnapshot } from "@/types/domain/trading";

import {
  V2_CANDLE_CLOSE_OFFSET_MS,
  V2_CANDLE_GRANULARITY_MS,
  V2_REQUIRED_CLOSE_COUNT,
} from "../calibrationFadeV2ForwardValidation/calibrationFadeV2ForwardValidationTypes";
import { buildHistoricalReplicaVolatilityWindow } from "../calibrationFadeV2ForwardValidation/buildHistoricalReplicaVolatilityWindow";
import type {
  CompletedCandleObservationIndex,
  MinuteRevisionHistory,
} from "../calibrationFadeV2ForwardValidation/preloadCompletedBtcCandleObservations";
import {
  assessCandleWindowContiguity,
  buildStrictContiguousVolatilityWindow,
  diagnoseFrozenV2VolatilityWindowContiguity,
  requireContiguousCompletedCandleWindow,
} from "./index";

const OPEN0 = Date.parse("2026-09-08T13:00:00.000Z");

function openTimes(offsetsMinutes: readonly number[]): number[] {
  return offsetsMinutes.map((offset) => OPEN0 + offset * V2_CANDLE_GRANULARITY_MS);
}

function candlesFromOpenTimes(opens: readonly number[]): EvaluationCandleSnapshot[] {
  return opens.map((openTimeMs) => ({
    timestamp: openTimeMs + V2_CANDLE_CLOSE_OFFSET_MS,
    open: 100,
    high: 101,
    low: 99,
    close: 100.5,
  }));
}

function historyForOpen(openTimeMs: number): MinuteRevisionHistory {
  const closeTimeMs = openTimeMs + V2_CANDLE_CLOSE_OFFSET_MS;
  const observedAtLocalMs = closeTimeMs + 1;
  return {
    openTimeMs,
    closeTimeMs,
    timingConflict: false,
    observations: [
      {
        source: "test",
        provider: "coinbase-spot",
        productId: "BTC-USD",
        sourceRecordType: "exchange-completed-1m-ohlc",
        granularityMs: V2_CANDLE_GRANULARITY_MS,
        candleOpenTime: new Date(openTimeMs).toISOString(),
        candleCloseTime: new Date(closeTimeMs).toISOString(),
        openTimeMs,
        closeTimeMs,
        open: 100,
        high: 101,
        low: 99,
        close: 100.5,
        volume: null,
        observedAtLocal: new Date(observedAtLocalMs).toISOString(),
        firstObservedAtLocal: new Date(observedAtLocalMs).toISOString(),
        observedAtLocalMs,
        firstObservedAtLocalMs: observedAtLocalMs,
        retrievalMethod: "synthetic-fixture",
        ohlcComplete: true,
        runId: "test-run",
        processEpochId: null,
      },
    ],
  };
}

function indexFromOpenMinutes(minuteOffsets: readonly number[]): CompletedCandleObservationIndex {
  const histories = minuteOffsets
    .map((offset) => historyForOpen(OPEN0 + offset * V2_CANDLE_GRANULARITY_MS))
    .sort((left, right) => left.openTimeMs - right.openTimeMs);
  return {
    candlesPath: "synthetic/btc-candles-1m.jsonl",
    observations: histories.flatMap((history) => history.observations),
    byOpenTimeMs: new Map(histories.map((history) => [history.openTimeMs, history])),
    minutesByCloseTimeMs: [...histories].sort((left, right) => left.closeTimeMs - right.closeTimeMs),
  };
}

describe("assessCandleWindowContiguity", () => {
  it("1. reports contiguous for 11 perfectly spaced 1-minute opens", () => {
    const timestampsMs = openTimes(Array.from({ length: 11 }, (_, index) => index));
    const assessment = assessCandleWindowContiguity({
      timestampsMs,
      expectedIntervalMs: 60_000,
      timestampKind: "open-time",
      minimumCandleCount: 11,
    });
    expect(assessment.status).toBe("contiguous");
    expect(assessment.isContiguous).toBe(true);
    expect(assessment.selectedCandleCount).toBe(11);
    expect(assessment.returnIntervalCount).toBe(10);
    expect(assessment.contiguousIntervalCount).toBe(10);
    expect(assessment.gapIntervalCount).toBe(0);
    expect(assessment.informationalOnly).toBe(true);
  });

  it("2. detects a single missing middle minute", () => {
    const timestampsMs = openTimes([0, 1, 2, 3, 4, 6, 7, 8, 9, 10, 11]);
    const assessment = assessCandleWindowContiguity({
      timestampsMs,
      expectedIntervalMs: 60_000,
      timestampKind: "open-time",
    });
    expect(assessment.status).toBe("gap-detected");
    expect(assessment.gapIntervalCount).toBe(1);
    expect(assessment.gapLocations[0]?.observedDeltaMs).toBe(120_000);
    expect(assessment.maximumGapMs).toBe(120_000);
  });

  it("3. counts multiple gaps and maximum gap", () => {
    const timestampsMs = openTimes([0, 1, 5, 6, 10]);
    const assessment = assessCandleWindowContiguity({
      timestampsMs,
      expectedIntervalMs: 60_000,
    });
    expect(assessment.status).toBe("gap-detected");
    expect(assessment.gapIntervalCount).toBe(2);
    expect(assessment.maximumGapMs).toBe(4 * 60_000);
    expect(assessment.maximumExcessGapMs).toBe(3 * 60_000);
  });

  it("4. detects a gap only near the beginning", () => {
    const timestampsMs = openTimes([0, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
    const assessment = assessCandleWindowContiguity({
      timestampsMs,
      expectedIntervalMs: 60_000,
    });
    expect(assessment.status).toBe("gap-detected");
    expect(assessment.gapLocations[0]?.afterIndex).toBe(1);
  });

  it("5. detects a gap only near the end", () => {
    const timestampsMs = openTimes([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 20]);
    const assessment = assessCandleWindowContiguity({
      timestampsMs,
      expectedIntervalMs: 60_000,
    });
    expect(assessment.status).toBe("gap-detected");
    expect(assessment.gapLocations.at(-1)?.afterIndex).toBe(10);
    expect(assessment.maximumGapMs).toBe(11 * 60_000);
  });

  it("6. core regression: early 15m gap with final pair contiguous still reports gap-detected", () => {
    // 11 candles: one early interval = 15 minutes; final two = 1 minute.
    const timestampsMs = openTimes([0, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]);
    const candles = candlesFromOpenTimes(timestampsMs);
    expect(inferBarIntervalMs(candles)).toBe(60_000);

    const assessment = assessCandleWindowContiguity({
      timestampsMs,
      expectedIntervalMs: 60_000,
      timestampKind: "open-time",
      minimumCandleCount: 11,
    });
    expect(assessment.status).toBe("gap-detected");
    expect(assessment.isContiguous).toBe(false);
    expect(assessment.gapIntervalCount).toBe(1);
    expect(assessment.maximumGapMs).toBe(15 * 60_000);
    expect(assessment.contiguousIntervalCount).toBe(9);
  });

  it("7. fails on non-monotonic timestamps", () => {
    const assessment = assessCandleWindowContiguity({
      timestampsMs: [OPEN0, OPEN0 + 60_000, OPEN0 + 30_000],
      expectedIntervalMs: 60_000,
    });
    expect(assessment.status).toBe("invalid-non-monotonic-timestamps");
    expect(assessment.isContiguous).toBe(false);
  });

  it("8. fails on duplicate timestamps", () => {
    const assessment = assessCandleWindowContiguity({
      timestampsMs: [OPEN0, OPEN0 + 60_000, OPEN0 + 60_000],
      expectedIntervalMs: 60_000,
    });
    expect(assessment.status).toBe("invalid-non-monotonic-timestamps");
  });

  it("9. reports insufficient-data when too few candles", () => {
    const assessment = assessCandleWindowContiguity({
      timestampsMs: [OPEN0],
      expectedIntervalMs: 60_000,
      minimumCandleCount: 11,
    });
    expect(assessment.status).toBe("insufficient-data");
  });

  it("10. honors an explicit expected interval", () => {
    const timestampsMs = [OPEN0, OPEN0 + 30_000, OPEN0 + 60_000];
    const ok = assessCandleWindowContiguity({
      timestampsMs,
      expectedIntervalMs: 30_000,
    });
    expect(ok.status).toBe("contiguous");
    const bad = assessCandleWindowContiguity({
      timestampsMs,
      expectedIntervalMs: 60_000,
    });
    expect(bad.status).toBe("gap-detected");
  });
});

describe("strict contiguous future primitive", () => {
  it("11. rejects a gapped trailing window", () => {
    // Missing minute 5 in an otherwise dense series → replica would omit; strict fails.
    const index = indexFromOpenMinutes([0, 1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12]);
    const strict = buildStrictContiguousVolatilityWindow({
      index,
      timestampMs: OPEN0 + 13 * V2_CANDLE_GRANULARITY_MS,
    });
    expect(strict.available).toBe(false);
    expect(strict.rejectionReason).toBe("gap-detected");
    expect(strict.evidenceContractKind).toBe("strict-contiguous-completed-candle-v1");
  });

  it("12. accepts a contiguous trailing window", () => {
    const index = indexFromOpenMinutes(Array.from({ length: 20 }, (_, index) => index));
    const strict = buildStrictContiguousVolatilityWindow({
      index,
      timestampMs: OPEN0 + 20 * V2_CANDLE_GRANULARITY_MS,
    });
    expect(strict.available).toBe(true);
    expect(strict.rejectionReason).toBeNull();
    expect(strict.selectedOpenTimeMs).toHaveLength(V2_REQUIRED_CLOSE_COUNT);
    expect(strict.contiguity?.isContiguous).toBe(true);
    expect(
      requireContiguousCompletedCandleWindow({
        selectedOpenTimeMs: strict.selectedOpenTimeMs,
      }).status,
    ).toBe("contiguous");
  });
});

describe("frozen v2 preservation", () => {
  it("13–15. historical-replica builder still omits gaps and is unchanged by diagnostics", () => {
    const selectedMinutes = [0, 1, 2, 3, 4, 6, 7, 8, 9, 10, 12];
    const index = indexFromOpenMinutes(selectedMinutes);
    const quoteMs = OPEN0 + 13 * V2_CANDLE_GRANULARITY_MS;
    const window = buildHistoricalReplicaVolatilityWindow({ index, timestampMs: quoteMs });
    expect(window.available).toBe(true);
    expect(window.selectedOpenTimeMs).toEqual(
      selectedMinutes.map((minute) => OPEN0 + minute * V2_CANDLE_GRANULARITY_MS),
    );
    expect(window.annualizedVolatility).not.toBeNull();

    const diagnostic = diagnoseFrozenV2VolatilityWindowContiguity(window);
    expect(diagnostic.status).toBe("gap-detected");
    expect(diagnostic.informationalOnly).toBe(true);
    // Re-running builder is identical — diagnostic does not mutate selection.
    const again = buildHistoricalReplicaVolatilityWindow({ index, timestampMs: quoteMs });
    expect(again.selectedOpenTimeMs).toEqual(window.selectedOpenTimeMs);
    expect(again.annualizedVolatility).toBe(window.annualizedVolatility);
  });

  it("16. integrity helpers do not use latest/mtime discovery APIs", async () => {
    const fs = await import("node:fs");
    const source = [
      fs.readFileSync(
        "src/lib/data/research/completedCandleWindowIntegrity/assessCandleWindowContiguity.ts",
        "utf8",
      ),
      fs.readFileSync(
        "src/lib/data/research/completedCandleWindowIntegrity/buildStrictContiguousVolatilityWindow.ts",
        "utf8",
      ),
      fs.readFileSync(
        "src/lib/data/research/completedCandleWindowIntegrity/diagnoseFrozenV2VolatilityWindowContiguity.ts",
        "utf8",
      ),
    ].join("\n");
    expect(source).not.toMatch(/mtime|readdirSync|latest/i);
  });
});
