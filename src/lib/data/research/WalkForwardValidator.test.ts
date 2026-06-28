import { describe, expect, it, vi } from "vitest";

import { DataSource } from "@/lib/data/provenance";
import { assembleHistoricalTradingSnapshot } from "@/lib/data/snapshots";
import type {
  HistoricalTradingSnapshot,
  SilverRecordEnvelope,
  SnapshotAssemblyInput,
} from "@/lib/data/snapshots/types";
import { DATA_CONTRACT_VERSION } from "@/lib/data/versioning";

import { WalkForwardValidationError, WalkForwardErrorCode } from "./errors";
import type { ResearchExperimentConfig } from "./parameterSweepTypes";
import {
  generateWalkForwardWindows,
  runWalkForwardValidation,
  serializeWalkForwardResult,
} from "./WalkForwardValidator";
import type { WalkForwardConfig } from "./walkForwardTypes";

const COLLECTION_TIME = "2026-06-27T01:00:00.000Z";
const SERIES = "KXBTC15M";

function envelope<T>(
  record: T,
  provenance: SilverRecordEnvelope<T>["provenance"],
): SilverRecordEnvelope<T> {
  return { record, provenance };
}

function createSnapshot(index: number): HistoricalTradingSnapshot {
  const eventTime = `2026-06-26T23:${String(index % 60).padStart(2, "0")}:00.000Z`;
  const temporalFields = {
    eventTime,
    collectionTime: COLLECTION_TIME,
    observedAt: eventTime,
  };
  const ticker = `KXBTC15M-WF-${index}`;
  const openTime = eventTime;

  const marketWindow = {
    ...temporalFields,
    ticker,
    seriesTicker: SERIES,
    openTime,
    closeTime: "2026-06-26T23:30:00.000Z",
    strikePriceUsd: 59_990.31,
    status: "open" as const,
    qualityFlags: [],
    datasetVersion: DATA_CONTRACT_VERSION,
  };

  const kalshiCandle = {
    ...temporalFields,
    ticker,
    openTime,
    closeTime: eventTime,
    yesBidCents: 48,
    yesAskCents: 52,
    noBidCents: 47,
    noAskCents: 51,
    volumeContracts: 120,
    qualityFlags: [],
    datasetVersion: DATA_CONTRACT_VERSION,
  };

  const btcBar = {
    ...temporalFields,
    openTime,
    closeTime: eventTime,
    openUsd: 59_980.5,
    highUsd: 60_010.25,
    lowUsd: 59_960.0,
    closeUsd: 59_995.75,
    volumeBtc: 12.5,
    qualityFlags: [],
    datasetVersion: DATA_CONTRACT_VERSION,
  };

  const provenance = {
    source: DataSource.KALSHI_REST,
    collectionTime: COLLECTION_TIME,
    observedAt: eventTime,
    fetchId: `fetch-${index}`,
  };

  const input: SnapshotAssemblyInput = {
    marketWindow: envelope(marketWindow, provenance),
    kalshiCandles: [envelope(kalshiCandle, provenance)],
    btcBars: [envelope(btcBar, provenance)],
  };

  return assembleHistoricalTradingSnapshot(input);
}

function createSnapshotSeries(count: number): HistoricalTradingSnapshot[] {
  return Array.from({ length: count }, (_, index) => createSnapshot(index));
}

function createConfig(
  overrides: Partial<WalkForwardConfig> = {},
): WalkForwardConfig {
  return {
    validationId: "wf-6.6c",
    trainingWindowSize: 40,
    testingWindowSize: 10,
    stepSize: 10,
    experimentConfig: {
      experimentId: "wf-exp",
      sweepId: "wf-6.6c",
      parameters: { strategy: "baseline" },
    },
    ...overrides,
  };
}

