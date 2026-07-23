export const DEFAULT_FORWARD_QUOTE_CAPTURE_OUTPUT_DIR =
  "data/live-capture/forward-quotes";
export const DEFAULT_FORWARD_QUOTE_CAPTURE_HTML_PATH =
  "data/reports/forward-quote-capture.html";

export const FORWARD_CAPTURE_DISCLAIMER =
  "Capture infrastructure only. No trading decisions are made. No orders are placed. Captured data is for offline research only.";

export type KalshiCredentialStatus =
  | "available"
  | "missing"
  | "invalid"
  | "invalid-private-key-path"
  | "invalid-private-key-format"
  | "read-error"
  | "unknown";

export type ForwardCaptureVerdict =
  | "capture-mvp-success"
  | "degraded-capture"
  | "blocked-missing-credentials"
  | "blocked-ws-auth"
  | "blocked-market-discovery"
  | "blocked-no-valid-books"
  | "dry-run-ok";

export type ForwardCaptureRecommendedAction =
  | "continue-capture"
  | "fix-credentials"
  | "fix-market-discovery"
  | "fix-ws-auth"
  | "build-overlap-validation"
  | "continue-spike-testing";

export type BtcSpotHealthStatus = "enabled" | "disabled" | "degraded" | "healthy";

export type CaptureEndReason =
  | "duration-complete"
  | "user-cancelled"
  | "terminal-websocket-failure"
  | "authentication-failure"
  | "writer-failure"
  | "unexpected-error";

/**
 * Explicitly selected Kalshi orderbook price representation.
 * "legacy-no-leg" = subscribe with `use_yes_price: false`: yes-side levels
 * carry yes-leg prices, no-side levels carry no-leg prices.
 */
export type ForwardCapturePriceRepresentation = "legacy-no-leg";

export const FORWARD_CAPTURE_PRICE_REPRESENTATION: ForwardCapturePriceRepresentation =
  "legacy-no-leg";

export type ForwardQuoteCaptureConfig = {
  series: string;
  durationMinutes: number;
  maxMarkets: number;
  outputDir: string;
  dryRun: boolean;
  marketTicker?: string;
  privateKeyPath?: string;
  captureBtcSpot: boolean;
  rolloverCheckSeconds: number;
  healthFlushSeconds: number;
  topOfBookThrottleMs: number;
  wsWatchdogEnabled: boolean;
  wsSoftSilenceThresholdMs: number;
  wsHardStallThresholdMs: number;
  wsProbeGraceMs: number;
  wsRecoveryMaxAttempts: number;
  /**
   * Price representation requested via `use_yes_price` on the subscribe
   * command. Optional for older configs; the capture always requests
   * "legacy-no-leg" explicitly on the wire.
   */
  priceRepresentation?: ForwardCapturePriceRepresentation;
};

export type ForwardRawKalshiWsRecord = {
  runId: string;
  captureId: string;
  receivedAtLocal: string;
  receivedAtMonotonicMs: number | null;
  source: "kalshi-ws";
  channel: string | null;
  messageType: string | null;
  marketTicker: string | null;
  eventTicker: string | null;
  seriesTicker: string;
  sequence: number | null;
  exchangeTimestampMs: number | null;
  rawPayload: unknown;
};

export type ForwardTopOfBookBookState =
  | "valid"
  | "awaiting-snapshot"
  | "gap-detected"
  | "resyncing"
  | "closed";

export type EconomicBookState =
  | "economically-valid"
  | "sequence-valid-crossed"
  | "sequence-valid-locked"
  | "insufficient-depth"
  | "awaiting-snapshot"
  | "invalid-price";

export type ForwardTopOfBookRecord = {
  runId: string;
  marketTicker: string;
  eventTicker: string | null;
  seriesTicker: string;
  receivedAtLocal: string;
  exchangeTimestampMs: number | null;
  sequence: number | null;
  bookState: ForwardTopOfBookBookState;
  /** Provenance: explicit price representation the capture subscribed with. */
  priceRepresentation: ForwardCapturePriceRepresentation;
  yesBestBidCents: number | null;
  yesBestBidSize: number | null;
  yesBestAskCents: number | null;
  yesBestAskSize: number | null;
  noBestBidCents: number | null;
  noBestBidSize: number | null;
  noBestAskCents: number | null;
  noBestAskSize: number | null;
  yesSpreadCents: number | null;
  noSpreadCents: number | null;
  yesSignedSpreadCents: number | null;
  noSignedSpreadCents: number | null;
  economicBookState: EconomicBookState;
  economicInvalidReasons: readonly string[];
  isEconomicallyValid: boolean;
  isParityUsable: boolean;
  yesBookCrossed: boolean;
  noBookCrossed: boolean;
  yesBookLocked: boolean;
  noBookLocked: boolean;
  btcSpotPriceUsd: number | null;
  btcSpotReceivedAtLocal: string | null;
  btcSpotSource: string | null;
};

