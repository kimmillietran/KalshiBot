import type { ResearchDatasetSeriesRegistry } from "@/lib/data/research/registry/researchDatasetRegistryTypes";

import { resolveEventTickerFromMarketTicker } from "./resolveEventTickerFromMarketTicker";
import { resolveMarketFixturePath } from "./resolveMarketFixturePath";
import type {
  LadderFeasibilitySummary,
  LadderHistogramEntry,
  LadderSampleEvent,
  QuoteFidelityGateIo,
  RegistryMarketRecord,
} from "./quoteFidelityGateTypes";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function readNumber(record: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

export function extractBronzeMarketMetadata(fixtureJson: string): {
  eventTicker: string | null;
  floorStrike: number | null;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fixtureJson);
  } catch {
    return { eventTicker: null, floorStrike: null };
  }

  if (!isRecord(parsed) || !Array.isArray(parsed.bronzeRecords)) {
    return { eventTicker: null, floorStrike: null };
  }

  for (const record of parsed.bronzeRecords) {
    if (!isRecord(record) || record.contentType !== "kalshi.historical.market") {
      continue;
    }

    const payload = record.payload;
    if (!isRecord(payload)) {
      continue;
    }

    return {
      eventTicker: readString(payload, "event_ticker", "eventTicker"),
      floorStrike: readNumber(payload, "floor_strike", "floorStrike"),
    };
  }

  return { eventTicker: null, floorStrike: null };
}

type EventAccumulator = {
  eventTicker: string;
  marketTickers: string[];
  floorStrikes: number[];
  parsedEventTickers: Set<string>;
  fixtureEventTickers: Set<string>;
};

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

function mean(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return (
    Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100)
    / 100
  );
}

export function analyzeLadderFeasibility(input: {
  markets: readonly RegistryMarketRecord[];
  fixtureMetadataByTicker: ReadonlyMap<
    string,
    { eventTicker: string | null; floorStrike: number | null }
  >;
}): LadderFeasibilitySummary {
  const events = new Map<string, EventAccumulator>();

  for (const market of input.markets) {
    const parsedEventTicker = resolveEventTickerFromMarketTicker(market.marketTicker);
    const fixtureMeta = input.fixtureMetadataByTicker.get(market.marketTicker);
    const fixtureEventTicker = fixtureMeta?.eventTicker ?? null;
    const eventTicker = fixtureEventTicker ?? parsedEventTicker;

    if (!eventTicker) {
      continue;
    }

    const existing = events.get(eventTicker) ?? {
      eventTicker,
      marketTickers: [],
      floorStrikes: [],
      parsedEventTickers: new Set<string>(),
      fixtureEventTickers: new Set<string>(),
    };

    existing.marketTickers.push(market.marketTicker);
    if (parsedEventTicker) {
      existing.parsedEventTickers.add(parsedEventTicker);
    }
    if (fixtureEventTicker) {
      existing.fixtureEventTickers.add(fixtureEventTicker);
    }

    const floorStrike = fixtureMeta?.floorStrike ?? null;
    if (floorStrike !== null) {
      existing.floorStrikes.push(floorStrike);
    }

    events.set(eventTicker, existing);
  }

  const strikeCounts = [...events.values()].map((event) => event.marketTickers.length);
  const histogramMap = new Map<number, number>();
  for (const count of strikeCounts) {
    histogramMap.set(count, (histogramMap.get(count) ?? 0) + 1);
  }

  const ladderHistogram: LadderHistogramEntry[] = [...histogramMap.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([strikesPerEvent, eventCount]) => ({ strikesPerEvent, eventCount }));

  const eventsWith1Strike = strikeCounts.filter((count) => count === 1).length;
  const eventsWith2PlusStrikes = strikeCounts.filter((count) => count >= 2).length;
  const eventsWith3PlusStrikes = strikeCounts.filter((count) => count >= 3).length;
  const maxStrikesPerEvent = strikeCounts.length > 0 ? Math.max(...strikeCounts) : 0;

  let parsedVsFixtureMismatchCount = 0;
  const sampleEvents: LadderSampleEvent[] = [...events.values()]
    .sort((left, right) => left.eventTicker.localeCompare(right.eventTicker))
    .slice(0, 10)
    .map((event) => {
      const parsed = [...event.parsedEventTickers][0] ?? null;
      const fixture = [...event.fixtureEventTickers][0] ?? null;
      const mismatch =
        parsed !== null
        && fixture !== null
        && parsed !== fixture;
      if (mismatch) {
        parsedVsFixtureMismatchCount += 1;
      }

      let eventTickerSource: LadderSampleEvent["eventTickerSource"] = "parsed";
      if (fixture && parsed && fixture === parsed) {
        eventTickerSource = "fixture";
      } else if (fixture && parsed && fixture !== parsed) {
        eventTickerSource = "mismatch";
      } else if (fixture) {
        eventTickerSource = "fixture";
      }

      return {
        eventTicker: event.eventTicker,
        strikeCount: event.marketTickers.length,
        marketTickers: [...event.marketTickers].sort(),
        floorStrikes: [...event.floorStrikes].sort((left, right) => left - right),
        eventTickerSource,
      };
    });

  return {
    eventCount: events.size,
    eventsWith1Strike,
    eventsWith2PlusStrikes,
    eventsWith3PlusStrikes,
    maxStrikesPerEvent,
    medianStrikesPerEvent: median(strikeCounts),
    meanStrikesPerEvent: mean(strikeCounts),
    ladderHistogram,
    sampleEvents,
    ladderResearchFeasible: eventsWith2PlusStrikes > 0,
    parsedVsFixtureMismatchCount,
  };
}

export function loadFixtureMetadataForMarkets(input: {
  markets: readonly RegistryMarketRecord[];
  io: QuoteFidelityGateIo;
  sampleSize: number;
  fixturesDir?: string | null;
}): Map<string, { eventTicker: string | null; floorStrike: number | null }> {
  const metadata = new Map<string, { eventTicker: string | null; floorStrike: number | null }>();
  const sampled = input.sampleSize > 0
    ? input.markets.slice(0, input.sampleSize)
    : input.markets;

  for (const market of sampled) {
    const fixturePath = resolveMarketFixturePath({
      marketTicker: market.marketTicker,
      registryFixturePath: market.fixturePath,
      fixturesDir: input.fixturesDir ?? null,
      io: input.io,
    });

    if (!input.io.fileExists(fixturePath)) {
      metadata.set(market.marketTicker, { eventTicker: null, floorStrike: null });
      continue;
    }

    metadata.set(
      market.marketTicker,
      extractBronzeMarketMetadata(input.io.readFile(fixturePath)),
    );
  }

  return metadata;
}

export function mapRegistryMarkets(
  registry: ResearchDatasetSeriesRegistry,
): RegistryMarketRecord[] {
  return registry.markets.map((market) => ({
    marketTicker: market.marketTicker,
    marketCloseTime: market.marketCloseTime,
    bidAskFidelity: market.bidAskFidelity,
    fixturePath: market.fixturePath,
  }));
}
