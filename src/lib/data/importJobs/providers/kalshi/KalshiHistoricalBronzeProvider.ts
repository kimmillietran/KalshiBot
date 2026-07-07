import {
  buildHistoricalCandlesticksPath,
  buildHistoricalMarketPath,
  eventTimeFromMarketWire,
  kalshiUnixSecondsToEventTime,
  mapKalshiCandlestickPayloadToBronzeRecord,
  mapKalshiMarketPayloadToBronzeRecord,
  mapKalshiSettlementPayloadToBronzeRecord,
} from "@/lib/data/importers/kalshi";
import {
  buildKalshiMarketDebugArtifactPath,
  buildKalshiMarketParseDiagnostic,
  findMissingKalshiMarketRecordFields,
  KalshiMarketImportCompatibilityError,
} from "@/lib/data/importers/kalshi/kalshiMarketImportDiagnostics";
import type {
  HistoricalCandlestickInterval,
  HistoricalCandlestickRecord,
  HistoricalDateRange,
  HistoricalMarketRecord,
  HistoricalSettlementResult,
} from "@/lib/data/importers/kalshi/kalshiHistoricalTypes";
import type { RawHistoricalRecord } from "@/lib/data/types";
import { DataQualityFlag } from "@/lib/data/schemas";
import type {
  CollectionTime,
  EventTime,
  ObservedAt,
} from "@/lib/data/timestamps";

import type { KalshiHistoricalBronzeProvider } from "../../historicalBronzeImportJobTypes";
import type {
  CreateKalshiHistoricalBronzeProviderInput,
  KalshiHistoricalBronzeImporter,
  KalshiHistoricalBronzeProviderMethodInput,
} from "./kalshiHistoricalBronzeProviderTypes";

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
  quality_flags?: readonly string[];
};

type KalshiCandlestickWire = {
  end_period_ts: number;
  volume: string;
  open_interest: string;
  price?: { close?: string | null };
};

const CANDLESTICK_INTERVAL: HistoricalCandlestickInterval = 1;

function compareBronzeRecords(
  left: RawHistoricalRecord,
  right: RawHistoricalRecord,
): number {
  const byEventTime = left.eventTime.localeCompare(right.eventTime);
  if (byEventTime !== 0) {
    return byEventTime;
  }

  const byCollectionTime = left.collectionTime.localeCompare(right.collectionTime);
  if (byCollectionTime !== 0) {
    return byCollectionTime;
  }

  const byTicker = left.ticker.localeCompare(right.ticker);
  if (byTicker !== 0) {
    return byTicker;
  }

  const byContentType = left.contentType.localeCompare(right.contentType);
  if (byContentType !== 0) {
    return byContentType;
  }

  return left.recordId.localeCompare(right.recordId);
}

function sortBronzeRecords(
  records: readonly RawHistoricalRecord[],
): readonly RawHistoricalRecord[] {
  return Object.freeze([...records].sort(compareBronzeRecords));
}

function toHistoricalDateRange(
  startTime: string,
  endTime: string,
): HistoricalDateRange {
  return {
    startTs: Math.floor(Date.parse(startTime) / 1000),
    endTs: Math.floor(Date.parse(endTime) / 1000),
  };
}

