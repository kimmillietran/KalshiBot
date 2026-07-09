export const DEFAULT_KALSHI_WS_CAPTURE_SPIKE_OUTPUT_DIR =
  "data/live-capture/kalshi-ws-spike";
export const DEFAULT_KALSHI_WS_CAPTURE_SPIKE_HTML_PATH =
  "data/reports/kalshi-ws-capture-spike.html";

export const CAPTURE_SPIKE_DISCLAIMER =
  "This is capture infrastructure only. No trading decisions are made. No orders are placed. Captured data is for offline research only.";

export type KalshiCredentialStatus =
  | "available"
  | "missing"
  | "invalid"
  | "invalid-private-key-path"
  | "invalid-private-key-format"
  | "read-error"
  | "unknown";

export type KalshiPrivateKeySourceReport =
  | "path"
  | "raw-env"
  | "fallback-raw-env"
  | "cli-path"
  | "missing"
  | "invalid";

export type CaptureSpikeVerdict =
  | "dry-run-ok"
  | "blocked-missing-credentials"
  | "blocked-invalid-private-key"
  | "blocked-market-discovery"
  | "blocked-ws-auth"
  | "blocked-no-snapshot"
  | "blocked-sequence-gaps"
  | "capture-spike-success";

export type CaptureSpikeRecommendedAction =
  | "configure-credentials"
  | "fix-market-discovery"
  | "fix-ws-auth"
  | "build-forward-capture-mvp"
  | "continue-spike-testing";

export type BtcSpotCaptureStatus = "disabled" | "unavailable" | "enabled";

export type KalshiWsCaptureSpikeConfig = {
  series: string;
  durationSeconds: number;
  maxMarkets: number;
  outputDir: string;
  dryRun: boolean;
  marketTicker?: string;
  privateKeyPath?: string;
  captureBtcSpot: boolean;
  restSnapshotIntervalSeconds: number | null;
  mockInput: boolean;
};

export type RawKalshiWsCaptureMessage = {
  captureId: string;
  runId: string;
  receivedAtLocal: string;
  receivedAtMonotonicMs?: number;
  source: "kalshi-ws";
  channel: string | null;
  marketTicker: string | null;
  sequence: number | null;
  messageType: string | null;
  exchangeTimestampMs: number | null;
  rawPayload: unknown;
};

export type KalshiTopOfBookBookState =
  | "valid"
  | "invalid"
  | "gap-detected"
  | "awaiting-snapshot";

export type KalshiTopOfBookCaptureRecord = {
  runId: string;
  marketTicker: string;
  eventTicker: string | null;
  seriesTicker: string;
  receivedAtLocal: string;
  exchangeTimestampMs: number | null;
  sequence: number | null;
  bookState: KalshiTopOfBookBookState;
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
  rawMessageType: string;
};

export type BtcSpotCaptureRecord = {
  runId: string;
  source: "coinbase" | "unknown";
  receivedAtLocal: string;
  exchangeTimestampMs: number | null;
  priceUsd: number;
  rawPayload?: unknown;
};

export type KalshiCaptureMarketDiscoveryResult = {
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

export type KalshiWsCaptureOrderbookDiagnostics = {
  messagesReceived: number;
  snapshotsReceived: number;
  deltasReceived: number;
  unknownMessagesReceived: number;
  sequenceMin: number | null;
  sequenceMax: number | null;
  sequenceGapCount: number;
  outOfOrderCount: number;
  reconnectCount: number;
  marketsAwaitingSnapshot: number;
  validBookStateDurationMs: number;
  invalidBookStateDurationMs: number;
  validTopOfBookRecords: number;
  marketsWithValidBook: number;
};

export type KalshiWsCaptureHealthReport = {
  runId: string;
  generatedAt: string;
  disclaimer: string;
  config: {
    series: string;
    durationSeconds: number;
    maxMarkets: number;
    dryRun: boolean;
  };
  connection: {
    liveConnectionAttempted: boolean;
    connected: boolean;
    credentialStatus: KalshiCredentialStatus;
    privateKeySource: KalshiPrivateKeySourceReport;
    privateKeyLoaded: boolean;
    privateKeyFingerprint: string | null;
    keyIdPresent: boolean;
    authHeadersGenerated: boolean;
    wsUrl: string | null;
  };
  marketDiscovery: {
    attempted: boolean;
    succeeded: boolean;
    discoveredMarketCount: number;
    selectedMarketTickers: string[];
  };
  capture: {
    messagesReceived: number;
    rawMessagesPath: string;
    topOfBookPath: string;
    btcSpotPath: string | null;
  };
  orderbook: {
    snapshotsReceived: number;
    deltasReceived: number;
    validTopOfBookRecords: number;
    sequenceGapCount: number;
    outOfOrderCount: number;
    marketsWithValidBook: number;
  };
  btcSpot: {
    status: BtcSpotCaptureStatus;
    recordsCaptured: number;
  };
  verdict: CaptureSpikeVerdict;
  recommendedNextAction: CaptureSpikeRecommendedAction;
  warnings: string[];
  errors: string[];
};

export type KalshiWsCaptureSpikeIo = {
  readFile?: (path: string) => string;
  writeFile: (path: string, data: string) => void;
  appendFile: (path: string, data: string) => void;
  mkdirSync: (path: string, options: { recursive: boolean }) => void;
  now: () => Date;
  monotonicNowMs: () => number;
  fetchImpl?: typeof fetch;
};

export type KalshiWsCaptureSpikeDeps = {
  discoverMarkets?: typeof import("./discoverKalshiCaptureMarkets").discoverKalshiCaptureMarkets;
  runDryRunCapture?: typeof import("./runDryRunKalshiWsCapture").runDryRunKalshiWsCapture;
  runLiveCapture?: typeof import("./runLiveKalshiWsCapture").runLiveKalshiWsCapture;
  resolveCredentials?: typeof import("./resolveKalshiCaptureCredentials").resolveKalshiCaptureCredentials;
  fetchBtcSpot?: () => Promise<{ price: number; updatedAt: string }>;
};
