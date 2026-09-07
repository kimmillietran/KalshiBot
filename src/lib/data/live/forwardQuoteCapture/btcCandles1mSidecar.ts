import {
  CandleRecordIdentityError,
  DEFAULT_BTC_CANDLES_1M_BACKFILL_COMPLETED_MINUTES,
  DEFAULT_BTC_CANDLES_1M_DEGRADED_AFTER_FAILURES,
  DEFAULT_BTC_CANDLES_1M_POLL_INTERVAL_MS,
  DEFAULT_BTC_CANDLES_1M_POLL_LOOKBACK_MINUTES,
  LIVE_CANDLE_GRANULARITY_MS,
  LIVE_CANDLE_GRANULARITY_SECONDS,
  LIVE_CANDLE_PRODUCT_ID,
  LIVE_CANDLE_PROVIDER,
  LIVE_CANDLE_SOURCE,
  LIVE_CANDLE_SOURCE_RECORD_TYPE,
  createEmptyBtcCandles1mHealth,
  type BtcCandles1mHealth,
  type BtcCandles1mPersistedRecord,
  type FetchCompletedCandles,
  type LiveCandleRetrievalMethod,
  type LiveCandleRevisionClass,
} from "./btcCandles1mSidecarTypes";
import {
  isClosedMinuteAt,
  mapExchangeCompletedOneMinuteCandle,
  type MappedExchangeOneMinuteCandle,
} from "./mapExchangeCompletedOneMinuteCandle";
import { assertWritableBtcCandles1mRecord } from "./persistBtcCandles1mRecord";

export type BtcCandles1mSidecarMinuteState = {
  firstObservedAtLocal: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTimeMs: number;
  lastObservationIndex: number;
};

export type BtcCandles1mSidecarWriter = {
  appendBtcCandles1m: (record: BtcCandles1mPersistedRecord) => void;
};

export type BtcCandles1mSidecarOptions = {
  runId: string;
  processEpochId: string;
  now: () => Date;
  writer: BtcCandles1mSidecarWriter;
  fetchCompletedCandles: FetchCompletedCandles;
  backfillCompletedMinutes?: number;
  pollLookbackMinutes?: number;
  pollIntervalMs?: number;
  degradedAfterConsecutiveFailures?: number;
};

