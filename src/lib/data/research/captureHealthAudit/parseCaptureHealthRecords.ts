import type {
  ParsedBtcSpotRecord,
  ParsedMarketMetadataRecord,
  ParsedTopOfBookRecord,
} from "./captureHealthAuditTypes";
import { hourBucketFromIso, parseIsoTimestampMs } from "./captureHealthAuditUtils";

/** Parse one top-of-book JSONL line. Invalid/incomplete lines return null. */
export function parseTopOfBookLine(line: string, lineNumber: number): ParsedTopOfBookRecord | null {
  const parsed = JSON.parse(line) as Record<string, unknown>;
  const marketTicker = typeof parsed.marketTicker === "string" ? parsed.marketTicker : null;
  const receivedAtLocal = typeof parsed.receivedAtLocal === "string" ? parsed.receivedAtLocal : null;

  if (!marketTicker || !receivedAtLocal) {
    return null;
  }

  const receivedAtMs = parseIsoTimestampMs(receivedAtLocal);
  if (receivedAtMs === null) {
    return null;
  }

  return {
    lineNumber,
    runId: typeof parsed.runId === "string" ? parsed.runId : null,
    marketTicker,
    eventTicker: typeof parsed.eventTicker === "string" ? parsed.eventTicker : null,
    seriesTicker: typeof parsed.seriesTicker === "string" ? parsed.seriesTicker : null,
    receivedAtLocal,
    receivedAtMs,
    exchangeTimestampMs:
      typeof parsed.exchangeTimestampMs === "number" ? parsed.exchangeTimestampMs : null,
    sequence: typeof parsed.sequence === "number" ? parsed.sequence : null,
    bookState: typeof parsed.bookState === "string" ? parsed.bookState : "unknown",
    yesBestBidCents:
      typeof parsed.yesBestBidCents === "number" ? parsed.yesBestBidCents : null,
    yesBestAskCents:
      typeof parsed.yesBestAskCents === "number" ? parsed.yesBestAskCents : null,
    yesBestBidSize:
      typeof parsed.yesBestBidSize === "number" ? parsed.yesBestBidSize : null,
    yesBestAskSize:
      typeof parsed.yesBestAskSize === "number" ? parsed.yesBestAskSize : null,
    noBestBidCents:
      typeof parsed.noBestBidCents === "number" ? parsed.noBestBidCents : null,
    noBestAskCents:
      typeof parsed.noBestAskCents === "number" ? parsed.noBestAskCents : null,
    noBestBidSize:
      typeof parsed.noBestBidSize === "number" ? parsed.noBestBidSize : null,
    noBestAskSize:
      typeof parsed.noBestAskSize === "number" ? parsed.noBestAskSize : null,
    yesSpreadCents: typeof parsed.yesSpreadCents === "number" ? parsed.yesSpreadCents : null,
    noSpreadCents: typeof parsed.noSpreadCents === "number" ? parsed.noSpreadCents : null,
    isEconomicallyValid:
      typeof parsed.isEconomicallyValid === "boolean" ? parsed.isEconomicallyValid : undefined,
    isParityUsable:
      typeof parsed.isParityUsable === "boolean" ? parsed.isParityUsable : undefined,
    economicBookState:
      typeof parsed.economicBookState === "string" ? parsed.economicBookState : undefined,
    hourBucket: hourBucketFromIso(receivedAtLocal),
  };
}

export function parseBtcSpotLine(line: string): ParsedBtcSpotRecord | null {
  const parsed = JSON.parse(line) as Record<string, unknown>;
  const receivedAtLocal = typeof parsed.receivedAtLocal === "string" ? parsed.receivedAtLocal : null;
  const priceUsd = typeof parsed.priceUsd === "number" ? parsed.priceUsd : null;

  if (!receivedAtLocal || priceUsd === null) {
    return null;
  }

  const receivedAtMs = parseIsoTimestampMs(receivedAtLocal);
  if (receivedAtMs === null) {
    return null;
  }

  return {
    receivedAtLocal,
    receivedAtMs,
    exchangeTimestampMs:
      typeof parsed.exchangeTimestampMs === "number" ? parsed.exchangeTimestampMs : null,
    priceUsd,
  };
}

export function parseMarketMetadataLine(line: string): ParsedMarketMetadataRecord | null {
  const parsed = JSON.parse(line) as Record<string, unknown>;
  const marketTicker = typeof parsed.marketTicker === "string" ? parsed.marketTicker : null;

  if (!marketTicker) {
    return null;
  }

  return {
    marketTicker,
    eventTicker: typeof parsed.eventTicker === "string" ? parsed.eventTicker : null,
  };
}

export function isZeroSpread(record: ParsedTopOfBookRecord): boolean {
  if (record.yesSpreadCents === 0) {
    return true;
  }

  if (record.noSpreadCents === 0) {
    return true;
  }

  if (
    record.yesBestBidCents !== null
    && record.yesBestAskCents !== null
    && record.yesBestBidCents === record.yesBestAskCents
  ) {
    return true;
  }

  return false;
}

export function isCrossedOrInverted(record: ParsedTopOfBookRecord): boolean {
  if (
    record.yesBestBidCents !== null
    && record.yesBestAskCents !== null
    && record.yesBestBidCents >= record.yesBestAskCents
  ) {
    return true;
  }

  return false;
}

export function isMissingBidOrAsk(record: ParsedTopOfBookRecord): boolean {
  return record.yesBestBidCents === null || record.yesBestAskCents === null;
}

export function segmentKey(value: string | null, fallback = "unknown"): string {
  return value?.trim() ? value : fallback;
}
