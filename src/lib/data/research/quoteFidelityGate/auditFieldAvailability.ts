import { marketWindowSchema } from "@/lib/data/schemas";

import { extractBronzeMarketMetadata } from "./analyzeLadderFeasibility";
import { resolveMarketFixturePath } from "./resolveMarketFixturePath";
import type {
  FieldAvailabilityEntry,
  QuoteFidelityGateIo,
  RegistryMarketRecord,
} from "./quoteFidelityGateTypes";

function silverMarketWindowHasEventTicker(): boolean {
  const shape = marketWindowSchema.shape;
  return "eventTicker" in shape || "event_ticker" in shape;
}

export function auditFieldAvailability(input: {
  markets: readonly RegistryMarketRecord[];
  fixtureSampleSize: number;
  fixturesDir?: string | null;
  io: QuoteFidelityGateIo;
}): FieldAvailabilityEntry[] {
  let fixtureEventTickerPresent = false;
  let fixtureFloorStrikePresent = false;
  let fixtureMarketTickerPresent = false;
  let fixtureYesBidPresent = false;
  let fixtureYesAskPresent = false;
  let fixtureCloseTimePresent = false;
  let fixtureTimestampPresent = false;

  const sampledMarkets = input.fixtureSampleSize > 0
    ? input.markets.slice(0, input.fixtureSampleSize)
    : input.markets;

  for (const market of sampledMarkets) {
    const fixturePath = resolveMarketFixturePath({
      marketTicker: market.marketTicker,
      registryFixturePath: market.fixturePath,
      fixturesDir: input.fixturesDir ?? null,
      io: input.io,
    });

    if (!input.io.fileExists(fixturePath)) {
      continue;
    }

    const fixtureJson = input.io.readFile(fixturePath);
    const meta = extractBronzeMarketMetadata(fixtureJson);
    if (meta.eventTicker) {
      fixtureEventTickerPresent = true;
    }
    if (meta.floorStrike !== null) {
      fixtureFloorStrikePresent = true;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(fixtureJson);
    } catch {
      continue;
    }

    if (typeof parsed !== "object" || parsed === null || !Array.isArray((parsed as { bronzeRecords?: unknown }).bronzeRecords)) {
      continue;
    }

    for (const record of (parsed as { bronzeRecords: readonly unknown[] }).bronzeRecords) {
      if (typeof record !== "object" || record === null) {
        continue;
      }

      const rec = record as Record<string, unknown>;
      if (typeof rec.ticker === "string") {
        fixtureMarketTickerPresent = true;
      }

      if (rec.contentType === "kalshi.historical.candlestick" && typeof rec.payload === "object" && rec.payload !== null) {
        const payload = rec.payload as Record<string, unknown>;
        const price = payload.price;
        if (typeof price === "object" && price !== null && "close" in (price as Record<string, unknown>)) {
          fixtureYesBidPresent = true;
          fixtureYesAskPresent = true;
        }
      }

      if (rec.contentType === "kalshi.historical.market" && typeof rec.payload === "object" && rec.payload !== null) {
        const payload = rec.payload as Record<string, unknown>;
        if (typeof payload.close_time === "string" || typeof payload.closeTime === "string") {
          fixtureCloseTimePresent = true;
        }
      }

      if (typeof rec.observedAt === "string" || typeof rec.eventTime === "string") {
        fixtureTimestampPresent = true;
      }
    }
  }

  const registryHasMarketTicker = input.markets.length > 0;

  return [
    {
      field: "eventTicker in silver MarketWindow",
      present: silverMarketWindowHasEventTicker(),
      source: "marketWindowSchema",
      notes: "Silver MarketWindow schema does not persist eventTicker.",
    },
    {
      field: "eventTicker in bronze fixtures",
      present: fixtureEventTickerPresent,
      source: fixtureEventTickerPresent ? "kalshi.historical.market payload" : null,
      notes: fixtureEventTickerPresent
        ? "Available on bronze market records in sampled fixtures."
        : "Not found in sampled fixtures.",
    },
    {
      field: "floorStrike / strikePriceUsd",
      present: fixtureFloorStrikePresent,
      source: fixtureFloorStrikePresent ? "kalshi.historical.market.floor_strike" : null,
      notes: "Silver uses strikePriceUsd; bronze uses floor_strike.",
    },
    {
      field: "marketTicker",
      present: registryHasMarketTicker,
      source: registryHasMarketTicker ? "dataset-registry.json" : null,
      notes: fixtureMarketTickerPresent
        ? "Canonical market identity is persisted in registry and bronze records."
        : "Registry lists marketTicker for all markets; bronze ticker not confirmed in sampled fixtures.",
    },
    {
      field: "yesBidCents",
      present: fixtureYesBidPresent,
      source: fixtureYesBidPresent ? "kalshi candle close proxy" : null,
      notes: "Historical candles synthesize yesBid=yesAsk from close price.",
    },
    {
      field: "yesAskCents",
      present: fixtureYesAskPresent,
      source: fixtureYesAskPresent ? "kalshi candle close proxy" : null,
      notes: "Historical candles synthesize yesBid=yesAsk from close price.",
    },
    {
      field: "noBidCents",
      present: false,
      source: null,
      notes: "NO side quotes are not persisted in historical candle payloads.",
    },
    {
      field: "noAskCents",
      present: false,
      source: null,
      notes: "NO side quotes are not persisted in historical candle payloads.",
    },
    {
      field: "real bid/ask source",
      present: false,
      source: null,
      notes: "Historical corpus uses live-close-only candle proxies, not displayed touch quotes.",
    },
    {
      field: "displayed depth / size at touch",
      present: false,
      source: null,
      notes: "Volume/open interest in candles are not displayed depth at the touch.",
    },
    {
      field: "timestamp / closeTime",
      present: fixtureCloseTimePresent || fixtureTimestampPresent,
      source: fixtureCloseTimePresent ? "market.close_time" : "bronze temporal fields",
      notes: "Temporal fields exist but quotes are not executable touch snapshots.",
    },
  ];
}
