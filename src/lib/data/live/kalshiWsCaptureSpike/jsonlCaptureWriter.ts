import { posix } from "node:path";

import type { KalshiWsCaptureSpikeIo } from "./kalshiWsCaptureSpikeTypes";

export function createRunOutputPaths(outputDir: string, runId: string) {
  const runDir = posix.join(outputDir.replaceAll("\\", "/"), runId);
  return {
    runDir,
    rawMessagesPath: posix.join(runDir, "raw-messages.jsonl"),
    topOfBookPath: posix.join(runDir, "top-of-book.jsonl"),
    btcSpotPath: posix.join(runDir, "btc-spot.jsonl"),
    captureHealthPath: posix.join(runDir, "capture-health.json"),
  };
}

export function createJsonlCaptureWriter(
  io: KalshiWsCaptureSpikeIo,
  paths: ReturnType<typeof createRunOutputPaths>,
): {
  appendRawMessage: (record: unknown) => void;
  appendTopOfBook: (record: unknown) => void;
  appendBtcSpot: (record: unknown) => void;
  counts: { raw: number; topOfBook: number; btcSpot: number };
} {
  io.mkdirSync(paths.runDir, { recursive: true });

  const counts = { raw: 0, topOfBook: 0, btcSpot: 0 };

  return {
    counts,
    appendRawMessage(record) {
      io.appendFile(paths.rawMessagesPath, `${JSON.stringify(record)}\n`);
      counts.raw += 1;
    },
    appendTopOfBook(record) {
      io.appendFile(paths.topOfBookPath, `${JSON.stringify(record)}\n`);
      counts.topOfBook += 1;
    },
    appendBtcSpot(record) {
      io.appendFile(paths.btcSpotPath, `${JSON.stringify(record)}\n`);
      counts.btcSpot += 1;
    },
  };
}
