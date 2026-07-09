import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

import { runKalshiWsCaptureSpike } from "@/lib/data/live/kalshiWsCaptureSpike";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import { normalizeKalshiWsCaptureSpikeArgv } from "../lib/cliArgvSchemas";

import {
  formatStdoutOutput,
  KalshiWsCaptureSpikeCommandError,
  parseCaptureSpikeConfigFromArgv,
  parseHtmlOutputPathFromArgv,
} from "./runKalshiWsCaptureSpikeTypes";
import type { KalshiWsCaptureSpikeCommandIo } from "./runKalshiWsCaptureSpikeTypes";

function mapCommandError(error: unknown): string {
  if (error instanceof KalshiWsCaptureSpikeCommandError) {
    return error.message;
  }

  return error instanceof Error ? error.message : "Kalshi WS capture spike failed";
}

export async function runKalshiWsCaptureSpikeCommand(
  argv: readonly string[],
  io: KalshiWsCaptureSpikeCommandIo,
): Promise<number> {
  try {
    const normalizedArgv = normalizeKalshiWsCaptureSpikeArgv(argv);
    let config = parseCaptureSpikeConfigFromArgv(normalizedArgv);
    const htmlOutputPath = parseHtmlOutputPathFromArgv(normalizedArgv);

    const result = await runKalshiWsCaptureSpike({
      config,
      htmlOutputPath,
      io: {
        readFile: io.readFile,
        writeFile: io.writeFile,
        appendFile: io.appendFile,
        mkdirSync: io.mkdirSync,
        now: () => new Date(),
        monotonicNowMs: () => performance.now(),
        fetchImpl: io.fetchImpl,
      },
    });

    io.writeStdout(
      formatStdoutOutput(
        stableStringify({
          runId: result.runId,
          verdict: result.healthReport.verdict,
          recommendedNextAction: result.healthReport.recommendedNextAction,
          credentialStatus: result.healthReport.connection.credentialStatus,
          messagesReceived: result.healthReport.capture.messagesReceived,
          topOfBookRecords: result.healthReport.orderbook.validTopOfBookRecords,
          sequenceGapCount: result.healthReport.orderbook.sequenceGapCount,
          htmlOutputPath: result.htmlOutputPath,
          outputDir: config.outputDir,
        }),
      ),
    );

    return 0;
  } catch (error) {
    io.writeStderr(`${mapCommandError(error)}\n`);
    return 1;
  }
}

function main(): void {
  const exitCodePromise = runKalshiWsCaptureSpikeCommand(process.argv.slice(2), {
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
    fetchImpl: fetch,
  });

  exitCodePromise.then((exitCode) => {
    process.exitCode = exitCode;
  });
}

if (process.env.VITEST !== "true") {
  main();
}
