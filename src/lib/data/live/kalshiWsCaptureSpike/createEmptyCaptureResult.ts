import { KalshiWsCaptureMessageProcessor } from "./kalshiWsCaptureMessageProcessor";
import type { KalshiCaptureMarketDiscoveryResult } from "./kalshiWsCaptureSpikeTypes";
import type { DryRunCaptureResult } from "./runDryRunKalshiWsCapture";
import { createRunOutputPaths } from "./jsonlCaptureWriter";
import type { BtcSpotCaptureStatus } from "./kalshiWsCaptureSpikeTypes";

export function createEmptyCaptureResult(input: {
  runId: string;
  outputDir: string;
  discovery: KalshiCaptureMarketDiscoveryResult;
  wsUrl: string | null;
  btcSpotStatus: BtcSpotCaptureStatus;
}): DryRunCaptureResult {
  const paths = createRunOutputPaths(input.outputDir, input.runId);
  const processor = new KalshiWsCaptureMessageProcessor({
    runId: input.runId,
    seriesTicker: input.discovery.seriesTicker,
    config: {
      series: input.discovery.seriesTicker,
      durationSeconds: 0,
      maxMarkets: 0,
      outputDir: input.outputDir,
      dryRun: false,
      captureBtcSpot: false,
      restSnapshotIntervalSeconds: null,
      mockInput: false,
    },
    writer: {
      appendRawMessage: () => {},
      appendTopOfBook: () => {},
      appendBtcSpot: () => {},
    },
    now: () => new Date(),
    monotonicNowMs: () => 0,
  });

  return {
    runId: input.runId,
    paths,
    discovery: input.discovery,
    processor,
    btcSpotStatus: input.btcSpotStatus,
    connected: false,
    wsUrl: input.wsUrl ?? "",
    recordCounts: { raw: 0, topOfBook: 0, btcSpot: 0 },
  };
}
