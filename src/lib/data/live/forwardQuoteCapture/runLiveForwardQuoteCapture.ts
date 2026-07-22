import { KALSHI_WS_URL } from "@/features/market-data/orderbook/constants";
import { OrderbookSubscriptionManager } from "@/features/market-data/orderbook/OrderbookSubscriptionManager";
import type { KalshiWsProbeTransport } from "@/features/market-data/orderbook/types";

import {
  createKalshiWebSocketAuthHeaders,
  NodeKalshiAuthenticatedWsClient,
  type KalshiCaptureCredentials,
} from "@/lib/data/live/kalshiWsCaptureSpike";
import { createEmptyConnectionDiagnostics } from "./connectionDiagnostics";
import { discoverRolloverMarkets } from "./discoverCaptureMarkets";
import {
  COMMAND_ACK_TIMEOUT_MS,
  ForwardCaptureMessageProcessor,
  type LatestBtcSpot,
} from "./forwardCaptureMessageProcessor";
import {
  createJsonlForwardCaptureWriter,
  createRunOutputPaths,
  type ForwardCaptureWriter,
} from "./jsonlForwardCaptureWriter";
import {
  KalshiWsLivenessWatchdog,
  resolveWatchdogConfigFromCaptureConfig,
  type KalshiWsWatchdogDiagnostics,
} from "./kalshiWsLivenessWatchdog";
import type {
  BtcSpotHealthStatus,
  CaptureEndReason,
  ForwardCaptureConnectionDiagnostics,
  ForwardCaptureMarketDiscoveryResult,
  ForwardCaptureRolloverDiagnostics,
  ForwardQuoteCaptureConfig,
  ForwardQuoteCaptureIo,
} from "./forwardQuoteCaptureTypes";

