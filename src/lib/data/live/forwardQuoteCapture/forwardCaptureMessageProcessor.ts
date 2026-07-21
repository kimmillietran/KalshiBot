import {
  kalshiOrderbookDeltaMessageSchema,
  kalshiOrderbookSnapshotMessageSchema,
} from "@/features/market-data/orderbook/schemas";
import type { OrderbookControlMessage } from "@/features/market-data/orderbook/OrderbookSubscriptionManager";

import type { EconomicBookState } from "./classifyTopOfBookEconomicValidity";
import {
  hasBidSizeFieldPresent,
  hasExecutableBidPairSize,
} from "./orderbookLevelSize";
import { createEmptyOrderbookDiagnostics } from "./createEmptyOrderbookDiagnostics";
import { OrderbookCaptureBook } from "./orderbookCaptureBook";
import type { ForwardCaptureWriter } from "./jsonlForwardCaptureWriter";
import type {
  ForwardCaptureOrderbookDiagnostics,
  ForwardCaptureSubscriptionLifecycleEvent,
  ForwardQuoteCaptureConfig,
  ForwardRawKalshiWsRecord,
  ForwardTopOfBookRecord,
} from "./forwardQuoteCaptureTypes";

export type LatestBtcSpot = {
  priceUsd: number;
  receivedAtLocal: string;
  source: string;
} | null;

export type ForwardCaptureMessageProcessingResult = {
  messageType: string | null;
  marketTicker: string | null;
  expectedMarketMessage: boolean;
  controlMessage?: OrderbookControlMessage;
};

/** Outcome of dispatching a get_snapshot recovery command to the transport. */
export type SnapshotRecoveryDispatchResult =
  | { status: "requested"; commandId: number; sid: number }
  | { status: "unavailable"; reason: string }
  | { status: "send-failed"; reason: string };

/** Minimum wait before re-requesting recovery after a failed command. */
const RECOVERY_RETRY_COOLDOWN_MS = 5_000;

function isEmptyAwaitingSnapshot(record: ForwardTopOfBookRecord): boolean {
  return (
    record.bookState === "awaiting-snapshot"
    && record.yesBestBidCents === null
    && record.yesBestAskCents === null
    && record.noBestBidCents === null
    && record.noBestAskCents === null
  );
}

function shouldBypassThrottle(input: {
  previousState: EconomicBookState | undefined;
  currentState: EconomicBookState;
}): boolean {
  const wasEconomicallyValid = input.previousState === "economically-valid";
  const isEconomicallyValid = input.currentState === "economically-valid";

  if (!wasEconomicallyValid && isEconomicallyValid) {
    return true;
  }

  if (wasEconomicallyValid && !isEconomicallyValid) {
    return true;
  }

  return false;
}

function recordEconomicDiagnostics(
  diagnostics: ForwardCaptureOrderbookDiagnostics,
  record: ForwardTopOfBookRecord,
): void {
  diagnostics.topOfBookRecordsEmitted += 1;

  if (record.bookState === "valid") {
    diagnostics.sequenceValidTopOfBookRecords += 1;
  }

  if (record.isEconomicallyValid) {
    diagnostics.economicallyValidTopOfBookRecords += 1;
    diagnostics.validTopOfBookRecords += 1;
  }

  if (record.isParityUsable) {
    diagnostics.parityUsableTopOfBookRecords += 1;
  }

  switch (record.economicBookState) {
    case "sequence-valid-crossed":
      diagnostics.crossedTopOfBookRecords += 1;
      break;
    case "sequence-valid-locked":
      diagnostics.lockedTopOfBookRecords += 1;
      break;
    case "insufficient-depth":
      diagnostics.insufficientDepthTopOfBookRecords += 1;
      break;
    case "awaiting-snapshot":
      diagnostics.awaitingSnapshotTopOfBookRecords += 1;
      break;
    case "invalid-price":
      diagnostics.invalidPriceTopOfBookRecords += 1;
      break;
    default:
      break;
  }

  if (
    hasBidSizeFieldPresent(record.yesBestBidSize)
    || hasBidSizeFieldPresent(record.noBestBidSize)
  ) {
    diagnostics.bidSizePresentTopOfBookRecords += 1;
  }

  if (hasExecutableBidPairSize(record.yesBestBidSize, record.noBestBidSize)) {
    diagnostics.bidPairWithSizeTopOfBookRecords += 1;
  } else if (
    record.yesBestBidCents !== null
    && record.noBestBidCents !== null
    && record.bookState === "valid"
  ) {
    diagnostics.bidPairWithoutSizeTopOfBookRecords += 1;
  }
}

