import { parseKalshiMarketWire } from "@/lib/data/importers/kalshi/kalshiSettlementRetrieval";
import { formatKxbtc15mEventTicker } from "@/lib/data/research/kalshiBrtiAccessProbe";

export type LiveMarketIdentity = {
  ticker: string;
  eventTicker: string;
  seriesTicker: string;
  closeTimeUtc: string;
  floorStrike: number | null;
  status: string;
  openTimeUtc: string | null;
};

export type LiveMarketBindResult =
  | { status: "bound"; market: LiveMarketIdentity; candidatesConsidered: number }
  | { status: "unbound"; reason: string; market: null; candidatesConsidered: number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sameUtcInstant(left: string, right: string): boolean {
  const leftMs = Date.parse(left);
  const rightMs = Date.parse(right);
  return Number.isFinite(leftMs) && Number.isFinite(rightMs) && leftMs === rightMs;
}

export function extractLiveMarketIdentities(body: unknown): LiveMarketIdentity[] {
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
      seriesTicker: wire.series_ticker ?? "KXBTC15M",
      closeTimeUtc: wire.close_time,
      floorStrike: wire.floor_strike ?? null,
      status: wire.status,
      openTimeUtc: wire.open_time,
    }];
  });
}

/**
 * Bind the planned quarter-hour close to a live KXBTC15M market.
 * Does not substitute a different event or close. When several strikes share
 * the matching event, pick the median floor_strike deterministically.
 */
export function bindLiveMarketToPlannedClose(input: {
  body: unknown;
  plannedCloseIso: string;
  expectedEventTicker?: string;
}): LiveMarketBindResult {
  const expectedEventTicker = input.expectedEventTicker
    ?? formatKxbtc15mEventTicker(Date.parse(input.plannedCloseIso));
  const markets = extractLiveMarketIdentities(input.body);
  const matching = markets.filter((market) => (
    (market.eventTicker === expectedEventTicker || market.ticker.startsWith(`${expectedEventTicker}-`))
    && sameUtcInstant(market.closeTimeUtc, input.plannedCloseIso)
  ));
  if (matching.length === 0) {
    return {
      status: "unbound",
      reason: "no-open-kxbtc15m-market-matches-planned-close",
      market: null,
      candidatesConsidered: markets.length,
    };
  }
  const ranked = [...matching].sort((left, right) => {
    const leftStrike = left.floorStrike ?? Number.POSITIVE_INFINITY;
    const rightStrike = right.floorStrike ?? Number.POSITIVE_INFINITY;
    if (leftStrike !== rightStrike) {
      return leftStrike - rightStrike;
    }
    return left.ticker.localeCompare(right.ticker);
  });
  const selected = ranked[Math.floor((ranked.length - 1) / 2)]!;
  return {
    status: "bound",
    market: selected,
    candidatesConsidered: markets.length,
  };
}

export function officialSettlementMatchesBoundMarket(input: {
  body: unknown;
  bound: LiveMarketIdentity;
}): {
  matches: boolean;
  reason: string | null;
  expirationValue: string | null;
} {
  const identities = extractLiveMarketIdentities(input.body);
  const matched = identities.find((market) => (
    market.ticker === input.bound.ticker
    && market.eventTicker === input.bound.eventTicker
    && sameUtcInstant(market.closeTimeUtc, input.bound.closeTimeUtc)
  ));
  if (!matched) {
    return { matches: false, reason: "official-metadata-does-not-match-bound-ticker", expirationValue: null };
  }
  const expiration = readExpiration(input.body, matched.ticker);
  return {
    matches: true,
    reason: expiration == null || expiration.trim() === "" ? "official-expiration-not-yet-published" : null,
    expirationValue: expiration,
  };
}

function readExpiration(body: unknown, ticker: string): string | null {
  if (!isRecord(body)) {
    return null;
  }
  const bags: unknown[] = [];
  if (Array.isArray(body.markets)) {
    bags.push(...body.markets);
  } else if (isRecord(body.market) || typeof body.ticker === "string") {
    bags.push(isRecord(body.market) ? body.market : body);
  }
  for (const item of bags) {
    if (!isRecord(item)) {
      continue;
    }
    if (item.ticker !== ticker) {
      continue;
    }
    return typeof item.expiration_value === "string" ? item.expiration_value : null;
  }
  return null;
}
