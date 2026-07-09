import {
  groupEventsByStrikeCount,
  resolveEventTickerForSeries,
} from "./vendorOrderbookAuditUtils";
import {
  parseVendorSampleFiles,
  type NormalizedVendorSampleRow,
} from "./parseVendorSample";
import type {
  VendorOrderbookSufficiencyAuditIo,
  VendorSampleAudit,
} from "./vendorOrderbookSufficiencyAuditTypes";

function percentile(sorted: readonly number[], p: number): number | null {
  if (sorted.length === 0) {
    return null;
  }

  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))] ?? null;
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }

  return sorted[mid]!;
}

function roundShare(numerator: number, denominator: number): number | null {
  if (denominator === 0) {
    return null;
  }

  return Math.round((numerator / denominator) * 10_000) / 10_000;
}

function inferTimestampResolution(timestamps: readonly number[]): "ms" | "seconds" | "unknown" {
  if (timestamps.length === 0) {
    return "unknown";
  }

  const allSubSecond = timestamps.every((value) => value % 1000 !== 0 || value > 1_000_000_000_000);
  if (allSubSecond) {
    return "ms";
  }

  const allWholeSeconds = timestamps.every((value) => value % 1000 === 0);
  return allWholeSeconds ? "seconds" : "ms";
}

function toIso(timestampMs: number | null): string | null {
  return timestampMs === null ? null : new Date(timestampMs).toISOString();
}

function computeSnapshotGaps(timestamps: readonly number[]): number[] {
  const sorted = [...timestamps].filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let index = 1; index < sorted.length; index += 1) {
    gaps.push(sorted[index]! - sorted[index - 1]!);
  }

  return gaps;
}

function hasNonZeroSpread(row: NormalizedVendorSampleRow): boolean {
  if (row.yesBidCents !== null && row.yesAskCents !== null) {
    return row.yesBidCents !== row.yesAskCents;
  }

  if (row.noBidCents !== null && row.noAskCents !== null) {
    return row.noBidCents !== row.noAskCents;
  }

  return false;
}