export class ForwardCaptureMessageProcessor {
  readonly diagnostics: ForwardCaptureOrderbookDiagnostics = createEmptyOrderbookDiagnostics();
  readonly books = new Map<string, OrderbookCaptureBook>();
  private captureCounter = 0;
  private lastTopOfBookEmitMs = new Map<string, number>();
  private lastEconomicBookState = new Map<string, EconomicBookState>();
  /** Markets with exactly one outstanding snapshot recovery request. */
  private readonly outstandingRecovery = new Map<
    string,
    { commandId: number | null; requestedAtMs: number }
  >();
  private readonly lastRecoveryFailureAtMs = new Map<string, number>();

  constructor(
    private readonly input: {
      runId: string;
      seriesTicker: string;
      config: ForwardQuoteCaptureConfig;
      writer: ForwardCaptureWriter;
      eventTickers?: Record<string, string | null>;
      now: () => Date;
      monotonicNowMs: () => number;
      /** Compatibility hook: invoked once per distinct gap episode. */
      onSequenceGap?: (marketTicker: string) => void;
      /**
       * Routes official WS control responses (subscribed/ok/unsubscribed/
       * error) to the subscription manager and returns the classification.
       */
      onControlMessage?: (payload: unknown) => OrderbookControlMessage | null;
      /** Sends one get_snapshot command with the tracked server sid. */
      requestSnapshotRecovery?: (marketTicker: string) => SnapshotRecoveryDispatchResult;
      onLifecycleEvent?: (event: ForwardCaptureSubscriptionLifecycleEvent) => void;
      /** Surfaces command failures into capture errors. */
      onCommandError?: (message: string) => void;
      getLatestBtcSpot?: () => LatestBtcSpot;
      onTopOfBookEmitted?: () => void;
    },
  ) {}

  private nextCaptureId(): string {
    this.captureCounter += 1;
    return `${this.input.runId}-${this.captureCounter}`;
  }

  private emitLifecycle(
    event: Omit<ForwardCaptureSubscriptionLifecycleEvent, "detectedAt">,
  ): void {
    this.input.onLifecycleEvent?.({
      ...event,
      detectedAt: this.input.now().toISOString(),
    });
  }

  getOrCreateBook(marketTicker: string): OrderbookCaptureBook {
    const existing = this.books.get(marketTicker);
    if (existing) {
      return existing;
    }

    const book = new OrderbookCaptureBook({
      marketTicker,
      seriesTicker: this.input.seriesTicker,
      eventTicker: this.input.eventTickers?.[marketTicker] ?? null,
    });
    this.books.set(marketTicker, book);
    return book;
  }

  markMarketClosed(marketTicker: string): void {
    const book = this.books.get(marketTicker);
    if (book) {
      book.markClosed();
    }
    this.outstandingRecovery.delete(marketTicker);
  }

  markResyncing(marketTicker: string): void {
    const book = this.getOrCreateBook(marketTicker);
    book.markResyncing();
    this.diagnostics.resyncAttemptCount += 1;
  }

  invalidateAllBooksForRecovery(): void {
    for (const book of this.books.values()) {
      book.invalidateForRecovery();
    }
    this.outstandingRecovery.clear();
    this.lastRecoveryFailureAtMs.clear();
  }

  recordBooksResynchronized(): void {
    this.diagnostics.resyncSuccessCount += [...this.books.values()].filter(
      (book) => book.bookState === "valid",
    ).length;
  }

  recordResyncSuccess(marketTicker: string): void {
    if (this.books.get(marketTicker)?.bookState === "valid") {
      this.diagnostics.resyncSuccessCount += 1;
    }
  }

