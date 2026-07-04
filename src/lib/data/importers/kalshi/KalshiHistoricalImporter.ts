import {
  buildHistoricalCandlesticksPath,
  buildHistoricalCutoffPath,
  buildHistoricalMarketPath,
  buildHistoricalMarketsPath,
  buildHistoricalTradesPath,
  DEFAULT_KALSHI_HISTORICAL_API_BASE,
} from "./historicalEndpoints";
import {
  buildKalshiMarketDebugArtifactPath,
  buildKalshiMarketParseDiagnostic,
  findMissingKalshiMarketWireFields,
  KalshiMarketImportCompatibilityError,
  saveKalshiMarketDebugArtifact,
} from "./kalshiMarketImportDiagnostics";
import { mergeKalshiMarketWireFromListDetail } from "./kalshiMarketSchemaReconciliation";
import type { KalshiHistoricalMarketFetchOptions } from "./HistoricalImporter";
import type { HistoricalImporter } from "./HistoricalImporter";
import type {
  HistoricalCandlestickInterval,
  HistoricalCandlesticksResult,
  HistoricalCutoffTimestamps,
  HistoricalDateRange,
  HistoricalImportProvenance,
  HistoricalMarketRecord,
  HistoricalMarketsPage,
  HistoricalPaginationOptions,
  HistoricalSettlementResult,
  HistoricalTradeRecord,
  HistoricalTradesPage,
  HistoricalTradesScope,
} from "./kalshiHistoricalTypes";

export type KalshiHistoricalHttpResponse = {
  status: number;
  body: unknown;
  headers?: Readonly<Record<string, string>>;
};

/** Injectable HTTP client — tests supply fake responses; production wires fetch. */
export type KalshiHistoricalHttpClient = {
  get(url: string): Promise<KalshiHistoricalHttpResponse>;
};

export type KalshiHistoricalImporterPersistDiagnosticsIo = {
  writeFile: (path: string, data: string) => void;
  mkdirSync: (path: string, options: { recursive: boolean }) => void;
};

export type KalshiHistoricalImporterOptions = {
  httpClient: KalshiHistoricalHttpClient;
  baseUrl?: string;
  now?: () => Date;
  persistMarketParseDiagnostics?: boolean;
  persistMarketParseDiagnosticsIo?: KalshiHistoricalImporterPersistDiagnosticsIo;
};

export class KalshiHistoricalImporterError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly retryAfterMs?: number;

  constructor(message: string, status: number, code?: string, retryAfterMs?: number) {
    super(message);
    this.name = "KalshiHistoricalImporterError";
    this.status = status;
    this.code = code;
    this.retryAfterMs = retryAfterMs;
  }
}

