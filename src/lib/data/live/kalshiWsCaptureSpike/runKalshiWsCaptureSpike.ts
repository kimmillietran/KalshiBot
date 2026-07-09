import { join } from "node:path";

import { fetchBtcSpotPrice } from "@/features/btc-feed/api/btcServer";

import {
  buildCaptureHealthReport,
  serializeCaptureHealthReport,
} from "./buildCaptureHealthReport";
import { createEmptyCaptureResult } from "./createEmptyCaptureResult";
import { discoverKalshiCaptureMarkets } from "./discoverKalshiCaptureMarkets";
import {
  createJsonlCaptureWriter,
  createRunOutputPaths,
} from "./jsonlCaptureWriter";
import { resolveKalshiCaptureCredentials } from "./resolveKalshiCaptureCredentials";
import { runDryRunKalshiWsCapture } from "./runDryRunKalshiWsCapture";
import { runLiveKalshiWsCapture } from "./runLiveKalshiWsCapture";
import { serializeKalshiWsCaptureSpikeHtml } from "./serializeKalshiWsCaptureSpikeHtml";
import type {
  KalshiCaptureMarketDiscoveryResult,
  KalshiWsCaptureHealthReport,
  KalshiWsCaptureSpikeConfig,
  KalshiWsCaptureSpikeDeps,
  KalshiWsCaptureSpikeIo,
} from "./kalshiWsCaptureSpikeTypes";
import { DEFAULT_KALSHI_WS_CAPTURE_SPIKE_HTML_PATH } from "./kalshiWsCaptureSpikeTypes";

export type KalshiWsCaptureSpikeRunResult = {
  runId: string;
  healthReport: KalshiWsCaptureHealthReport;
  htmlOutputPath: string;
};

function createRunId(now: Date): string {
  return now.toISOString().replaceAll(":", "-").replaceAll(".", "-");
}

function createBlockedDiscoveryResult(input: {
  seriesTicker: string;
  error: string;
}): KalshiCaptureMarketDiscoveryResult {
  return {
    attempted: true,
    succeeded: false,
    seriesTicker: input.seriesTicker,
    discoveredMarketCount: 0,
    selectedMarketTickers: [],
    marketStatuses: {},
    eventTickers: {},
    closeTimes: {},
    error: input.error,
  };
}