  hasOutstandingRecovery(marketTicker: string): boolean {
    return this.outstandingRecovery.has(marketTicker);
  }

  /**
   * Issues at most one outstanding get_snapshot recovery request per market.
   * Re-requests after a failed command only once the cooldown elapses.
   */
  private ensureRecoveryRequested(marketTicker: string): void {
    if (this.outstandingRecovery.has(marketTicker)) {
      return;
    }

    const nowMs = this.input.monotonicNowMs();
    const lastFailureAt = this.lastRecoveryFailureAtMs.get(marketTicker);
    if (lastFailureAt !== undefined && nowMs - lastFailureAt < RECOVERY_RETRY_COOLDOWN_MS) {
      return;
    }

    const dispatch = this.input.requestSnapshotRecovery?.(marketTicker);
    if (!dispatch) {
      return;
    }

    if (dispatch.status === "requested") {
      this.outstandingRecovery.set(marketTicker, {
        commandId: dispatch.commandId,
        requestedAtMs: nowMs,
      });
      this.diagnostics.snapshotRecoveryRequestCount += 1;
      this.emitLifecycle({
        type: "snapshotRecoveryRequested",
        marketTickers: [marketTicker],
        commandId: dispatch.commandId,
        sid: dispatch.sid,
      });
      return;
    }

    this.diagnostics.snapshotRecoveryFailureCount += 1;
    this.lastRecoveryFailureAtMs.set(marketTicker, nowMs);
    this.emitLifecycle({
      type: "snapshotRecoveryFailed",
      marketTickers: [marketTicker],
      commandId: null,
      sid: null,
      errorMessage: dispatch.reason,
    });
    this.input.onCommandError?.(
      `Snapshot recovery request failed for ${marketTicker}: ${dispatch.reason}`,
    );
  }

  private handleControlMessage(
    control: OrderbookControlMessage,
  ): void {
    this.diagnostics.controlResponsesReceived += 1;

    switch (control.kind) {
      case "subscriptionAcknowledged":
        this.emitLifecycle({
          type: "subscriptionAcknowledged",
          marketTickers: control.marketTickers,
          commandId: control.commandId,
          sid: control.sid,
        });
        return;
      case "commandAcknowledged":
        if (control.commandKind === "get_snapshot") {
          this.emitLifecycle({
            type: "snapshotRecoveryAcknowledged",
            marketTickers: control.marketTickers,
            commandId: control.commandId,
            sid: control.sid,
          });
        }
        return;
      case "unsubscribeAcknowledged":
        this.emitLifecycle({
          type: "marketUnsubscribeAcknowledged",
          marketTickers: control.marketTickers,
          commandId: control.commandId,
          sid: control.sid,
        });
        return;
      case "commandFailed": {
        this.diagnostics.commandErrorsReceived += 1;
        const errorDetail = `code=${control.errorCode ?? "unknown"} ${control.errorMessage}`;

        if (control.commandKind === "get_snapshot") {
          const nowMs = this.input.monotonicNowMs();
          for (const ticker of control.marketTickers) {
            this.outstandingRecovery.delete(ticker);
            this.lastRecoveryFailureAtMs.set(ticker, nowMs);
          }
          this.diagnostics.snapshotRecoveryFailureCount += 1;
          this.emitLifecycle({
            type: "snapshotRecoveryFailed",
            marketTickers: control.marketTickers,
            commandId: control.commandId,
            sid: null,
            errorCode: control.errorCode,
            errorMessage: control.errorMessage,
          });
          this.input.onCommandError?.(
            `Kalshi WS snapshot recovery command failed (${errorDetail})`,
          );
          return;
        }

        if (control.commandKind === "subscribe") {
          this.emitLifecycle({
            type: "subscriptionFailed",
            marketTickers: control.marketTickers,
            commandId: control.commandId,
            sid: null,
            errorCode: control.errorCode,
            errorMessage: control.errorMessage,
          });
          this.input.onCommandError?.(
            `Kalshi WS subscribe command failed (${errorDetail})`,
          );
          return;
        }

        if (
          control.commandKind === "unsubscribe"
          || control.commandKind === "delete_markets"
        ) {
          this.emitLifecycle({
            type: "marketUnsubscribeFailed",
            marketTickers: control.marketTickers,
            commandId: control.commandId,
            sid: null,
            errorCode: control.errorCode,
            errorMessage: control.errorMessage,
          });
          this.input.onCommandError?.(
            `Kalshi WS unsubscribe command failed (${errorDetail})`,
          );
          return;
        }

        this.input.onCommandError?.(
          `Kalshi WS command failed (${errorDetail})`,
        );
        return;
      }
      default:
        return;
    }
  }

