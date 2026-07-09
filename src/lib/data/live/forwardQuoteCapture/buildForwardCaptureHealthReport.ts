import { stableStringify } from "@/lib/trading/config/hashConfig";

import {
  redactCaptureArtifactText,
  type KalshiCaptureCredentials,
} from "@/lib/data/live/kalshiWsCaptureSpike";
import type { DryRunForwardCaptureResult } from "./runDryRunForwardQuoteCapture";
import type { LiveForwardCaptureResult } from "./runLiveForwardQuoteCapture";
import {
  FORWARD_CAPTURE_DISCLAIMER,
  type ForwardCaptureConnectionDiagnostics,
  type ForwardCaptureRecommendedAction,
  type ForwardCaptureVerdict,
  type ForwardCaptureHealthReport,
  type ForwardQuoteCaptureConfig,
  type ForwardCaptureMarketDiscoveryResult,
} from "./forwardQuoteCaptureTypes";

type CaptureRunResult = DryRunForwardCaptureResult | LiveForwardCaptureResult;

export type ForwardCaptureVerdictInput = {
  dryRun: boolean;
  credentialStatus: KalshiCaptureCredentials["status"];
  discovery: ForwardCaptureMarketDiscoveryResult;
  authHeadersGenerated: boolean;
  wsConnectCount: number;
  marketsSubscribed: number;
  snapshotsReceived: number;
  validTopOfBookRecords: number;
  rawMessageCount: number;
  sequenceGapCount: number;
  resyncSuccessCount: number;
  errors: string[];
};

export function evaluateForwardCaptureVerdict(
  input: ForwardCaptureVerdictInput,
): ForwardCaptureVerdict {
  if (input.dryRun) {
    return "dry-run-ok";
  }

  if (input.credentialStatus === "missing") {
    return "blocked-missing-credentials";
  }

  if (input.credentialStatus !== "available") {
    return "blocked-missing-credentials";
  }

  if (!input.discovery.succeeded) {
    return "blocked-market-discovery";
  }

  if (!input.authHeadersGenerated || input.wsConnectCount === 0) {
    return "blocked-ws-auth";
  }

  if (input.rawMessageCount === 0) {
    return "blocked-ws-auth";
  }

  if (input.snapshotsReceived === 0 || input.validTopOfBookRecords === 0) {
    return "blocked-no-valid-books";
  }

  if (input.marketsSubscribed < 1) {
    return "blocked-no-valid-books";
  }

  if (
    input.sequenceGapCount > 0
    && input.resyncSuccessCount === 0
  ) {
    return "degraded-capture";
  }

  if (input.errors.length > 0) {
    return "degraded-capture";
  }

  return "capture-mvp-success";
}

function resolveVerdict(input: ForwardCaptureVerdictInput): ForwardCaptureVerdict {
  return evaluateForwardCaptureVerdict(input);
}

export function deriveConnectionSemantics(input: {
  connection: Pick<
    ForwardCaptureConnectionDiagnostics,
    "wsConnectCount" | "connected"
  >;
  authHeadersGenerated: boolean;
  endedAt: string | null;
  dryRun: boolean;
  rawMessageCount: number;
}): Pick<
  ForwardCaptureConnectionDiagnostics,
  "everConnected" | "completedNormally" | "liveConnectionSucceeded"
> {
  const everConnected = input.connection.wsConnectCount > 0;
  const liveConnectionSucceeded =
    input.authHeadersGenerated
    && everConnected
    && input.rawMessageCount > 0;
  const completedNormally =
    !input.dryRun
    && input.endedAt !== null
    && everConnected
    && liveConnectionSucceeded;

  return {
    everConnected,
    completedNormally,
    liveConnectionSucceeded,
  };
}

function resolveRecommendedAction(verdict: ForwardCaptureVerdict): ForwardCaptureRecommendedAction {
  switch (verdict) {
    case "blocked-missing-credentials":
      return "fix-credentials";
    case "blocked-market-discovery":
      return "fix-market-discovery";
    case "blocked-ws-auth":
    case "blocked-no-valid-books":
      return "fix-ws-auth";
    case "capture-mvp-success":
    case "degraded-capture":
      return "continue-capture";
    case "dry-run-ok":
    default:
      return "continue-spike-testing";
  }
}

