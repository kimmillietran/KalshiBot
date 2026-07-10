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
  sequenceGapCount: number;
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
  marketsWithValidBook: number;
  marketsAwaitingSnapshot: number;
  validBookStateDurationMs: number;
  invalidBookStateDurationMs: number;
};

export type ForwardCaptureConnectionDiagnostics = {
  wsConnectCount: number;
  wsDisconnectCount: number;
  reconnectCount: number;
  /** Current socket state when the health report is generated (false after graceful shutdown). */
  connected: boolean;
  /** Whether at least one WebSocket connection succeeded during the run. */
  everConnected: boolean;
  /** Whether a duration-bounded live run ended without an early fatal error. */
  completedNormally: boolean;
  /** Whether live auth + WS produced captured messages during the run. */
  liveConnectionSucceeded: boolean;
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
    sequenceGapCount: number;
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
  now: () => Date;
  monotonicNowMs: () => number;
  fetchImpl?: typeof fetch;
  setInterval?: (fn: () => void, ms: number) => number;
  clearInterval?: (handle: number) => void;
  setTimeout?: (fn: () => void, ms: number) => number;
  clearTimeout?: (handle: number) => void;
};