export type ForwardBtcSpotRecord = {
  runId: string;
  source: "coinbase" | "unknown";
  receivedAtLocal: string;
  exchangeTimestampMs: number | null;
  priceUsd: number;
  rawPayload?: unknown;
};

export type ForwardMarketMetadataRecord = {
  runId: string;
  recordedAtLocal: string;
  marketTicker: string;
  eventTicker: string | null;
  seriesTicker: string;
  status: string;
  closeTime: string | null;
  action: "discovered" | "subscribed" | "closed";
};

export type ForwardCaptureMarketDiscoveryResult = {
  attempted: boolean;
  succeeded: boolean;
  seriesTicker: string;
  discoveredMarketCount: number;
  selectedMarketTickers: string[];
  marketStatuses: Record<string, string>;
  eventTickers: Record<string, string | null>;
  closeTimes: Record<string, string | null>;
  error: string | null;
};

export type ForwardCaptureOrderbookDiagnostics = {
  rawMessageCount: number;
  snapshotsReceived: number;
  deltasReceived: number;
  unknownMessagesReceived: number;
  /**
   * Compatibility field. As of M12.1D this counts distinct sequence-gap
   * episodes (one per discontinuity), NOT every delta received while
   * resyncing. It always equals sequenceGapEpisodeCount.
   */
  sequenceGapCount: number;
  /** Distinct sequence discontinuity episodes (one per gap, per market). */
  sequenceGapEpisodeCount: number;
  /** Raw deltas received while a market awaited snapshot recovery (not applied). */
  deltasQuarantinedDuringResync: number;
  /** get_snapshot recovery commands sent (with a tracked server sid). */
  snapshotRecoveryRequestCount: number;
  /** Recoveries completed by a fresh snapshot restoring the book to valid. */
  snapshotRecoverySuccessCount: number;
  /** Recovery commands that failed (WS error response or send failure). */
  snapshotRecoveryFailureCount: number;
  /** Recoveries that timed out (missing ack, missing snapshot, or total deadline). */
  snapshotRecoveryTimeoutCount: number;
  /** Markets whose bounded snapshot-recovery retries were exhausted and escalated. */
  snapshotRecoveryExhaustedCount: number;
  /** Pending WS commands that timed out without any acknowledgement. */
  pendingCommandTimeoutCount: number;
  /** Subscribe commands that never received a subscribed acknowledgement. */
  subscribeAckTimeoutCount: number;
  /** get_snapshot commands that never received an ok acknowledgement. */
  snapshotAckTimeoutCount: number;
  /** Unsubscribe/delete_markets commands that never received an acknowledgement. */
  unsubscribeAckTimeoutCount: number;
  /** Pending commands invalidated by a reconnect (old socket generation). */
  pendingCommandsInvalidatedOnReconnect: number;
  /** Control responses whose command id matched no pending command. */
  unknownControlResponseCount: number;
  /** Raw WS payloads that could not be parsed as JSON. */
  malformedPayloadCount: number;
  /** Pending WS commands still unresolved when the capture finalized. */
  pendingCommandCountAtCaptureEnd: number;
  /** Markets still awaiting snapshot recovery when the capture finalized. */
  marketsWithOutstandingRecoveryAtEnd: number;
  /** Snapshots rejected because they were older than data already seen. */
  staleSnapshotsRejected: number;
  /** Official WS control responses (subscribed/ok/unsubscribed/error). */
  controlResponsesReceived: number;
  /** WS error control responses attributed to commands. */
  commandErrorsReceived: number;
  /** Duplicate or out-of-order deltas ignored by the sequence tracker. */
  outOfOrderCount: number;
  resyncAttemptCount: number;
  resyncSuccessCount: number;
  /** Total top-of-book JSONL records written. */
  topOfBookRecordsEmitted: number;
  /** Economically valid records (strict bid < ask on both sides). */
  validTopOfBookRecords: number;
  /** Records with capture bookState === "valid". */
  sequenceValidTopOfBookRecords: number;
  economicallyValidTopOfBookRecords: number;
  parityUsableTopOfBookRecords: number;
  crossedTopOfBookRecords: number;
  lockedTopOfBookRecords: number;
  insufficientDepthTopOfBookRecords: number;
  awaitingSnapshotTopOfBookRecords: number;
  invalidPriceTopOfBookRecords: number;
  bidSizePresentTopOfBookRecords: number;
  bidPairWithSizeTopOfBookRecords: number;
  bidPairWithoutSizeTopOfBookRecords: number;
  marketsWithValidBook: number;
  marketsAwaitingSnapshot: number;
  validBookStateDurationMs: number;
  invalidBookStateDurationMs: number;
};