function requireFiniteTimestamp(label: string, value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Kalshi historical bronze provider requires valid ${label}`);
  }

  return parsed;
}

function marketRecordToWire(
  market: HistoricalMarketRecord,
  marketTicker: string,
): KalshiMarketWire {
  const missingRequiredFields = findMissingKalshiMarketRecordFields(market);
  if (missingRequiredFields.length > 0) {
    const requestPath = buildHistoricalMarketPath(marketTicker);
    throw new KalshiMarketImportCompatibilityError(
      buildKalshiMarketParseDiagnostic({
        ticker: marketTicker,
        endpoint: requestPath,
        requestContext: `bronze-provider marketRecordToWire for ${marketTicker}`,
        httpStatus: 200,
        body: { market: market },
        missingRequiredFields,
        debugArtifactPath: buildKalshiMarketDebugArtifactPath(marketTicker),
      }),
    );
  }

  return {
    ticker: market.ticker,
    event_ticker: market.eventTicker,
    status: market.status,
    result: market.result,
    open_time: market.openTime,
    close_time: market.closeTime,
    settlement_ts: market.settlementTs,
    settlement_value_dollars: market.settlementValueDollars,
    expiration_value: market.expirationValue,
    floor_strike: market.floorStrike,
  };
}

function settlementResultToWire(
  settlement: HistoricalSettlementResult,
  settlementQualityFlags: readonly DataQualityFlag[] = [],
): KalshiMarketWire {
  if (
    !settlement.ticker.trim()
    || !settlement.expirationValue.trim()
    || !settlement.settlementTs?.trim()
  ) {
    throw new Error("Kalshi historical settlement response is missing required fields");
  }

  const settlementTime = settlement.settlementTs ?? "";

  return {
    ticker: settlement.ticker,
    event_ticker: settlement.ticker.split("-")[0] ?? settlement.ticker,
    status: settlement.status,
    result: settlement.result,
    open_time: settlementTime,
    close_time: settlementTime,
    settlement_ts: settlement.settlementTs,
    settlement_value_dollars: settlement.settlementValueDollars,
    expiration_value: settlement.expirationValue,
    floor_strike: null,
    ...(settlementQualityFlags.length > 0
      ? { quality_flags: [...settlementQualityFlags] }
      : {}),
  };
}

function candlestickRecordToWire(candle: HistoricalCandlestickRecord): KalshiCandlestickWire {
  if (!Number.isFinite(candle.endPeriodTs)) {
    throw new Error("Kalshi historical candlestick response is missing end_period_ts");
  }

  return {
    end_period_ts: candle.endPeriodTs,
    volume: candle.volume,
    open_interest: candle.openInterest,
    price: candle.priceClose === null ? undefined : { close: candle.priceClose },
  };
}

function mapMarketRecordToBronze(
  market: HistoricalMarketRecord,
  input: KalshiHistoricalBronzeProviderMethodInput,
  requestPath: string,
): RawHistoricalRecord {
  const wire = marketRecordToWire(market, input.marketTicker);

  return mapKalshiMarketPayloadToBronzeRecord({
    ticker: input.marketTicker,
    rawPayload: wire,
    eventTime: eventTimeFromMarketWire(wire) as EventTime,
    collectionTime: input.collectionTime as CollectionTime,
    observedAt: input.observedAt as ObservedAt,
    requestPath,
    fetchId: requestPath,
  });
}

function mapCandlestickRecordToBronze(
  candle: HistoricalCandlestickRecord,
  input: KalshiHistoricalBronzeProviderMethodInput,
  requestPath: string,
): RawHistoricalRecord {
  const wire = candlestickRecordToWire(candle);

  return mapKalshiCandlestickPayloadToBronzeRecord({
    ticker: input.marketTicker,
    rawPayload: wire,
    eventTime: kalshiUnixSecondsToEventTime(wire.end_period_ts),
    collectionTime: input.collectionTime as CollectionTime,
    observedAt: input.observedAt as ObservedAt,
    requestPath,
    fetchId: requestPath,
  });
}

function mapSettlementRecordToBronze(
  settlement: HistoricalSettlementResult,
  input: KalshiHistoricalBronzeProviderMethodInput,
  requestPath: string,
  settlementQualityFlags: readonly DataQualityFlag[] = [],
): RawHistoricalRecord {
  const wire = settlementResultToWire(settlement, settlementQualityFlags);

  return mapKalshiSettlementPayloadToBronzeRecord({
    ticker: input.marketTicker,
    rawPayload: { market: wire },
    eventTime: eventTimeFromMarketWire(wire) as EventTime,
    collectionTime: input.collectionTime as CollectionTime,
    observedAt: input.observedAt as ObservedAt,
    requestPath,
    fetchId: requestPath,
  });
}

function importKalshiMarketRecords(
  importer: KalshiHistoricalBronzeImporter,
  input: KalshiHistoricalBronzeProviderMethodInput,
): readonly RawHistoricalRecord[] {
  requireFiniteTimestamp("startTime", input.startTime);
  requireFiniteTimestamp("endTime", input.endTime);

  const dateRange = toHistoricalDateRange(input.startTime, input.endTime);
  const market = importer.getMarketByTicker(input.marketTicker, dateRange);
  if (market === null) {
    return Object.freeze([]);
  }

  const requestPath = buildHistoricalMarketPath(input.marketTicker);
  return sortBronzeRecords([
    mapMarketRecordToBronze(market, input, requestPath),
  ]);
}

function importKalshiCandleRecords(
  importer: KalshiHistoricalBronzeImporter,
  input: KalshiHistoricalBronzeProviderMethodInput,
): readonly RawHistoricalRecord[] {
  requireFiniteTimestamp("startTime", input.startTime);
  requireFiniteTimestamp("endTime", input.endTime);

  const dateRange = toHistoricalDateRange(input.startTime, input.endTime);
  const result = importer.getMarketCandlesticks(input.marketTicker, dateRange);
  const requestPath = buildHistoricalCandlesticksPath(
    input.marketTicker,
    CANDLESTICK_INTERVAL,
    dateRange,
  );

  return sortBronzeRecords(
    result.candlesticks.map((candle) =>
      mapCandlestickRecordToBronze(candle, input, requestPath),
    ),
  );
}

function importKalshiSettlementRecords(
  importer: KalshiHistoricalBronzeImporter,
  input: KalshiHistoricalBronzeProviderMethodInput,
  settlementQualityFlags: readonly DataQualityFlag[] = [],
): readonly RawHistoricalRecord[] {
  const settlement = importer.getSettlementResult(input.marketTicker);
  if (settlement === null) {
    return Object.freeze([]);
  }

  const requestPath = buildHistoricalMarketPath(input.marketTicker);
  return sortBronzeRecords([
    mapSettlementRecordToBronze(
      settlement,
      input,
      requestPath,
      settlementQualityFlags,
    ),
  ]);
}

/**
 * Adapts Kalshi historical importer data into the sync bronze provider contract
 * expected by {@link runHistoricalBronzeImportJob}.
 */
export function createKalshiHistoricalBronzeProvider(
  config: CreateKalshiHistoricalBronzeProviderInput,
): KalshiHistoricalBronzeProvider {
  const { importer, settlementQualityFlags = [] } = config;

  return Object.freeze({
    importKalshiMarketRecords: (input) => importKalshiMarketRecords(importer, input),
    importKalshiCandleRecords: (input) => importKalshiCandleRecords(importer, input),
    importKalshiSettlementRecords: (input) =>
      importKalshiSettlementRecords(importer, input, settlementQualityFlags),
  });
}

export type {
  CreateKalshiHistoricalBronzeProviderInput,
  KalshiHistoricalBronzeImporter,
  KalshiHistoricalBronzeProviderContext,
  KalshiHistoricalBronzeProviderMethodInput,
} from "./kalshiHistoricalBronzeProviderTypes";
