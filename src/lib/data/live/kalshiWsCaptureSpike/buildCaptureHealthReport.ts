import { stableStringify } from "@/lib/trading/config/hashConfig";

import { redactCaptureArtifactText } from "./credentialRedaction";

import type { KalshiCaptureCredentials } from "./resolveKalshiCaptureCredentials";
import type { DryRunCaptureResult } from "./runDryRunKalshiWsCapture";
import type { LiveCaptureResult } from "./runLiveKalshiWsCapture";
import {
  CAPTURE_SPIKE_DISCLAIMER,
  type CaptureSpikeRecommendedAction,
  type CaptureSpikeVerdict,
  type KalshiCaptureMarketDiscoveryResult,
  type KalshiWsCaptureHealthReport,
  type KalshiWsCaptureSpikeConfig,
} from "./kalshiWsCaptureSpikeTypes";

function resolveVerdict(input: {
  dryRun: boolean;
  credentialStatus: KalshiCaptureCredentials["status"];
  discovery: KalshiCaptureMarketDiscoveryResult;
  connected: boolean;
  authHeadersGenerated: boolean;
  snapshotsReceived: number;
  validTopOfBookRecords: number;
  messagesReceived: number;
  sequenceGapCount: number;
  errors: string[];
}): CaptureSpikeVerdict {
  if (input.dryRun) {
    return "dry-run-ok";
  }

  if (input.credentialStatus === "missing") {
    return "blocked-missing-credentials";
  }

  if (
    input.credentialStatus === "invalid-private-key-path"
    || input.credentialStatus === "invalid-private-key-format"
    || input.credentialStatus === "read-error"
    || input.credentialStatus === "invalid"
  ) {
    return "blocked-invalid-private-key";
  }

  if (!input.discovery.succeeded) {
    return "blocked-market-discovery";
  }

  if (!input.authHeadersGenerated || !input.connected) {
    return "blocked-ws-auth";
  }

  if (input.snapshotsReceived === 0) {
    return "blocked-no-snapshot";
  }

  if (input.sequenceGapCount > 0) {
    return "blocked-sequence-gaps";
  }

  if (
    input.messagesReceived === 0
    || input.validTopOfBookRecords === 0
    || input.errors.length > 0
  ) {
    return "blocked-ws-auth";
  }

  return "capture-spike-success";
}

function resolveRecommendedAction(verdict: CaptureSpikeVerdict): CaptureSpikeRecommendedAction {
  switch (verdict) {
    case "blocked-missing-credentials":
    case "blocked-invalid-private-key":
      return "configure-credentials";
    case "blocked-ws-auth":
      return "fix-ws-auth";
    case "blocked-market-discovery":
      return "fix-market-discovery";
    case "blocked-no-snapshot":
    case "blocked-sequence-gaps":
      return "continue-spike-testing";
    case "capture-spike-success":
      return "build-forward-capture-mvp";
    case "dry-run-ok":
    default:
      return "continue-spike-testing";
  }
}