export function auditVendorSampleData(input: {
  vendorId: string;
  sampleFilePaths: readonly string[];
  io: VendorOrderbookSufficiencyAuditIo;
}): VendorSampleAudit {
  if (input.sampleFilePaths.length === 0) {
    return createMissingSampleAudit(input.vendorId);
  }

  const parsedFiles = parseVendorSampleFiles({
    filePaths: input.sampleFilePaths,
    io: input.io,
  });

  const rows = parsedFiles.flatMap((file) => file.rows);
  const schemaNotes = parsedFiles.flatMap((file) => {
    if (file.error) {
      return [`${file.filePath}: ${file.error}`];
    }

    return [`${file.filePath}: parsed ${file.rows.length} rows (${file.format})`];
  });

  if (rows.length === 0) {
    const hasUnsupported = parsedFiles.some((file) => file.format === "unsupported");
    const hasParseError = parsedFiles.some((file) => file.error !== null);
    return {
      vendorId: input.vendorId,
      sampleStatus: hasUnsupported
        ? "unsupported-sample-schema"
        : hasParseError
          ? "parse-error"
          : "unsupported-sample-schema",
      sampleFileCount: input.sampleFilePaths.length,
      rowCount: 0,
      marketTickers: [],
      seriesTickers: [],
      eventTickers: [],
      earliestTimestamp: null,
      latestTimestamp: null,
      timestampResolution: "unknown",
      medianSnapshotGapMs: null,
      p90SnapshotGapMs: null,
      maxSnapshotGapMs: null,
      hasYesBids: false,
      hasYesAsks: false,
      hasNoBids: false,
      hasNoAsks: false,
      hasSizes: false,
      hasTrades: false,
      hasMarketMetadata: false,
      hasFloorStrike: false,
      hasEventTicker: false,
      hasSequenceOrUpdateId: false,
      hasExchangeTimestamp: false,
      hasVendorReceiveTimestamp: false,
      nonZeroSpreadShare: null,
      zeroSpreadShare: null,
      distinctMarkets: 0,
      distinctEvents: 0,
      eventsWith2PlusStrikes: 0,
      eventsWith3PlusStrikes: 0,
      maxStrikesPerEvent: 0,
      schemaNotes,
    };
  }

  const timestamps = rows
    .map((row) => row.timestampMs)
    .filter((value): value is number => value !== null);
  const gaps = computeSnapshotGaps(timestamps);
  const sortedGaps = [...gaps].sort((left, right) => left - right);

  const marketTickers = [...new Set(rows.map((row) => row.marketTicker).filter(Boolean))] as string[];
  const seriesTickers = [...new Set(rows.map((row) => row.seriesTicker).filter(Boolean))] as string[];
  const eventRows = rows.map((row) => ({
    marketTicker: row.marketTicker ?? "unknown",
    eventTicker: resolveEventTickerForSeries({
      marketTicker: row.marketTicker ?? "",
      seriesTicker: row.seriesTicker,
      eventTicker: row.eventTicker,
      floorStrike: row.floorStrike,
    }),
  }));
  const eventTickers = [
    ...new Set(eventRows.map((row) => row.eventTicker).filter(Boolean)),
  ] as string[];

  const spreadRows = rows.filter(
    (row) =>
      (row.yesBidCents !== null && row.yesAskCents !== null)
      || (row.noBidCents !== null && row.noAskCents !== null),
  );
  const nonZeroSpreadCount = spreadRows.filter(hasNonZeroSpread).length;
  const zeroSpreadCount = spreadRows.length - nonZeroSpreadCount;

  const ladder = groupEventsByStrikeCount({ rows: eventRows });

  return {
    vendorId: input.vendorId,
    sampleStatus: "present",
    sampleFileCount: input.sampleFilePaths.length,
    rowCount: rows.length,
    marketTickers: marketTickers.sort(),
    seriesTickers: seriesTickers.sort(),
    eventTickers: eventTickers.sort(),
    earliestTimestamp: toIso(timestamps.length > 0 ? Math.min(...timestamps) : null),
    latestTimestamp: toIso(timestamps.length > 0 ? Math.max(...timestamps) : null),
    timestampResolution: inferTimestampResolution(timestamps),
    medianSnapshotGapMs: median(gaps),
    p90SnapshotGapMs: percentile(sortedGaps, 90),
    maxSnapshotGapMs: gaps.length > 0 ? Math.max(...gaps) : null,
    hasYesBids: rows.some((row) => row.yesBidCents !== null),
    hasYesAsks: rows.some((row) => row.yesAskCents !== null),
    hasNoBids: rows.some((row) => row.noBidCents !== null),
    hasNoAsks: rows.some((row) => row.noAskCents !== null),
    hasSizes: rows.some(
      (row) =>
        row.yesBidSize !== null
        || row.yesAskSize !== null
        || row.noBidSize !== null
        || row.noAskSize !== null,
    ),
    hasTrades: rows.some((row) => row.tradePriceCents !== null || row.tradeSize !== null),
    hasMarketMetadata: rows.some((row) => row.marketTicker !== null || row.seriesTicker !== null),
    hasFloorStrike: rows.some((row) => row.floorStrike !== null),
    hasEventTicker: rows.some((row) => row.eventTicker !== null) || eventTickers.length > 0,
    hasSequenceOrUpdateId: rows.some((row) => row.sequenceOrUpdateId !== null),
    hasExchangeTimestamp: rows.some((row) => row.exchangeTimestampMs !== null),
    hasVendorReceiveTimestamp: rows.some((row) => row.vendorReceiveTimestampMs !== null),
    nonZeroSpreadShare: roundShare(nonZeroSpreadCount, spreadRows.length),
    zeroSpreadShare: roundShare(zeroSpreadCount, spreadRows.length),
    distinctMarkets: marketTickers.length,
    distinctEvents: ladder.distinctEvents,
    eventsWith2PlusStrikes: ladder.eventsWith2PlusStrikes,
    eventsWith3PlusStrikes: ladder.eventsWith3PlusStrikes,
    maxStrikesPerEvent: ladder.maxStrikesPerEvent,
    schemaNotes,
  };
}

function createMissingSampleAudit(vendorId: string): VendorSampleAudit {
  return {
    vendorId,
    sampleStatus: "missing-samples",
    sampleFileCount: 0,
    rowCount: 0,
    marketTickers: [],
    seriesTickers: [],
    eventTickers: [],
    earliestTimestamp: null,
    latestTimestamp: null,
    timestampResolution: "unknown",
    medianSnapshotGapMs: null,
    p90SnapshotGapMs: null,
    maxSnapshotGapMs: null,
    hasYesBids: false,
    hasYesAsks: false,
    hasNoBids: false,
    hasNoAsks: false,
    hasSizes: false,
    hasTrades: false,
    hasMarketMetadata: false,
    hasFloorStrike: false,
    hasEventTicker: false,
    hasSequenceOrUpdateId: false,
    hasExchangeTimestamp: false,
    hasVendorReceiveTimestamp: false,
    nonZeroSpreadShare: null,
    zeroSpreadShare: null,
    distinctMarkets: 0,
    distinctEvents: 0,
    eventsWith2PlusStrikes: 0,
    eventsWith3PlusStrikes: 0,
    maxStrikesPerEvent: 0,
    schemaNotes: [],
  };
}

export function sampleHasKxbtc15mCoverage(audit: VendorSampleAudit): boolean {
  return audit.seriesTickers.some((series) => series === "KXBTC15M")
    || audit.marketTickers.some((ticker) => ticker.startsWith("KXBTC15M"));
}

export function sampleHasKxbtcdCoverage(audit: VendorSampleAudit): boolean {
  return audit.seriesTickers.some((series) => series === "KXBTCD")
    || audit.marketTickers.some((ticker) => ticker.startsWith("KXBTCD"));
}
