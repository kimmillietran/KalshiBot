import { isUtcIsoTimestamp } from "@/lib/data/timestamps";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import {
  HistoricalBronzeImportBtcInterval,
  HistoricalBronzeImportBtcProvider,
  HistoricalBronzeImportConfigError,
  HistoricalBronzeImportConfigErrorCode,
  HistoricalBronzeImportKalshiSource,
  HistoricalBronzeImportMode,
  HistoricalBronzeImportOutputFormat,
} from "./historicalBronzeImportConfigTypes";
import type {
  BuildHistoricalBronzeImportConfigInput,
  HistoricalBronzeImportBtcConfig,
  HistoricalBronzeImportConfig,
  HistoricalBronzeImportConfigMetadata,
  HistoricalBronzeImportKalshiConfig,
  HistoricalBronzeImportOutputConfig,
} from "./historicalBronzeImportConfigTypes";

const SUPPORTED_KALSHI_SOURCES = new Set<string>(
  Object.values(HistoricalBronzeImportKalshiSource),
);
const SUPPORTED_BTC_PROVIDERS = new Set<string>(
  Object.values(HistoricalBronzeImportBtcProvider),
);
const SUPPORTED_BTC_INTERVALS = new Set<string>(
  Object.values(HistoricalBronzeImportBtcInterval),
);
const SUPPORTED_OUTPUT_FORMATS = new Set<string>(
  Object.values(HistoricalBronzeImportOutputFormat),
);
const SUPPORTED_IMPORT_MODES = new Set<string>(
  Object.values(HistoricalBronzeImportMode),
);

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") {
    return value;
  }

  Object.freeze(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      deepFreeze(item);
    }
  } else {
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
  }

  return value;
}

function assertPlainObject(
  value: unknown,
  label: string,
): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new HistoricalBronzeImportConfigError(
      `${label} must be a plain object`,
      HistoricalBronzeImportConfigErrorCode.INVALID_INPUT,
    );
  }
}

function validateNonEmptyString(
  value: unknown,
  label: string,
  code: HistoricalBronzeImportConfigErrorCode,
): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new HistoricalBronzeImportConfigError(
      `${label} is required`,
      code,
    );
  }

  return value.trim();
}

function validateUtcTimestamp(
  value: unknown,
  label: string,
): string {
  if (typeof value !== "string" || !isUtcIsoTimestamp(value)) {
    throw new HistoricalBronzeImportConfigError(
      `${label} must be a valid UTC ISO-8601 instant with Z suffix`,
      HistoricalBronzeImportConfigErrorCode.INVALID_TIMESTAMP,
    );
  }

  return value;
}

function validateKalshiConfig(kalshi: unknown): HistoricalBronzeImportKalshiConfig {
  assertPlainObject(kalshi, "kalshi");

  const marketSource = validateKalshiSource(kalshi.marketSource, "kalshi.marketSource");
  const candleSource = validateKalshiSource(kalshi.candleSource, "kalshi.candleSource");
  const settlementSource = validateKalshiSource(
    kalshi.settlementSource,
    "kalshi.settlementSource",
  );

  return {
    marketSource,
    candleSource,
    settlementSource,
  };
}

function validateKalshiSource(
  value: unknown,
  label: string,
): HistoricalBronzeImportKalshiConfig["marketSource"] {
  if (typeof value !== "string" || !SUPPORTED_KALSHI_SOURCES.has(value)) {
    throw new HistoricalBronzeImportConfigError(
      `${label} must be a supported Kalshi import source`,
      HistoricalBronzeImportConfigErrorCode.INVALID_KALSHI_SOURCE,
    );
  }

  return value as HistoricalBronzeImportKalshiConfig["marketSource"];
}

function validateBtcConfig(btc: unknown): HistoricalBronzeImportBtcConfig {
  assertPlainObject(btc, "btc");

  const provider = validateBtcProvider(btc.provider);
  const symbol = validateNonEmptyString(
    btc.symbol,
    "btc.symbol",
    HistoricalBronzeImportConfigErrorCode.INVALID_BTC_SYMBOL,
  );
  const interval = validateBtcInterval(btc.interval);

  return {
    provider,
    symbol,
    interval,
  };
}

function validateBtcProvider(
  value: unknown,
): HistoricalBronzeImportBtcConfig["provider"] {
  if (typeof value !== "string" || !SUPPORTED_BTC_PROVIDERS.has(value)) {
    throw new HistoricalBronzeImportConfigError(
      "btc.provider must be a supported BTC import provider",
      HistoricalBronzeImportConfigErrorCode.INVALID_BTC_PROVIDER,
    );
  }

  return value as HistoricalBronzeImportBtcConfig["provider"];
}

function validateBtcInterval(
  value: unknown,
): HistoricalBronzeImportBtcConfig["interval"] {
  if (typeof value !== "string" || !SUPPORTED_BTC_INTERVALS.has(value)) {
    throw new HistoricalBronzeImportConfigError(
      "btc.interval must be a supported BTC interval",
      HistoricalBronzeImportConfigErrorCode.INVALID_BTC_INTERVAL,
    );
  }

  return value as HistoricalBronzeImportBtcConfig["interval"];
}

