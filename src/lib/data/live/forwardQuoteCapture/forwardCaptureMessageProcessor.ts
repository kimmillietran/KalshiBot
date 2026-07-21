import {
  kalshiOrderbookDeltaMessageSchema,
  kalshiOrderbookSnapshotMessageSchema,
} from "@/features/market-data/orderbook/schemas";
import type {
  OrderbookControlMessage,
  PendingOrderbookCommand,
} from "@/features/market-data/orderbook/OrderbookSubscriptionManager";

import type { EconomicBookState } from "./classifyTopOfBookEconomicValidity";
import {
  hasBidSizeFieldPresent,
  hasExecutableBidPairSize,
} from "./orderbookLevelSize";
import { createEmptyOrderbookDiagnostics } from "./createEmptyOrderbookDiagnostics";
import { OrderbookCaptureBook } from "./orderbookCaptureBook";
import type { ForwardCaptureWriter } from "./jsonlForwardCaptureWriter";
import {
  FORWARD_CAPTURE_PRICE_REPRESENTATION,
  type ForwardCaptureOrderbookDiagnostics,
  type ForwardCaptureSubscriptionLifecycleEvent,
  type ForwardQuoteCaptureConfig,
  type ForwardRawKalshiWsRecord,
  type ForwardTopOfBookRecord,
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

/**
 * Bounded, monotonic snapshot-recovery lifecycle deadlines. A recovery that
 * misses any of these deadlines fails visibly and is retried (bounded) or
 * escalated; the book can never remain silently resyncing indefinitely.
 */
export const RECOVERY_ACK_TIMEOUT_MS = 10_000;
/** After an ok acknowledgement, a fresh snapshot must arrive within this window. */
export const RECOVERY_SNAPSHOT_TIMEOUT_MS = 20_000;
/** Absolute cap on one recovery request, acknowledged or not. */
export const RECOVERY_TOTAL_TIMEOUT_MS = 45_000;
/** Max snapshot-recovery attempts per gap episode before escalation. */
export const RECOVERY_MAX_ATTEMPTS = 3;
/** Acknowledgement deadline for all pending WS commands. */
export const COMMAND_ACK_TIMEOUT_MS = 10_000;

type OutstandingRecovery = {
  commandId: number | null;
  requestedAtMs: number;
  acknowledgedAtMs: number | null;
};

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
  private readonly outstandingRecovery = new Map<string, OutstandingRecovery>();
  private readonly lastRecoveryFailureAtMs = new Map<string, number>();
  /** Snapshot-recovery attempts per market for the current gap episode. */
  private readonly recoveryAttempts = new Map<string, number>();
  /** Markets whose bounded retries were exhausted (until a snapshot or reset). */
  private readonly recoveryExhausted = new Set<string>();

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
      /**
       * Escalation hook: bounded snapshot-recovery retries were exhausted
       * for a market; the caller should trigger WebSocket/socket-level
       * recovery (or terminal degradation).
       */
      onRecoveryExhausted?: (marketTicker: string) => void;
      /** Removes and returns pending WS commands past their ack deadline. */
      expirePendingCommands?: (nowMs: number) => PendingOrderbookCommand[];
      /** Pending WS command count for finalization reporting. */
      getPendingCommandCount?: () => number;
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
      priceRepresentation:
        this.input.config.priceRepresentation ?? FORWARD_CAPTURE_PRICE_REPRESENTATION,
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
    this.recoveryAttempts.delete(marketTicker);
    this.recoveryExhausted.delete(marketTicker);
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
    this.recoveryAttempts.clear();
    this.recoveryExhausted.clear();
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
   * Issues at most one outstanding get_snapshot recovery request per market,
   * bounded by RECOVERY_MAX_ATTEMPTS per gap episode. Re-requests after a
   * failure only once the cooldown elapses; exhaustion escalates once via
   * onRecoveryExhausted (socket-level recovery or terminal degradation).
   */
  private ensureRecoveryRequested(marketTicker: string): void {
    const nowMs = this.input.monotonicNowMs();
    this.expireOutstandingRecovery(marketTicker, nowMs);

    if (
      this.outstandingRecovery.has(marketTicker)
      || this.recoveryExhausted.has(marketTicker)
    ) {
      return;
    }

    const lastFailureAt = this.lastRecoveryFailureAtMs.get(marketTicker);
    if (lastFailureAt !== undefined && nowMs - lastFailureAt < RECOVERY_RETRY_COOLDOWN_MS) {
      return;
    }

    const attempts = this.recoveryAttempts.get(marketTicker) ?? 0;
    if (attempts >= RECOVERY_MAX_ATTEMPTS) {
      this.escalateRecoveryExhausted(marketTicker, attempts);
      return;
    }

    // Pre-register attempt and outstanding state BEFORE dispatch: synchronous
    // transports can deliver the ok acknowledgement and fresh snapshot during
    // the send itself, and those handlers must find (and may complete/clear)
    // this recovery.
    this.recoveryAttempts.set(marketTicker, attempts + 1);
    this.outstandingRecovery.set(marketTicker, {
      commandId: null,
      requestedAtMs: nowMs,
      acknowledgedAtMs: null,
    });

    const dispatch = this.input.requestSnapshotRecovery?.(marketTicker);
    if (!dispatch) {
      this.outstandingRecovery.delete(marketTicker);
      this.recoveryAttempts.set(marketTicker, attempts);
      return;
    }

    if (dispatch.status === "requested") {
      this.diagnostics.snapshotRecoveryRequestCount += 1;
      // A synchronous snapshot may already have completed this recovery; only
      // attach the command id if the entry is still outstanding.
      const outstanding = this.outstandingRecovery.get(marketTicker);
      if (outstanding && outstanding.commandId === null) {
        this.outstandingRecovery.set(marketTicker, {
          ...outstanding,
          commandId: dispatch.commandId,
        });
      }
      this.emitLifecycle({
        type: "snapshotRecoveryRequested",
        marketTickers: [marketTicker],
        commandId: dispatch.commandId,
        sid: dispatch.sid,
      });
      return;
    }

    this.outstandingRecovery.delete(marketTicker);
    this.recordRecoveryFailure(marketTicker, nowMs, {
      commandId: null,
      errorMessage: `Snapshot recovery request failed for ${marketTicker}: ${dispatch.reason}`,
    });
  }

  /** Marks one recovery failed: counters, cooldown, lifecycle event, error. */
  private recordRecoveryFailure(
    marketTicker: string,
    nowMs: number,
    detail: { commandId: number | null; errorMessage: string; isTimeout?: boolean },
  ): void {
    this.outstandingRecovery.delete(marketTicker);
    this.lastRecoveryFailureAtMs.set(marketTicker, nowMs);
    this.diagnostics.snapshotRecoveryFailureCount += 1;
    if (detail.isTimeout) {
      this.diagnostics.snapshotRecoveryTimeoutCount += 1;
    }
    this.emitLifecycle({
      type: "snapshotRecoveryFailed",
      marketTickers: [marketTicker],
      commandId: detail.commandId,
      sid: null,
      errorMessage: detail.errorMessage,
    });
    this.input.onCommandError?.(detail.errorMessage);
  }

  private escalateRecoveryExhausted(marketTicker: string, attempts: number): void {
    this.recoveryExhausted.add(marketTicker);
    this.diagnostics.snapshotRecoveryExhaustedCount += 1;
    const message =
      `Snapshot recovery exhausted for ${marketTicker} after ${attempts} attempt(s); escalating to socket-level recovery`;
    this.emitLifecycle({
      type: "snapshotRecoveryExhausted",
      marketTickers: [marketTicker],
      commandId: null,
      sid: null,
      errorMessage: message,
    });
    this.input.onCommandError?.(message);
    this.input.onRecoveryExhausted?.(marketTicker);
  }

  /** Fails one outstanding recovery if any of its monotonic deadlines passed. */
  private expireOutstandingRecovery(marketTicker: string, nowMs: number): void {
    const outstanding = this.outstandingRecovery.get(marketTicker);
    if (!outstanding) {
      return;
    }

    if (nowMs - outstanding.requestedAtMs >= RECOVERY_TOTAL_TIMEOUT_MS) {
      this.recordRecoveryFailure(marketTicker, nowMs, {
        commandId: outstanding.commandId,
        errorMessage:
          `Snapshot recovery for ${marketTicker} exceeded the total deadline (${RECOVERY_TOTAL_TIMEOUT_MS}ms) without a fresh snapshot`,
        isTimeout: true,
      });
      return;
    }

    if (
      outstanding.acknowledgedAtMs === null
      && nowMs - outstanding.requestedAtMs >= RECOVERY_ACK_TIMEOUT_MS
    ) {
      this.recordRecoveryFailure(marketTicker, nowMs, {
        commandId: outstanding.commandId,
        errorMessage:
          `Snapshot recovery command for ${marketTicker} was never acknowledged within ${RECOVERY_ACK_TIMEOUT_MS}ms`,
        isTimeout: true,
      });
      return;
    }

    if (
      outstanding.acknowledgedAtMs !== null
      && nowMs - outstanding.acknowledgedAtMs >= RECOVERY_SNAPSHOT_TIMEOUT_MS
    ) {
      this.recordRecoveryFailure(marketTicker, nowMs, {
        commandId: outstanding.commandId,
        errorMessage:
          `Snapshot recovery for ${marketTicker} was acknowledged but no fresh snapshot arrived within ${RECOVERY_SNAPSHOT_TIMEOUT_MS}ms`,
        isTimeout: true,
      });
    }
  }

  /**
   * Periodic timeout sweep: expires outstanding snapshot recoveries and
   * pending WS commands past their acknowledgement deadline. Must be called
   * on a monotonic cadence by the capture loop (and is also evaluated
   * opportunistically as messages arrive).
   */
  checkTimeouts(): void {
    const nowMs = this.input.monotonicNowMs();
    for (const marketTicker of [...this.outstandingRecovery.keys()]) {
      this.expireOutstandingRecovery(marketTicker, nowMs);
    }

    const expired = this.input.expirePendingCommands?.(nowMs) ?? [];
    for (const command of expired) {
      this.recordPendingCommandTimeout(command);
    }
  }

  /** Surfaces a pending WS command that timed out without acknowledgement. */
  recordPendingCommandTimeout(command: PendingOrderbookCommand): void {
    this.diagnostics.pendingCommandTimeoutCount += 1;
    const nowMs = this.input.monotonicNowMs();
    const message =
      `Kalshi WS ${command.kind} command (id=${command.id}) was never acknowledged within ${COMMAND_ACK_TIMEOUT_MS}ms`;

    this.emitLifecycle({
      type: "commandAcknowledgementTimeout",
      marketTickers: [...command.marketTickers],
      commandId: command.id,
      sid: command.sids[0] ?? null,
      errorMessage: message,
    });

    switch (command.kind) {
      case "subscribe":
        this.diagnostics.subscribeAckTimeoutCount += 1;
        this.emitLifecycle({
          type: "subscriptionFailed",
          marketTickers: [...command.marketTickers],
          commandId: command.id,
          sid: null,
          errorMessage: message,
        });
        break;
      case "get_snapshot": {
        this.diagnostics.snapshotAckTimeoutCount += 1;
        for (const ticker of command.marketTickers) {
          const outstanding = this.outstandingRecovery.get(ticker);
          if (outstanding && outstanding.commandId === command.id) {
            this.recordRecoveryFailure(ticker, nowMs, {
              commandId: command.id,
              errorMessage: message,
              isTimeout: true,
            });
          }
        }
        break;
      }
      case "unsubscribe":
      case "delete_markets":
        this.diagnostics.unsubscribeAckTimeoutCount += 1;
        this.emitLifecycle({
          type: "marketUnsubscribeFailed",
          marketTickers: [...command.marketTickers],
          commandId: command.id,
          sid: null,
          errorMessage: message,
        });
        break;
      default:
        break;
    }

    this.input.onCommandError?.(message);
  }

  /** Surfaces pending commands invalidated by a reconnect (old generation). */
  recordPendingCommandsInvalidated(commands: readonly PendingOrderbookCommand[]): void {
    if (commands.length === 0) {
      return;
    }

    this.diagnostics.pendingCommandsInvalidatedOnReconnect += commands.length;
    this.emitLifecycle({
      type: "pendingCommandsInvalidatedOnReconnect",
      marketTickers: [...new Set(commands.flatMap((command) => command.marketTickers))],
      commandId: null,
      sid: null,
      errorMessage:
        `${commands.length} pending WS command(s) invalidated by reconnect; they can never be acknowledged on the new socket`,
    });
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
          // Acknowledgement starts the snapshot-arrival deadline; it does NOT
          // complete recovery. Only a fresh orderbook_snapshot does.
          const ackAtMs = this.input.monotonicNowMs();
          for (const [ticker, outstanding] of this.outstandingRecovery) {
            if (
              control.commandId !== null
              && outstanding.commandId === control.commandId
              && outstanding.acknowledgedAtMs === null
            ) {
              this.outstandingRecovery.set(ticker, {
                ...outstanding,
                acknowledgedAtMs: ackAtMs,
              });
            }
          }
          this.emitLifecycle({
            type: "snapshotRecoveryAcknowledged",
            marketTickers: control.marketTickers,
            commandId: control.commandId,
            sid: control.sid,
          });
        }
        return;
      case "unknownControlResponse":
        this.diagnostics.unknownControlResponseCount += 1;
        this.emitLifecycle({
          type: "unknownControlResponseReceived",
          marketTickers: [],
          commandId: control.commandId,
          sid: control.sid,
          errorMessage:
            `Uncorrelated ${control.responseType} control response (command id=${control.commandId ?? "none"}); no subscription state was mutated`,
        });
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

    let payload: unknown;
    if (typeof rawPayload === "string") {
      try {
        payload = JSON.parse(rawPayload);
      } catch {
        // A malformed WS payload must not crash the message handler or write
        // misleading parsed state; count it and preserve a bounded raw
        // diagnostic (server payloads never contain local credentials, and
        // artifact serialization redacts secrets defensively).
        this.diagnostics.malformedPayloadCount += 1;
        this.diagnostics.unknownMessagesReceived += 1;
        this.input.writer.appendRawKalshiWs({
          runId: this.input.runId,
          captureId: this.nextCaptureId(),
          receivedAtLocal,
          receivedAtMonotonicMs,
          source: "kalshi-ws",
          channel: null,
          messageType: "malformed-json",
          marketTicker: null,
          eventTicker: null,
          seriesTicker: this.input.seriesTicker,
          sequence: null,
          exchangeTimestampMs: null,
          rawPayload: {
            malformed: true,
            textPreview: rawPayload.slice(0, 512),
            textLength: rawPayload.length,
          },
        });
        this.input.onCommandError?.(
          `Malformed Kalshi WS payload could not be parsed as JSON (${rawPayload.length} chars)`,
        );
        return { messageType: null, marketTicker: null, expectedMarketMessage: false };
      }
    } else {
      payload = rawPayload;
    }
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
        this.recoveryAttempts.delete(ticker);
        this.recoveryExhausted.delete(ticker);
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
    // Only sequence-valid emissions count as synchronized-stream liveness;
    // a stream of quarantined/resyncing records is not a healthy market feed.
    if (record.bookState === "valid") {
      this.input.onTopOfBookEmitted?.();
    }

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

    // Unresolved recovery/pending-command state must be visible at capture
    // end; it prevents a clean health classification.
    this.diagnostics.marketsWithOutstandingRecoveryAtEnd = this.outstandingRecovery.size;
    this.diagnostics.pendingCommandCountAtCaptureEnd =
      this.input.getPendingCommandCount?.() ?? 0;
    if (this.outstandingRecovery.size > 0) {
      const tickers = [...this.outstandingRecovery.keys()];
      this.input.onCommandError?.(
        `Capture ended with ${tickers.length} market(s) still awaiting snapshot recovery: ${tickers.join(", ")}`,
      );
    }
  }
}
