import { join } from "node:path";

import { fetchBtcSpotPrice } from "@/features/btc-feed/api/btcServer";

import {
  buildForwardCaptureHealthReport,
  serializeForwardCaptureHealthReport,
} from "./buildForwardCaptureHealthReport";
import {
  publishCaptureRunStatus,
  resolveTerminalCaptureRunState,
  writeCaptureArtifactAtomically,
  type CaptureRunLifecycleState,
} from "./captureRunStatus";
import { createEmptyConnectionDiagnostics } from "./connectionDiagnostics";
import { createEmptyOrderbookDiagnostics } from "./createEmptyOrderbookDiagnostics";
import { discoverCaptureMarkets } from "./discoverCaptureMarkets";
import { createJsonlForwardCaptureWriter, createRunOutputPaths } from "./jsonlForwardCaptureWriter";
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
}): Promise<ForwardQuoteCaptureRunResult> {
  const startedAt = input.io.now().toISOString();
  const runId = createRunId(input.io.now());
  const htmlOutputPath = input.htmlOutputPath ?? DEFAULT_FORWARD_QUOTE_CAPTURE_HTML_PATH;

  const paths = createRunOutputPaths(input.config.outputDir, runId);
  const writer = createJsonlForwardCaptureWriter(input.io, paths);

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

  const credentials = resolveKalshiCaptureCredentials({
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
  try {
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
        shouldStop: input.shouldStop,
        fetchBtcSpot: input.config.captureBtcSpot
          ? async () => {
            const response = await fetchBtcSpotPrice();
            return { price: response.price, updatedAt: response.updatedAt };
          }
          : undefined,
      });
    }
  } catch (error) {
    // Unexpected capture crash: drain what we can and leave a truthful
    // terminal marker so tools never mistake this directory for an active or
    // completed run. Health publication is not possible without a result.
    publishStatus("finalizing", { captureEndReason: "unexpected-error" });
    try {
      await writer.finalize();
    } catch {
      // preserve the original error
    }
    publishStatus("failed", {
      endedAt: input.io.now().toISOString(),
      captureEndReason: "unexpected-error",
      failureReason: error instanceof Error ? error.message : "Forward quote capture failed",
    });
    throw error;
  }

  const endedAt = "endedAt" in captureResult ? captureResult.endedAt : input.io.now().toISOString();
  const captureEndReason: CaptureEndReason | null =
    "captureEndReason" in captureResult
      ? (captureResult.captureEndReason as CaptureEndReason)
      : null;

  // Finalization ordering contract (M12.1E): intervals and recovery already
  // stopped inside the capture run; mark finalizing, drain and close all
  // writer streams, publish terminal health atomically, then (and only then)
  // publish the terminal run status atomically.
  publishStatus("finalizing", { captureEndReason });
  await writer.finalize();
  const writerDiagnostics = writer.diagnostics();

  const healthReport = buildForwardCaptureHealthReport({
    runId,
    generatedAt: input.io.now().toISOString(),
    startedAt,
    endedAt,
    config: input.config,
    credentials,
    discovery,
    captureResult: captureResult as Parameters<typeof buildForwardCaptureHealthReport>[0]["captureResult"],
    errors: "errors" in captureResult ? captureResult.errors : [],
    writerDiagnostics,
  });

  writeCaptureArtifactAtomically(
    input.io,
    captureResult.paths.captureHealthPath,
    serializeForwardCaptureHealthReport(healthReport),
  );
  input.io.mkdirSync(join(htmlOutputPath, ".."), { recursive: true });
  input.io.writeFile(htmlOutputPath, serializeForwardQuoteCaptureHtml(healthReport));

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
}
