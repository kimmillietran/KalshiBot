import { posix } from "node:path";

import type { HistoricalMarketRecord } from "./kalshiHistoricalTypes";

export const KALSHI_MARKET_IMPORT_REQUIRED_WIRE_FIELDS = [
  "ticker",
  "open_time",
  "close_time",
  "expiration_value",
] as const;

export const KALSHI_MARKET_IMPORT_REQUIRED_RECORD_FIELDS = [
  "ticker",
  "openTime",
  "closeTime",
  "expirationValue",
] as const;

export type KalshiMarketWireShape = {
  ticker?: string;
  event_ticker?: string;
  status?: string;
  result?: string;
  open_time?: string;
  close_time?: string;
  settlement_ts?: string | null;
  settlement_value_dollars?: string | null;
  expiration_value?: string;
  floor_strike?: number | null;
  title?: string | null;
  yes_sub_title?: string | null;
  subtitle?: string | null;
  series_ticker?: string | null;
};

export type KalshiMarketParseDiagnostic = {
  ticker: string;
  endpoint: string;
  requestContext: string;
  httpStatus: number;
  topLevelKeys: readonly string[];
  missingRequiredFields: readonly string[];
  sanitizedResponseExcerpt: string;
  debugArtifactPath: string | null;
  listEndpointComparison?: {
    listEndpoint: string;
    listTopLevelKeys: readonly string[];
    listMissingRequiredFields: readonly string[];
    schemaDiffers: boolean;
  };
};

const SECRET_KEY_PATTERN =
  /api[_-]?key|authorization|bearer|token|password|secret|signature/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth > 4) {
    return "[truncated]";
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((entry) => sanitizeValue(entry, depth + 1));
  }

  if (!isRecord(value)) {
    return value;
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    if (SECRET_KEY_PATTERN.test(key)) {
      sanitized[key] = "[redacted]";
      continue;
    }

    sanitized[key] = sanitizeValue(nested, depth + 1);
  }

  return sanitized;
}

/** Returns a compact JSON excerpt safe for debug artifacts and error messages. */
export function sanitizeKalshiMarketResponseExcerpt(body: unknown, maxLength = 2_000): string {
  const serialized = JSON.stringify(sanitizeValue(body));
  if (serialized.length <= maxLength) {
    return serialized;
  }

  return `${serialized.slice(0, maxLength)}…`;
}

function wireFieldPresent(wire: KalshiMarketWireShape, field: string): boolean {
  const value = wire[field as keyof KalshiMarketWireShape];
  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  return value !== null && value !== undefined;
}

/** Lists required wire fields absent or empty on a Kalshi market payload. */
export function findMissingKalshiMarketWireFields(
  wire: KalshiMarketWireShape,
): string[] {
  return KALSHI_MARKET_IMPORT_REQUIRED_WIRE_FIELDS.filter(
    (field) => !wireFieldPresent(wire, field),
  );
}

/** Lists required parsed record fields absent or empty. */
export function findMissingKalshiMarketRecordFields(
  market: HistoricalMarketRecord,
): string[] {
  const checks: Array<[string, string]> = [
    ["ticker", market.ticker],
    ["openTime", market.openTime],
    ["closeTime", market.closeTime],
    ["expirationValue", market.expirationValue],
  ];

  return checks
    .filter(([, value]) => !value.trim())
    .map(([field]) => field);
}

function sanitizeTickerForFilename(ticker: string): string {
  return ticker.replace(/[^A-Za-z0-9._-]+/g, "_");
}

export function buildKalshiMarketDebugArtifactPath(ticker: string): string {
  return posix.join("data/debug", `kalshi-market-${sanitizeTickerForFilename(ticker)}.json`);
}

