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
  ForwardCaptureMessageProcessor,
  type LatestBtcSpot,
} from "./forwardCaptureMessageProcessor";
import {
  createJsonlForwardCaptureWriter,
  createRunOutputPaths,
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
  transport?: KalshiWsProbeTransport;
  fetchBtcSpot?: () => Promise<{ price: number; updatedAt: string }>;
  shouldStop?: () => boolean;
  onLog?: (message: string) => void;
}): Promise<LiveForwardCaptureResult> {
  const paths = createRunOutputPaths(input.config.outputDir, input.runId);
  const writer = createJsonlForwardCaptureWriter(input.io, paths);
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

  const eventTickers = { ...input.discovery.eventTickers };
  const marketStatuses = { ...input.discovery.marketStatuses };
  const closeTimes = { ...input.discovery.closeTimes };

  const transport = input.transport ?? new NodeKalshiAuthenticatedWsClient();
  const subscriptionManager = new OrderbookSubscriptionManager();
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
    onSequenceGap: (marketTicker) => {
      processorRef.markResyncing(marketTicker);
      try {
        subscriptionManager.requestSnapshot(transport, marketTicker);
      } catch (error) {
        errors.push(
          error instanceof Error ? error.message : "Resync snapshot request failed",
        );
      }
    },
  });
  const processorRef = processor;

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
        const rawBeforeRecovery = processor.diagnostics.rawMessageCount;
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
          if (processor.diagnostics.rawMessageCount > rawBeforeRecovery) {
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
          reason: "no-application-messages-after-recovery",
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

  function subscribeMarket(ticker: string): void {
    if (subscribedTickers.has(ticker)) {
      return;
    }

    subscribedTickers.add(ticker);
    rollover.marketsSubscribed += 1;
    appendMarketMetadata(ticker, "subscribed");

    if (connection.connected) {
      subscriptionManager.subscribe(transport, ticker);
      subscriptionManager.requestSnapshot(transport, ticker);
      watchdog?.recordSubscriptionSuccess(subscribedTickers.size);
    }
  }

  async function connectTransport(socketGeneration: number): Promise<void> {
    if (!authHeadersGenerated || !connectHeaders) {
      throw new Error("Missing authenticated WebSocket headers.");
    }

    handlerSocketGeneration = socketGeneration;
    await transport.connect(wsUrl, { headers: connectHeaders });
    connection.wsConnectCount += 1;
    connection.connected = true;
    watchdog?.recordWebSocketOpen();

    for (const ticker of subscribedTickers) {
      subscriptionManager.subscribe(transport, ticker);
      subscriptionManager.requestSnapshot(transport, ticker);
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
    if (watchdog && handlerSocketGeneration !== watchdog.currentSocketGeneration) {
      return;
    }

    try {
      processor.processRawPayload(payload);
      watchdog?.recordRawMessage();
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
    connection.connected = false;
    errors.push(error instanceof Error ? error.message : "Live WS capture failed");
    processor.finalize();
    return {
      runId: input.runId,
      startedAt: input.startedAt,
      endedAt: input.io.now().toISOString(),
      paths,
      discovery: input.discovery,
      processor,
      connection: {
        ...connection,
        captureEndReason: "authentication-failure",
      },
      rollover,
      btcSpotStatus,
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

  const rolloverHandle = setIntervalFn(() => {
    void (async () => {
      rollover.rolloverChecks += 1;
      const result = await discoverRolloverMarkets({
        seriesTicker: input.config.series,
        maxMarkets: input.config.maxMarkets,
        currentlySubscribed: [...subscribedTickers],
        fetchImpl: input.io.fetchImpl,
        now: input.io.now(),
      });

      rollover.marketsDiscovered = result.discovery.discoveredMarketCount;
      Object.assign(eventTickers, result.discovery.eventTickers);
      Object.assign(marketStatuses, result.discovery.marketStatuses);
      Object.assign(closeTimes, result.discovery.closeTimes);

      for (const ticker of result.newTickers) {
        subscribeMarket(ticker);
        rollover.rolloverSubscriptionsAdded += 1;
      }

      for (const ticker of result.closedTickers) {
        processor.markMarketClosed(ticker);
        rollover.marketsClosed += 1;
        appendMarketMetadata(ticker, "closed");
        subscribedTickers.delete(ticker);
      }
      watchdog?.recordSubscriptionSuccess(subscribedTickers.size);
    })();
  }, input.config.rolloverCheckSeconds * 1_000);

  const btcHandle = input.config.captureBtcSpot
    ? setIntervalFn(() => {
      void pollBtcSpot();
    }, 5_000)
    : null;

  const watchdogHandle = watchdog
    ? setIntervalFn(() => {
      void watchdog.tick();
    }, watchdogConfig.watchdogTickMs)
    : null;

  if (input.config.captureBtcSpot) {
    await pollBtcSpot();
  }

  while (input.io.now().getTime() < endAt && !input.shouldStop?.()) {
    if (watchdog?.isTerminal) {
      captureEndReason = "terminal-websocket-failure";
      break;
    }
    await sleep(250);
  }

  if (input.shouldStop?.()) {
    captureEndReason = "user-cancelled";
  }

  clearIntervalFn(rolloverHandle);
  if (btcHandle !== null) {
    clearIntervalFn(btcHandle);
  }
  if (watchdogHandle !== null) {
    clearIntervalFn(watchdogHandle);
  }

  await watchdog?.waitForRecovery();
  watchdog?.disable();
  plannedShutdown = true;
  transport.close();
  connection.connected = false;
  processor.finalize();

  const watchdogDiagnostics = watchdog?.toDiagnostics() ?? null;
  const completedWithWarnings =
    (watchdogDiagnostics?.wsRecoverySuccessCount ?? 0) > 0
    || (watchdogDiagnostics?.wsStallDetectedCount ?? 0) > 0;
  const terminalFailureReason =
    captureEndReason === "terminal-websocket-failure"
      ? "kalshi-websocket-recovery-exhausted"
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
