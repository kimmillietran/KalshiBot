import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { performance } from "node:perf_hooks";

import { runForwardQuoteCapture } from "@/lib/data/live/forwardQuoteCapture";
import { createNodeForwardCaptureAppendStream } from "@/lib/data/live/forwardQuoteCapture/nodeForwardCaptureAppendStream";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import {
  formatStdoutOutput,
  mapCommandError,
  parseForwardQuoteCaptureConfigFromArgv,
  parseHtmlOutputPathFromArgv,
} from "./runForwardQuoteCaptureTypes";
import type { ForwardQuoteCaptureCommandIo } from "./runForwardQuoteCaptureTypes";

let shutdownRequested = false;

export function requestForwardCaptureShutdown(): void {
  shutdownRequested = true;
}

export function resetForwardCaptureShutdown(): void {
  shutdownRequested = false;
}

export async function runForwardQuoteCaptureCommand(
  argv: readonly string[],
  io: ForwardQuoteCaptureCommandIo,
): Promise<number> {
  try {
    const config = parseForwardQuoteCaptureConfigFromArgv(argv);
    const htmlOutputPath = parseHtmlOutputPathFromArgv(argv);

    const result = await runForwardQuoteCapture({
      config,
      htmlOutputPath,
      shouldStop: () => shutdownRequested,
      io: {
        readFile: io.readFile,
        writeFile: io.writeFile,
        appendFile: io.appendFile,
        mkdirSync: io.mkdirSync,
        createAppendStream: io.createAppendStream,
        renameFile: io.renameFile,
        createExclusiveFile: io.createExclusiveFile,
        deleteFile: io.deleteFile,
        now: () => new Date(),
        monotonicNowMs: () => performance.now(),
        fetchImpl: io.fetchImpl,
        setInterval: io.setInterval,
        clearInterval: io.clearInterval,
        setTimeout: io.setTimeout,
        clearTimeout: io.clearTimeout,
      },
    });

    io.writeStdout(
      formatStdoutOutput(
        stableStringify({
          runId: result.runId,
          verdict: result.healthReport.verdict,
          recommendedNextAction: result.healthReport.recommendedNextAction,
          credentialStatus: result.healthReport.credentialStatus,
          marketsSubscribed: result.healthReport.marketDiscovery.marketsSubscribed,
          rawMessageCount: result.healthReport.capture.rawMessageCount,
          topOfBookRecordCount: result.healthReport.capture.topOfBookRecordCount,
          btcSpotRecordCount: result.healthReport.capture.btcSpotRecordCount,
          sequenceGapCount: result.healthReport.orderbook.sequenceGapCount,
          reconnectCount: result.healthReport.connection.reconnectCount,
          captureEndReason: result.healthReport.connection.captureEndReason,
          terminalFailureReason: result.healthReport.connection.terminalFailureReason,
          htmlOutputPath: result.htmlOutputPath,
          outputDir: config.outputDir,
        }),
      ),
    );

    const endReason = result.healthReport.connection.captureEndReason;
    if (endReason === "user-cancelled") {
      // Conventional SIGINT exit code; the run drained gracefully and
      // published a user-cancelled status before we reach this point.
      return 130;
    }

    // Failed runs still emit structured stdout (runId/outputDir) above so the
    // smoke wrapper can identify the exact run. Exit nonzero for every
    // terminal failure reason, including an initial WebSocket handshake
    // rejection (authentication-failure).
    if (
      endReason === "terminal-websocket-failure"
      || endReason === "authentication-failure"
      || endReason === "writer-failure"
      || endReason === "unexpected-error"
      || result.healthReport.connection.terminalFailureReason !== null
    ) {
      return 1;
    }

    return 0;
  } catch (error) {
    io.writeStderr(`${mapCommandError(error)}\n`);
    return 1;
  }
}

function main(): void {
  process.on("SIGINT", () => {
    shutdownRequested = true;
  });

  const exitCodePromise = runForwardQuoteCaptureCommand(process.argv.slice(2), {
    readFile: (path) => readFileSync(path, "utf8").replace(/^\uFEFF/, ""),
    writeStdout: (text) => {
      process.stdout.write(text);
    },
    writeStderr: (text) => {
      process.stderr.write(text);
    },
    writeFile: (path, data) => {
      writeFileSync(path, data, "utf8");
    },
    appendFile: (path, data) => {
      appendFileSync(path, data, "utf8");
    },
    mkdirSync: (path, options) => {
      mkdirSync(path, options);
    },
    createAppendStream: createNodeForwardCaptureAppendStream,
    renameFile: (from, to) => {
      renameSync(from, to);
    },
    createExclusiveFile: (path, data) => {
      // "wx" fails when the file already exists — the atomic capture lock.
      writeFileSync(path, data, { encoding: "utf8", flag: "wx" });
    },
    deleteFile: (path) => {
      unlinkSync(path);
    },
    fetchImpl: fetch,
  });

  exitCodePromise.then((exitCode) => {
    process.exitCode = exitCode;
  });
}

if (process.env.VITEST !== "true") {
  main();
}
