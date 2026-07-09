import { join } from "node:path";

import { fetchBtcSpotPrice } from "@/features/btc-feed/api/btcServer";

import {
  buildForwardCaptureHealthReport,
  serializeForwardCaptureHealthReport,
} from "./buildForwardCaptureHealthReport";
import { createEmptyConnectionDiagnostics } from "./connectionDiagnostics";
import { discoverCaptureMarkets } from "./discoverCaptureMarkets";
import { createJsonlForwardCaptureWriter, createRunOutputPaths } from "./jsonlForwardCaptureWriter";
import { resolveKalshiCaptureCredentials } from "@/lib/data/live/kalshiWsCaptureSpike";
import { runDryRunForwardQuoteCapture } from "./runDryRunForwardQuoteCapture";
import { runLiveForwardQuoteCapture } from "./runLiveForwardQuoteCapture";
import { serializeForwardQuoteCaptureHtml } from "./serializeForwardQuoteCaptureHtml";
import {
  DEFAULT_FORWARD_QUOTE_CAPTURE_HTML_PATH,
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

  let captureResult;
  if (input.config.dryRun) {
    captureResult = runDryRunForwardQuoteCapture({
      runId,
      startedAt,
      config: input.config,
      discovery,
      io: input.io,
    });
  } else if (credentials.status !== "available") {
    const paths = createRunOutputPaths(input.config.outputDir, runId);
    createJsonlForwardCaptureWriter(input.io, paths);
    captureResult = {
      runId,
      startedAt,
      endedAt: input.io.now().toISOString(),
      paths,
      discovery,
      processor: {
        diagnostics: {
          rawMessageCount: 0,
          snapshotsReceived: 0,
          deltasReceived: 0,
          unknownMessagesReceived: 0,
          sequenceGapCount: 0,
          outOfOrderCount: 0,
          resyncAttemptCount: 0,
          resyncSuccessCount: 0,
          validTopOfBookRecords: 0,
          marketsWithValidBook: 0,
          marketsAwaitingSnapshot: 0,
          validBookStateDurationMs: 0,
          invalidBookStateDurationMs: 0,
        },
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
    const paths = createRunOutputPaths(input.config.outputDir, runId);
    createJsonlForwardCaptureWriter(input.io, paths);
    captureResult = {
      runId,
      startedAt,
      endedAt: input.io.now().toISOString(),
      paths,
      discovery,
      processor: {
        diagnostics: {
          rawMessageCount: 0,
          snapshotsReceived: 0,
          deltasReceived: 0,
          unknownMessagesReceived: 0,
          sequenceGapCount: 0,
          outOfOrderCount: 0,
          resyncAttemptCount: 0,
          resyncSuccessCount: 0,
          validTopOfBookRecords: 0,
          marketsWithValidBook: 0,
          marketsAwaitingSnapshot: 0,
          validBookStateDurationMs: 0,
          invalidBookStateDurationMs: 0,
        },
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
      shouldStop: input.shouldStop,
      fetchBtcSpot: input.config.captureBtcSpot
        ? async () => {
          const response = await fetchBtcSpotPrice();
          return { price: response.price, updatedAt: response.updatedAt };
        }
        : undefined,
    });
  }

  const endedAt = "endedAt" in captureResult ? captureResult.endedAt : input.io.now().toISOString();
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
  });

  input.io.writeFile(
    captureResult.paths.captureHealthPath,
    serializeForwardCaptureHealthReport(healthReport),
  );
  input.io.mkdirSync(join(htmlOutputPath, ".."), { recursive: true });
  input.io.writeFile(htmlOutputPath, serializeForwardQuoteCaptureHtml(healthReport));

  return { runId, healthReport, htmlOutputPath };
}
