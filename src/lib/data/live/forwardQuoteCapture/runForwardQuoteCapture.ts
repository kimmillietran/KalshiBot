import { join } from "node:path";

import { fetchBtcSpotPrice } from "@/features/btc-feed/api/btcServer";
import type { KalshiWsProbeTransport } from "@/features/market-data/orderbook/types";

import {
  buildForwardCaptureHealthReport,
  serializeForwardCaptureHealthReport,
} from "./buildForwardCaptureHealthReport";
import { acquireCaptureLock } from "./captureLock";
import {
  publishCaptureRunStatus,
  resolveTerminalCaptureRunState,
  writeCaptureArtifactAtomically,
  type CaptureRunLifecycleState,
} from "./captureRunStatus";
import { createEmptyConnectionDiagnostics } from "./connectionDiagnostics";
import { createEmptyOrderbookDiagnostics } from "./createEmptyOrderbookDiagnostics";
import { discoverCaptureMarkets } from "./discoverCaptureMarkets";
import {
  createJsonlForwardCaptureWriter,
  createRunOutputPaths,
  type ForwardCaptureWriterLimits,
} from "./jsonlForwardCaptureWriter";
import { resolveKalshiCaptureCredentials } from "@/lib/data/live/kalshiWsCaptureSpike";
import { runDryRunForwardQuoteCapture } from "./runDryRunForwardQuoteCapture";
import { runLiveForwardQuoteCapture } from "./runLiveForwardQuoteCapture";
import { serializeForwardQuoteCaptureHtml } from "./serializeForwardQuoteCaptureHtml";
import {
  DEFAULT_FORWARD_QUOTE_CAPTURE_HTML_PATH,
  type CaptureEndReason,
  type ForwardCaptureHealthReport,
  type ForwardCaptureMarketDiscoveryResult,
  type ForwardQuoteCaptureConfig,
  type ForwardQuoteCaptureIo,
} from "./forwardQuoteCaptureTypes";

export type ForwardQuoteCaptureRunResult = {
  runId: string;
  healthReport: ForwardCaptureHealthReport;
  htmlOutputPath: string;
};

function createRunId(now: Date): string {
  return now.toISOString().replaceAll(":", "-").replaceAll(".", "-");
}

export async function runForwardQuoteCapture(input: {
  config: ForwardQuoteCaptureConfig;
  io: ForwardQuoteCaptureIo;
  htmlOutputPath?: string;
  shouldStop?: () => boolean;
  /**
   * Deterministic-harness injection (M12.1F): overrides the environment used
   * for credential resolution so acceptance runs never read real process.env
   * credentials. Production callers omit this.
   */
  credentialEnv?: NodeJS.ProcessEnv;
  /**
   * Deterministic-harness injection (M12.1F): scripted WebSocket transport
   * forwarded to the live capture. Production callers omit this and get the
   * authenticated Node WebSocket client.
   */
  transport?: KalshiWsProbeTransport;
  /**
   * Deterministic-harness injection (M12.1F): overrides the buffered
   * writer's limits (e.g. a short drain-timeout) so no-drain scenarios can
   * be exercised quickly. Production callers omit this.
   */
  writerLimits?: Partial<ForwardCaptureWriterLimits>;
  /**
   * Validation-only (M12.1G): after the first valid top-of-book record,
   * request exactly one controlled socket recovery. Not exposed on the
   * ordinary capture CLI.
   */
  forceReconnectAfterFirstValidTopOfBook?: boolean;
}): Promise<ForwardQuoteCaptureRunResult> {
  const startedAt = input.io.now().toISOString();
  const runId = createRunId(input.io.now());
  const htmlOutputPath = input.htmlOutputPath ?? DEFAULT_FORWARD_QUOTE_CAPTURE_HTML_PATH;

  // The global capture lock is acquired atomically BEFORE any run artifact
  // (directory, writer, status) exists, and released only after terminal
  // status publication. Two concurrent starts can therefore never both
  // proceed, regardless of directory-scan preflights.
  const captureLock = acquireCaptureLock({
    io: input.io,
    outputDir: input.config.outputDir,
    runId,
  });

  try {
    return await runLockedForwardQuoteCapture({ ...input, startedAt, runId, htmlOutputPath });
  } finally {
    captureLock?.release();
  }
}