type KalshiMarketWire = {
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

type KalshiMarketsResponseWire = {
  markets: KalshiMarketWire[];
  cursor: string;
};

type KalshiMarketResponseWire = {
  market: KalshiMarketWire;
};

type KalshiCandlestickWire = {
  end_period_ts: number;
  volume: string;
  open_interest: string;
  price?: { close?: string | null };
};

type KalshiCandlesticksResponseWire = {
  ticker: string;
  candlesticks: KalshiCandlestickWire[];
};

type KalshiTradeWire = {
  trade_id: string;
  ticker: string;
  count_fp: string;
  yes_price_dollars: string;
  no_price_dollars: string;
  created_time: string;
  is_block_trade: boolean;
};

type KalshiTradesResponseWire = {
  trades: KalshiTradeWire[];
  cursor: string;
};

type KalshiCutoffResponseWire = {
  market_settled_ts: string;
  trades_created_ts: string;
  orders_updated_ts: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function parseKalshiError(
  body: unknown,
  status: number,
  retryAfterMs?: number,
): KalshiHistoricalImporterError {
  if (isRecord(body)) {
    const message =
      readString(body, "message") ?? `Kalshi historical API error (${status})`;
    const code = readString(body, "code");
    return new KalshiHistoricalImporterError(message, status, code, retryAfterMs);
  }

  return new KalshiHistoricalImporterError(
    `Kalshi historical API error (${status})`,
    status,
    undefined,
    retryAfterMs,
  );
}

function readRetryAfterMs(
  headers?: Readonly<Record<string, string>>,
): number | undefined {
  if (!headers) {
    return undefined;
  }

  const raw = headers["retry-after"] ?? headers["Retry-After"];
  if (raw === undefined) {
    return undefined;
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }

  const seconds = Number(trimmed);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.ceil(seconds * 1000);
  }

  const parsedDateMs = Date.parse(trimmed);
  if (Number.isFinite(parsedDateMs)) {
    return Math.max(0, parsedDateMs - Date.now());
  }

  return undefined;
}

function assertKalshiResponse<T>(
  body: unknown,
  status: number,
  label: string,
  headers?: Readonly<Record<string, string>>,
): T {
  if (status >= 400) {
    const retryAfterMs = status === 429 ? readRetryAfterMs(headers) : undefined;
    throw parseKalshiError(body, status, retryAfterMs);
  }

  if (!isRecord(body)) {
    throw new KalshiHistoricalImporterError(`Invalid ${label} response`, status);
  }

  return body as T;
}

function buildProvenance(
  requestPath: string,
  fetchedAt: string,
  cursor?: string | null,
): HistoricalImportProvenance {
  return {
    source: "kalshi-historical-api",
    fetchedAt,
    requestPath,
    ...(cursor !== undefined ? { cursor } : {}),
  };
}

function parseMarketRecord(market: KalshiMarketWire): HistoricalMarketRecord {
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

function parseTradeRecord(trade: KalshiTradeWire): HistoricalTradeRecord {
  return {
    tradeId: trade.trade_id,
    ticker: trade.ticker,
    countFp: trade.count_fp,
    yesPriceDollars: trade.yes_price_dollars,
    noPriceDollars: trade.no_price_dollars,
    createdTime: trade.created_time,
    isBlockTrade: trade.is_block_trade,
  };
}

/** Kalshi Historical API importer with injectable HTTP client (no disk / network in tests). */
export class KalshiHistoricalImporter implements HistoricalImporter {
  private readonly httpClient: KalshiHistoricalHttpClient;
  private readonly baseUrl: string;
  private readonly now: () => Date;

  private readonly persistMarketParseDiagnostics: boolean;
  private readonly persistMarketParseDiagnosticsIo:
    | KalshiHistoricalImporterPersistDiagnosticsIo
    | null;

  constructor(options: KalshiHistoricalImporterOptions) {
    this.httpClient = options.httpClient;
    this.baseUrl = options.baseUrl ?? DEFAULT_KALSHI_HISTORICAL_API_BASE;
    this.now = options.now ?? (() => new Date());
    this.persistMarketParseDiagnostics = options.persistMarketParseDiagnostics ?? true;
    this.persistMarketParseDiagnosticsIo =
      options.persistMarketParseDiagnosticsIo ?? null;
  }

  private throwMarketImportCompatibilityError(input: {
    ticker: string;
    endpoint: string;
    requestContext: string;
    httpStatus: number;
    body: unknown;
    missingRequiredFields: readonly string[];
  }): never {
    const plannedArtifactPath = buildKalshiMarketDebugArtifactPath(input.ticker);
    let debugArtifactPath: string | null = null;
    const diagnostic = buildKalshiMarketParseDiagnostic({
      ...input,
      debugArtifactPath: plannedArtifactPath,
    });

    if (this.persistMarketParseDiagnostics && this.persistMarketParseDiagnosticsIo) {
      debugArtifactPath = saveKalshiMarketDebugArtifact({
        ticker: input.ticker,
        diagnostic,
        writeFile: this.persistMarketParseDiagnosticsIo.writeFile,
        mkdirSync: this.persistMarketParseDiagnosticsIo.mkdirSync,
      });
    }

    throw new KalshiMarketImportCompatibilityError({
      ...diagnostic,
      debugArtifactPath,
    });
  }

  async listHistoricalMarkets(
    seriesTicker: string,
    dateRange?: HistoricalDateRange,
    pagination?: HistoricalPaginationOptions,
  ): Promise<HistoricalMarketsPage> {
    const requestPath = buildHistoricalMarketsPath(seriesTicker, dateRange, pagination);
    const body = await this.request<KalshiMarketsResponseWire>(requestPath, "markets");
    const fetchedAt = this.now().toISOString();

    return {
      markets: body.markets.map(parseMarketRecord),
      cursor: body.cursor,
      provenance: buildProvenance(requestPath, fetchedAt, body.cursor),
    };
  }

  async getMarketCandlesticks(
    ticker: string,
    interval: HistoricalCandlestickInterval,
    dateRange: HistoricalDateRange,
  ): Promise<HistoricalCandlesticksResult> {
    const requestPath = buildHistoricalCandlesticksPath(ticker, interval, dateRange);
    const body = await this.request<KalshiCandlesticksResponseWire>(
      requestPath,
      "candlesticks",
    );
    const fetchedAt = this.now().toISOString();

    return {
      ticker: body.ticker,
      interval,
      candlesticks: body.candlesticks.map((candle) => ({
        endPeriodTs: candle.end_period_ts,
        volume: candle.volume,
        openInterest: candle.open_interest,
        priceClose: candle.price?.close ?? null,
      })),
      provenance: buildProvenance(requestPath, fetchedAt),
    };
  }

  async getHistoricalTrades(
    scope: HistoricalTradesScope,
    dateRange?: HistoricalDateRange,
    pagination?: HistoricalPaginationOptions,
  ): Promise<HistoricalTradesPage> {
    if (scope.seriesTicker && !scope.ticker) {
      throw new Error(
        "Kalshi historical trades endpoint requires ticker; seriesTicker-only scope is not supported",
      );
    }

    const requestPath = buildHistoricalTradesPath(scope, dateRange, pagination);
    const body = await this.request<KalshiTradesResponseWire>(requestPath, "trades");
    const fetchedAt = this.now().toISOString();

    return {
      trades: body.trades.map(parseTradeRecord),
      cursor: body.cursor,
      provenance: buildProvenance(requestPath, fetchedAt, body.cursor),
    };
  }

  async getHistoricalCutoff(): Promise<HistoricalCutoffTimestamps> {
    const requestPath = buildHistoricalCutoffPath();
    const body = await this.request<KalshiCutoffResponseWire>(requestPath, "cutoff");
    const fetchedAt = this.now().toISOString();

    return {
      marketSettledTs: body.market_settled_ts,
      tradesCreatedTs: body.trades_created_ts,
      ordersUpdatedTs: body.orders_updated_ts,
      provenance: buildProvenance(requestPath, fetchedAt),
    };
  }

  async getHistoricalMarket(
    ticker: string,
    options?: KalshiHistoricalMarketFetchOptions,
  ): Promise<HistoricalMarketRecord | null> {
    const requestPath = buildHistoricalMarketPath(ticker);

    try {
      const { status, body, headers } = await this.httpClient.get(
        `${this.baseUrl}${requestPath}`,
      );

      if (status === 404) {
        return null;
      }

      const response = assertKalshiResponse<KalshiMarketResponseWire>(
        body,
        status,
        "market",
        headers,
      );
      const reconciliation = mergeKalshiMarketWireFromListDetail({
        listMarket: options?.listMarketWire,
        detailMarket: response.market,
      });
      options?.reconciliationTrace?.onDetailMarket?.({
        ticker,
        detailMarket: response.market,
        listMarketWire: options?.listMarketWire,
      });
      options?.reconciliationTrace?.onMerge?.({
        ticker,
        reconciliation,
      });
      const missingRequiredFields = findMissingKalshiMarketWireFields(
        reconciliation.mergedWire,
      );
      options?.reconciliationTrace?.onValidation?.({
        ticker,
        wire: reconciliation.mergedWire,
      });
      if (missingRequiredFields.length > 0) {
        this.throwMarketImportCompatibilityError({
          ticker,
          endpoint: requestPath,
          requestContext: `GET ${requestPath}`,
          httpStatus: status,
          body: {
            market: reconciliation.mergedWire,
            detailMarket: response.market,
            listMarket: options?.listMarketWire ?? null,
            mergedFields: reconciliation.mergedFields,
          },
          missingRequiredFields,
        });
      }

      return parseMarketRecord(reconciliation.mergedWire as KalshiMarketWire);
    } catch (error) {
      if (error instanceof KalshiHistoricalImporterError && error.status === 404) {
        return null;
      }

      throw error;
    }
  }

  async getSettlementResult(
    ticker: string,
    options?: KalshiHistoricalMarketFetchOptions,
  ): Promise<HistoricalSettlementResult> {
    const requestPath = buildHistoricalMarketPath(ticker);
    const { status, body, headers } = await this.httpClient.get(
      `${this.baseUrl}${requestPath}`,
    );
    const response = assertKalshiResponse<KalshiMarketResponseWire>(
      body,
      status,
      "market",
      headers,
    );
    const reconciliation = mergeKalshiMarketWireFromListDetail({
      listMarket: options?.listMarketWire,
      detailMarket: response.market,
    });
    const market = parseMarketRecord(reconciliation.mergedWire as KalshiMarketWire);
    const fetchedAt = this.now().toISOString();

    return {
      ticker: market.ticker,
      result: market.result,
      status: market.status,
      settlementTs: market.settlementTs,
      settlementValueDollars: market.settlementValueDollars,
      expirationValue: market.expirationValue,
      provenance: buildProvenance(requestPath, fetchedAt),
    };
  }

  private async request<T>(path: string, label: string): Promise<T> {
    const { status, body, headers } = await this.httpClient.get(`${this.baseUrl}${path}`);
    return assertKalshiResponse<T>(body, status, label, headers);
  }
}