function validateOutputConfig(output: unknown): HistoricalBronzeImportOutputConfig {
  assertPlainObject(output, "output");

  const format = validateOutputFormat(output.format);

  if (typeof output.includeValidationReport !== "boolean") {
    throw new HistoricalBronzeImportConfigError(
      "output.includeValidationReport must be a boolean",
      HistoricalBronzeImportConfigErrorCode.INVALID_INPUT,
    );
  }

  if (typeof output.includeFixture !== "boolean") {
    throw new HistoricalBronzeImportConfigError(
      "output.includeFixture must be a boolean",
      HistoricalBronzeImportConfigErrorCode.INVALID_INPUT,
    );
  }

  return {
    format,
    includeValidationReport: output.includeValidationReport,
    includeFixture: output.includeFixture,
  };
}

function validateOutputFormat(
  value: unknown,
): HistoricalBronzeImportOutputConfig["format"] {
  if (typeof value !== "string" || !SUPPORTED_OUTPUT_FORMATS.has(value)) {
    throw new HistoricalBronzeImportConfigError(
      "output.format must be a supported output format",
      HistoricalBronzeImportConfigErrorCode.INVALID_OUTPUT_FORMAT,
    );
  }

  return value as HistoricalBronzeImportOutputConfig["format"];
}

function cloneMetadata(
  metadata: HistoricalBronzeImportConfigMetadata | undefined,
): HistoricalBronzeImportConfigMetadata {
  if (metadata === undefined) {
    return deepFreeze({});
  }

  assertPlainObject(metadata, "metadata");
  return deepFreeze({ ...metadata });
}

function validateTimeRange(startTime: string, endTime: string): void {
  if (Date.parse(startTime) >= Date.parse(endTime)) {
    throw new HistoricalBronzeImportConfigError(
      "startTime must be before endTime",
      HistoricalBronzeImportConfigErrorCode.INVALID_TIME_RANGE,
    );
  }
}

function validateImportMode(value: unknown): HistoricalBronzeImportMode {
  if (typeof value !== "string" || !SUPPORTED_IMPORT_MODES.has(value)) {
    throw new HistoricalBronzeImportConfigError(
      "importMode must be a supported historical import mode",
      HistoricalBronzeImportConfigErrorCode.INVALID_IMPORT_MODE,
    );
  }

  return value as HistoricalBronzeImportMode;
}

function resolveImportMode(input: BuildHistoricalBronzeImportConfigInput): HistoricalBronzeImportMode {
  if (input.importMode === undefined) {
    return HistoricalBronzeImportMode.FULL_BRONZE;
  }

  return validateImportMode(input.importMode);
}

function resolveBtcConfig(
  input: BuildHistoricalBronzeImportConfigInput,
  importMode: HistoricalBronzeImportMode,
): HistoricalBronzeImportBtcConfig | null {
  if (importMode === HistoricalBronzeImportMode.SETTLEMENT_ONLY) {
    return input.btc === undefined || input.btc === null ? null : validateBtcConfig(input.btc);
  }

  if (input.btc === undefined || input.btc === null) {
    throw new HistoricalBronzeImportConfigError(
      "btc config is required for full-bronze imports",
      HistoricalBronzeImportConfigErrorCode.MISSING_BTC_CONFIG,
    );
  }

  return validateBtcConfig(input.btc);
}

/** Validates and freezes a historical bronze import job configuration. */
export function buildHistoricalBronzeImportConfig(
  input: BuildHistoricalBronzeImportConfigInput,
): HistoricalBronzeImportConfig {
  assertPlainObject(input, "input");

  const jobId = validateNonEmptyString(
    input.jobId,
    "jobId",
    HistoricalBronzeImportConfigErrorCode.MISSING_JOB_ID,
  );
  const marketTicker = validateNonEmptyString(
    input.marketTicker,
    "marketTicker",
    HistoricalBronzeImportConfigErrorCode.MISSING_MARKET_TICKER,
  );
  const startTime = validateUtcTimestamp(input.startTime, "startTime");
  const endTime = validateUtcTimestamp(input.endTime, "endTime");
  validateTimeRange(startTime, endTime);
  const collectionTime = validateUtcTimestamp(input.collectionTime, "collectionTime");
  const observedAt = validateUtcTimestamp(input.observedAt, "observedAt");
  const importMode = resolveImportMode(input);
  const kalshi = validateKalshiConfig(input.kalshi);
  const btc = resolveBtcConfig(input, importMode);
  const output = validateOutputConfig(input.output);
  const metadata = cloneMetadata(input.metadata);

  return deepFreeze({
    jobId,
    marketTicker,
    startTime: startTime as HistoricalBronzeImportConfig["startTime"],
    endTime: endTime as HistoricalBronzeImportConfig["endTime"],
    collectionTime: collectionTime as HistoricalBronzeImportConfig["collectionTime"],
    observedAt: observedAt as HistoricalBronzeImportConfig["observedAt"],
    importMode,
    kalshi: deepFreeze({ ...kalshi }),
    btc: btc === null ? null : deepFreeze({ ...btc }),
    output: deepFreeze({ ...output }),
    metadata,
  });
}

/** Serializes a historical bronze import config to stable JSON. */
export function serializeHistoricalBronzeImportConfig(
  config: HistoricalBronzeImportConfig,
): string {
  return stableStringify(config);
}