/** Orchestrates the Kalshi WS capture spike run. */
export async function runKalshiWsCaptureSpike(input: {
  config: KalshiWsCaptureSpikeConfig;
  io: KalshiWsCaptureSpikeIo;
  htmlOutputPath?: string;
  deps?: KalshiWsCaptureSpikeDeps;
}): Promise<KalshiWsCaptureSpikeRunResult> {
  const generatedAt = input.io.now().toISOString();
  const runId = createRunId(input.io.now());
  const htmlOutputPath = input.htmlOutputPath ?? DEFAULT_KALSHI_WS_CAPTURE_SPIKE_HTML_PATH;
  const resolveCredentials =
    input.deps?.resolveCredentials ?? resolveKalshiCaptureCredentials;
  const discoverMarkets = input.deps?.discoverMarkets ?? discoverKalshiCaptureMarkets;
  const runDryRun = input.deps?.runDryRunCapture ?? runDryRunKalshiWsCapture;
  const runLive = input.deps?.runLiveCapture ?? runLiveKalshiWsCapture;
  const fetchBtcSpot =
    input.deps?.fetchBtcSpot
    ?? (async () => {
      const response = await fetchBtcSpotPrice();
      return { price: response.price, updatedAt: response.updatedAt };
    });

  const credentials = resolveCredentials({
    readFile: input.io.readFile,
    privateKeyPathOverride: input.config.privateKeyPath,
  });

  const discovery = input.config.dryRun
    ? input.config.marketTicker
      ? await discoverMarkets({
          seriesTicker: input.config.series,
          maxMarkets: input.config.maxMarkets,
          marketTickerOverride: input.config.marketTicker,
          fetchImpl: input.io.fetchImpl,
          now: input.io.now(),
        })
      : {
          attempted: true,
          succeeded: true,
          seriesTicker: input.config.series,
          discoveredMarketCount: 1,
          selectedMarketTickers: [`${input.config.series}-MOCK`],
          marketStatuses: { [`${input.config.series}-MOCK`]: "mock" },
          eventTickers: { [`${input.config.series}-MOCK`]: null },
          closeTimes: { [`${input.config.series}-MOCK`]: null },
          error: null,
        }
    : await discoverMarkets({
        seriesTicker: input.config.series,
        maxMarkets: input.config.maxMarkets,
        marketTickerOverride: input.config.marketTicker,
        fetchImpl: input.io.fetchImpl,
        now: input.io.now(),
      });

  if (input.config.dryRun) {
    const captureResult = runDryRun({
      runId,
      config: input.config,
      discovery,
      io: input.io,
    });
    const healthReport = buildCaptureHealthReport({
      runId,
      generatedAt,
      config: input.config,
      credentials,
      discovery,
      captureResult,
      liveConnectionAttempted: false,
      recordCounts: captureResult.recordCounts,
    });
    input.io.writeFile(captureResult.paths.captureHealthPath, serializeCaptureHealthReport(healthReport));
    input.io.mkdirSync(join(htmlOutputPath, ".."), { recursive: true });
    input.io.writeFile(htmlOutputPath, serializeKalshiWsCaptureSpikeHtml(healthReport));
    return { runId, healthReport, htmlOutputPath };
  }

  if (credentials.status !== "available") {
    const paths = createRunOutputPaths(input.config.outputDir, runId);
    createJsonlCaptureWriter(input.io, paths);
    const blockedDiscovery = discovery.succeeded
      ? discovery
      : createBlockedDiscoveryResult({
          seriesTicker: input.config.series,
          error: discovery.error ?? "Market discovery failed",
        });
    const captureResult = createEmptyCaptureResult({
      runId,
      outputDir: input.config.outputDir,
      discovery: blockedDiscovery,
      wsUrl: credentials.wsUrl,
      btcSpotStatus: input.config.captureBtcSpot ? "unavailable" : "disabled",
    });

    const credentialErrors: string[] = [];
    if (credentials.status === "missing") {
      credentialErrors.push(
        "Missing Kalshi credentials (KALSHI_API_KEY_ID and private key path or PEM).",
      );
    } else if (credentials.status === "invalid") {
      credentialErrors.push("Incomplete Kalshi credential configuration.");
    } else if (credentials.status === "invalid-private-key-path") {
      credentialErrors.push("Private key path is invalid or unreadable.");
    } else if (credentials.status === "invalid-private-key-format") {
      credentialErrors.push("Private key material is not valid PEM format.");
    } else if (credentials.status === "read-error") {
      credentialErrors.push(credentials.error ?? "Failed to read private key file.");
    }

    const healthReport = buildCaptureHealthReport({
      runId,
      generatedAt,
      config: input.config,
      credentials,
      discovery: blockedDiscovery,
      captureResult,
      liveConnectionAttempted: true,
      recordCounts: captureResult.recordCounts,
      errors: [...credentialErrors, ...credentials.warnings],
    });
    input.io.writeFile(paths.captureHealthPath, serializeCaptureHealthReport(healthReport));
    input.io.mkdirSync(join(htmlOutputPath, ".."), { recursive: true });
    input.io.writeFile(htmlOutputPath, serializeKalshiWsCaptureSpikeHtml(healthReport));
    return { runId, healthReport, htmlOutputPath };
  }

  if (!discovery.succeeded) {
    const paths = createRunOutputPaths(input.config.outputDir, runId);
    createJsonlCaptureWriter(input.io, paths);
    const captureResult = createEmptyCaptureResult({
      runId,
      outputDir: input.config.outputDir,
      discovery,
      wsUrl: credentials.wsUrl,
      btcSpotStatus: input.config.captureBtcSpot ? "unavailable" : "disabled",
    });
    const healthReport = buildCaptureHealthReport({
      runId,
      generatedAt,
      config: input.config,
      credentials,
      discovery,
      captureResult,
      liveConnectionAttempted: true,
      recordCounts: captureResult.recordCounts,
      errors: [discovery.error ?? "Market discovery failed"],
    });
    input.io.writeFile(paths.captureHealthPath, serializeCaptureHealthReport(healthReport));
    input.io.mkdirSync(join(htmlOutputPath, ".."), { recursive: true });
    input.io.writeFile(htmlOutputPath, serializeKalshiWsCaptureSpikeHtml(healthReport));
    return { runId, healthReport, htmlOutputPath };
  }

  const captureResult = await runLive({
    runId,
    config: input.config,
    discovery,
    credentials,
    io: input.io,
    fetchBtcSpot: input.config.captureBtcSpot ? fetchBtcSpot : undefined,
  });

  const healthReport = buildCaptureHealthReport({
    runId,
    generatedAt,
    config: input.config,
    credentials,
    discovery,
    captureResult,
    liveConnectionAttempted: true,
    recordCounts: captureResult.recordCounts,
    errors: captureResult.errors,
  });
  input.io.writeFile(captureResult.paths.captureHealthPath, serializeCaptureHealthReport(healthReport));
  input.io.mkdirSync(join(htmlOutputPath, ".."), { recursive: true });
  input.io.writeFile(htmlOutputPath, serializeKalshiWsCaptureSpikeHtml(healthReport));
  return { runId, healthReport, htmlOutputPath };
}
