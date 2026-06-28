import { describe, expect, it } from "vitest";

import { DataSource } from "@/lib/data/provenance";
import { assembleHistoricalTradingSnapshot } from "@/lib/data/snapshots";
import type {
  HistoricalTradingSnapshot,
  SilverRecordEnvelope,
  SnapshotAssemblyInput,
} from "@/lib/data/snapshots/types";
import { serializeHistoricalTradingSnapshot } from "@/lib/data/snapshots/HistoricalSnapshotAssembler";
import { DATA_CONTRACT_VERSION } from "@/lib/data/versioning";
import { DEFAULT_ENGINE_CONFIG } from "@/lib/trading/config/defaults";

import {
  ReplaySession,
  serializeReplaySessionState,
  serializeReplayStepResult,
  serializeReplayStepResults,
} from "./ReplaySession";

const EVENT_TIME_A = "2026-06-26T23:15:00.000Z";
const EVENT_TIME_B = "2026-06-26T23:30:00.000Z";
const COLLECTION_TIME = "2026-06-27T01:00:00.000Z";
const OBSERVED_AT_A = "2026-06-27T01:00:05.000Z";
const OBSERVED_AT_B = "2026-06-27T01:30:05.000Z";
const OPEN_TIME = "2026-06-26T23:15:00.000Z";
const CLOSE_TIME = "2026-06-26T23:16:00.000Z";
const WINDOW_CLOSE = "2026-06-26T23:30:00.000Z";
const SERIES = "KXBTC15M";

function envelope<T>(
  record: T,
  provenance: SilverRecordEnvelope<T>["provenance"],
): SilverRecordEnvelope<T> {
  return { record, provenance };
}

function createSnapshot(options: {
  ticker: string;
  eventTime: string;
  observedAt: string;
  yesBidCents?: number;
  yesAskCents?: number;
}): HistoricalTradingSnapshot {
  const temporalFields = {
    eventTime: options.eventTime,
    collectionTime: COLLECTION_TIME,
    observedAt: options.observedAt,
  };

  const marketWindow = {
    ...temporalFields,
    ticker: options.ticker,
    seriesTicker: SERIES,
    openTime: OPEN_TIME,
    closeTime: WINDOW_CLOSE,
    strikePriceUsd: 59_990.31,
    status: "open" as const,
    qualityFlags: [],
    datasetVersion: DATA_CONTRACT_VERSION,
  };

  const kalshiCandle = {
    ...temporalFields,
    ticker: options.ticker,
    openTime: OPEN_TIME,
    closeTime: CLOSE_TIME,
    yesBidCents: options.yesBidCents ?? 48,
    yesAskCents: options.yesAskCents ?? 52,
    noBidCents: 47,
    noAskCents: 51,
    volumeContracts: 120,
    qualityFlags: [],
    datasetVersion: DATA_CONTRACT_VERSION,
  };

  const btcBar = {
    ...temporalFields,
    openTime: OPEN_TIME,
    closeTime: CLOSE_TIME,
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
    observedAt: options.observedAt,
    fetchId: `fetch-${options.ticker}`,
  };

  const input: SnapshotAssemblyInput = {
    marketWindow: envelope(marketWindow, provenance),
    kalshiCandles: [envelope(kalshiCandle, provenance)],
    btcBars: [envelope(btcBar, provenance)],
  };

  return assembleHistoricalTradingSnapshot(input);
}

const snapshotA = createSnapshot({
  ticker: "KXBTC15M-STEP-A",
  eventTime: EVENT_TIME_A,
  observedAt: OBSERVED_AT_A,
});

const snapshotB = createSnapshot({
  ticker: "KXBTC15M-STEP-B",
  eventTime: EVENT_TIME_B,
  observedAt: OBSERVED_AT_B,
});

