/**
 * M12.1G: bounded live reconnect validation capture.
 *
 * Runs the canonical capture path with forceReconnectAfterFirstValidTopOfBook
 * so a controlled socket recovery is exercised once after the first valid
 * top-of-book. Duration is intentionally smoke-bounded (15–20 minutes) —
 * this command never starts an eight-hour capture.
 *
 * Not exposed on the ordinary runForwardQuoteCapture CLI.
 */
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
  ForwardQuoteCaptureCommandError,
} from "./runForwardQuoteCaptureTypes";
import type { ForwardQuoteCaptureCommandIo } from "./runForwardQuoteCaptureTypes";

const SMOKE_DURATION_MIN = 15;
const SMOKE_DURATION_MAX = 20;

let shutdownRequested = false;

export function requestReconnectValidationShutdown(): void {
  shutdownRequested = true;
}

export function resetReconnectValidationShutdown(): void {
  shutdownRequested = false;
}

export async function runReconnectValidationCaptureCommand(
  argv: readonly string[],
  io: ForwardQuoteCaptureCommandIo,
): Promise<number> {
  try {
    // Fail closed before any capture startup: validation must exercise the
    // production watchdog recovery path. Do not create a run directory,
    // acquire a lock, or contact transport when the watchdog is disabled.
    if (argv.includes("--disable-ws-watchdog")) {
      throw new ForwardQuoteCaptureCommandError(
        "Reconnect validation requires the WebSocket watchdog; "
          + "--disable-ws-watchdog is not allowed.",
      );
    }

    const config = parseForwardQuoteCaptureConfigFromArgv(argv);
    if (
      config.durationMinutes < SMOKE_DURATION_MIN
      || config.durationMinutes > SMOKE_DURATION_MAX
    ) {
      throw new ForwardQuoteCaptureCommandError(
        `Reconnect validation duration must be between ${SMOKE_DURATION_MIN} and ${SMOKE_DURATION_MAX} minutes `
          + `(got ${config.durationMinutes}). This command never starts an eight-hour capture.`,
      );
    }

    if (config.wsWatchdogEnabled !== true) {
      throw new ForwardQuoteCaptureCommandError(
        "Reconnect validation requires wsWatchdogEnabled=true.",
      );
    }

    const htmlOutputPath = parseHtmlOutputPathFromArgv(argv);

    const result = await runForwardQuoteCapture({
      config,
      htmlOutputPath,
      shouldStop: () => shutdownRequested,
      forceReconnectAfterFirstValidTopOfBook: true,
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

    const endReason = result.healthReport.connection.captureEndReason;
    const controlled = result.controlledReconnectValidation;
    const controlledSucceeded =
      controlled?.succeeded === true
      && controlled.acceptedRequestCount === 1
      && controlled.attemptCount >= 1
      && controlled.failed === false
      && controlled.recoveryReason === "controlled-reconnect-validation"
      && typeof controlled.recoveryCycleId === "number"
      && controlled.recoveryCycleId >= 1;

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
          reconnectCount: result.healthReport.connection.reconnectCount,
          wsRecoverySuccessCount:
            result.healthReport.watchdog?.wsRecoverySuccessCount ?? 0,
          wsRecoveryFailureCount:
            result.healthReport.watchdog?.wsRecoveryFailureCount ?? 0,
          terminalWebSocketFailure:
            result.healthReport.watchdog?.terminalWebSocketFailure ?? false,
          connectionAttemptCount:
            result.healthReport.connection.connectionAttemptCount,
          authHeaderGenerationCount:
            result.healthReport.connection.authHeaderGenerationCount,
          captureEndReason: result.healthReport.connection.captureEndReason,
          terminalFailureReason: result.healthReport.connection.terminalFailureReason,
          htmlOutputPath: result.htmlOutputPath,
          outputDir: config.outputDir,
          forceReconnectAfterFirstValidTopOfBook: true,
          controlledReconnectValidation: controlled,
          controlledReconnectSucceeded: controlledSucceeded,
        }),
      ),
    );

    if (endReason === "user-cancelled") {
      return 130;
    }

    if (
      endReason === "terminal-websocket-failure"
      || endReason === "authentication-failure"
      || endReason === "writer-failure"
      || endReason === "unexpected-error"
      || result.healthReport.connection.terminalFailureReason !== null
      || !controlledSucceeded
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

  const exitCodePromise = runReconnectValidationCaptureCommand(
    process.argv.slice(2),
    {
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
        writeFileSync(path, data, { encoding: "utf8", flag: "wx" });
      },
      deleteFile: (path) => {
        unlinkSync(path);
      },
      fetchImpl: fetch,
    },
  );

  exitCodePromise.then((exitCode) => {
    process.exitCode = exitCode;
  });
}

if (process.env.VITEST !== "true") {
  main();
}
