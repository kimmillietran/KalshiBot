import { describe, expect, it, vi } from "vitest";

import type { ExpansionDiscoveredMarket } from "../expansionExecutorTypes";
import {
  buildDiscoveryCacheSegmentPath,
  buildExpansionDiscoveryCacheSegmentDocument,
  calendarMonthToDiscoverySamplingWindow,
  createExpansionDiscoveryDeltaRefreshDiagnostics,
  evaluateDiscoveryCacheSegment,
  mergeExpansionDiscoveredMarkets,
  parseExpansionDiscoveryCacheSegmentJson,
  resolveDiscoveryWithDeltaRefresh,
  serializeExpansionDiscoveryCacheSegment,
  validateExpansionDiscoveredMarketWire,
} from "./index";

const GENERATED_AT = "2026-07-05T18:00:00.000Z";
const CACHE_DIR = "data/research-results/discovery-cache";
const SERIES = "KXBTC15M";

function createMarket(
  ticker: string,
  openTime: string,
  wireValue = "cached-wire",
): ExpansionDiscoveredMarket {
  return {
    marketTicker: ticker,
    seriesTicker: SERIES,
    eventTicker: ticker.split("-").slice(0, 2).join("-"),
    status: "closed",
    openTime,
    closeTime: openTime,
    settlementTime: null,
    expirationValue: "100000",
    title: null,
    subtitle: null,
    listMarketWire: {
      ticker,
      expiration_value: "100000",
      open_time: openTime,
      close_time: openTime,
      wireValue,
    },
    provenance: {
      source: "kalshi-rest",
      fetchedAt: GENERATED_AT,
      requestUrl: "https://example.test/markets",
      pageIndex: 0,
    },
  };
}

function createMockIo(initialFiles: Record<string, string> = {}) {
  const files = { ...initialFiles };
  const writes: Record<string, string> = {};

  return {
    files,
    writes,
    io: {
      readFile: (path: string) => files[path] ?? "",
      fileExists: (path: string) => path in files,
      readdir: (path: string) =>
        Object.keys(files)
          .filter((entry) => entry.startsWith(`${path}/`))
          .map((entry) => entry.slice(path.length + 1).split("/")[0]!)
          .filter((entry, index, entries) => entries.indexOf(entry) === index),
      isDirectory: () => true,
      writeFile: (path: string, data: string) => {
        files[path] = data;
        writes[path] = data;
      },
      mkdirSync: () => {},
    },
  };
}

function seedFreshSegment(
  files: Record<string, string>,
  month: string,
  markets: ExpansionDiscoveredMarket[],
  discoveryFetchDurationMs = 1200,
): void {
  const path = buildDiscoveryCacheSegmentPath({
    cacheDir: CACHE_DIR,
    seriesTicker: SERIES,
    calendarMonth: month,
  });
  files[path] = serializeExpansionDiscoveryCacheSegment(
    buildExpansionDiscoveryCacheSegmentDocument({
      seriesTicker: SERIES,
      calendarMonth: month,
      generatedAt: GENERATED_AT,
      sampling: calendarMonthToDiscoverySamplingWindow(month),
      markets,
      discoveryFetchDurationMs,
    }),
  );
}

const FULL_WINDOW = {
  after: "2026-01-01T00:00:00.000Z",
  before: "2026-05-31T23:59:59.999Z",
};

describe("validateExpansionDiscoveredMarketWire", () => {
  it("requires raw list-market wire fields", () => {
    const market = createMarket("KXBTC15M-26JAN151215-00", "2026-01-15T12:15:00.000Z");
    expect(validateExpansionDiscoveredMarketWire(market)).toBeNull();
  });
});

describe("parseExpansionDiscoveryCacheSegmentJson", () => {
  it("rejects corrupt checksum payloads", () => {
    const markets = [createMarket("KXBTC15M-26JAN151215-00", "2026-01-15T12:15:00.000Z")];
    const document = buildExpansionDiscoveryCacheSegmentDocument({
      seriesTicker: SERIES,
      calendarMonth: "2026-01",
      generatedAt: GENERATED_AT,
      sampling: calendarMonthToDiscoverySamplingWindow("2026-01"),
      markets,
    });
    const corrupt = serializeExpansionDiscoveryCacheSegment(document).replace(
      document.checksum,
      "deadbeef",
    );

    const parsed = parseExpansionDiscoveryCacheSegmentJson("segment.json", corrupt);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.reason).toContain("checksum");
    }
  });
});

describe("evaluateDiscoveryCacheSegment", () => {
  it("treats fresh segments as cache hits within ttl", () => {
    const segment = buildExpansionDiscoveryCacheSegmentDocument({
      seriesTicker: SERIES,
      calendarMonth: "2026-03",
      generatedAt: GENERATED_AT,
      sampling: calendarMonthToDiscoverySamplingWindow("2026-03"),
      markets: [createMarket("KXBTC15M-26MAR151215-00", "2026-03-15T12:15:00.000Z")],
    });

    expect(
      evaluateDiscoveryCacheSegment({
        segment,
        ttlHours: 24,
        nowMs: Date.parse(GENERATED_AT) + 60_000,
        forcedRefresh: false,
      }),
    ).toBe("cache-hit");
  });
});

describe("mergeExpansionDiscoveredMarkets", () => {
  it("dedupes duplicate tickers with later segment winning", () => {
    const merged = mergeExpansionDiscoveredMarkets([
      [createMarket("KXBTC15M-26JAN151215-00", "2026-01-15T12:15:00.000Z", "jan")],
      [createMarket("KXBTC15M-26JAN151215-00", "2026-01-15T12:15:00.000Z", "feb")],
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0]?.listMarketWire.wireValue).toBe("feb");
  });
});