  processRawPayload(rawPayload: unknown): ForwardCaptureMessageProcessingResult {
    this.diagnostics.rawMessageCount += 1;
    const receivedAtLocal = this.input.now().toISOString();
    const receivedAtMonotonicMs = this.input.monotonicNowMs();

    const payload =
      typeof rawPayload === "string" ? JSON.parse(rawPayload) : rawPayload;
    const messageType =
      typeof payload === "object"
      && payload !== null
      && "type" in payload
      && typeof payload.type === "string"
        ? payload.type
        : null;
    const sequence =
      typeof payload === "object"
      && payload !== null
      && "seq" in payload
      && typeof payload.seq === "number"
        ? payload.seq
        : null;
    const marketTicker =
      typeof payload === "object"
      && payload !== null
      && "msg" in payload
      && typeof payload.msg === "object"
      && payload.msg !== null
      && "market_ticker" in payload.msg
      && typeof payload.msg.market_ticker === "string"
        ? payload.msg.market_ticker
        : null;
    const eventTicker = marketTicker
      ? this.input.eventTickers?.[marketTicker] ?? null
      : null;
    const exchangeTimestampMs =
      typeof payload === "object"
      && payload !== null
      && "msg" in payload
      && typeof payload.msg === "object"
      && payload.msg !== null
      && "ts_ms" in payload.msg
      && typeof payload.msg.ts_ms === "number"
        ? payload.msg.ts_ms
        : null;

    const rawRecord: ForwardRawKalshiWsRecord = {
      runId: this.input.runId,
      captureId: this.nextCaptureId(),
      receivedAtLocal,
      receivedAtMonotonicMs,
      source: "kalshi-ws",
      channel: messageType?.includes("orderbook") ? "orderbook_delta" : null,
      messageType,
      marketTicker,
      eventTicker,
      seriesTicker: this.input.seriesTicker,
      sequence,
      exchangeTimestampMs,
      rawPayload: payload,
    };
    this.input.writer.appendRawKalshiWs(rawRecord);

    if (messageType === "orderbook_snapshot") {
      const parsed = kalshiOrderbookSnapshotMessageSchema.safeParse(payload);
      if (!parsed.success) {
        this.diagnostics.unknownMessagesReceived += 1;
        return { messageType, marketTicker, expectedMarketMessage: false };
      }

      const ticker = parsed.data.msg.market_ticker;
      const book = this.getOrCreateBook(ticker);
      // Initial awaiting-snapshot (never synchronized, no episode) is not a
      // recovery; only gap/resync states or an outstanding request count.
      const wasRecovering =
        book.bookState === "gap-detected"
        || book.bookState === "resyncing"
        || this.outstandingRecovery.has(ticker);
      const snapshotResult = book.applySnapshot(parsed.data);

      if (snapshotResult === "stale-rejected") {
        this.diagnostics.staleSnapshotsRejected += 1;
        return { messageType, marketTicker: ticker, expectedMarketMessage: true };
      }

      if (snapshotResult === "closed-ignored") {
        return { messageType, marketTicker: ticker, expectedMarketMessage: true };
      }

      this.diagnostics.snapshotsReceived += 1;
      if (wasRecovering) {
        this.diagnostics.snapshotRecoverySuccessCount += 1;
        this.recordResyncSuccess(ticker);
        this.outstandingRecovery.delete(ticker);
        this.lastRecoveryFailureAtMs.delete(ticker);
        this.emitLifecycle({
          type: "snapshotRecoverySucceeded",
          marketTickers: [ticker],
          commandId: null,
          sid: parsed.data.sid,
        });
      }
      this.emitTopOfBook(book, receivedAtLocal, exchangeTimestampMs);
      return {
        messageType,
        marketTicker: ticker,
        expectedMarketMessage: true,
      };
    }

    if (messageType === "orderbook_delta") {
      const parsed = kalshiOrderbookDeltaMessageSchema.safeParse(payload);
      if (!parsed.success) {
        this.diagnostics.unknownMessagesReceived += 1;
        return { messageType, marketTicker, expectedMarketMessage: false };
      }

      this.diagnostics.deltasReceived += 1;
      const ticker = parsed.data.msg.market_ticker;
      const book = this.getOrCreateBook(ticker);
      const result = book.applyDelta(parsed.data);

      if (result === "gap-initiated") {
        this.diagnostics.sequenceGapCount += 1;
        this.diagnostics.sequenceGapEpisodeCount += 1;
        this.markResyncing(ticker);
        this.ensureRecoveryRequested(ticker);
        this.input.onSequenceGap?.(ticker);
      } else if (result === "quarantined") {
        this.diagnostics.deltasQuarantinedDuringResync += 1;
        this.ensureRecoveryRequested(ticker);
      } else if (result === "duplicate") {
        this.diagnostics.outOfOrderCount += 1;
      }

      if (result !== "closed-ignored") {
        this.emitTopOfBook(book, receivedAtLocal, exchangeTimestampMs);
      }
      return {
        messageType,
        marketTicker: ticker,
        expectedMarketMessage: true,
      };
    }

    const control = this.input.onControlMessage?.(payload) ?? null;
    if (control) {
      this.handleControlMessage(control);
      return {
        messageType,
        marketTicker,
        expectedMarketMessage: false,
        controlMessage: control,
      };
    }

    this.diagnostics.unknownMessagesReceived += 1;
    return { messageType, marketTicker, expectedMarketMessage: false };
  }