/** Subscription/recovery lifecycle events written to capture-lifecycle.jsonl. */
export type ForwardCaptureSubscriptionLifecycleEventType =
  | "subscriptionRequested"
  | "subscriptionAcknowledged"
  | "subscriptionFailed"
  | "snapshotRecoveryRequested"
  | "snapshotRecoveryAcknowledged"
  | "snapshotRecoverySucceeded"
  | "snapshotRecoveryFailed"
  | "snapshotRecoveryExhausted"
  | "marketUnsubscribeRequested"
  | "marketUnsubscribeAcknowledged"
  | "marketUnsubscribeFailed"
  | "commandAcknowledgementTimeout"
  | "pendingCommandsInvalidatedOnReconnect"
  | "unknownControlResponseReceived"
  | "writerFailureDetected";

export type ForwardCaptureSubscriptionLifecycleEvent = {
  type: ForwardCaptureSubscriptionLifecycleEventType;
  detectedAt: string;
  marketTickers: string[];
  commandId: number | null;
  sid: number | null;
  errorCode?: number | null;
  errorMessage?: string;
};

export type ForwardCaptureConnectionDiagnostics = {
  wsConnectCount: number;
  wsDisconnectCount: number;
  reconnectCount: number;
  /** Successful + failed WebSocket connect attempts (initial and reconnect). */
  connectionAttemptCount: number;
  /** Fresh signed auth-header generations across all connection attempts. */
  authHeaderGenerationCount: number;
  /** Current socket state when the health report is generated (false after graceful shutdown). */
  connected: boolean;
  /** Whether at least one WebSocket connection succeeded during the run. */
  everConnected: boolean;
  /** Whether a duration-bounded live run ended without an early fatal error. */
  completedNormally: boolean;
  /** Whether live auth + WS produced captured messages during the run. */
  liveConnectionSucceeded: boolean;
  completedWithWarnings: boolean;
  terminalFailureReason: string | null;
  captureEndReason: CaptureEndReason | null;
};

export type ForwardCaptureRolloverDiagnostics = {
  marketsDiscovered: number;
  marketsSubscribed: number;
  marketsClosed: number;
  rolloverChecks: number;
  rolloverSubscriptionsAdded: number;
};