describe("resolveDiscoveryWithDeltaRefresh", () => {
  it("uses cached segments for a full multi-month cache hit", async () => {
    const mock = createMockIo();
    for (const month of ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05"]) {
      seedFreshSegment(mock.files, month, [
        createMarket(
          `KXBTC15M-${month.replace("-", "")}-1215-00`,
          `${month}-15T12:15:00.000Z`,
        ),
      ]);
    }

    const discoverMarkets = vi.fn();
    const diagnostics = createExpansionDiscoveryDeltaRefreshDiagnostics();

    const markets = await resolveDiscoveryWithDeltaRefresh({
      seriesTicker: SERIES,
      sampling: FULL_WINDOW,
      discoverMarkets,
      io: mock.io,
      config: {
        discoveryCacheDir: CACHE_DIR,
        discoveryCacheSegment: "month",
        discoveryCacheTtlHours: 24,
        refreshDiscoveryMonth: null,
        refreshDiscoveryCache: false,
        useDiscoveryCache: true,
      },
      generatedAt: GENERATED_AT,
      diagnostics,
      nowMs: Date.parse(GENERATED_AT),
    });

    expect(discoverMarkets).not.toHaveBeenCalled();
    expect(markets).toHaveLength(5);
    expect(diagnostics.discoverySegmentsCacheHit).toBe(5);
    expect(diagnostics.estimatedDiscoverySavingsMs).toBe(6000);
  });

  it("refreshes corrupt segments and records warnings", async () => {
    const mock = createMockIo();
    const path = buildDiscoveryCacheSegmentPath({
      cacheDir: CACHE_DIR,
      seriesTicker: SERIES,
      calendarMonth: "2026-01",
    });
    mock.files[path] = "{not-json";

    const discoverMarkets = vi.fn(async (_series, sampling) => [
      createMarket("KXBTC15M-26JAN151215-00", sampling.after),
    ]);
    const diagnostics = createExpansionDiscoveryDeltaRefreshDiagnostics();
    const warnings: string[] = [];

    await resolveDiscoveryWithDeltaRefresh({
      seriesTicker: SERIES,
      sampling: calendarMonthToDiscoverySamplingWindow("2026-01"),
      discoverMarkets,
      io: mock.io,
      config: {
        discoveryCacheDir: CACHE_DIR,
        discoveryCacheSegment: "month",
        discoveryCacheTtlHours: 24,
        refreshDiscoveryMonth: null,
        refreshDiscoveryCache: false,
        useDiscoveryCache: true,
      },
      generatedAt: GENERATED_AT,
      diagnostics,
      warnings,
      nowMs: Date.parse(GENERATED_AT),
    });

    expect(discoverMarkets).toHaveBeenCalledTimes(1);
    expect(diagnostics.discoverySegmentsCorrupt).toBe(1);
    expect(warnings[0]).toContain("corrupt");
  });

  it("forces refresh for all segments when --refresh-discovery-cache is set", async () => {
    const mock = createMockIo();
    seedFreshSegment(mock.files, "2026-03", [
      createMarket("KXBTC15M-26MAR151215-00", "2026-03-15T12:15:00.000Z", "old"),
    ]);

    const discoverMarkets = vi.fn(async (_series, sampling) => [
      createMarket("KXBTC15M-26MAR151530-00", sampling.after, "forced"),
    ]);
    const diagnostics = createExpansionDiscoveryDeltaRefreshDiagnostics();

    await resolveDiscoveryWithDeltaRefresh({
      seriesTicker: SERIES,
      sampling: calendarMonthToDiscoverySamplingWindow("2026-03"),
      discoverMarkets,
      io: mock.io,
      config: {
        discoveryCacheDir: CACHE_DIR,
        discoveryCacheSegment: "month",
        discoveryCacheTtlHours: 24,
        refreshDiscoveryMonth: null,
        refreshDiscoveryCache: true,
        useDiscoveryCache: true,
      },
      generatedAt: GENERATED_AT,
      diagnostics,
      nowMs: Date.parse(GENERATED_AT),
    });

    expect(discoverMarkets).toHaveBeenCalledTimes(1);
    expect(diagnostics.discoverySegmentsRefreshed).toBe(1);
  });

  it("bypasses cache when useDiscoveryCache is false", async () => {
    const mock = createMockIo();
    seedFreshSegment(mock.files, "2026-01", [
      createMarket("KXBTC15M-26JAN151215-00", "2026-01-15T12:15:00.000Z"),
    ]);

    const discoverMarkets = vi.fn(async () => [
      createMarket("KXBTC15M-26JAN151530-00", "2026-01-15T12:30:00.000Z"),
    ]);
    const diagnostics = createExpansionDiscoveryDeltaRefreshDiagnostics(false);

    await resolveDiscoveryWithDeltaRefresh({
      seriesTicker: SERIES,
      sampling: calendarMonthToDiscoverySamplingWindow("2026-01"),
      discoverMarkets,
      io: mock.io,
      config: {
        discoveryCacheDir: CACHE_DIR,
        discoveryCacheSegment: "month",
        discoveryCacheTtlHours: 24,
        refreshDiscoveryMonth: null,
        refreshDiscoveryCache: false,
        useDiscoveryCache: false,
      },
      generatedAt: GENERATED_AT,
      diagnostics,
      nowMs: Date.parse(GENERATED_AT),
    });

    expect(discoverMarkets).toHaveBeenCalledTimes(1);
    expect(diagnostics.discoverySegmentsCacheHit).toBe(0);
  });
});
