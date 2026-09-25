/**
 * Minimal offline book / time derivers for CryptoStruct RAW-BBO-CHANGE levels.
 * Mirrors scripts/research/streamSettlementFrictionCoverage.py semantics.
 * No network. Does not use settlement labels.
 */

const MONTHS: Record<string, number> = {
  JAN: 1,
  FEB: 2,
  MAR: 3,
  APR: 4,
  MAY: 5,
  JUN: 6,
  JUL: 7,
  AUG: 8,
  SEP: 9,
  OCT: 10,
  NOV: 11,
  DEC: 12,
};

const TICKER_RE =
  /KXBTC15M-(\d{2})([A-Z]{3})(\d{2})(\d{4})-(\d{2})/;

export type BookSideMaps = {
  bids: Map<number, number>;
  asks: Map<number, number>;
};

export type DerivedBboCents = {
  yesBidCents: number;
  yesAskCents: number;
  yesMidpoint: number;
  /** Executable NO ask for buying NO = 100 − YES bid (complement cross). */
  noAskCents: number;
  yesBidSize: number;
  yesAskSize: number;
  crossed: boolean;
  locked: boolean;
};

/** Apply CryptoStruct level tuples [side, priceStr, qtyStr, ...]. side 0=bid, 1=ask. */
export function applyCryptostructLevels(
  books: BookSideMaps,
  levels: readonly unknown[],
  snapshot: boolean,
): void {
  if (snapshot) {
    books.bids.clear();
    books.asks.clear();
  }
  for (const lvl of levels) {
    if (!Array.isArray(lvl) || lvl.length < 3) continue;
    const side = lvl[0];
    const price = Number(lvl[1]);
    const qty = Number(lvl[2]);
    if (!(side === 0 || side === 1)) continue;
    if (!Number.isFinite(price) || !Number.isFinite(qty)) continue;
    if (price < 0 || price > 1 || qty < 0) continue;
    const book = side === 0 ? books.bids : books.asks;
    if (qty === 0) book.delete(price);
    else book.set(price, qty);
  }
}

export function deriveBboCentsFromBooks(books: BookSideMaps): DerivedBboCents | null {
  if (books.bids.size === 0 || books.asks.size === 0) return null;
  let yesBid = -Infinity;
  let yesBidSize = 0;
  for (const [p, q] of books.bids) {
    if (p > yesBid) {
      yesBid = p;
      yesBidSize = q;
    }
  }
  let yesAsk = Infinity;
  let yesAskSize = 0;
  for (const [p, q] of books.asks) {
    if (p < yesAsk) {
      yesAsk = p;
      yesAskSize = q;
    }
  }
  if (!Number.isFinite(yesBid) || !Number.isFinite(yesAsk)) return null;
  const yesBidCents = Math.round(yesBid * 100);
  const yesAskCents = Math.round(yesAsk * 100);
  return {
    yesBidCents,
    yesAskCents,
    yesMidpoint: (yesBidCents + yesAskCents) / 2 / 100,
    noAskCents: 100 - yesBidCents,
    yesBidSize,
    yesAskSize,
    crossed: yesBid > yesAsk,
    locked: yesBid === yesAsk,
  };
}

function zonedWallTimeToUtcMs(input: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  timeZone: string;
}): number {
  // Iterate: guess UTC, read wall in zone, adjust until wall matches.
  let utc = Date.UTC(
    input.year,
    input.month - 1,
    input.day,
    input.hour,
    input.minute,
    0,
  );
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: input.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  for (let i = 0; i < 4; i += 1) {
    const parts = Object.fromEntries(
      dtf.formatToParts(new Date(utc)).map((p) => [p.type, p.value]),
    ) as Record<string, string>;
    const asUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    const desired = Date.UTC(
      input.year,
      input.month - 1,
      input.day,
      input.hour,
      input.minute,
      0,
    );
    const delta = desired - asUtc;
    if (delta === 0) break;
    utc += delta;
  }
  return utc;
}

/**
 * Close instant from ticker HHMM interpreted in America/New_York on the
 * ticker calendar date (same rule as friction streamer).
 */
export function parseCloseTimeMsFromTicker(
  ticker: string,
  timeZone: string = "America/New_York",
): number | null {
  const m = TICKER_RE.exec(ticker);
  if (!m) return null;
  const yy = Number(m[1]);
  const mon = MONTHS[m[2]];
  const dd = Number(m[3]);
  const hhmm = m[4];
  if (!mon || !Number.isFinite(yy) || !Number.isFinite(dd) || hhmm.length !== 4) {
    return null;
  }
  const hour = Number(hhmm.slice(0, 2));
  const minute = Number(hhmm.slice(2, 4));
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return zonedWallTimeToUtcMs({
    year: 2000 + yy,
    month: mon,
    day: dd,
    hour,
    minute,
    timeZone,
  });
}

export function computeTimeRemainingMs(input: {
  entryTimestampMs: number;
  closeTimeMs: number;
}): number | null {
  if (!Number.isFinite(input.entryTimestampMs) || !Number.isFinite(input.closeTimeMs)) {
    return null;
  }
  return input.closeTimeMs - input.entryTimestampMs;
}

export type CryptostructMessageTimestamps = {
  admissionTsNs: number;
  exchangeTsNs: number | null;
  admissionTsMs: number;
  exchangeTsMs: number | null;
};

/** Parse timestamps from a RAW-BBO list message [msg, id, prev, eid, ad_ts, ex_ts?, ...]. */
export function parseCryptostructMessageTimestamps(
  message: readonly unknown[],
): CryptostructMessageTimestamps | null {
  if (message.length < 5) return null;
  const ad = message[4];
  if (typeof ad !== "number" || !Number.isFinite(ad) || ad <= 0) return null;
  const ex = message.length > 5 && typeof message[5] === "number" && message[5] > 0
    ? message[5]
    : null;
  return {
    admissionTsNs: ad,
    exchangeTsNs: ex,
    admissionTsMs: Math.floor(ad / 1_000_000),
    exchangeTsMs: ex != null ? Math.floor(ex / 1_000_000) : null,
  };
}
