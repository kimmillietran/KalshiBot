import { KALSHI_WS_URL } from "@/features/market-data/orderbook/constants";

import { KalshiWsCaptureMessageProcessor } from "./kalshiWsCaptureMessageProcessor";
import {
  createJsonlCaptureWriter,
  createRunOutputPaths,
} from "./jsonlCaptureWriter";
import {
  createMockBtcSpotRecords,
  createMockKalshiWsCaptureMessages,
} from "./mockKalshiWsCaptureFeed";
import type {
  BtcSpotCaptureStatus,
  KalshiCaptureMarketDiscoveryResult,
  KalshiWsCaptureSpikeConfig,
  KalshiWsCaptureSpikeIo,
} from "./kalshiWsCaptureSpikeTypes";

export type DryRunCaptureResult = {
  runId: string;
  paths: ReturnType<typeof createRunOutputPaths>;
  discovery: KalshiCaptureMarketDiscoveryResult;
  processor: KalshiWsCaptureMessageProcessor;
  btcSpotStatus: BtcSpotCaptureStatus;
  connected: boolean;
  wsUrl: string;
  recordCounts: { raw: number; topOfBook: number; btcSpot: number };
};

export function runDryRunKalshiWsCapture(input: {
  runId: string;
  config: KalshiWsCaptureSpikeConfig;
  discovery: KalshiCaptureMarketDiscoveryResult;
  io: KalshiWsCaptureSpikeIo;
}): DryRunCaptureResult {
  const paths = createRunOutputPaths(input.config.outputDir, input.runId);
  const writer = createJsonlCaptureWriter(input.io, paths);
  const marketTicker =
    input.discovery.selectedMarketTickers[0] ?? `${input.config.series}-MOCK`;

  const processor = new KalshiWsCaptureMessageProcessor({
    runId: input.runId,
    seriesTicker: input.config.series,
    config: input.config,
    writer,
    eventTickers: input.discovery.eventTickers,
    now: input.io.now,
    monotonicNowMs: input.io.monotonicNowMs,
  });

  for (const message of createMockKalshiWsCaptureMessages(marketTicker)) {
    processor.processRawPayload(message);
  }

  let btcSpotStatus: BtcSpotCaptureStatus = "disabled";
  if (input.config.captureBtcSpot) {
    btcSpotStatus = "enabled";
    for (const record of createMockBtcSpotRecords(input.runId)) {
      writer.appendBtcSpot(record);
    }
  }

  processor.finalize();

  return {
    runId: input.runId,
    paths,
    discovery: input.discovery,
    processor,
    btcSpotStatus,
    connected: false,
    wsUrl: KALSHI_WS_URL,
    recordCounts: writer.counts,
  };
}
