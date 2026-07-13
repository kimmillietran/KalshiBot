import { buildHistoricalMarketPath } from "./historicalEndpoints";
import type { KalshiHistoricalHttpClient } from "./KalshiHistoricalImporter";
import { KalshiHistoricalImporterError } from "./KalshiHistoricalImporter";
import { buildKalshiRestMarketPath } from "./kalshiRestEndpoints";
import type {
  HistoricalImportProvenance,
  HistoricalMarketRecord,
  HistoricalSettlementResult,
} from "./kalshiHistoricalTypes";

export type KalshiMarketIdentifierType = "marketTicker" | "eventTicker" | "seriesTicker";

export type KalshiSettlementRetrievalErrorKind =
  | "kalshi-market-not-found"
  | "kalshi-event-not-found"
  | "kalshi-endpoint-not-found"
  | "kalshi-settlement-not-found"
  | "kalshi-market-not-settled"
  | "kalshi-settlement-malformed"
  | "kalshi-transient-http-error";

export type KalshiMarketWire = {
  ticker: string;
  event_ticker: string;
  status: string;
  result: string;
  open_time: string;
  close_time: string;
  settlement_ts?: string | null;
  settlement_value_dollars?: string | null;
  expiration_value: string;
  floor_strike?: number | null;
  title?: string | null;
  yes_sub_title?: string | null;
  subtitle?: string | null;
  series_ticker?: string | null;
};

type KalshiMarketResponseWire = {
  market: KalshiMarketWire;
};

const SETTLED_REST_STATUSES = new Set([
  "finalized",
  "settled",
  "determined",
  "amended",
]);

const UNRESOLVED_REST_STATUSES = new Set([
  "initialized",
  "active",
  "inactive",
  "open",
  "closed",
  "paused",
  "unopened",
  "disputed",
]);

