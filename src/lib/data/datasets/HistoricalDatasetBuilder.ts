import { bronzeRecordsAreIdentical } from "@/lib/data/bronze";
import type { FetchProvenance } from "@/lib/data/provenance";
import { orderReplaySnapshots } from "@/lib/data/replay/ReplayTimeline";
import {
  assembleHistoricalTradingSnapshot,
  serializeHistoricalTradingSnapshot,
} from "@/lib/data/snapshots/HistoricalSnapshotAssembler";
import type {
  BtcBar1m,
  KalshiCandle1m,
  MarketWindow,
  RawHistoricalRecord,
  SettlementRecord,
} from "@/lib/data/types";
import { eventTimeSchema } from "@/lib/data/timestamps";
import { btcBar1mSchema } from "@/lib/data/schemas";
import { fnv1a32, stableStringify } from "@/lib/trading/config/hashConfig";

import {
  SilverNormalizer,
  SILVER_BRONZE_CONTENT_TYPE,
  SilverUnsupportedContentTypeError,
} from "@/lib/data/silver";
import type { SilverNormalizationResult } from "@/lib/data/silver";
import {
  datasetVersion,
  finalizeSilverRecord,
  formatZodIssues,
  normalizeQualityFlags,
  parsePayloadObject,
  readNumber,
  readString,
} from "@/lib/data/silver/shared";
import { SilverMalformedPayloadError } from "@/lib/data/silver/errors";

import {
  DATASET_BRONZE_CONTENT_TYPE,
  HistoricalDatasetBuildError,
  HistoricalDatasetBuildErrorCode,
} from "./datasetTypes";
import type {
  HistoricalDataset,
  HistoricalDatasetMetadata,
  HistoricalDatasetProvenanceSummary,
} from "./datasetTypes";
import type {
  HistoricalTradingSnapshot,
  SilverRecordEnvelope,
} from "@/lib/data/snapshots/types";
import { z } from "zod";

type MarketSnapshotGroup = {
  market: RawHistoricalRecord | null;
  candles: RawHistoricalRecord[];
  btcBars: RawHistoricalRecord[];
  settlement: RawHistoricalRecord | null;
};

const btcKlineBronzePayloadSchema = z
  .object({
    open_time: eventTimeSchema,
    close_time: eventTimeSchema,
    open_usd: z.number().finite().positive(),
    high_usd: z.number().finite().positive(),
    low_usd: z.number().finite().positive(),
    close_usd: z.number().finite().positive(),
    volume_btc: z.number().finite().nonnegative().nullable().optional(),
    quality_flags: z.array(z.string()).optional(),
  })
  .passthrough();

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

function compareBronzeRecords(left: RawHistoricalRecord, right: RawHistoricalRecord): number {
  const eventTimeCompare = left.eventTime.localeCompare(right.eventTime);
  if (eventTimeCompare !== 0) {
    return eventTimeCompare;
  }

  return left.recordId.localeCompare(right.recordId);
}

function sortBronzeRecords(
  records: readonly RawHistoricalRecord[],
): RawHistoricalRecord[] {
  return [...records].sort(compareBronzeRecords);
}

function toSilverEnvelope<T>(
  result: SilverNormalizationResult<T>,
): SilverRecordEnvelope<T> {
  return {
    record: result.record,
    provenance: { ...result.provenance },
  };
}

/** Normalizes a Binance bronze kline into a validated BtcBar1m silver record. */
export function normalizeBtcKlineBronze(
  record: RawHistoricalRecord,
): SilverNormalizationResult<BtcBar1m> {
  const payload = parsePayloadObject(record);

  const parsedPayload = btcKlineBronzePayloadSchema.safeParse({
    open_time: readString(payload, "open_time", "openTime"),
    close_time: readString(payload, "close_time", "closeTime"),
    open_usd: readNumber(payload, "open_usd", "openUsd"),
    high_usd: readNumber(payload, "high_usd", "highUsd"),
    low_usd: readNumber(payload, "low_usd", "lowUsd"),
    close_usd: readNumber(payload, "close_usd", "closeUsd"),
    volume_btc: readNumber(payload, "volume_btc", "volumeBtc") ?? null,
    quality_flags: payload.quality_flags ?? payload.qualityFlags,
  });

  if (!parsedPayload.success) {
    throw new SilverMalformedPayloadError(
      record.recordId,
      formatZodIssues(parsedPayload.error),
    );
  }

  const candidate: BtcBar1m = {
    eventTime: record.eventTime,
    collectionTime: record.collectionTime,
    observedAt: record.observedAt,
    openTime: parsedPayload.data.open_time,
    closeTime: parsedPayload.data.close_time,
    openUsd: parsedPayload.data.open_usd,
    highUsd: parsedPayload.data.high_usd,
    lowUsd: parsedPayload.data.low_usd,
    closeUsd: parsedPayload.data.close_usd,
    volumeBtc: parsedPayload.data.volume_btc ?? null,
    qualityFlags: normalizeQualityFlags(
      record.recordId,
      parsedPayload.data.quality_flags,
    ),
    datasetVersion: datasetVersion(),
  };

  const validated = btcBar1mSchema.safeParse(candidate);
  if (!validated.success) {
    throw new SilverMalformedPayloadError(
      record.recordId,
      formatZodIssues(validated.error),
    );
  }

  return finalizeSilverRecord(btcBar1mSchema, record, validated.data);
}