async function runLockedForwardQuoteCapture(input: {
  config: ForwardQuoteCaptureConfig;
  io: ForwardQuoteCaptureIo;
  htmlOutputPath: string;
  shouldStop?: () => boolean;
  credentialEnv?: NodeJS.ProcessEnv;
  transport?: KalshiWsProbeTransport;
  writerLimits?: Partial<ForwardCaptureWriterLimits>;
  forceReconnectAfterFirstValidTopOfBook?: boolean;
  startedAt: string;
  runId: string;
}): Promise<ForwardQuoteCaptureRunResult> {
  const { startedAt, runId, htmlOutputPath } = input;

  const paths = createRunOutputPaths(input.config.outputDir, runId);
  const writer = createJsonlForwardCaptureWriter(input.io, paths, {
    ...(input.writerLimits ? { limits: input.writerLimits } : {}),
  });

  function publishStatus(
    state: CaptureRunLifecycleState,
    detail: {
      endedAt?: string | null;
      captureEndReason?: CaptureEndReason | null;
      failureReason?: string | null;
    } = {},
  ): void {
    publishCaptureRunStatus(input.io, paths.captureRunStatusPath, {
      schemaVersion: 1,
      runId,
      state,
      startedAt,
      updatedAt: input.io.now().toISOString(),
      endedAt: detail.endedAt ?? null,
      captureEndReason: detail.captureEndReason ?? null,
      failureReason: detail.failureReason ?? null,
    });
  }

  publishStatus("active");

  // Everything after the run directory and "active" status exist is guarded:
  // a failure anywhere in credential resolution, discovery, capture execution,
  // writer finalization, or artifact publication must drain the writer and
  // leave a truthful terminal "failed" marker instead of stranding the run at
  // active/finalizing forever.
  try {
    const credentials = resolveKalshiCaptureCredentials({
      ...(input.credentialEnv ? { env: input.credentialEnv } : {}),
      readFile: input.io.readFile,
      privateKeyPathOverride: input.config.privateKeyPath,
    });

    const discovery = input.config.dryRun
      ? input.config.marketTicker
        ? await discoverCaptureMarkets({
          seriesTicker: input.config.series,
          maxMarkets: input.config.maxMarkets,
          marketTickerOverride: input.config.marketTicker,
          fetchImpl: input.io.fetchImpl,
          now: input.io.now(),
        })
        : ({
          attempted: true,
          succeeded: true,
          seriesTicker: input.config.series,
          discoveredMarketCount: 1,
          selectedMarketTickers: [`${input.config.series}-MOCK`],
          marketStatuses: { [`${input.config.series}-MOCK`]: "mock" },
          eventTickers: { [`${input.config.series}-MOCK`]: null },
          closeTimes: { [`${input.config.series}-MOCK`]: null },
          error: null,
        } satisfies ForwardCaptureMarketDiscoveryResult)
      : await discoverCaptureMarkets({
        seriesTicker: input.config.series,
        maxMarkets: input.config.maxMarkets,
        marketTickerOverride: input.config.marketTicker,
        fetchImpl: input.io.fetchImpl,
        now: input.io.now(),
      });

    let blockedBeforeCapture = false;
    let captureResult;
    if (input.config.dryRun) {
      captureResult = runDryRunForwardQuoteCapture({
        runId,
        startedAt,
        config: input.config,
        discovery,
        io: input.io,
        writer,
      });
    } else if (credentials.status !== "available") {
      blockedBeforeCapture = true;
      captureResult = {
        runId,
        startedAt,
        endedAt: input.io.now().toISOString(),
        paths,
        discovery,
        processor: {
          diagnostics: createEmptyOrderbookDiagnostics(),
          finalize: () => {},
        },
        connection: createEmptyConnectionDiagnostics(),
        rollover: {
          marketsDiscovered: discovery.discoveredMarketCount,
          marketsSubscribed: 0,
          marketsClosed: 0,
          rolloverChecks: 0,
          rolloverSubscriptionsAdded: 0,
        },
        btcSpotStatus: input.config.captureBtcSpot ? "degraded" : "disabled",
        connected: false,
        wsUrl: credentials.wsUrl,
        authHeadersGenerated: false,
        connectionAttemptCount: 0,
        authHeaderGenerationCount: 0,
        errors: ["Missing or invalid Kalshi credentials."],
        recordCounts: { raw: 0, topOfBook: 0, btcSpot: 0, marketMetadata: 0 },
      };
    } else if (!discovery.succeeded) {
      blockedBeforeCapture = true;
      captureResult = {
        runId,
        startedAt,
        endedAt: input.io.now().toISOString(),
        paths,
        discovery,
        processor: {
          diagnostics: createEmptyOrderbookDiagnostics(),
          finalize: () => {},
        },
        connection: createEmptyConnectionDiagnostics(),
        rollover: {
          marketsDiscovered: 0,
          marketsSubscribed: 0,
          marketsClosed: 0,
          rolloverChecks: 0,
          rolloverSubscriptionsAdded: 0,
        },
        btcSpotStatus: input.config.captureBtcSpot ? "degraded" : "disabled",
        connected: false,
        wsUrl: credentials.wsUrl,
        authHeadersGenerated: false,
        connectionAttemptCount: 0,
        authHeaderGenerationCount: 0,
        errors: [discovery.error ?? "Market discovery failed"],
        recordCounts: { raw: 0, topOfBook: 0, btcSpot: 0, marketMetadata: 0 },
      };
    } else {
      captureResult = await runLiveForwardQuoteCapture({
        runId,
        startedAt,
        config: input.config,
        discovery,
        credentials,
        io: input.io,
        writer,
        transport: input.transport,
        shouldStop: input.shouldStop,
        forceReconnectAfterFirstValidTopOfBook:
          input.forceReconnectAfterFirstValidTopOfBook,
        fetchBtcSpot: input.config.captureBtcSpot
          ? async () => {
            const response = await fetchBtcSpotPrice();
            return { price: response.price, updatedAt: response.updatedAt };
          }
          : undefined,
      });
    }

    const endedAt = "endedAt" in captureResult ? captureResult.endedAt : input.io.now().toISOString();
    let captureEndReason: CaptureEndReason | null =
      "captureEndReason" in captureResult
        ? (captureResult.captureEndReason as CaptureEndReason)
        : null;

    // Finalization ordering contract (M12.1E): producers are quiesced inside
    // the capture run; mark finalizing, drain and close all writer streams,
    // publish terminal health atomically, then (and only then) publish the
    // terminal run status atomically.
    publishStatus("finalizing", { captureEndReason });
    await writer.finalize();
    const writerDiagnostics = writer.diagnostics();

    // A writer failure discovered at any point — including one first detected
    // while draining or closing streams during finalization — must fail the
    // run everywhere: capture end reason, terminal failure reason, health
    // errors/verdict, run status, and (via terminalFailureReason) the CLI
    // exit code. Warnings alone are not enough.
    if (writerDiagnostics.failure !== null && !blockedBeforeCapture) {
      const failureMessage =
        `Capture writer failed for ${writerDiagnostics.failure.artifact}: `
        + writerDiagnostics.failure.reason;
      if (
        captureEndReason !== "terminal-websocket-failure"
        && captureEndReason !== "authentication-failure"
        && captureEndReason !== "unexpected-error"
      ) {
        captureEndReason = "writer-failure";
      }
      if (!captureResult.errors.includes(failureMessage)) {
        captureResult.errors.push(failureMessage);
      }
      Object.assign(captureResult.connection, {
        captureEndReason,
        terminalFailureReason:
          captureResult.connection.terminalFailureReason ?? "capture-writer-failure",
        completedNormally: false,
      });
    }

    const healthReport = buildForwardCaptureHealthReport({
      runId,
      generatedAt: input.io.now().toISOString(),
      startedAt,
      endedAt,
      config: input.config,
      credentials,
      discovery,
      captureResult: captureResult as Parameters<typeof buildForwardCaptureHealthReport>[0]["captureResult"],
      errors: captureResult.errors,
      writerDiagnostics,
    });

    writeCaptureArtifactAtomically(
      input.io,
      captureResult.paths.captureHealthPath,
      serializeForwardCaptureHealthReport(healthReport),
    );

    try {
      input.io.mkdirSync(join(htmlOutputPath, ".."), { recursive: true });
      input.io.writeFile(htmlOutputPath, serializeForwardQuoteCaptureHtml(healthReport));
    } catch (htmlError) {
      // The HTML report is a convenience artifact: its failure is recorded
      // visibly in the health report (republished atomically) but must not
      // strand the run at "finalizing" or fail an otherwise healthy capture.
      healthReport.warnings.push(
        `HTML report publication failed: ${
          htmlError instanceof Error ? htmlError.message : String(htmlError)
        }`,
      );
      writeCaptureArtifactAtomically(
        input.io,
        captureResult.paths.captureHealthPath,
        serializeForwardCaptureHealthReport(healthReport),
      );
    }

    const terminalState = resolveTerminalCaptureRunState({
      captureEndReason,
      hadFatalError: blockedBeforeCapture || writerDiagnostics.failure !== null,
    });
    publishStatus(terminalState, {
      endedAt,
      captureEndReason,
      failureReason:
        terminalState === "failed"
          ? writerDiagnostics.failure?.reason
            ?? healthReport.errors[0]
            ?? healthReport.connection.terminalFailureReason
            ?? null
          : null,
    });

    return { runId, healthReport, htmlOutputPath };
  } catch (error) {
    // Best-effort failure path: drain what we can and leave a truthful
    // terminal "failed" marker so tools never mistake this directory for an
    // active or completed run. Nothing here may mask the original error.
    try {
      publishStatus("finalizing", { captureEndReason: "unexpected-error" });
    } catch {
      // The status file may itself be unwritable; the thrown error remains.
    }
    try {
      await writer.finalize();
    } catch {
      // preserve the original error
    }
    try {
      publishStatus("failed", {
        endedAt: input.io.now().toISOString(),
        captureEndReason: "unexpected-error",
        failureReason: error instanceof Error ? error.message : "Forward quote capture failed",
      });
    } catch {
      // The status file may itself be unwritable; the thrown error remains.
    }
    throw error;
  }
}