export type ForwardCaptureHealthReport = {
  runId: string;
  generatedAt: string;
  startedAt: string;
  endedAt: string | null;
  disclaimer: string;
  config: ForwardQuoteCaptureConfig;
  credentialStatus: KalshiCredentialStatus;
  connection: ForwardCaptureConnectionDiagnostics & {
    authHeadersGenerated: boolean;
    connectionAttemptCount: number;
    authHeaderGenerationCount: number;
    wsUrl: string | null;
    privateKeySource: string;
    privateKeyFingerprint: string | null;
  };
  marketDiscovery: ForwardCaptureRolloverDiagnostics & {
    attempted: boolean;
    succeeded: boolean;
    discoveredMarketCount: number;
    selectedMarketTickers: string[];
  };
  capture: {
    rawMessageCount: number;
    topOfBookRecordCount: number;
    btcSpotRecordCount: number;
    marketMetadataRecordCount: number;
    rawKalshiWsPath: string;
    topOfBookPath: string;
    btcSpotPath: string | null;
    marketMetadataPath: string;
    captureHealthPath: string;
    /** Explicit price representation requested on the WS subscribe command. */
    priceRepresentation: ForwardCapturePriceRepresentation;
  };
  orderbook: {
    snapshotsReceived: number;
    deltasReceived: number;
    topOfBookRecordsEmitted: number;
    validTopOfBookRecords: number;
    sequenceValidTopOfBookRecords: number;
    economicallyValidTopOfBookRecords: number;
    parityUsableTopOfBookRecords: number;
    crossedTopOfBookRecords: number;
    lockedTopOfBookRecords: number;
    insufficientDepthTopOfBookRecords: number;
    awaitingSnapshotTopOfBookRecords: number;
    invalidPriceTopOfBookRecords: number;
    bidSizePresentTopOfBookRecords: number;
    bidPairWithSizeTopOfBookRecords: number;
    bidPairWithoutSizeTopOfBookRecords: number;
    bidSizeCoverageShare: number | null;
    /** Compatibility: equals sequenceGapEpisodeCount as of M12.1D. */
    sequenceGapCount: number;
    sequenceGapEpisodeCount: number;
    deltasQuarantinedDuringResync: number;
    snapshotRecoveryRequestCount: number;
    snapshotRecoverySuccessCount: number;
    snapshotRecoveryFailureCount: number;
    snapshotRecoveryTimeoutCount: number;
    snapshotRecoveryExhaustedCount: number;
    pendingCommandTimeoutCount: number;
    subscribeAckTimeoutCount: number;
    snapshotAckTimeoutCount: number;
    unsubscribeAckTimeoutCount: number;
    pendingCommandsInvalidatedOnReconnect: number;
    unknownControlResponseCount: number;
    malformedPayloadCount: number;
    pendingCommandCountAtCaptureEnd: number;
    marketsWithOutstandingRecoveryAtEnd: number;
    staleSnapshotsRejected: number;
    controlResponsesReceived: number;
    commandErrorsReceived: number;
    outOfOrderCount: number;
    resyncAttemptCount: number;
    resyncSuccessCount: number;
    marketsWithValidBook: number;
    invalidBookStateDurationMs: number;
    validBookStateDurationMs: number;
  };
  btcSpot: {
    status: BtcSpotHealthStatus;
    provider: string | null;
    recordsCaptured: number;
  };
  /**
   * Buffered-writer diagnostics (M12.1E). Absent for legacy reports generated
   * before buffered persistence existed.
   */
  writer?: import("./jsonlForwardCaptureWriter").ForwardCaptureWriterDiagnostics;
  watchdog?: {
    wsStallDetectedCount: number;
    wsRecoveryAttemptCount: number;
    wsRecoverySuccessCount: number;
    wsRecoveryFailureCount: number;
    postResumeRecoveryCount: number;
    longestKalshiSilenceMs: number;
    longestRecoveredStallMs: number;
    terminalWebSocketFailure: boolean;
    kalshiStreamEndedAt: string | null;
    kalshiSilentWhileBtcActiveSeconds: number;
    lifecycleEventCount: number;
    lifecyclePath: string | null;
  };
  verdict: ForwardCaptureVerdict;
  recommendedNextAction: ForwardCaptureRecommendedAction;
  warnings: string[];
  errors: string[];
};

export type ForwardQuoteCaptureIo = {
  readFile?: (path: string) => string;
  writeFile: (path: string, data: string) => void;
  appendFile: (path: string, data: string) => void;
  mkdirSync: (path: string, options: { recursive: boolean }) => void;
  /**
   * Buffered append sink factory for JSONL artifacts. When absent, the writer
   * falls back to a synchronous appendFile shim (legacy/dry-run behavior).
   */
  createAppendStream?: (
    path: string,
  ) => import("./jsonlForwardCaptureWriter").ForwardCaptureAppendStream;
  /** Required for atomic temp-file-plus-rename publication when available. */
  renameFile?: (from: string, to: string) => void;
  /**
   * Atomically creates a file, throwing when it already exists (O_EXCL
   * semantics). Required for the global capture lock; when absent no lock
   * is taken (legacy in-memory test io).
   */
  createExclusiveFile?: (path: string, data: string) => void;
  /** Deletes a file; used to release the global capture lock. */
  deleteFile?: (path: string) => void;
  now: () => Date;
  monotonicNowMs: () => number;
  fetchImpl?: typeof fetch;
  setInterval?: (fn: () => void, ms: number) => number;
  clearInterval?: (handle: number) => void;
  setTimeout?: (fn: () => void, ms: number) => number;
  clearTimeout?: (handle: number) => void;
};