describe("generateWalkForwardWindows", () => {
  it("rejects an empty snapshot dataset", () => {
    expect(() => generateWalkForwardWindows([], 40, 10, 10)).toThrow(
      WalkForwardValidationError,
    );
  });

  it("rejects invalid window sizes", () => {
    const snapshots = createSnapshotSeries(50);

    expect(() => generateWalkForwardWindows(snapshots, 0, 10, 10)).toThrow(
      WalkForwardValidationError,
    );
    expect(() => generateWalkForwardWindows(snapshots, 40, -1, 10)).toThrow(
      WalkForwardValidationError,
    );
  });

  it("generates a single window when only one fit exists", () => {
    const snapshots = createSnapshotSeries(50);
    const windows = generateWalkForwardWindows(snapshots, 40, 10, 100);

    expect(windows).toHaveLength(1);
    expect(windows[0]).toMatchObject({
      trainingStartIndex: 0,
      trainingEndIndex: 39,
      testingStartIndex: 40,
      testingEndIndex: 49,
    });
  });

  it("generates multiple rolling windows with correct boundaries", () => {
    const snapshots = createSnapshotSeries(100);
    const windows = generateWalkForwardWindows(snapshots, 40, 10, 10);

    expect(windows.length).toBeGreaterThan(1);
    expect(windows[0]).toMatchObject({
      trainingStartIndex: 0,
      trainingEndIndex: 39,
      testingStartIndex: 40,
      testingEndIndex: 49,
    });
    expect(windows[1]).toMatchObject({
      trainingStartIndex: 10,
      trainingEndIndex: 49,
      testingStartIndex: 50,
      testingEndIndex: 59,
    });
    expect(windows[0]?.trainingSnapshots[0]).toBe(snapshots[0]);
    expect(windows[0]?.testingSnapshots[0]).toBe(snapshots[40]);
  });
});

describe("runWalkForwardValidation", () => {
  it("produces identical results on repeated execution", () => {
    const input = {
      snapshots: createSnapshotSeries(100),
      config: createConfig(),
    };

    const first = serializeWalkForwardResult(runWalkForwardValidation(input));
    const second = serializeWalkForwardResult(runWalkForwardValidation(input));

    expect(first).toBe(second);
  });

  it("executes training and testing experiments once per window", () => {
    const runExperiment = vi.fn(
      (config: ResearchExperimentConfig) => ({
        experimentId: config.experimentId,
        sweepId: config.sweepId,
        parameters: config.parameters,
        status: "completed" as const,
      }),
    );

    const snapshots = createSnapshotSeries(100);
    const result = runWalkForwardValidation(
      { snapshots, config: createConfig() },
      { runExperiment },
    );

    expect(result.completedRuns.length).toBe(result.windows.length);
    expect(runExperiment).toHaveBeenCalledTimes(result.windows.length * 2);
  });

  it("returns deeply frozen immutable outputs", () => {
    const result = runWalkForwardValidation({
      snapshots: createSnapshotSeries(50),
      config: createConfig({ stepSize: 50 }),
    });

    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.windows)).toBe(true);
    expect(Object.isFrozen(result.completedRuns)).toBe(true);
    expect(Object.isFrozen(result.windows[0])).toBe(true);
    expect(Object.isFrozen(result.windows[0]?.trainingSnapshots)).toBe(true);
  });

  it("serializes results deterministically", () => {
    const result = runWalkForwardValidation({
      snapshots: createSnapshotSeries(50),
      config: createConfig({ stepSize: 50 }),
    });

    expect(serializeWalkForwardResult(result)).toBe(
      serializeWalkForwardResult(result),
    );
  });

  it("does not mutate input snapshots", () => {
    const snapshots = createSnapshotSeries(50);
    const snapshot = JSON.stringify(
      snapshots.map((entry) => entry.ticker),
    );

    runWalkForwardValidation({
      snapshots,
      config: createConfig({ stepSize: 50 }),
    });

    expect(
      JSON.stringify(snapshots.map((entry) => entry.ticker)),
    ).toBe(snapshot);
  });

  it("rejects configs where training plus testing exceeds the dataset", () => {
    expect(() =>
      runWalkForwardValidation({
        snapshots: createSnapshotSeries(20),
        config: createConfig({
          trainingWindowSize: 15,
          testingWindowSize: 10,
        }),
      }),
    ).toThrow(WalkForwardValidationError);

    try {
      runWalkForwardValidation({
        snapshots: createSnapshotSeries(20),
        config: createConfig({
          trainingWindowSize: 15,
          testingWindowSize: 10,
        }),
      });
    } catch (error) {
      expect((error as WalkForwardValidationError).code).toBe(
        WalkForwardErrorCode.WINDOW_LARGER_THAN_DATASET,
      );
    }
  });
});
