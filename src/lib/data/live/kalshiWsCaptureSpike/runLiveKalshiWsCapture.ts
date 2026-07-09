import { KALSHI_WS_URL } from "@/features/market-data/orderbook/constants";
import {
  KalshiOrderbookWsClient,
  MockKalshiWsTransport,
} from "@/features/market-data/orderbook/KalshiOrderbookWsClient";
import { OrderbookSubscriptionManager } from "@/features/market-data/orderbook/OrderbookSubscriptionManager";
import type { KalshiWsTransport } from "@/features/market-data/orderbook/types";

import { KalshiWsCaptureMessageProcessor } from "./kalshiWsCaptureMessageProcessor";
import {
  createJsonlCaptureWriter,
  createRunOutputPaths,
} from "./jsonlCaptureWriter";
import type {
  BtcSpotCaptureStatus,
  KalshiCaptureMarketDiscoveryResult,
  KalshiWsCaptureSpikeConfig,
  KalshiWsCaptureSpikeIo,
} from "./kalshiWsCaptureSpikeTypes";
import type { KalshiCaptureCredentials } from "./resolveKalshiCaptureCredentials";

export type LiveCaptureResult = {
  runId: string;
  paths: ReturnType<typeof createRunOutputPaths>;
  discovery: KalshiCaptureMarketDiscoveryResult;
  processor: KalshiWsCaptureMessageProcessor;
  btcSpotStatus: BtcSpotCaptureStatus;
  connected: boolean;
  wsUrl: string;
  errors: string[];
  recordCounts: { raw: number; topOfBook: number; btcSpot: number };
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function resolveWsUrl(credentials: KalshiCaptureCredentials): string {
  return credentials.wsUrl ?? KALSHI_WS_URL;
}

/** Attempts a short live Kalshi WS capture using injectable transport. */
export async function runLiveKalshiWsCapture(input: {
  runId: string;
  config: KalshiWsCaptureSpikeConfig;
  discovery: KalshiCaptureMarketDiscoveryResult;
  credentials: KalshiCaptureCredentials;
  io: KalshiWsCaptureSpikeIo;
  transport?: KalshiWsTransport;
  fetchBtcSpot?: () => Promise<{ price: number; updatedAt: string }>;
}): Promise<LiveCaptureResult> {
  const paths = createRunOutputPaths(input.config.outputDir, input.runId);
  const writer = createJsonlCaptureWriter(input.io, paths);
  const wsUrl = resolveWsUrl(input.credentials);
  const errors: string[] = [];

  const processor = new KalshiWsCaptureMessageProcessor({
    runId: input.runId,
    seriesTicker: input.config.series,
    config: input.config,
    writer,
    eventTickers: input.discovery.eventTickers,
    now: input.io.now,
    monotonicNowMs: input.io.monotonicNowMs,
  });

  const transport =
    input.transport
    ?? (typeof WebSocket !== "undefined"
      ? new KalshiOrderbookWsClient(WebSocket)
      : new KalshiOrderbookWsClient(MockKalshiWsTransport as unknown as typeof WebSocket));
  const subscriptionManager = new OrderbookSubscriptionManager();
  let connected = false;

  try {
    await transport.connect(wsUrl);
    connected = true;

    for (const ticker of input.discovery.selectedMarketTickers) {
      subscriptionManager.subscribe(transport, ticker);
      subscriptionManager.requestSnapshot(transport, ticker);
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

    await sleep(input.config.durationSeconds * 1_000);
  } catch (error) {
    connected = false;
    errors.push(error instanceof Error ? error.message : "Live WS capture failed");
  } finally {
    transport.close();
  }

  let btcSpotStatus: BtcSpotCaptureStatus = "disabled";
  if (input.config.captureBtcSpot) {
    if (input.fetchBtcSpot) {
      try {
        const spot = await input.fetchBtcSpot();
        writer.appendBtcSpot({
          runId: input.runId,
          source: "coinbase",
          receivedAtLocal: input.io.now().toISOString(),
          exchangeTimestampMs: Date.parse(spot.updatedAt),
          priceUsd: spot.price,
        });
        btcSpotStatus = "enabled";
      } catch (error) {
        btcSpotStatus = "unavailable";
        errors.push(
          error instanceof Error ? error.message : "BTC spot capture unavailable",
        );
      }
    } else {
      btcSpotStatus = "unavailable";
    }
  }

  processor.finalize();

  return {
    runId: input.runId,
    paths,
    discovery: input.discovery,
    processor,
    btcSpotStatus,
    connected,
    wsUrl,
    errors,
    recordCounts: writer.counts,
  };
}