export function createBtcCandles1mSidecar(options: BtcCandles1mSidecarOptions) {
  const runId = options.runId.trim();
  const processEpochId = options.processEpochId.trim();
  if (runId.length === 0) {
    throw new CandleRecordIdentityError(
      "Candle sidecar requires the authoritative non-empty runId",
    );
  }
  if (processEpochId.length === 0) {
    throw new CandleRecordIdentityError(
      "Candle sidecar requires a non-empty processEpochId",
    );
  }

  const backfillCompletedMinutes =
    options.backfillCompletedMinutes ?? DEFAULT_BTC_CANDLES_1M_BACKFILL_COMPLETED_MINUTES;
  const pollLookbackMinutes =
    options.pollLookbackMinutes ?? DEFAULT_BTC_CANDLES_1M_POLL_LOOKBACK_MINUTES;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_BTC_CANDLES_1M_POLL_INTERVAL_MS;
  const degradedAfter =
    options.degradedAfterConsecutiveFailures ?? DEFAULT_BTC_CANDLES_1M_DEGRADED_AFTER_FAILURES;

  const health = createEmptyBtcCandles1mHealth(processEpochId);
  const minutes = new Map<number, BtcCandles1mSidecarMinuteState>();
  const coverageMissedOpenTimes = new Set<number>();
  let observationIndex = 0;
  let consecutiveFailures = 0;
  let shuttingDown = false;
  let schedulerHandle: number | null = null;
  let inFlight: Promise<void> | null = null;
  let clearIntervalFn: ((handle: number) => void) | null = null;

  function markSuccess(): void {
    consecutiveFailures = 0;
    if (health.recordsCaptured > 0) {
      health.status = "healthy";
    } else {
      health.status = "enabled";
    }
  }

  function markFailure(): void {
    consecutiveFailures += 1;
    if (consecutiveFailures >= degradedAfter) {
      health.status = "degraded";
    }
  }

  function expectedCompletedOpenTimes(
    startMs: number,
    endMs: number,
    nowMs: number,
  ): number[] {
    const firstOpen = Math.ceil(startMs / LIVE_CANDLE_GRANULARITY_MS) * LIVE_CANDLE_GRANULARITY_MS;
    const opens: number[] = [];
    for (let openMs = firstOpen; openMs < endMs; openMs += LIVE_CANDLE_GRANULARITY_MS) {
      const closeMs = openMs + LIVE_CANDLE_GRANULARITY_MS - 1;
      if (isClosedMinuteAt(closeMs, nowMs)) {
        opens.push(openMs);
      }
    }
    return opens;
  }

  function ohlcEqual(
    left: Pick<MappedExchangeOneMinuteCandle, "open" | "high" | "low" | "close">,
    right: Pick<BtcCandles1mSidecarMinuteState, "open" | "high" | "low" | "close">,
  ): boolean {
    return (
      left.open === right.open
      && left.high === right.high
      && left.low === right.low
      && left.close === right.close
    );
  }

  function persist(
    candle: MappedExchangeOneMinuteCandle,
    input: {
      observedAtLocal: string;
      firstObservedAtLocal: string;
      retrievalMethod: LiveCandleRetrievalMethod;
      revisionClass: LiveCandleRevisionClass;
      requestStartedAtLocal: string;
    },
  ): void {
    observationIndex += 1;
    const record = assertWritableBtcCandles1mRecord({
      runId,
      processEpochId,
      provider: LIVE_CANDLE_PROVIDER,
      productId: LIVE_CANDLE_PRODUCT_ID,
      sourceRecordType: LIVE_CANDLE_SOURCE_RECORD_TYPE,
      source: LIVE_CANDLE_SOURCE,
      granularityMs: LIVE_CANDLE_GRANULARITY_MS,
      candleOpenTime: candle.candleOpenTime,
      candleCloseTime: candle.candleCloseTime,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume,
      observedAtLocal: input.observedAtLocal,
      firstObservedAtLocal: input.firstObservedAtLocal,
      retrievalMethod: input.retrievalMethod,
      observationIndex,
      revisionClass: input.revisionClass,
      requestStartedAtLocal: input.requestStartedAtLocal,
    });
    options.writer.appendBtcCandles1m(record);
    health.recordsCaptured += 1;
    health.lastObservedAtLocal = input.observedAtLocal;
    if (input.retrievalMethod === "startup-backfill") {
      health.startupBackfillRecords += 1;
    } else {
      health.restPollRecords += 1;
    }
    minutes.set(candle.openTimeMs, {
      firstObservedAtLocal: input.firstObservedAtLocal,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume,
      closeTimeMs: candle.closeTimeMs,
      lastObservationIndex: observationIndex,
    });
    health.distinctExchangeMinutes = minutes.size;
    if (health.status !== "degraded" || consecutiveFailures === 0) {
      health.status = "healthy";
    }
  }

  function acceptMappedCandles(input: {
    rows: readonly unknown[];
    nowMs: number;
    observedAtLocal: string;
    requestStartedAtLocal: string;
    retrievalMethod: LiveCandleRetrievalMethod;
    requestStartMs: number;
    requestEndMs: number;
  }): void {
    const acceptedOpens = new Set<number>();
    const mapped: MappedExchangeOneMinuteCandle[] = [];

    for (const row of input.rows) {
      const mappedRow = mapExchangeCompletedOneMinuteCandle(row);
      if (!mappedRow.ok) {
        health.malformedRowCount += 1;
        continue;
      }
      mapped.push(mappedRow.candle);
    }

    mapped.sort((left, right) => left.openTimeMs - right.openTimeMs);

    for (const candle of mapped) {
      if (!isClosedMinuteAt(candle.closeTimeMs, input.nowMs)) {
        health.inProgressDropped += 1;
        continue;
      }

      const existing = minutes.get(candle.openTimeMs);
      if (existing && existing.closeTimeMs !== candle.closeTimeMs) {
        health.timestampConflictCount += 1;
        continue;
      }

      acceptedOpens.add(candle.openTimeMs);

      if (!existing) {
        persist(candle, {
          observedAtLocal: input.observedAtLocal,
          firstObservedAtLocal: input.observedAtLocal,
          retrievalMethod: input.retrievalMethod,
          revisionClass: "first-observation",
          requestStartedAtLocal: input.requestStartedAtLocal,
        });
        coverageMissedOpenTimes.delete(candle.openTimeMs);
        continue;
      }

      const sameOhlc = ohlcEqual(candle, existing);
      if (sameOhlc && candle.volume === existing.volume) {
        health.identicalRepeatSuppressed += 1;
        continue;
      }

      if (sameOhlc) {
        health.volumeOnlyRevisionCount += 1;
        persist(candle, {
          observedAtLocal: input.observedAtLocal,
          firstObservedAtLocal: existing.firstObservedAtLocal,
          retrievalMethod: input.retrievalMethod,
          revisionClass: "volume-only",
          requestStartedAtLocal: input.requestStartedAtLocal,
        });
        continue;
      }

      health.ohlcRevisionCount += 1;
      persist(candle, {
        observedAtLocal: input.observedAtLocal,
        firstObservedAtLocal: existing.firstObservedAtLocal,
        retrievalMethod: input.retrievalMethod,
        revisionClass: "ohlc-revision",
        requestStartedAtLocal: input.requestStartedAtLocal,
      });
    }

    for (const openMs of expectedCompletedOpenTimes(
      input.requestStartMs,
      input.requestEndMs,
      input.nowMs,
    )) {
      if (!acceptedOpens.has(openMs) && !minutes.has(openMs)) {
        coverageMissedOpenTimes.add(openMs);
        health.coverageMissCount += 1;
      }
    }
  }

  async function executeRequest(retrievalMethod: LiveCandleRetrievalMethod, lookbackMinutes: number): Promise<void> {
    if (shuttingDown) {
      return;
    }

    const now = options.now();
    const nowMs = now.getTime();
    const requestStartedAtLocal = now.toISOString();
    const endMs = nowMs;
    const startMs = nowMs - lookbackMinutes * LIVE_CANDLE_GRANULARITY_MS;

    const result = await options.fetchCompletedCandles({
      productId: LIVE_CANDLE_PRODUCT_ID,
      granularitySeconds: LIVE_CANDLE_GRANULARITY_SECONDS,
      startTime: new Date(startMs).toISOString(),
      endTime: new Date(endMs).toISOString(),
      requestStartedAtLocal,
    });

    if (shuttingDown) {
      // Receipt time is still the request-completion clock if we accept;
      // the parent decides whether the writer is still accepting.
    }

    if (!result.ok) {
      if (result.kind === "http-429") {
        health.http429Count += 1;
      } else if (result.kind === "http-5xx") {
        health.http5xxCount += 1;
      } else if (result.kind === "timeout") {
        health.timeoutCount += 1;
      } else if (result.kind === "connection-failure") {
        health.connectionFailureCount += 1;
      } else {
        health.malformedRowCount += 1;
      }
      markFailure();
      return;
    }

    if (!Array.isArray(result.body)) {
      health.malformedRowCount += 1;
      markFailure();
      return;
    }

    markSuccess();

    if (result.body.length === 0) {
      health.emptySuccessCount += 1;
      for (const openMs of expectedCompletedOpenTimes(startMs, endMs, options.now().getTime())) {
        if (!minutes.has(openMs)) {
          coverageMissedOpenTimes.add(openMs);
          health.coverageMissCount += 1;
        }
      }
      return;
    }

    const observedAt = options.now();
    acceptMappedCandles({
      rows: result.body,
      nowMs: observedAt.getTime(),
      observedAtLocal: observedAt.toISOString(),
      requestStartedAtLocal: result.requestStartedAtLocal,
      retrievalMethod,
      requestStartMs: startMs,
      requestEndMs: endMs,
    });
  }

  async function runGuarded(retrievalMethod: LiveCandleRetrievalMethod, lookbackMinutes: number): Promise<void> {
    if (shuttingDown || inFlight !== null) {
      return;
    }
    const work = executeRequest(retrievalMethod, lookbackMinutes).finally(() => {
      if (inFlight === work) {
        inFlight = null;
      }
    });
    inFlight = work;
    await work;
  }

  return {
    pollIntervalMs,
    processEpochId,
    runId,
    async runStartupBackfill(): Promise<void> {
      await runGuarded("startup-backfill", backfillCompletedMinutes);
    },
    async poll(): Promise<void> {
      await runGuarded("rest-poll", pollLookbackMinutes);
    },
    startScheduler(input: {
      setInterval: (fn: () => void, ms: number) => number;
      clearInterval: (handle: number) => void;
    }): void {
      if (shuttingDown || schedulerHandle !== null) {
        return;
      }
      clearIntervalFn = input.clearInterval;
      schedulerHandle = input.setInterval(() => {
        if (shuttingDown || inFlight !== null) {
          return;
        }
        void runGuarded("rest-poll", pollLookbackMinutes);
      }, pollIntervalMs);
    },
    stopScheduler(): void {
      if (schedulerHandle !== null && clearIntervalFn !== null) {
        clearIntervalFn(schedulerHandle);
      }
      schedulerHandle = null;
    },
    setShuttingDown(): void {
      shuttingDown = true;
    },
    isShuttingDown(): boolean {
      return shuttingDown;
    },
    hasScheduler(): boolean {
      return schedulerHandle !== null;
    },
    async awaitInFlight(): Promise<void> {
      await (inFlight ?? Promise.resolve());
    },
    health(): BtcCandles1mHealth {
      return { ...health };
    },
    minuteState(openTimeMs: number): BtcCandles1mSidecarMinuteState | undefined {
      return minutes.get(openTimeMs);
    },
  };
}

export type BtcCandles1mSidecar = ReturnType<typeof createBtcCandles1mSidecar>;

export function createProcessEpochId(): string {
  return globalThis.crypto.randomUUID();
}
