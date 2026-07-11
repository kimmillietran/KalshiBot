import { posix } from "node:path";

import type { ForwardQuoteCaptureIo } from "./forwardQuoteCaptureTypes";

export function createRunOutputPaths(outputDir: string, runId: string) {
  const runDir = posix.join(outputDir.replaceAll("\\", "/"), runId);
  return {
    runDir,
    rawKalshiWsPath: posix.join(runDir, "raw-kalshi-ws.jsonl"),
    topOfBookPath: posix.join(runDir, "top-of-book.jsonl"),
    btcSpotPath: posix.join(runDir, "btc-spot.jsonl"),
    marketMetadataPath: posix.join(runDir, "market-metadata.jsonl"),
    captureHealthPath: posix.join(runDir, "capture-health.json"),
    captureLifecyclePath: posix.join(runDir, "capture-lifecycle.jsonl"),
  };
}

export function createJsonlForwardCaptureWriter(
  io: ForwardQuoteCaptureIo,
  paths: ReturnType<typeof createRunOutputPaths>,
) {
  io.mkdirSync(paths.runDir, { recursive: true });

  const counts = {
    raw: 0,
    topOfBook: 0,
    btcSpot: 0,
    marketMetadata: 0,
    lifecycle: 0,
  };

  return {
    paths,
    counts,
    appendRawKalshiWs(record: unknown) {
      io.appendFile(paths.rawKalshiWsPath, `${JSON.stringify(record)}\n`);
      counts.raw += 1;
    },
    appendTopOfBook(record: unknown) {
      io.appendFile(paths.topOfBookPath, `${JSON.stringify(record)}\n`);
      counts.topOfBook += 1;
    },
    appendBtcSpot(record: unknown) {
      io.appendFile(paths.btcSpotPath, `${JSON.stringify(record)}\n`);
      counts.btcSpot += 1;
    },
    appendMarketMetadata(record: unknown) {
      io.appendFile(paths.marketMetadataPath, `${JSON.stringify(record)}\n`);
      counts.marketMetadata += 1;
    },
    appendLifecycleEvent(record: unknown) {
      io.appendFile(paths.captureLifecyclePath, `${JSON.stringify(record)}\n`);
      counts.lifecycle += 1;
    },
  };
}

export type ForwardCaptureWriter = ReturnType<typeof createJsonlForwardCaptureWriter>;
