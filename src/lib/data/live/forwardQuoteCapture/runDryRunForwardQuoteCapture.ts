import { KALSHI_WS_URL } from "@/features/market-data/orderbook/constants";

import { createEmptyConnectionDiagnostics } from "./connectionDiagnostics";
import { ForwardCaptureMessageProcessor } from "./forwardCaptureMessageProcessor";
import {
  createJsonlForwardCaptureWriter,
  createRunOutputPaths,
  type ForwardCaptureWriter,
} from "./jsonlForwardCaptureWriter";
import {
  createMockBtcSpotRecords,
  createMockForwardCaptureMessages,
} from "./mockForwardCaptureFeed";
import type {
  BtcSpotHealthStatus,
  ForwardCaptureConnectionDiagnostics,
  ForwardCaptureMarketDiscoveryResult,
  ForwardCaptureRolloverDiagnostics,
  ForwardQuoteCaptureConfig,
  ForwardQuoteCaptureIo,
} from "./forwardQuoteCaptureTypes";

export type DryRunForwardCaptureResult = {
  runId: string;
  startedAt: string;
  paths: ReturnType<typeof createRunOutputPaths>;
  discovery: ForwardCaptureMarketDiscoveryResult;
  processor: ForwardCaptureMessageProcessor;
  connection: ForwardCaptureConnectionDiagnostics;
  rollover: ForwardCaptureRolloverDiagnostics;
  btcSpotStatus: BtcSpotHealthStatus;
  wsUrl: string;
  authHeadersGenerated: boolean;
  connectionAttemptCount?: number;
  authHeaderGenerationCount?: number;
  errors: string[];
  recordCounts: {
    raw: number;
    topOfBook: number;
    btcSpot: number;
    marketMetadata: number;
  };
};

export function runDryRunForwardQuoteCapture(input: {
  runId: string;
  startedAt: string;
  config: ForwardQuoteCaptureConfig;
  discovery: ForwardCaptureMarketDiscoveryResult;
  io: ForwardQuoteCaptureIo;
  /** Pre-created buffered writer (owned by the orchestrator, which finalizes it). */
  writer?: ForwardCaptureWriter;
}): DryRunForwardCaptureResult {
  const paths = input.writer?.paths ?? createRunOutputPaths(input.config.outputDir, input.runId);
  const writer = input.writer ?? createJsonlForwardCaptureWriter(input.io, paths);
  const marketTicker =
    input.discovery.selectedMarketTickers[0] ?? `${input.config.series}-MOCK`;

  for (const ticker of input.discovery.selectedMarketTickers) {
    writer.appendMarketMetadata({
      runId: input.runId,
      recordedAtLocal: input.io.now().toISOString(),
      marketTicker: ticker,
      eventTicker: input.discovery.eventTickers[ticker] ?? null,
      seriesTicker: input.config.series,
      status: input.discovery.marketStatuses[ticker] ?? "mock",
      closeTime: input.discovery.closeTimes[ticker] ?? null,
      action: "subscribed",
    });
  }

  const processor = new ForwardCaptureMessageProcessor({
    runId: input.runId,
    seriesTicker: input.config.series,
    config: input.config,
    writer,
    eventTickers: input.discovery.eventTickers,
    now: input.io.now,
    monotonicNowMs: input.io.monotonicNowMs,
    getLatestBtcSpot: () => ({
      priceUsd: 62_500,
      receivedAtLocal: input.io.now().toISOString(),
      source: "coinbase",
    }),
  });

  for (const message of createMockForwardCaptureMessages(marketTicker)) {
    processor.processRawPayload(message);
  }

  let btcSpotStatus: BtcSpotHealthStatus = "disabled";
  if (input.config.captureBtcSpot) {
    btcSpotStatus = "healthy";
    for (const record of createMockBtcSpotRecords(input.runId)) {
      writer.appendBtcSpot(record);
    }
  }

  processor.finalize();

  return {
    runId: input.runId,
    startedAt: input.startedAt,
    paths,
    discovery: input.discovery,
    processor,
    connection: createEmptyConnectionDiagnostics(),
    rollover: {
      marketsDiscovered: input.discovery.discoveredMarketCount,
      marketsSubscribed: input.discovery.selectedMarketTickers.length,
      marketsClosed: 0,
      rolloverChecks: 0,
      rolloverSubscriptionsAdded: 0,
    },
    btcSpotStatus,
    wsUrl: KALSHI_WS_URL,
    authHeadersGenerated: false,
    connectionAttemptCount: 0,
    authHeaderGenerationCount: 0,
    errors: [],
    recordCounts: writer.counts,
  };
}