  private emitTopOfBook(
    book: OrderbookCaptureBook,
    receivedAtLocal: string,
    exchangeTimestampMs: number | null,
  ): void {
    const btcSpot = this.input.getLatestBtcSpot?.() ?? null;
    const record: ForwardTopOfBookRecord = book.toTopOfBookRecord({
      runId: this.input.runId,
      receivedAtLocal,
      exchangeTimestampMs,
      btcSpotPriceUsd: btcSpot?.priceUsd ?? null,
      btcSpotReceivedAtLocal: btcSpot?.receivedAtLocal ?? null,
      btcSpotSource: btcSpot?.source ?? null,
    });

    if (isEmptyAwaitingSnapshot(record)) {
      return;
    }

    const throttleMs = this.input.config.topOfBookThrottleMs;
    const bypassThrottle = shouldBypassThrottle({
      previousState: this.lastEconomicBookState.get(book.marketTicker),
      currentState: record.economicBookState,
    });
    const hasPriorEmit = this.lastTopOfBookEmitMs.has(book.marketTicker);

    if (throttleMs > 0 && hasPriorEmit && !bypassThrottle) {
      const lastEmit = this.lastTopOfBookEmitMs.get(book.marketTicker) ?? 0;
      const nowMs = this.input.monotonicNowMs();
      if (nowMs - lastEmit < throttleMs) {
        return;
      }
      this.lastTopOfBookEmitMs.set(book.marketTicker, nowMs);
    } else if (throttleMs > 0) {
      this.lastTopOfBookEmitMs.set(book.marketTicker, this.input.monotonicNowMs());
    }

    this.input.writer.appendTopOfBook(record);
    recordEconomicDiagnostics(this.diagnostics, record);
    this.lastEconomicBookState.set(book.marketTicker, record.economicBookState);
    this.input.onTopOfBookEmitted?.();

    if (record.bookState === "valid") {
      this.diagnostics.validBookStateDurationMs += 1;
    } else {
      this.diagnostics.invalidBookStateDurationMs += 1;
    }
  }

  finalize(): void {
    this.diagnostics.marketsAwaitingSnapshot = [...this.books.values()].filter(
      (book) => book.bookState === "awaiting-snapshot",
    ).length;
    this.diagnostics.marketsWithValidBook = [...this.books.values()].filter(
      (book) => book.bookState === "valid",
    ).length;
  }
}