function isSupportedBronzeContentType(contentType: string): boolean {
  return (
    contentType === SILVER_BRONZE_CONTENT_TYPE.MARKET ||
    contentType === SILVER_BRONZE_CONTENT_TYPE.CANDLESTICK ||
    contentType === SILVER_BRONZE_CONTENT_TYPE.SETTLEMENT ||
    contentType === DATASET_BRONZE_CONTENT_TYPE.BTC_KLINE
  );
}

function classifyBronzeRecord(record: RawHistoricalRecord): keyof MarketSnapshotGroup {
  switch (record.contentType) {
    case SILVER_BRONZE_CONTENT_TYPE.MARKET:
      return "market";
    case SILVER_BRONZE_CONTENT_TYPE.CANDLESTICK:
      return "candles";
    case DATASET_BRONZE_CONTENT_TYPE.BTC_KLINE:
      return "btcBars";
    case SILVER_BRONZE_CONTENT_TYPE.SETTLEMENT:
      return "settlement";
    default:
      throw new HistoricalDatasetBuildError(
        HistoricalDatasetBuildErrorCode.UNSUPPORTED_BRONZE_CONTENT_TYPE,
        { recordId: record.recordId },
      );
  }
}

function createEmptyGroup(): MarketSnapshotGroup {
  return {
    market: null,
    candles: [],
    btcBars: [],
    settlement: null,
  };
}

function assertNoDuplicateRecordIds(records: readonly RawHistoricalRecord[]): void {
  const seen = new Map<string, RawHistoricalRecord>();

  for (const record of records) {
    const existing = seen.get(record.recordId);
    if (existing !== undefined) {
      if (!bronzeRecordsAreIdentical(existing, record)) {
        throw new HistoricalDatasetBuildError(
          HistoricalDatasetBuildErrorCode.DUPLICATE_RECORD_ID,
          { recordId: record.recordId },
        );
      }
      throw new HistoricalDatasetBuildError(
        HistoricalDatasetBuildErrorCode.DUPLICATE_RECORD_ID,
        { recordId: record.recordId },
      );
    }
    seen.set(record.recordId, record);
  }
}

function groupBronzeRecordsByMarket(
  records: readonly RawHistoricalRecord[],
): Map<string, MarketSnapshotGroup> {
  const groups = new Map<string, MarketSnapshotGroup>();

  for (const record of records) {
    if (!isSupportedBronzeContentType(record.contentType)) {
      throw new HistoricalDatasetBuildError(
        HistoricalDatasetBuildErrorCode.UNSUPPORTED_BRONZE_CONTENT_TYPE,
        { recordId: record.recordId },
      );
    }

    const bucket = classifyBronzeRecord(record);
    const ticker = record.ticker;
    const group = groups.get(ticker) ?? createEmptyGroup();

    if (bucket === "market") {
      if (group.market !== null) {
        throw new HistoricalDatasetBuildError(
          HistoricalDatasetBuildErrorCode.DUPLICATE_MARKET_WINDOW,
          { ticker },
        );
      }
      group.market = record;
    } else if (bucket === "settlement") {
      if (group.settlement !== null) {
        throw new HistoricalDatasetBuildError(
          HistoricalDatasetBuildErrorCode.DUPLICATE_SETTLEMENT,
          { ticker },
        );
      }
      group.settlement = record;
    } else if (bucket === "candles") {
      group.candles.push(record);
    } else {
      group.btcBars.push(record);
    }

    groups.set(ticker, group);
  }

  return groups;
}

function isCompleteGroup(group: MarketSnapshotGroup): group is MarketSnapshotGroup & {
  market: RawHistoricalRecord;
  candles: RawHistoricalRecord[];
  btcBars: RawHistoricalRecord[];
} {
  return (
    group.market !== null &&
    group.candles.length > 0 &&
    group.btcBars.length > 0
  );
}

function buildDatasetId(snapshots: readonly HistoricalTradingSnapshot[]): string {
  const digest = fnv1a32(
    stableStringify(
      snapshots.map((snapshot) => serializeHistoricalTradingSnapshot(snapshot)),
    ),
  );
  return `historical-dataset-${digest}`;
}

