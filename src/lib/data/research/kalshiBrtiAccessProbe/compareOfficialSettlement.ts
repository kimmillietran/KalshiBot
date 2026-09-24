import { parseKalshiMarketWire } from "@/lib/data/importers/kalshi/kalshiSettlementRetrieval";

import { parseOfficialNumericString } from "./parseOfficialNumericString";

export type OfficialComparisonRecord = {
  status: "agree" | "disagree" | "pending" | "not-compared" | "not-attempted";
  reason?: string;
  officialExpirationRaw?: string | null;
  venueAverageRaw?: string | null;
  reconstruction?: "unverified";
  comparisonKind?: "venue-provided-window-average-vs-official-expiration";
  matchedTicker?: string;
  matchedEventTicker?: string;
  matchedCloseTime?: string;
  observedCloseIso?: string;
  expectedEventTicker?: string;
  metadataAttempts?: number;
  eventTicker?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function sameUtcInstant(left: string, right: string): boolean {
  const leftMs = Date.parse(left);
  const rightMs = Date.parse(right);
  return Number.isFinite(leftMs) && Number.isFinite(rightMs) && leftMs === rightMs;
}

function marketMatchesObservedWindow(input: {
  ticker: string;
  eventTicker: string;
  closeTime: string;
  expectedEventTicker: string;
  observedCloseIso: string;
}): boolean {
  const eventMatches = input.eventTicker === input.expectedEventTicker
    || input.ticker === input.expectedEventTicker
    || input.ticker.startsWith(`${input.expectedEventTicker}-`);
  return eventMatches && sameUtcInstant(input.closeTime, input.observedCloseIso);
}

export function extractOfficialMarkets(body: unknown): Array<{
  ticker: string;
  eventTicker: string;
  closeTime: string;
  expirationValue: string;
}> {
  if (!isRecord(body)) {
    return [];
  }
  const bags: unknown[] = [];
  if (Array.isArray(body.markets)) {
    bags.push(...body.markets);
  } else if (isRecord(body.market) || typeof body.ticker === "string") {
    bags.push(isRecord(body.market) ? body.market : body);
  }
  return bags.flatMap((item) => {
    const wire = parseKalshiMarketWire(isRecord(item) && item.ticker ? { market: item } : item);
    if (!wire) {
      return [];
    }
    return [{
      ticker: wire.ticker,
      eventTicker: wire.event_ticker,
      closeTime: wire.close_time,
      expirationValue: wire.expiration_value,
    }];
  });
}

export function compareOfficialSettlementToObservedWindow(input: {
  body: unknown;
  venueAverageRaw: string | null;
  observedCloseIso: string;
  expectedEventTicker: string;
}): OfficialComparisonRecord {
  const markets = extractOfficialMarkets(input.body);
  const matched = markets.filter((market) => marketMatchesObservedWindow({
    ticker: market.ticker,
    eventTicker: market.eventTicker,
    closeTime: market.closeTime,
    expectedEventTicker: input.expectedEventTicker,
    observedCloseIso: input.observedCloseIso,
  }));
  if (matched.length === 0) {
    return {
      status: "not-compared",
      reason: "no-matching-official-market-for-observed-window",
      venueAverageRaw: input.venueAverageRaw,
      observedCloseIso: input.observedCloseIso,
      expectedEventTicker: input.expectedEventTicker,
      reconstruction: "unverified",
    };
  }
  const selected = matched.find((market) => market.expirationValue.trim() !== "") ?? matched[0]!;
  if (selected.expirationValue.trim() === "") {
    return {
      status: "pending",
      reason: "official-expiration-value-not-yet-available",
      officialExpirationRaw: null,
      venueAverageRaw: input.venueAverageRaw,
      matchedTicker: selected.ticker,
      matchedEventTicker: selected.eventTicker,
      matchedCloseTime: selected.closeTime,
      observedCloseIso: input.observedCloseIso,
      expectedEventTicker: input.expectedEventTicker,
      reconstruction: "unverified",
    };
  }
  const officialParsed = parseOfficialNumericString(selected.expirationValue);
  const venueParsed = parseOfficialNumericString(input.venueAverageRaw);
  if (officialParsed.kind !== "ok" || venueParsed.kind !== "ok") {
    return {
      status: "not-compared",
      reason: "official-or-venue-value-unparseable",
      officialExpirationRaw: selected.expirationValue,
      venueAverageRaw: input.venueAverageRaw,
      matchedTicker: selected.ticker,
      matchedEventTicker: selected.eventTicker,
      matchedCloseTime: selected.closeTime,
      reconstruction: "unverified",
    };
  }
  const roundedOfficial = officialParsed.value.toFixed(2);
  const roundedVenue = Number(venueParsed.value).toFixed(2);
  return {
    status: roundedOfficial === roundedVenue ? "agree" : "disagree",
    officialExpirationRaw: selected.expirationValue,
    venueAverageRaw: input.venueAverageRaw,
    reconstruction: "unverified",
    comparisonKind: "venue-provided-window-average-vs-official-expiration",
    matchedTicker: selected.ticker,
    matchedEventTicker: selected.eventTicker,
    matchedCloseTime: selected.closeTime,
    observedCloseIso: input.observedCloseIso,
    expectedEventTicker: input.expectedEventTicker,
  };
}