describe("ReplaySession", () => {
  it("handles empty sessions predictably", () => {
    const session = ReplaySession.create([]);

    expect(session.getState()).toEqual({
      stepIndex: 0,
      totalSteps: 0,
      isEmpty: true,
      isComplete: true,
      canStep: false,
    });

    const stepOutput = session.step();
    expect(stepOutput.result).toBeNull();
    expect(stepOutput.session).toBe(session);

    const allOutput = session.stepAll();
    expect(allOutput.results).toEqual([]);
    expect(allOutput.session).toBe(session);
  });

  it("replays a single step through evaluate()", () => {
    const session = ReplaySession.create([snapshotA], DEFAULT_ENGINE_CONFIG);
    const { session: advanced, result } = session.step();

    expect(result).not.toBeNull();
    expect(result?.stepIndex).toBe(0);
    expect(result?.sourceTicker).toBe("KXBTC15M-STEP-A");
    expect(result?.engineInput.evaluatedAt).toBe(OBSERVED_AT_A);
    expect(result?.engineOutput.action).toBeDefined();
    expect(result?.engineOutput.evaluatedAt).toBe(OBSERVED_AT_A);
    expect(advanced.getState().isComplete).toBe(true);
    expect(advanced.getState().canStep).toBe(false);
  });

  it("stepAll returns remaining steps in deterministic timeline order", () => {
    const session = ReplaySession.create(
      [snapshotB, snapshotA],
      DEFAULT_ENGINE_CONFIG,
    );
    const { session: complete, results } = session.stepAll();

    expect(results).toHaveLength(2);
    expect(results.map((result) => result.stepIndex)).toEqual([0, 1]);
    expect(results.map((result) => result.sourceTicker)).toEqual([
      "KXBTC15M-STEP-A",
      "KXBTC15M-STEP-B",
    ]);
    expect(complete.getState().isComplete).toBe(true);
  });

  it("reset returns a new session at the initial cursor", () => {
    const session = ReplaySession.create([snapshotA, snapshotB]);
    const { session: advanced } = session.stepAll();
    const reset = advanced.reset();

    expect(reset.getState()).toEqual(session.getState());
    expect(reset).not.toBe(advanced);

    const rerun = reset.stepAll();
    expect(serializeReplayStepResults(rerun.results)).toBe(
      serializeReplayStepResults(session.stepAll().results),
    );
  });

  it("returns null when stepping after completion", () => {
    const session = ReplaySession.create([snapshotA]);
    const { session: complete } = session.step();
    const afterComplete = complete.step();

    expect(afterComplete.result).toBeNull();
    expect(afterComplete.session).toBe(complete);
  });

  it("preserves engine output and source metadata on each step", () => {
    const session = ReplaySession.create([snapshotA]);
    const { result } = session.step();

    expect(result?.temporal).toEqual(snapshotA.temporal);
    expect(result?.provenance).toEqual(snapshotA.provenance);
    expect(result?.sourceSnapshot).toBe(snapshotA);
    expect(result?.engineOutput.configHash).toMatch(/^cfg-v1-/);
    expect(result?.engineOutput.reasoning.summary.length).toBeGreaterThan(0);
  });

  it("does not mutate source snapshots", () => {
    const snapshot = createSnapshot({
      ticker: "KXBTC15M-IMMUTABLE",
      eventTime: EVENT_TIME_A,
      observedAt: OBSERVED_AT_A,
    });
    const serializedBefore = serializeHistoricalTradingSnapshot(snapshot);

    ReplaySession.create([snapshot]).stepAll();

    expect(serializeHistoricalTradingSnapshot(snapshot)).toBe(serializedBefore);
    expect(Object.isFrozen(snapshot)).toBe(true);
  });

  it("produces deterministic output across repeated runs", () => {
    const snapshots = [snapshotB, snapshotA];
    const firstRun = ReplaySession.create(snapshots).stepAll();
    const secondRun = ReplaySession.create(snapshots).stepAll();

    expect(serializeReplayStepResults(firstRun.results)).toBe(
      serializeReplayStepResults(secondRun.results),
    );
    expect(serializeReplaySessionState(firstRun.session.getState())).toBe(
      serializeReplaySessionState(secondRun.session.getState()),
    );
  });

  it("returns deeply frozen step results", () => {
    const { result } = ReplaySession.create([snapshotA]).step();

    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result?.engineOutput)).toBe(true);
    expect(Object.isFrozen(result?.engineInput)).toBe(true);
    expect(serializeReplayStepResult(result!)).toContain("KXBTC15M-STEP-A");
  });

  it("does not compute P/L or backtest metrics", () => {
    const { results } = ReplaySession.create([snapshotA, snapshotB]).stepAll();

    for (const result of results) {
      const serialized = serializeReplayStepResult(result);
      expect(serialized).not.toMatch(/pnl|profit|loss|cagr|sharpe|drawdown/i);
      expect(result.engineOutput).not.toHaveProperty("pnl");
      expect(result.engineOutput).not.toHaveProperty("profit");
    }
  });
});