function buildProvenanceSummary(
  records: readonly RawHistoricalRecord[],
  rejectedMarketTickers: readonly string[],
): HistoricalDatasetProvenanceSummary {
  const bronzeRecordIds = records
    .map((record) => record.recordId)
    .sort((left, right) => left.localeCompare(right));

  const provenanceByBronzeRecordId: Record<string, FetchProvenance> = {};
  for (const record of records) {
    provenanceByBronzeRecordId[record.recordId] = { ...record.provenance };
  }

  return {
    bronzeRecordCount: records.length,
    bronzeRecordIds,
    provenanceByBronzeRecordId,
    rejectedMarketTickers: [...rejectedMarketTickers].sort((left, right) =>
      left.localeCompare(right),
    ),
  };
}

function buildMetadata(
  snapshots: readonly HistoricalTradingSnapshot[],
  contractVersion: HistoricalDatasetMetadata["contractVersion"],
): HistoricalDatasetMetadata {
  const marketTickers = [...new Set(snapshots.map((snapshot) => snapshot.ticker))].sort(
    (left, right) => left.localeCompare(right),
  );

  return {
    datasetId: buildDatasetId(snapshots),
    contractVersion,
    snapshotCount: snapshots.length,
    marketTickers,
  };
}

function normalizeGroupRecords(
  group: MarketSnapshotGroup & {
    market: RawHistoricalRecord;
    candles: RawHistoricalRecord[];
    btcBars: RawHistoricalRecord[];
  },
  normalizer: SilverNormalizer,
): ReturnType<typeof assembleHistoricalTradingSnapshot> {
  const marketResult = normalizer.normalize(group.market) as SilverNormalizationResult<MarketWindow>;

  const kalshiCandles = sortBronzeRecords(group.candles).map((record) =>
    toSilverEnvelope(
      normalizer.normalize(record) as SilverNormalizationResult<KalshiCandle1m>,
    ),
  );

  const btcBars = sortBronzeRecords(group.btcBars).map((record) =>
    toSilverEnvelope(normalizeBtcKlineBronze(record)),
  );

  const settlementEnvelope = group.settlement
    ? toSilverEnvelope(
        normalizer.normalize(
          group.settlement,
        ) as SilverNormalizationResult<SettlementRecord>,
      )
    : undefined;

  return assembleHistoricalTradingSnapshot({
    marketWindow: toSilverEnvelope(marketResult),
    kalshiCandles,
    btcBars,
    settlement: settlementEnvelope,
  });
}

/**
 * Converts bronze records into an immutable, replay-ready historical dataset.
 * Bronze → Silver normalization → snapshot assembly with deterministic ordering.
 */
export function buildHistoricalDataset(
  records: readonly RawHistoricalRecord[],
): HistoricalDataset {
  if (records.length === 0) {
    throw new HistoricalDatasetBuildError(
      HistoricalDatasetBuildErrorCode.EMPTY_BRONZE_RECORDS,
    );
  }

  assertNoDuplicateRecordIds(records);

  const groups = groupBronzeRecordsByMarket(records);
  const normalizer = new SilverNormalizer();
  const rejectedMarketTickers: string[] = [];
  const snapshots: ReturnType<typeof assembleHistoricalTradingSnapshot>[] = [];

  const tickers = [...groups.keys()].sort((left, right) => left.localeCompare(right));

  for (const ticker of tickers) {
    const group = groups.get(ticker)!;

    if (!isCompleteGroup(group)) {
      rejectedMarketTickers.push(ticker);
      throw new HistoricalDatasetBuildError(
        HistoricalDatasetBuildErrorCode.INCOMPLETE_SNAPSHOT_GROUP,
        { ticker },
      );
    }

    try {
      snapshots.push(normalizeGroupRecords(group, normalizer));
    } catch (error) {
      if (error instanceof SilverUnsupportedContentTypeError) {
        throw new HistoricalDatasetBuildError(
          HistoricalDatasetBuildErrorCode.UNSUPPORTED_BRONZE_CONTENT_TYPE,
          { recordId: error.recordId, cause: error },
        );
      }
      throw error;
    }
  }

  const orderedSnapshots = orderReplaySnapshots(snapshots);
  const metadata = buildMetadata(orderedSnapshots, datasetVersion());
  const provenance = buildProvenanceSummary(records, rejectedMarketTickers);

  return deepFreeze({
    snapshots: orderedSnapshots,
    metadata,
    provenance,
  });
}

/** Deterministic JSON-like serialization for dataset comparison and hashing. */
export function serializeHistoricalDataset(dataset: HistoricalDataset): string {
  return stableStringify(dataset);
}