export function buildKalshiMarketParseDiagnostic(input: {
  ticker: string;
  endpoint: string;
  requestContext: string;
  httpStatus: number;
  body: unknown;
  missingRequiredFields: readonly string[];
  debugArtifactPath?: string | null;
  listEndpointComparison?: KalshiMarketParseDiagnostic["listEndpointComparison"];
}): KalshiMarketParseDiagnostic {
  const topLevelKeys = isRecord(input.body) ? Object.keys(input.body).sort() : [];

  return {
    ticker: input.ticker,
    endpoint: input.endpoint,
    requestContext: input.requestContext,
    httpStatus: input.httpStatus,
    topLevelKeys,
    missingRequiredFields: input.missingRequiredFields,
    sanitizedResponseExcerpt: sanitizeKalshiMarketResponseExcerpt(input.body),
    debugArtifactPath: input.debugArtifactPath ?? null,
    listEndpointComparison: input.listEndpointComparison,
  };
}

export function formatKalshiMarketParseError(
  diagnostic: KalshiMarketParseDiagnostic,
): string {
  const missing = diagnostic.missingRequiredFields.join(", ") || "unknown";
  const artifactSuffix = diagnostic.debugArtifactPath
    ? ` Raw response saved to ${diagnostic.debugArtifactPath}.`
    : "";

  return `Kalshi historical market response missing required fields: ${missing}.${artifactSuffix}`;
}

export type SaveKalshiMarketDebugArtifactInput = {
  ticker: string;
  diagnostic: KalshiMarketParseDiagnostic;
  writeFile: (path: string, data: string) => void;
  mkdirSync: (path: string, options: { recursive: boolean }) => void;
};

/** Persists a sanitized parse diagnostic for offline inspection. */
export function saveKalshiMarketDebugArtifact(
  input: SaveKalshiMarketDebugArtifactInput,
): string {
  const path = input.diagnostic.debugArtifactPath ?? buildKalshiMarketDebugArtifactPath(input.ticker);
  input.mkdirSync(posix.dirname(path), { recursive: true });
  input.writeFile(
    path,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        ...input.diagnostic,
      },
      null,
      2,
    )}\n`,
  );

  return path;
}

export type CompareKalshiMarketResponseShapesResult = {
  ticker: string;
  listEndpoint: string;
  detailEndpoint: string;
  listMissingRequiredFields: readonly string[];
  detailMissingRequiredFields: readonly string[];
  listOnlyFields: readonly string[];
  detailOnlyFields: readonly string[];
  schemaDiffers: boolean;
  likelyImportIncompatible: boolean;
};

/** Compares list vs detail historical market payloads for schema drift. */
export function compareKalshiMarketResponseShapes(input: {
  ticker: string;
  listEndpoint: string;
  detailEndpoint: string;
  listMarket: KalshiMarketWireShape;
  detailMarket: KalshiMarketWireShape;
}): CompareKalshiMarketResponseShapesResult {
  const listKeys = new Set(Object.keys(input.listMarket));
  const detailKeys = new Set(Object.keys(input.detailMarket));
  const listMissingRequiredFields = findMissingKalshiMarketWireFields(input.listMarket);
  const detailMissingRequiredFields = findMissingKalshiMarketWireFields(input.detailMarket);

  return {
    ticker: input.ticker,
    listEndpoint: input.listEndpoint,
    detailEndpoint: input.detailEndpoint,
    listMissingRequiredFields,
    detailMissingRequiredFields,
    listOnlyFields: [...listKeys].filter((key) => !detailKeys.has(key)).sort(),
    detailOnlyFields: [...detailKeys].filter((key) => !listKeys.has(key)).sort(),
    schemaDiffers:
      listMissingRequiredFields.join() !== detailMissingRequiredFields.join()
      || [...listKeys].join() !== [...detailKeys].join(),
    likelyImportIncompatible:
      detailMissingRequiredFields.length > 0 && listMissingRequiredFields.length === 0,
  };
}

export class KalshiMarketImportCompatibilityError extends Error {
  readonly diagnostic: KalshiMarketParseDiagnostic;

  constructor(diagnostic: KalshiMarketParseDiagnostic) {
    super(formatKalshiMarketParseError(diagnostic));
    this.name = "KalshiMarketImportCompatibilityError";
    this.diagnostic = diagnostic;
  }
}