export function buildCaptureHealthReport(input: {
  runId: string;
  generatedAt: string;
  config: KalshiWsCaptureSpikeConfig;
  credentials: KalshiCaptureCredentials;
  discovery: KalshiCaptureMarketDiscoveryResult;
  captureResult: DryRunCaptureResult | LiveCaptureResult;
  liveConnectionAttempted: boolean;
  recordCounts: { raw: number; topOfBook: number; btcSpot: number };
  errors?: string[];
}): KalshiWsCaptureHealthReport {
  const diagnostics = input.captureResult.processor.diagnostics;
  const authHeadersGenerated =
    "authHeadersGenerated" in input.captureResult
      ? input.captureResult.authHeadersGenerated
      : false;
  const verdict = resolveVerdict({
    dryRun: input.config.dryRun,
    credentialStatus: input.credentials.status,
    discovery: input.discovery,
    connected: input.captureResult.connected,
    authHeadersGenerated,
    snapshotsReceived: diagnostics.snapshotsReceived,
    validTopOfBookRecords: diagnostics.validTopOfBookRecords,
    messagesReceived: diagnostics.messagesReceived,
    sequenceGapCount: diagnostics.sequenceGapCount,
    errors: input.errors ?? ("errors" in input.captureResult ? input.captureResult.errors : []),
  });

  const warnings: string[] = [];
  if (input.config.dryRun) {
    warnings.push("Dry-run mode used mock orderbook messages; live liquidity was not observed.");
    warnings.push(
      "Dry-run validates capture plumbing only; authenticated live Kalshi WS orderbook capture is not proven.",
    );
  }
  if (input.config.restSnapshotIntervalSeconds !== null) {
    warnings.push(
      "REST snapshot polling interval is parsed but not yet wired in the live runner.",
    );
  }
  if (
    !input.config.dryRun
    && input.credentials.status === "available"
    && verdict !== "capture-spike-success"
  ) {
    warnings.push("Live authenticated orderbook capture did not complete successfully.");
  }
  if (diagnostics.sequenceGapCount > 0) {
    warnings.push(
      `Detected ${diagnostics.sequenceGapCount} sequence gap(s); book state marked gap-detected until recovery snapshot.`,
    );
  }
  if (diagnostics.marketsAwaitingSnapshot > 0) {
    warnings.push(
      `${diagnostics.marketsAwaitingSnapshot} market(s) never received an orderbook snapshot.`,
    );
  }

  return {
    runId: input.runId,
    generatedAt: input.generatedAt,
    disclaimer: CAPTURE_SPIKE_DISCLAIMER,
    config: {
      series: input.config.series,
      durationSeconds: input.config.durationSeconds,
      maxMarkets: input.config.maxMarkets,
      dryRun: input.config.dryRun,
    },
    connection: {
      liveConnectionAttempted: input.liveConnectionAttempted,
      connected: input.captureResult.connected,
      credentialStatus: input.credentials.status,
      privateKeySource: input.credentials.privateKeySource,
      privateKeyLoaded: input.credentials.privateKeyLoaded,
      privateKeyFingerprint: input.credentials.privateKeyFingerprint,
      keyIdPresent: input.credentials.keyIdPresent,
      authHeadersGenerated,
      wsUrl: input.captureResult.wsUrl,
    },
    marketDiscovery: {
      attempted: input.discovery.attempted,
      succeeded: input.discovery.succeeded,
      discoveredMarketCount: input.discovery.discoveredMarketCount,
      selectedMarketTickers: input.discovery.selectedMarketTickers,
    },
    capture: {
      messagesReceived: diagnostics.messagesReceived,
      rawMessagesPath: input.captureResult.paths.rawMessagesPath,
      topOfBookPath: input.captureResult.paths.topOfBookPath,
      btcSpotPath: input.config.captureBtcSpot
        ? input.captureResult.paths.btcSpotPath
        : null,
    },
    orderbook: {
      snapshotsReceived: diagnostics.snapshotsReceived,
      deltasReceived: diagnostics.deltasReceived,
      validTopOfBookRecords: diagnostics.validTopOfBookRecords,
      sequenceGapCount: diagnostics.sequenceGapCount,
      outOfOrderCount: diagnostics.outOfOrderCount,
      marketsWithValidBook: diagnostics.marketsWithValidBook,
    },
    btcSpot: {
      status: input.captureResult.btcSpotStatus,
      recordsCaptured: input.recordCounts.btcSpot,
    },
    verdict,
    recommendedNextAction: resolveRecommendedAction(verdict),
    warnings,
    errors: input.errors ?? ("errors" in input.captureResult ? input.captureResult.errors : []),
  };
}

export function serializeCaptureHealthReport(report: KalshiWsCaptureHealthReport): string {
  return redactCaptureArtifactText(stableStringify(report));
}