export type LiveForwardCaptureResult = {
  runId: string;
  startedAt: string;
  endedAt: string;
  paths: ReturnType<typeof createRunOutputPaths>;
  discovery: ForwardCaptureMarketDiscoveryResult;
  processor: ForwardCaptureMessageProcessor;
  connection: ForwardCaptureConnectionDiagnostics;
  rollover: ForwardCaptureRolloverDiagnostics;
  btcSpotStatus: BtcSpotHealthStatus;
  connected: boolean;
  wsUrl: string;
  authHeadersGenerated: boolean;
  errors: string[];
  recordCounts: {
    raw: number;
    topOfBook: number;
    btcSpot: number;
    marketMetadata: number;
    lifecycle: number;
  };
  watchdog: KalshiWsWatchdogDiagnostics | null;
  captureEndReason: CaptureEndReason;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function resolveWsUrl(credentials: KalshiCaptureCredentials): string {
  return credentials.wsUrl ?? KALSHI_WS_URL;
}

function isProbeTransport(
  transport: KalshiWsProbeTransport,
): transport is KalshiWsProbeTransport {
  return typeof transport.ping === "function";
}

export async function runLiveForwardQuoteCapture(input: {
  runId: string;
  startedAt: string;
  config: ForwardQuoteCaptureConfig;
  discovery: ForwardCaptureMarketDiscoveryResult;
  credentials: KalshiCaptureCredentials;
  io: ForwardQuoteCaptureIo;
  /** Pre-created buffered writer (owned by the orchestrator, which finalizes it). */
  writer?: ForwardCaptureWriter;
  transport?: KalshiWsProbeTransport;
  fetchBtcSpot?: () => Promise<{ price: number; updatedAt: string }>;
  shouldStop?: () => boolean;
  onLog?: (message: string) => void;
}): Promise<LiveForwardCaptureResult> {
  const paths = input.writer?.paths ?? createRunOutputPaths(input.config.outputDir, input.runId);
  const writer = input.writer ?? createJsonlForwardCaptureWriter(input.io, paths);
  const wsUrl = resolveWsUrl(input.credentials);
  const errors: string[] = [];

  const connection = createEmptyConnectionDiagnostics();
  const rollover: ForwardCaptureRolloverDiagnostics = {
    marketsDiscovered: input.discovery.discoveredMarketCount,
    marketsSubscribed: 0,
    marketsClosed: 0,
    rolloverChecks: 0,
    rolloverSubscriptionsAdded: 0,
  };

  const subscribedTickers = new Set<string>();
  let latestBtcSpot: LatestBtcSpot = null;
  let btcSpotStatus: BtcSpotHealthStatus = input.config.captureBtcSpot
    ? "enabled"
    : "disabled";
  let btcSpotFailures = 0;
  let plannedShutdown = false;
  let captureEndReason: CaptureEndReason = "duration-complete";
  let handlerSocketGeneration = 0;
  // Producer-quiescence state: once shutdown begins no new producer work may
  // start, and in-flight BTC polls / rollover discoveries / watchdog ticks
  // are awaited before this function returns to the orchestrator (which then
  // finalizes the writer). Late work must never touch a finalizing writer.
  let shuttingDown = false;
  let acceptingMessages = true;
  let activeBtcPoll: Promise<void> | null = null;
  let activeRolloverCheck: Promise<void> | null = null;
  let activeWatchdogTick: Promise<void> | null = null;

  const eventTickers = { ...input.discovery.eventTickers };
  const marketStatuses = { ...input.discovery.marketStatuses };
  const closeTimes = { ...input.discovery.closeTimes };

  const transport = input.transport ?? new NodeKalshiAuthenticatedWsClient();
  const subscriptionManager = new OrderbookSubscriptionManager(input.io.monotonicNowMs);
  const watchdogConfig = resolveWatchdogConfigFromCaptureConfig({
    dryRun: false,
    wsWatchdogEnabled: input.config.wsWatchdogEnabled,
    wsSoftSilenceThresholdMs: input.config.wsSoftSilenceThresholdMs,
    wsHardStallThresholdMs: input.config.wsHardStallThresholdMs,
    wsProbeGraceMs: input.config.wsProbeGraceMs,
    wsRecoveryMaxAttempts: input.config.wsRecoveryMaxAttempts,
  });

  const processor = new ForwardCaptureMessageProcessor({
    runId: input.runId,
    seriesTicker: input.config.series,
    config: input.config,
    writer,
    eventTickers,
    now: input.io.now,
    monotonicNowMs: input.io.monotonicNowMs,
    getLatestBtcSpot: () => latestBtcSpot,
    onTopOfBookEmitted: () => {
      watchdog?.recordTopOfBookEmission();
    },
    onControlMessage: (payload) => subscriptionManager.handleControlMessage(payload),
    correlateSnapshotResponse: (input) =>
      subscriptionManager.correlateSnapshotResponse(input),
    requestSnapshotRecovery: (marketTicker) => {
      try {
        const result = subscriptionManager.requestSnapshot(transport, marketTicker);
        if (result.status === "requested") {
          return result;
        }
        return {
          status: "unavailable",
          reason: "No acknowledged server subscription id (sid) for market",
        };
      } catch (error) {
        return {
          status: "send-failed",
          reason:
            error instanceof Error ? error.message : "Resync snapshot request failed",
        };
      }
    },
    onLifecycleEvent: (event) => {
      writer.appendLifecycleEvent({ runId: input.runId, ...event });
    },
    onCommandError: (message) => {
      errors.push(message);
    },
    onRecoveryExhausted: () => {
      // Bounded snapshot-recovery retries were exhausted; escalate to a full
      // socket-level recovery so the book cannot stay resyncing indefinitely.
      watchdog?.requestEscalatedRecovery("snapshot-recovery-exhausted");
    },
    expirePendingCommands: (nowMs) =>
      subscriptionManager.expirePendingCommands(nowMs, COMMAND_ACK_TIMEOUT_MS),
    getPendingCommandCount: () => subscriptionManager.getPendingCommands().length,
  });

  let watchdog: KalshiWsLivenessWatchdog | null = null;

  let authHeadersGenerated = false;
  let connectHeaders: Record<string, string> | undefined;

  if (
    input.credentials.status === "available"
    && input.credentials.apiKeyId
    && input.credentials.privateKeyMaterial.privateKeyPem
  ) {
    connectHeaders = createKalshiWebSocketAuthHeaders({
      apiKeyId: input.credentials.apiKeyId,
      privateKeyPem: input.credentials.privateKeyMaterial.privateKeyPem,
      timestampMs: String(input.io.now().getTime()),
    });
    authHeadersGenerated = true;
  } else {
    errors.push("Authenticated WebSocket headers could not be generated from credentials.");
  }

  watchdog = watchdogConfig.enabled
    ? new KalshiWsLivenessWatchdog(watchdogConfig, {
      now: input.io.now,
      monotonicNowMs: input.io.monotonicNowMs,
      shouldStop: () => input.shouldStop?.() ?? false,
      getActiveMarketTickers: () => [...subscribedTickers],
      onLog: input.onLog,
      onEvent: (event) => {
        writer.appendLifecycleEvent({ runId: input.runId, ...event });
        if (event.type === "wsRecoverySucceeded") {
          processor.recordBooksResynchronized();
        }
      },
      sendProbe: isProbeTransport(transport)
        ? () => {
          try {
            transport.ping?.();
          } catch (error) {
            errors.push(error instanceof Error ? error.message : "Watchdog probe failed");
          }
        }
        : undefined,
      executeRecovery: async ({ socketGeneration, activeMarketTickers }) => {
        writer.appendLifecycleEvent({
          runId: input.runId,
          type: "wsBooksMarkedUnsynchronized",
          detectedAt: input.io.now().toISOString(),
          socketGeneration,
          marketTickers: activeMarketTickers,
        });
        processor.invalidateAllBooksForRecovery();
        const snapshotsBeforeRecovery = processor.diagnostics.snapshotsReceived;
        plannedShutdown = true;
        try {
          transport.close();
        } catch {
          // ignore close errors on stale sockets
        }
        plannedShutdown = false;
        connection.connected = false;
        connection.wsDisconnectCount += 1;
        connection.reconnectCount += 1;
        watchdog?.recordWebSocketClose();

        const confirmationDeadline =
          input.io.monotonicNowMs() + watchdogConfig.wsPostSubscribeConfirmationMs;
        await connectTransport(socketGeneration);

        while (input.io.monotonicNowMs() < confirmationDeadline) {
          if (processor.diagnostics.snapshotsReceived > snapshotsBeforeRecovery) {
            return {
              status: "succeeded" as const,
              firstRawMessageAt: input.io.now().toISOString(),
              subscriptionsRestored: activeMarketTickers.length,
            };
          }
          await sleep(50);
        }

        return {
          status: "failed" as const,
          reason: "no-fresh-orderbook-snapshot-after-recovery",
        };
      },
    })
    : null;

  function appendMarketMetadata(
    ticker: string,
    action: "discovered" | "subscribed" | "closed",
  ): void {
    writer.appendMarketMetadata({
      runId: input.runId,
      recordedAtLocal: input.io.now().toISOString(),
      marketTicker: ticker,
      eventTicker: eventTickers[ticker] ?? null,
      seriesTicker: input.config.series,
      status: marketStatuses[ticker] ?? "unknown",
      closeTime: closeTimes[ticker] ?? null,
      action,
    });
  }

  function appendSubscriptionLifecycle(
    type:
      | "subscriptionRequested"
      | "subscriptionFailed"
      | "marketUnsubscribeRequested"
      | "marketUnsubscribeFailed",
    marketTickers: string[],
    detail?: { commandId?: number | null; sid?: number | null; errorMessage?: string },
  ): void {
    writer.appendLifecycleEvent({
      runId: input.runId,
      type,
      detectedAt: input.io.now().toISOString(),
      marketTickers,
      commandId: detail?.commandId ?? null,
      sid: detail?.sid ?? null,
      ...(detail?.errorMessage ? { errorMessage: detail.errorMessage } : {}),
    });
  }

  function sendSubscribe(ticker: string): void {
    // Kalshi sends an orderbook_snapshot immediately after a successful
    // subscribe; no separate get_snapshot command is needed (and none can be
    // sent until the server sid is acknowledged).
    try {
      const commandId = subscriptionManager.subscribe(transport, ticker);
      appendSubscriptionLifecycle("subscriptionRequested", [ticker], { commandId });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Subscribe command failed";
      errors.push(`Kalshi WS subscribe send failed for ${ticker}: ${message}`);
      appendSubscriptionLifecycle("subscriptionFailed", [ticker], {
        errorMessage: message,
      });
    }
  }

  function subscribeMarket(ticker: string): void {
    if (subscribedTickers.has(ticker)) {
      return;
    }

    subscribedTickers.add(ticker);
    rollover.marketsSubscribed += 1;
    appendMarketMetadata(ticker, "subscribed");

    if (connection.connected) {
      sendSubscribe(ticker);
      watchdog?.recordSubscriptionSuccess(subscribedTickers.size);
    }
  }

  /**
   * Rollover unsubscribe lifecycle: the book is marked closed (late messages
   * are ignored, never reactivate the book), a server-side unsubscribe /
   * delete_markets command is sent with the acknowledged sid, and the ticker
   * leaves local active state at request time. Acknowledgement or failure is
   * recorded via marketUnsubscribeAcknowledged / marketUnsubscribeFailed.
   */
  function unsubscribeMarket(ticker: string): void {
    processor.markMarketClosed(ticker);
    appendMarketMetadata(ticker, "closed");
    subscribedTickers.delete(ticker);

    if (!connection.connected) {
      return;
    }

    try {
      const result = subscriptionManager.unsubscribe(transport, [ticker]);
      if (result.commandIds.length > 0) {
        appendSubscriptionLifecycle("marketUnsubscribeRequested", [ticker], {
          commandId: result.commandIds[0],
        });
      }
      if (result.unmappedTickers.length > 0) {
        appendSubscriptionLifecycle("marketUnsubscribeFailed", result.unmappedTickers, {
          errorMessage: "No acknowledged server subscription id (sid) for market",
        });
        errors.push(
          `Kalshi WS unsubscribe unavailable for ${result.unmappedTickers.join(", ")}: no acknowledged sid`,
        );
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unsubscribe command failed";
      errors.push(`Kalshi WS unsubscribe send failed for ${ticker}: ${message}`);
      appendSubscriptionLifecycle("marketUnsubscribeFailed", [ticker], {
        errorMessage: message,
      });
    }
  }

  async function connectTransport(socketGeneration: number): Promise<void> {
    if (!authHeadersGenerated || !connectHeaders) {
      throw new Error("Missing authenticated WebSocket headers.");
    }

    handlerSocketGeneration = socketGeneration;
    // Server subscription ids do not survive a socket; drop all sid mappings
    // before rebuilding subscriptions on the new connection. Invalidated
    // pending commands are surfaced visibly (they can never be acknowledged).
    const invalidatedCommands = subscriptionManager.resetForReconnect();
    processor.recordPendingCommandsInvalidated(invalidatedCommands);
    await transport.connect(wsUrl, { headers: connectHeaders });
    connection.wsConnectCount += 1;
    connection.connected = true;
    watchdog?.recordWebSocketOpen();

    for (const ticker of subscribedTickers) {
      sendSubscribe(ticker);
    }
    watchdog?.recordSubscriptionSuccess(subscribedTickers.size);
  }

  if (isProbeTransport(transport)) {
    transport.onPong?.(() => {
      if (watchdog && handlerSocketGeneration !== watchdog.currentSocketGeneration) {
        return;
      }
      watchdog?.recordPong();
    });
  }

  transport.onMessage((payload) => {
    // Late buffered messages arriving after producer shutdown must not reach
    // the processor (and therefore the writer) once finalization can begin.
    if (!acceptingMessages) {
      return;
    }
    if (watchdog && handlerSocketGeneration !== watchdog.currentSocketGeneration) {
      return;
    }

    try {
      const result = processor.processRawPayload(payload);
      watchdog?.recordRawMessage();
      if (result.expectedMarketMessage) {
        watchdog?.recordExpectedMarketMessage();
      }
    } catch (error) {
      errors.push(
        error instanceof Error ? error.message : "Failed to process WS payload",
      );
    }
  });

  transport.onClose(() => {
    if (plannedShutdown) {
      connection.connected = false;
      watchdog?.recordWebSocketClose();
      return;
    }

    connection.connected = false;
    connection.wsDisconnectCount += 1;
    watchdog?.recordWebSocketClose();
    watchdog?.notifyTransportClosedUnexpectedly();
  });

  transport.onError((error) => {
    errors.push(error.message);
  });

  for (const ticker of input.discovery.selectedMarketTickers) {
    subscribeMarket(ticker);
  }

  try {
    const initialGeneration = watchdog?.incrementSocketGeneration() ?? 1;
    await connectTransport(initialGeneration);
    watchdog?.markCaptureStarted();
  } catch (error) {
    // Initial handshake rejection (e.g. HTTP 401): return a structured
    // authentication-failure result WITHOUT starting BTC/rollover/watchdog
    // intervals. Close the failed transport so no socket keeps the process
    // alive, then finalize the processor. The orchestrator still drains the
    // writer, publishes health + terminal status, and releases the lock.
    shuttingDown = true;
    acceptingMessages = false;
    connection.connected = false;
    const failureMessage =
      error instanceof Error ? error.message : "Live WS capture failed";
    if (!errors.includes(failureMessage)) {
      errors.push(failureMessage);
    }
    plannedShutdown = true;
    try {
      transport.close();
    } catch {
      // ignore close errors on a rejected handshake socket
    }
    watchdog?.disable();
    processor.finalize();
    Object.assign(connection, {
      everConnected: false,
      completedNormally: false,
      liveConnectionSucceeded: false,
      completedWithWarnings: false,
      terminalFailureReason: null,
      captureEndReason: "authentication-failure" as const,
    });
    return {
      runId: input.runId,
      startedAt: input.startedAt,
      endedAt: input.io.now().toISOString(),
      paths,
      discovery: input.discovery,
      processor,
      connection,
      rollover,
      // BTC polling never started after a rejected handshake — do not report
      // a healthy BTC path for work that did not run.
      btcSpotStatus: input.config.captureBtcSpot ? "enabled" : "disabled",
      connected: false,
      wsUrl,
      authHeadersGenerated,
      errors,
      recordCounts: writer.counts,
      watchdog: watchdog?.toDiagnostics() ?? null,
      captureEndReason: "authentication-failure",
    };
  }

  const durationMs = input.config.durationMinutes * 60_000;
  const endAt = input.io.now().getTime() + durationMs;
  const setIntervalFn = input.io.setInterval ?? globalThis.setInterval.bind(globalThis);
  const clearIntervalFn = input.io.clearInterval ?? globalThis.clearInterval.bind(globalThis);

  const pollBtcSpot = async () => {
    if (!input.config.captureBtcSpot || !input.fetchBtcSpot) {
      return;
    }

    try {
      const spot = await input.fetchBtcSpot();
      const receivedAtLocal = input.io.now().toISOString();
      latestBtcSpot = {
        priceUsd: spot.price,
        receivedAtLocal,
        source: "coinbase",
      };
      writer.appendBtcSpot({
        runId: input.runId,
        source: "coinbase",
        receivedAtLocal,
        exchangeTimestampMs: Date.parse(spot.updatedAt),
        priceUsd: spot.price,
      });
      btcSpotStatus = "healthy";
      watchdog?.recordBtcActivity();
    } catch {
      btcSpotFailures += 1;
      btcSpotStatus = btcSpotFailures >= 3 ? "degraded" : "enabled";
    }
  };

  const runRolloverCheck = async () => {
    rollover.rolloverChecks += 1;
    const result = await discoverRolloverMarkets({
      seriesTicker: input.config.series,
      maxMarkets: input.config.maxMarkets,
      currentlySubscribed: [...subscribedTickers],
      fetchImpl: input.io.fetchImpl,
      now: input.io.now(),
    });

    if (shuttingDown) {
      // Discovery finished after shutdown began; do not mutate subscriptions.
      return;
    }

    rollover.marketsDiscovered = result.discovery.discoveredMarketCount;
    Object.assign(eventTickers, result.discovery.eventTickers);
    Object.assign(marketStatuses, result.discovery.marketStatuses);
    Object.assign(closeTimes, result.discovery.closeTimes);

    for (const ticker of result.newTickers) {
      subscribeMarket(ticker);
      rollover.rolloverSubscriptionsAdded += 1;
    }

    for (const ticker of result.closedTickers) {
      unsubscribeMarket(ticker);
      rollover.marketsClosed += 1;
    }
    watchdog?.recordSubscriptionSuccess(subscribedTickers.size);
  };

  const rolloverHandle = setIntervalFn(() => {
    // One check at a time; a rollover rejection must not escape the lifecycle.
    if (shuttingDown || activeRolloverCheck !== null) {
      return;
    }
    activeRolloverCheck = runRolloverCheck()
      .catch((error) => {
        errors.push(
          `Rollover market discovery failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      })
      .finally(() => {
        activeRolloverCheck = null;
      });
  }, input.config.rolloverCheckSeconds * 1_000);

  const btcHandle = input.config.captureBtcSpot
    ? setIntervalFn(() => {
      if (shuttingDown || activeBtcPoll !== null) {
        return;
      }
      activeBtcPoll = pollBtcSpot().finally(() => {
        activeBtcPoll = null;
      });
    }, 5_000)
    : null;

  const watchdogHandle = watchdog
    ? setIntervalFn(() => {
      if (shuttingDown || activeWatchdogTick !== null) {
        return;
      }
      activeWatchdogTick = watchdog
        .tick()
        .catch((error) => {
          errors.push(
            error instanceof Error ? error.message : "Watchdog tick failed",
          );
        })
        .finally(() => {
          activeWatchdogTick = null;
        });
    }, watchdogConfig.watchdogTickMs)
    : null;

  /**
   * Producer-quiescence phase: block new producer work, clear timers, await
   * in-flight BTC polls / rollover discoveries / watchdog ticks and any
   * outstanding watchdog recovery, stop accepting WebSocket messages, then
   * close the transport. Only after this completes may the orchestrator
   * begin writer finalization.
   */
  async function stopProducers(): Promise<void> {
    shuttingDown = true;
    clearIntervalFn(rolloverHandle);
    if (btcHandle !== null) {
      clearIntervalFn(btcHandle);
    }
    if (watchdogHandle !== null) {
      clearIntervalFn(watchdogHandle);
    }

    await Promise.allSettled([
      activeBtcPoll ?? Promise.resolve(),
      activeRolloverCheck ?? Promise.resolve(),
      activeWatchdogTick ?? Promise.resolve(),
    ]);

    await watchdog?.waitForRecovery();
    watchdog?.disable();

    acceptingMessages = false;
    plannedShutdown = true;
    try {
      transport.close();
    } catch {
      // ignore close errors on already-broken sockets
    }
    connection.connected = false;
  }

  try {
    if (input.config.captureBtcSpot) {
      await pollBtcSpot();
    }

    while (input.io.now().getTime() < endAt && !input.shouldStop?.()) {
      if (watchdog?.isTerminal) {
        captureEndReason = "terminal-websocket-failure";
        break;
      }
      if (writer.hasFailed()) {
        captureEndReason = "writer-failure";
        break;
      }
      processor.checkTimeouts();
      await sleep(250);
    }

    if (captureEndReason === "duration-complete" && writer.hasFailed()) {
      captureEndReason = "writer-failure";
    }

    if (captureEndReason === "duration-complete" && input.shouldStop?.()) {
      captureEndReason = "user-cancelled";
    }

    if (captureEndReason === "writer-failure") {
      const failure = writer.getFailure();
      const failureMessage = failure
        ? `Capture writer failed for ${failure.artifact}: ${failure.reason}`
        : "Capture writer failed";
      errors.push(failureMessage);
      writer.appendLifecycleEvent({
        runId: input.runId,
        type: "writerFailureDetected",
        detectedAt: input.io.now().toISOString(),
        artifact: failure?.artifact ?? null,
        errorMessage: failure?.reason ?? "Capture writer failed",
      });
    }
  } finally {
    // Producers are quiesced even when the capture loop throws, so an
    // exception can never leave timers or in-flight work racing the writer
    // finalization that the orchestrator performs next.
    await stopProducers();
    processor.finalize();
  }

  const watchdogDiagnostics = watchdog?.toDiagnostics() ?? null;
  const completedWithWarnings =
    (watchdogDiagnostics?.wsRecoverySuccessCount ?? 0) > 0
    || (watchdogDiagnostics?.wsStallDetectedCount ?? 0) > 0;
  const terminalFailureReason =
    captureEndReason === "terminal-websocket-failure"
      ? "kalshi-websocket-recovery-exhausted"
      : captureEndReason === "writer-failure"
        ? "capture-writer-failure"
        : null;

  Object.assign(connection, {
    everConnected: connection.wsConnectCount > 0,
    completedNormally:
      captureEndReason === "duration-complete"
      && connection.wsConnectCount > 0
      && processor.diagnostics.rawMessageCount > 0
      && terminalFailureReason === null,
    liveConnectionSucceeded:
      authHeadersGenerated
      && connection.wsConnectCount > 0
      && processor.diagnostics.rawMessageCount > 0,
    completedWithWarnings,
    terminalFailureReason,
    captureEndReason,
  });

  return {
    runId: input.runId,
    startedAt: input.startedAt,
    endedAt: input.io.now().toISOString(),
    paths,
    discovery: input.discovery,
    processor,
    connection,
    rollover,
    btcSpotStatus,
    connected: connection.wsConnectCount > 0,
    wsUrl,
    authHeadersGenerated,
    errors,
    recordCounts: writer.counts,
    watchdog: watchdogDiagnostics,
    captureEndReason,
  };
}
