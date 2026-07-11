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
  topOfBookRecordsEmitted: number;
  economicallyValidTopOfBookRecords: number;
  rawMessageCount: number;
  sequenceGapCount: number;
  resyncSuccessCount: number;
  errors: string[];
  terminalWebSocketFailure?: boolean;
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

  if (
    input.snapshotsReceived === 0
    || input.topOfBookRecordsEmitted === 0
    || input.economicallyValidTopOfBookRecords === 0
  ) {
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

  if (input.terminalWebSocketFailure) {
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
    "wsConnectCount" | "connected" | "terminalFailureReason" | "captureEndReason"
  >;
  authHeadersGenerated: boolean;
  endedAt: string | null;
  dryRun: boolean;
  rawMessageCount: number;
  kalshiSilentWhileBtcActiveSeconds?: number;
}): Pick<
  ForwardCaptureConnectionDiagnostics,
  "everConnected" | "completedNormally" | "liveConnectionSucceeded" | "completedWithWarnings"
> {
  const everConnected = input.connection.wsConnectCount > 0;
  const liveConnectionSucceeded =
    input.authHeadersGenerated
    && everConnected
    && input.rawMessageCount > 0;
  const terminalFailure = input.connection.terminalFailureReason !== null;
  const materialKalshiSilence =
    (input.kalshiSilentWhileBtcActiveSeconds ?? 0) > 300;
  const completedNormally =
    !input.dryRun
    && input.endedAt !== null
    && everConnected
    && liveConnectionSucceeded
    && !terminalFailure
    && input.connection.captureEndReason !== "terminal-websocket-failure"
    && !materialKalshiSilence;

  return {
    everConnected,
    completedNormally,
    liveConnectionSucceeded,
    completedWithWarnings:
      input.connection.captureEndReason === "duration-complete"
      && (terminalFailure || materialKalshiSilence),
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

function resolveDominantEconomicInvalidReason(
  diagnostics: {
    crossedTopOfBookRecords: number;
    lockedTopOfBookRecords: number;
    insufficientDepthTopOfBookRecords: number;
    awaitingSnapshotTopOfBookRecords: number;
    invalidPriceTopOfBookRecords: number;
  },
): string | null {
  const entries: Array<[string, number]> = [
    ["sequence-valid-crossed", diagnostics.crossedTopOfBookRecords],
    ["sequence-valid-locked", diagnostics.lockedTopOfBookRecords],
    ["insufficient-depth", diagnostics.insufficientDepthTopOfBookRecords],
    ["awaiting-snapshot", diagnostics.awaitingSnapshotTopOfBookRecords],
    ["invalid-price", diagnostics.invalidPriceTopOfBookRecords],
  ];

  const dominant = entries.reduce<[string, number] | null>(
    (best, current) => {
      if (current[1] <= 0) {
        return best;
      }

      if (!best || current[1] > best[1]) {
        return current;
      }

      return best;
    },
    null,
  );

  return dominant ? dominant[0] : null;
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
    topOfBookRecordsEmitted: diagnostics.topOfBookRecordsEmitted,
    economicallyValidTopOfBookRecords: diagnostics.economicallyValidTopOfBookRecords,
    rawMessageCount: diagnostics.rawMessageCount,
    sequenceGapCount: diagnostics.sequenceGapCount,
    resyncSuccessCount: diagnostics.resyncSuccessCount,
    errors,
    terminalWebSocketFailure:
      "watchdog" in input.captureResult
        ? input.captureResult.watchdog?.terminalWebSocketFailure
        : undefined,
  });

  const connectionSemantics = deriveConnectionSemantics({
    connection: input.captureResult.connection,
    authHeadersGenerated,
    endedAt: input.endedAt,
    dryRun: input.config.dryRun,
    rawMessageCount: diagnostics.rawMessageCount,
    kalshiSilentWhileBtcActiveSeconds:
      "watchdog" in input.captureResult
        ? input.captureResult.watchdog?.kalshiSilentWhileBtcActiveSeconds
        : undefined,
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
  if (
    diagnostics.topOfBookRecordsEmitted > 0
    && diagnostics.sequenceValidTopOfBookRecords > diagnostics.economicallyValidTopOfBookRecords
  ) {
    const sequenceShare = Math.round(
      (diagnostics.sequenceValidTopOfBookRecords / diagnostics.topOfBookRecordsEmitted) * 100,
    );
    const economicShare = Math.round(
      (diagnostics.economicallyValidTopOfBookRecords / diagnostics.topOfBookRecordsEmitted) * 100,
    );
    const parityShare = Math.round(
      (diagnostics.parityUsableTopOfBookRecords / diagnostics.topOfBookRecordsEmitted) * 100,
    );
    const crossedShare = Math.round(
      (diagnostics.crossedTopOfBookRecords / diagnostics.topOfBookRecordsEmitted) * 100,
    );
    const dominantInvalidReason = resolveDominantEconomicInvalidReason(diagnostics);
    warnings.push(
      `Top-of-book quality: capture-valid ${sequenceShare}% vs economically-valid ${economicShare}% vs parity-usable ${parityShare}%; crossed share ${crossedShare}%.`,
    );
    if (dominantInvalidReason) {
      warnings.push(`Dominant economic invalid reason: ${dominantInvalidReason}.`);
    }
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
      topOfBookRecordCount: diagnostics.topOfBookRecordsEmitted,
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
      topOfBookRecordsEmitted: diagnostics.topOfBookRecordsEmitted,
      validTopOfBookRecords: diagnostics.validTopOfBookRecords,
      sequenceValidTopOfBookRecords: diagnostics.sequenceValidTopOfBookRecords,
      economicallyValidTopOfBookRecords: diagnostics.economicallyValidTopOfBookRecords,
      parityUsableTopOfBookRecords: diagnostics.parityUsableTopOfBookRecords,
      crossedTopOfBookRecords: diagnostics.crossedTopOfBookRecords,
      lockedTopOfBookRecords: diagnostics.lockedTopOfBookRecords,
      insufficientDepthTopOfBookRecords: diagnostics.insufficientDepthTopOfBookRecords,
      awaitingSnapshotTopOfBookRecords: diagnostics.awaitingSnapshotTopOfBookRecords,
      invalidPriceTopOfBookRecords: diagnostics.invalidPriceTopOfBookRecords,
      bidSizePresentTopOfBookRecords: diagnostics.bidSizePresentTopOfBookRecords,
      bidPairWithSizeTopOfBookRecords: diagnostics.bidPairWithSizeTopOfBookRecords,
      bidPairWithoutSizeTopOfBookRecords: diagnostics.bidPairWithoutSizeTopOfBookRecords,
      bidSizeCoverageShare:
        diagnostics.topOfBookRecordsEmitted > 0
          ? diagnostics.bidPairWithSizeTopOfBookRecords / diagnostics.topOfBookRecordsEmitted
          : null,
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
    watchdog:
      "watchdog" in input.captureResult && input.captureResult.watchdog
        ? {
          wsStallDetectedCount: input.captureResult.watchdog.wsStallDetectedCount,
          wsRecoveryAttemptCount: input.captureResult.watchdog.wsRecoveryAttemptCount,
          wsRecoverySuccessCount: input.captureResult.watchdog.wsRecoverySuccessCount,
          wsRecoveryFailureCount: input.captureResult.watchdog.wsRecoveryFailureCount,
          postResumeRecoveryCount: input.captureResult.watchdog.postResumeRecoveryCount,
          longestKalshiSilenceMs: input.captureResult.watchdog.longestKalshiSilenceMs,
          longestRecoveredStallMs: input.captureResult.watchdog.longestRecoveredStallMs,
          terminalWebSocketFailure: input.captureResult.watchdog.terminalWebSocketFailure,
          kalshiStreamEndedAt: input.captureResult.watchdog.kalshiStreamEndedAt,
          kalshiSilentWhileBtcActiveSeconds:
            input.captureResult.watchdog.kalshiSilentWhileBtcActiveSeconds,
          lifecycleEventCount: input.captureResult.watchdog.lifecycleEvents.length,
          lifecyclePath:
            "paths" in input.captureResult
              ? input.captureResult.paths.captureLifecyclePath
              : null,
        }
        : undefined,
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