export function buildForwardCaptureHealthReport(input: {
  runId: string;
  generatedAt: string;
  startedAt: string;
  endedAt: string | null;
  config: ForwardQuoteCaptureConfig;
  credentials: KalshiCaptureCredentials;
  discovery: ForwardCaptureMarketDiscoveryResult;
  captureResult: CaptureRunResult;
  errors?: string[];
}): ForwardCaptureHealthReport {
  const diagnostics = input.captureResult.processor.diagnostics;
  const authHeadersGenerated = input.captureResult.authHeadersGenerated;
  const errors = input.errors ?? input.captureResult.errors;

  const verdict = resolveVerdict({
    dryRun: input.config.dryRun,
    credentialStatus: input.credentials.status,
    discovery: input.discovery,
    authHeadersGenerated,
    wsConnectCount: input.captureResult.connection.wsConnectCount,
    marketsSubscribed: input.captureResult.rollover.marketsSubscribed,
    snapshotsReceived: diagnostics.snapshotsReceived,
    validTopOfBookRecords: diagnostics.validTopOfBookRecords,
    rawMessageCount: diagnostics.rawMessageCount,
    sequenceGapCount: diagnostics.sequenceGapCount,
    resyncSuccessCount: diagnostics.resyncSuccessCount,
    errors,
  });

  const connectionSemantics = deriveConnectionSemantics({
    connection: input.captureResult.connection,
    authHeadersGenerated,
    endedAt: input.endedAt,
    dryRun: input.config.dryRun,
    rawMessageCount: diagnostics.rawMessageCount,
  });

  const warnings: string[] = [];
  if (input.config.dryRun) {
    warnings.push("Dry-run mode used mock orderbook messages; live liquidity was not observed.");
  }
  if (diagnostics.sequenceGapCount > 0) {
    warnings.push(
      `Detected ${diagnostics.sequenceGapCount} sequence gap(s); resync attempts=${diagnostics.resyncAttemptCount}, successes=${diagnostics.resyncSuccessCount}.`,
    );
  }
  if (input.captureResult.btcSpotStatus === "degraded") {
    warnings.push("BTC spot capture degraded; Kalshi capture continued.");
  }
  if (
    !input.config.dryRun
    && connectionSemantics.everConnected
    && !input.captureResult.connection.connected
    && connectionSemantics.completedNormally
  ) {
    warnings.push(
      "connection.connected is false at report time after graceful shutdown; this is expected for completed duration-bounded captures.",
    );
  }

  return {
    runId: input.runId,
    generatedAt: input.generatedAt,
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    disclaimer: FORWARD_CAPTURE_DISCLAIMER,
    config: input.config,
    credentialStatus: input.credentials.status,
    connection: {
      ...input.captureResult.connection,
      ...connectionSemantics,
      authHeadersGenerated,
      wsUrl: input.captureResult.wsUrl,
      privateKeySource: input.credentials.privateKeySource,
      privateKeyFingerprint: input.credentials.privateKeyFingerprint,
    },
    marketDiscovery: {
      ...input.captureResult.rollover,
      attempted: input.discovery.attempted,
      succeeded: input.discovery.succeeded,
      discoveredMarketCount: input.discovery.discoveredMarketCount,
      selectedMarketTickers: input.discovery.selectedMarketTickers,
    },
    capture: {
      rawMessageCount: diagnostics.rawMessageCount,
      topOfBookRecordCount: diagnostics.validTopOfBookRecords,
      btcSpotRecordCount: input.captureResult.recordCounts.btcSpot,
      marketMetadataRecordCount: input.captureResult.recordCounts.marketMetadata,
      rawKalshiWsPath: input.captureResult.paths.rawKalshiWsPath,
      topOfBookPath: input.captureResult.paths.topOfBookPath,
      btcSpotPath: input.config.captureBtcSpot
        ? input.captureResult.paths.btcSpotPath
        : null,
      marketMetadataPath: input.captureResult.paths.marketMetadataPath,
      captureHealthPath: input.captureResult.paths.captureHealthPath,
    },
    orderbook: {
      snapshotsReceived: diagnostics.snapshotsReceived,
      deltasReceived: diagnostics.deltasReceived,
      validTopOfBookRecords: diagnostics.validTopOfBookRecords,
      sequenceGapCount: diagnostics.sequenceGapCount,
      outOfOrderCount: diagnostics.outOfOrderCount,
      resyncAttemptCount: diagnostics.resyncAttemptCount,
      resyncSuccessCount: diagnostics.resyncSuccessCount,
      marketsWithValidBook: diagnostics.marketsWithValidBook,
      invalidBookStateDurationMs: diagnostics.invalidBookStateDurationMs,
      validBookStateDurationMs: diagnostics.validBookStateDurationMs,
    },
    btcSpot: {
      status: input.captureResult.btcSpotStatus,
      provider: input.config.captureBtcSpot ? "coinbase" : null,
      recordsCaptured: input.captureResult.recordCounts.btcSpot,
    },
    verdict,
    recommendedNextAction: resolveRecommendedAction(verdict),
    warnings,
    errors,
  };
}

export function serializeForwardCaptureHealthReport(
  report: ForwardCaptureHealthReport,
): string {
  return redactCaptureArtifactText(stableStringify(report));
}
