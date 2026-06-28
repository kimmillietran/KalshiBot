export { DATA_CONTRACT_VERSION } from "./versioning";
export type { DatasetVersion } from "./versioning";

export {
  UTC_ISO_PATTERN,
  isUtcIsoTimestamp,
  utcTimestampSchema,
  eventTimeSchema,
  collectionTimeSchema,
  observedAtSchema,
  temporalFieldsSchema,
} from "./timestamps";
export type {
  EventTime,
  CollectionTime,
  ObservedAt,
  TemporalFields,
} from "./timestamps";

export { DataSource, dataSourceSchema, fetchProvenanceSchema } from "./provenance";
export type { FetchProvenance } from "./provenance";

export {
  DataQualityFlag,
  dataQualityFlagSchema,
  datasetVersionSchema,
  historicalTickerSchema,
  seriesTickerSchema,
  rawHistoricalRecordSchema,
  marketWindowSchema,
  kalshiCandle1mSchema,
  btcBar1mSchema,
  settlementRecordSchema,
} from "./schemas";

export type {
  HistoricalTicker,
  SeriesTicker,
  RawHistoricalRecord,
  MarketWindow,
  KalshiCandle1m,
  BtcBar1m,
  SettlementRecord,
} from "./types";

export {
  BRONZE_KEY_PREFIX,
  buildBronzeRecordKey,
  bronzeKeyFromRecord,
  isBronzeRecordKey,
  recordIdFromBronzeKey,
  InMemoryBronzeStore,
  bronzeRecordsAreIdentical,
  cloneBronzeRecord,
  parseSerializedBronzeRecord,
  serializeBronzeRecord,
  BronzeDuplicateConflictError,
} from "./bronze";

export type {
  BronzeRecordFilter,
  BronzeRecordKey,
  BronzeStore,
} from "./bronze";

export {
  SilverNormalizer,
  normalizeRecord,
  normalizeMarketWindow,
  normalizeKalshiCandle,
  normalizeSettlement,
  SILVER_BRONZE_CONTENT_TYPE,
  SilverNormalizationError,
  SilverUnsupportedContentTypeError,
  SilverMalformedPayloadError,
  SilverInvalidBronzeRecordError,
} from "./silver";

export type {
  SilverBronzeContentType,
  SilverNormalizationOutput,
  SilverNormalizationResult,
} from "./silver";

export {
  assembleHistoricalTradingSnapshot,
  serializeHistoricalTradingSnapshot,
  HistoricalSnapshotAssemblyError,
  SnapshotAssemblyErrorCode,
} from "./snapshots";
export type {
  HistoricalSnapshotProvenance,
  HistoricalTradingSnapshot,
  SilverRecordEnvelope,
  SnapshotAssemblyInput,
  SnapshotTemporalMetadata,
} from "./snapshots";

export {
  adaptHistoricalSnapshot,
  ReplayAdaptationError,
  ReplayAdaptationErrorCode,
  REPLAY_BTC_FEED_STATUS,
  REPLAY_BTC_PROVIDER_SOURCE,
  ReplayTimeline,
  orderReplaySnapshots,
  ReplaySession,
  serializeReplaySessionState,
  serializeReplayStepResult,
  serializeReplayStepResults,
} from "./replay";

export type {
  HistoricalReplayAdaptation,
  CreateReplayTimelineInput,
  ReplayTimelineCursor,
  ReplayTimelineSnapshotSequence,
  ReplayTimelineState,
  CreateReplaySessionInput,
  ReplaySessionState,
  ReplayStepAllOutput,
  ReplayStepOutput,
  ReplayStepResult,
} from "./replay";

export {
  DEFAULT_POLLING_RATE_GOVERNOR_CONFIG,
  PollingRateGovernor,
  applyPollIntervalJitter,
  validatePollingRateGovernorConfig,
  MARKET_POLL_PRIORITY_WEIGHT,
  intervalMsForPriority,
  PollingRateGovernorConfigError,
} from "./polling";
export type {
  JitterSample,
  MarketPollPriority,
  MarketPollState,
  PollIntervalDecision,
  PollReadiness,
  PollThrottleReason,
  PollingRateGovernorConfig,
  StaleQuoteStatus,
} from "./polling";

export {
  BacktestLedger,
  BacktestLedgerError,
  BacktestLedgerErrorCode,
  positionKey,
} from "./backtesting";

export type {
  LedgerSnapshot,
  MarkPrice,
  OpenPosition,
  TradeAction,
  TradeFill,
  TradeFillInput,
  TradeSide,
  UnrealizedPnLResult,
} from "./backtesting";
