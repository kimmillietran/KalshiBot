import { KALSHI_WS_URL } from "@/features/market-data/orderbook/constants";
import { OrderbookSubscriptionManager } from "@/features/market-data/orderbook/OrderbookSubscriptionManager";
import type { KalshiWsTransport } from "@/features/market-data/orderbook/types";

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
import type {
  BtcSpotHealthStatus,
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
  };
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function resolveWsUrl(credentials: KalshiCaptureCredentials): string {
  return credentials.wsUrl ?? KALSHI_WS_URL;
}

export async function runLiveForwardQuoteCapture(input: {
  runId: string;
  startedAt: string;
  config: ForwardQuoteCaptureConfig;
  discovery: ForwardCaptureMarketDiscoveryResult;
  credentials: KalshiCaptureCredentials;
  io: ForwardQuoteCaptureIo;
  transport?: KalshiWsTransport;
  fetchBtcSpot?: () => Promise<{ price: number; updatedAt: string }>;
  shouldStop?: () => boolean;
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

  const eventTickers = { ...input.discovery.eventTickers };
  const marketStatuses = { ...input.discovery.marketStatuses };
  const closeTimes = { ...input.discovery.closeTimes };

  const transport = input.transport ?? new NodeKalshiAuthenticatedWsClient();
  const subscriptionManager = new OrderbookSubscriptionManager();
  let reconnectScheduled = false;

  const processor = new ForwardCaptureMessageProcessor({
    runId: input.runId,
    seriesTicker: input.config.series,
    config: input.config,
    writer,
    eventTickers,
    now: input.io.now,
    monotonicNowMs: input.io.monotonicNowMs,
    getLatestBtcSpot: () => latestBtcSpot,
    onSequenceGap: (marketTicker) => {
      processor.markResyncing(marketTicker);
      try {
        subscriptionManager.requestSnapshot(transport, marketTicker);
      } catch (error) {
        errors.push(
          error instanceof Error ? error.message : "Resync snapshot request failed",
        );
      }
    },
  });

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
    }
  }

  async function connectTransport(): Promise<void> {
    if (!authHeadersGenerated || !connectHeaders) {
      throw new Error("Missing authenticated WebSocket headers.");
    }

    await transport.connect(wsUrl, { headers: connectHeaders });
    connection.wsConnectCount += 1;
    connection.connected = true;

    for (const ticker of subscribedTickers) {
      subscriptionManager.subscribe(transport, ticker);
      subscriptionManager.requestSnapshot(transport, ticker);
    }
  }

  async function scheduleReconnect(): Promise<void> {
    if (reconnectScheduled || input.shouldStop?.()) {
      return;
    }

    reconnectScheduled = true;
    connection.reconnectCount += 1;

    await sleep(1_000);
    reconnectScheduled = false;

    if (input.shouldStop?.()) {
      return;
    }

    try {
      await connectTransport();
    } catch (error) {
      connection.connected = false;
      errors.push(error instanceof Error ? error.message : "Reconnect failed");
    }
  }

  transport.onMessage((payload) => {
    try {
      processor.processRawPayload(payload);
    } catch (error) {
      errors.push(
        error instanceof Error ? error.message : "Failed to process WS payload",
      );
    }
  });

  transport.onClose(() => {
    connection.connected = false;
    connection.wsDisconnectCount += 1;
    void scheduleReconnect();
  });

  transport.onError((error) => {
    errors.push(error.message);
  });

  for (const ticker of input.discovery.selectedMarketTickers) {
    subscribeMarket(ticker);
  }

  try {
    await connectTransport();
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
      connection,
      rollover,
      btcSpotStatus,
      connected: false,
      wsUrl,
      authHeadersGenerated,
      errors,
      recordCounts: writer.counts,
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
    })();
  }, input.config.rolloverCheckSeconds * 1_000);

  const btcHandle = input.config.captureBtcSpot
    ? setIntervalFn(() => {
      void pollBtcSpot();
    }, 5_000)
    : null;

  if (input.config.captureBtcSpot) {
    await pollBtcSpot();
  }

  while (input.io.now().getTime() < endAt && !input.shouldStop?.()) {
    await sleep(250);
  }

  clearIntervalFn(rolloverHandle);
  if (btcHandle !== null) {
    clearIntervalFn(btcHandle);
  }

  transport.close();
  connection.connected = false;
  processor.finalize();

  const connectionSemantics = {
    everConnected: connection.wsConnectCount > 0,
    completedNormally:
      connection.wsConnectCount > 0
      && processor.diagnostics.rawMessageCount > 0,
    liveConnectionSucceeded:
      authHeadersGenerated
      && connection.wsConnectCount > 0
      && processor.diagnostics.rawMessageCount > 0,
  };
  Object.assign(connection, connectionSemantics);

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
  };
}