const VOID_REST_STATUSES = new Set(["void", "voided", "canceled", "cancelled"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

export function parseKalshiMarketWire(body: unknown): KalshiMarketWire | null {
  if (!isRecord(body)) {
    return null;
  }

  const market = isRecord(body.market) ? body.market : body;
  const ticker = readString(market, "ticker");
  const eventTicker = readString(market, "event_ticker");
  const status = readString(market, "status");
  const result = readString(market, "result") ?? "";
  const openTime = readString(market, "open_time");
  const closeTime = readString(market, "close_time");
  const expirationValue = readString(market, "expiration_value") ?? "";

  if (!ticker || !eventTicker || !status || !openTime || !closeTime) {
    return null;
  }

  const floorStrike = market.floor_strike;
  return {
    ticker,
    event_ticker: eventTicker,
    status,
    result,
    open_time: openTime,
    close_time: closeTime,
    settlement_ts:
      market.settlement_ts === null || market.settlement_ts === undefined
        ? null
        : readString(market, "settlement_ts") ?? null,
    settlement_value_dollars:
      market.settlement_value_dollars === null
      || market.settlement_value_dollars === undefined
        ? null
        : readString(market, "settlement_value_dollars") ?? null,
    expiration_value: expirationValue,
    floor_strike:
      typeof floorStrike === "number" && Number.isFinite(floorStrike) ? floorStrike : null,
    title: readString(market, "title") ?? null,
    yes_sub_title: readString(market, "yes_sub_title") ?? null,
    subtitle: readString(market, "subtitle") ?? null,
    series_ticker: readString(market, "series_ticker") ?? null,
  };
}

export function marketWireToHistoricalRecord(market: KalshiMarketWire): HistoricalMarketRecord {
  return {
    ticker: market.ticker,
    eventTicker: market.event_ticker,
    status: market.status,
    result: market.result,
    openTime: market.open_time,
    closeTime: market.close_time,
    settlementTs: market.settlement_ts ?? null,
    settlementValueDollars: market.settlement_value_dollars ?? null,
    expirationValue: market.expiration_value,
    floorStrike: market.floor_strike ?? null,
    title: market.title ?? null,
    subtitle: market.yes_sub_title ?? market.subtitle ?? null,
    seriesTicker: market.series_ticker ?? null,
  };
}

export function classifyKalshiSettlementState(market: KalshiMarketWire): {
  settledOutcome: "yes" | "no" | "void" | "canceled" | "unresolved" | "malformed";
  settlementReady: boolean;
} {
  const status = market.status.toLowerCase();
  if (VOID_REST_STATUSES.has(status)) {
    return {
      settledOutcome: status.includes("cancel") ? "canceled" : "void",
      settlementReady: false,
    };
  }

  const normalizedResult = market.result.trim().toLowerCase();
  if (normalizedResult === "yes" || normalizedResult === "no") {
    return { settledOutcome: normalizedResult, settlementReady: true };
  }

  if (SETTLED_REST_STATUSES.has(status)) {
    return { settledOutcome: "malformed", settlementReady: false };
  }

  if (UNRESOLVED_REST_STATUSES.has(status)) {
    return { settledOutcome: "unresolved", settlementReady: false };
  }

  return { settledOutcome: "malformed", settlementReady: false };
}

export function buildSettlementResultFromWire(input: {
  market: KalshiMarketWire;
  provenance: HistoricalImportProvenance;
}): HistoricalSettlementResult {
  const settlementState = classifyKalshiSettlementState(input.market);
  if (!settlementState.settlementReady) {
    throw createKalshiSettlementRetrievalError({
      kind:
        settlementState.settledOutcome === "unresolved"
          ? "kalshi-market-not-settled"
          : "kalshi-settlement-not-found",
      message:
        settlementState.settledOutcome === "unresolved"
          ? `Kalshi market ${input.market.ticker} is not settled (status=${input.market.status})`
          : `Kalshi market ${input.market.ticker} has no authoritative settlement result`,
      status: 200,
      retryable: settlementState.settledOutcome === "unresolved",
      requestOperation: "get-settlement-result",
      identifierType: "marketTicker",
      requestPath: input.provenance.requestPath,
    });
  }

  if (!input.market.settlement_ts?.trim()) {
    throw createKalshiSettlementRetrievalError({
      kind: "kalshi-settlement-malformed",
      message: `Kalshi market ${input.market.ticker} is missing settlement_ts`,
      status: 200,
      retryable: false,
      requestOperation: "get-settlement-result",
      identifierType: "marketTicker",
      requestPath: input.provenance.requestPath,
    });
  }

  return {
    ticker: input.market.ticker,
    result: settlementState.settledOutcome,
    status: input.market.status,
    settlementTs: input.market.settlement_ts,
    settlementValueDollars: input.market.settlement_value_dollars ?? null,
    expirationValue: input.market.expiration_value,
    provenance: input.provenance,
  };
}

export function isKalshiSettlementErrorRetryable(
  error: KalshiHistoricalImporterError,
): boolean {
  if (error.retryable) {
    return true;
  }

  if (error.status === 429) {
    return true;
  }

  if (error.status >= 500) {
    return true;
  }

  return false;
}

export function createKalshiSettlementRetrievalError(input: {
  kind: KalshiSettlementRetrievalErrorKind;
  message: string;
  status: number;
  retryable: boolean;
  requestOperation: string;
  identifierType: KalshiMarketIdentifierType;
  requestPath: string;
  code?: string;
  retryAfterMs?: number;
}): KalshiHistoricalImporterError {
  return new KalshiHistoricalImporterError(
    input.message,
    input.status,
    input.code,
    input.retryAfterMs,
    {
      errorKind: input.kind,
      retryable: input.retryable,
      requestOperation: input.requestOperation,
      identifierType: input.identifierType,
      requestPath: input.requestPath,
    },
  );
}

async function fetchMarketWire(input: {
  httpClient: KalshiHistoricalHttpClient;
  baseUrl: string;
  requestPath: string;
  requestOperation: string;
  identifierType: KalshiMarketIdentifierType;
}): Promise<{ status: number; body: unknown; headers?: Readonly<Record<string, string>> }> {
  return input.httpClient.get(`${input.baseUrl}${input.requestPath}`);
}

function classifyHttpNotFound(input: {
  requestPath: string;
  requestOperation: string;
  identifierType: KalshiMarketIdentifierType;
}): KalshiHistoricalImporterError {
  const kind: KalshiSettlementRetrievalErrorKind = input.requestPath.startsWith("/historical/")
    ? "kalshi-market-not-found"
    : "kalshi-market-not-found";

  return createKalshiSettlementRetrievalError({
    kind,
    message: `Kalshi ${input.requestOperation} returned 404 for ${input.identifierType} on ${input.requestPath}`,
    status: 404,
    retryable: false,
    requestOperation: input.requestOperation,
    identifierType: input.identifierType,
    requestPath: input.requestPath,
  });
}

function classifyHttpFailure(input: {
  status: number;
  body: unknown;
  requestPath: string;
  requestOperation: string;
  identifierType: KalshiMarketIdentifierType;
  headers?: Readonly<Record<string, string>>;
}): KalshiHistoricalImporterError {
  if (input.status === 404) {
    return classifyHttpNotFound(input);
  }

  const message =
    isRecord(input.body) && typeof input.body.message === "string"
      ? input.body.message
      : `Kalshi historical API error (${input.status})`;
  const code = isRecord(input.body) ? readString(input.body, "code") : undefined;
  const retryAfterMs =
    input.status === 429 && input.headers
      ? readRetryAfterMs(input.headers)
      : undefined;

  return createKalshiSettlementRetrievalError({
    kind: input.status >= 500 ? "kalshi-transient-http-error" : "kalshi-endpoint-not-found",
    message,
    status: input.status,
    retryable: input.status === 429 || input.status >= 500,
    requestOperation: input.requestOperation,
    identifierType: input.identifierType,
    requestPath: input.requestPath,
    code,
    retryAfterMs,
  });
}

function readRetryAfterMs(headers: Readonly<Record<string, string>>): number | undefined {
  const raw = headers["retry-after"] ?? headers["Retry-After"];
  if (!raw?.trim()) {
    return undefined;
  }

  const seconds = Number(raw.trim());
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.ceil(seconds * 1000);
  }

  const parsedDateMs = Date.parse(raw.trim());
  if (Number.isFinite(parsedDateMs)) {
    return Math.max(0, parsedDateMs - Date.now());
  }

  return undefined;
}

export async function fetchKalshiMarketWireWithFallback(input: {
  httpClient: KalshiHistoricalHttpClient;
  baseUrl: string;
  marketTicker: string;
  historicalAlreadyMissing?: boolean;
}): Promise<{
  wire: KalshiMarketWire;
  requestPath: string;
  source: HistoricalImportProvenance["source"];
} | null> {
  const historicalPath = buildHistoricalMarketPath(input.marketTicker);
  const restPath = buildKalshiRestMarketPath(input.marketTicker);

  if (!input.historicalAlreadyMissing) {
    const historicalResponse = await fetchMarketWire({
      httpClient: input.httpClient,
      baseUrl: input.baseUrl,
      requestPath: historicalPath,
      requestOperation: "get-historical-market",
      identifierType: "marketTicker",
    });

    if (historicalResponse.status === 200) {
      const wire = parseKalshiMarketWire(historicalResponse.body as KalshiMarketResponseWire);
      if (!wire) {
        return null;
      }

      return { wire, requestPath: historicalPath, source: "kalshi-historical-api" };
    }

    if (historicalResponse.status !== 404) {
      throw classifyHttpFailure({
        status: historicalResponse.status,
        body: historicalResponse.body,
        requestPath: historicalPath,
        requestOperation: "get-historical-market",
        identifierType: "marketTicker",
        headers: historicalResponse.headers,
      });
    }
  }

  const restResponse = await fetchMarketWire({
    httpClient: input.httpClient,
    baseUrl: input.baseUrl,
    requestPath: restPath,
    requestOperation: "get-rest-market",
    identifierType: "marketTicker",
  });

  if (restResponse.status === 404) {
    return null;
  }

  if (restResponse.status !== 200) {
    throw classifyHttpFailure({
      status: restResponse.status,
      body: restResponse.body,
      requestPath: restPath,
      requestOperation: "get-rest-market",
      identifierType: "marketTicker",
      headers: restResponse.headers,
    });
  }

  const wire = parseKalshiMarketWire(restResponse.body as KalshiMarketResponseWire);
  if (!wire || wire.ticker !== input.marketTicker) {
    return null;
  }

  return { wire, requestPath: restPath, source: "kalshi-rest-api" };
}

export async function fetchKalshiMarketWithSettlementFallback(input: {
  httpClient: KalshiHistoricalHttpClient;
  baseUrl: string;
  marketTicker: string;
  fetchedAt: string;
}): Promise<{
  market: HistoricalMarketRecord;
  settlement: HistoricalSettlementResult;
  requestPath: string;
  source: HistoricalImportProvenance["source"];
}> {
  const restPath = buildKalshiRestMarketPath(input.marketTicker);
  const marketWire = await fetchKalshiMarketWireWithFallback({
    httpClient: input.httpClient,
    baseUrl: input.baseUrl,
    marketTicker: input.marketTicker,
  });

  if (!marketWire) {
    throw classifyHttpNotFound({
      requestPath: restPath,
      requestOperation: "get-rest-market",
      identifierType: "marketTicker",
    });
  }

  const provenance: HistoricalImportProvenance = {
    source: marketWire.source,
    fetchedAt: input.fetchedAt,
    requestPath: marketWire.requestPath,
  };
  const market = marketWireToHistoricalRecord(marketWire.wire);
  const settlement = buildSettlementResultFromWire({
    market: marketWire.wire,
    provenance,
  });
  return {
    market,
    settlement,
    requestPath: marketWire.requestPath,
    source: provenance.source,
  };
}

export function mapKalshiImporterErrorToBackfillCategory(
  error: KalshiHistoricalImporterError,
): string {
  switch (error.errorKind) {
    case "kalshi-market-not-found":
      return "kalshi-market-not-found";
    case "kalshi-event-not-found":
      return "kalshi-event-not-found";
    case "kalshi-endpoint-not-found":
      return "kalshi-endpoint-not-found";
    case "kalshi-settlement-not-found":
      return "kalshi-settlement-not-found";
    case "kalshi-market-not-settled":
      return "market-not-settled";
    case "kalshi-settlement-malformed":
      return "normalization-failed";
    case "kalshi-transient-http-error":
      return "kalshi-settlement-request-failed";
    default:
      return error.status === 404 ? "kalshi-market-not-found" : "unknown";
  }
}
