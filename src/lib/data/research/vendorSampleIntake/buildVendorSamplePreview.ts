import type { NormalizedVendorSampleRow } from "@/lib/data/research/vendorOrderbookSufficiencyAudit/parseVendorSample";

import type { VendorOrderbookSamplePreview } from "./vendorSampleIntakeTypes";

function level(
  priceCents: number | null,
  size: number | null,
): Array<{ priceCents: number; size: number }> | null {
  if (priceCents === null) {
    return null;
  }

  return [{ priceCents, size: size ?? 0 }];
}

function timestampKind(row: NormalizedVendorSampleRow): VendorOrderbookSamplePreview["timestampKind"] {
  if (row.exchangeTimestampMs !== null) {
    return "exchange";
  }

  if (row.vendorReceiveTimestampMs !== null) {
    return "vendor-receive";
  }

  return "unknown";
}

function timestampIso(row: NormalizedVendorSampleRow): string | null {
  const ms = row.exchangeTimestampMs ?? row.vendorReceiveTimestampMs ?? row.timestampMs;
  return ms === null ? null : new Date(ms).toISOString();
}

/** Builds preview records without importing into the main corpus. */
export function buildVendorSamplePreviewRecords(input: {
  vendorId: string;
  sourceFile: string;
  rows: readonly NormalizedVendorSampleRow[];
  rawRecords: readonly unknown[];
  limit: number;
}): VendorOrderbookSamplePreview[] {
  return input.rows.slice(0, input.limit).map((row, rowIndex) => ({
    vendorId: input.vendorId,
    sourceFile: input.sourceFile,
    rowIndex,
    marketTicker: row.marketTicker,
    eventTicker: row.eventTicker,
    seriesTicker: row.seriesTicker,
    floorStrike: row.floorStrike,
    timestamp: timestampIso(row),
    timestampKind: timestampKind(row),
    yesBids: level(row.yesBidCents, row.yesBidSize),
    yesAsks: level(row.yesAskCents, row.yesAskSize),
    noBids: level(row.noBidCents, row.noBidSize),
    noAsks: level(row.noAskCents, row.noAskSize),
    raw: input.rawRecords[rowIndex] ?? null,
  }));
}
