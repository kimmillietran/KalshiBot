import { describe, expect, it } from "vitest";

import { buildPlannedExpansionImportQueue } from "./buildPlannedExpansionImportQueue";
import type { ExpansionDiscoveredMarket } from "./expansionExecutorTypes";
import type { ExpansionImportPlanningHistory } from "./expansionImportSelectionTypes";

function market(
  ticker: string,
  overrides?: Partial<ExpansionDiscoveredMarket>,
): ExpansionDiscoveredMarket {
  const openTime = overrides?.openTime ?? `2026-01-15T12:${String(ticker.length).padStart(2, "0")}:00.000Z`;
  const closeTime = overrides?.closeTime ?? `2026-01-15T12:${String(ticker.length + 15).padStart(2, "0")}:00.000Z`;
  const expirationValue = overrides?.expirationValue ?? "60010.25";

  return {
    marketTicker: ticker,
    seriesTicker: "KXBTC15M",
    eventTicker: "KXBTC15M-26JAN01",
    status: "finalized",
    openTime,
    closeTime,
    settlementTime: null,
    expirationValue,
    title: null,
    subtitle: null,
    listMarketWire: overrides?.listMarketWire ?? {
      ticker,
      event_ticker: "KXBTC15M-26JAN01",
      series_ticker: "KXBTC15M",
      status: "finalized",
      open_time: openTime,
      close_time: closeTime,
      expiration_value: expirationValue,
    },
    provenance: {
      source: "kalshi-historical-api",
      fetchedAt: "2026-07-04T04:00:00.000Z",
      requestPath: "/historical/markets",
    },
    ...overrides,
  };
}

function unsupportedMarket(ticker: string): ExpansionDiscoveredMarket {
  return market(ticker, {
    expirationValue: "",
    listMarketWire: {
      ticker,
      event_ticker: "KXBTC15M-26JAN01",
      series_ticker: "KXBTC15M",
      status: "finalized",
      open_time: "2026-01-15T12:00:00.000Z",
      close_time: "2026-01-15T12:15:00.000Z",
      expiration_value: "",
    },
  });
}

function createHistory(
  overrides?: Partial<ExpansionImportPlanningHistory>,
): ExpansionImportPlanningHistory {
  return {
    summaryPath: "data/research-results/historical-expansion-import-summary.json",
    summaryPresent: true,
    knownUnsupportedTickers: new Set(),
    successfullyImportedTickers: new Set(),
    ...overrides,
  };
}

describe("buildPlannedExpansionImportQueue", () => {
  it("excludes deduped markets from the planned queue", () => {
    const discovered = [market("A"), market("B"), market("C")];
    const existing = new Set(["B"]);

    const plan = buildPlannedExpansionImportQueue(discovered, existing, null);

    expect(plan.alreadyCoveredCount).toBe(1);
    expect(plan.plannedQueue.map((entry) => entry.marketTicker)).toEqual(["A", "C"]);
  });

  it("applies max-markets as a hard cap on the planned queue", () => {
    const discovered = Array.from({ length: 20 }, (_, index) => market(`M-${index}`));

    const plan = buildPlannedExpansionImportQueue(discovered, new Set(), 10);

    expect(plan.plannedQueue).toHaveLength(10);
    expect(plan.plannedQueue.map((entry) => entry.marketTicker)).toEqual([
      "M-0",
      "M-1",
      "M-10",
      "M-11",
      "M-12",
      "M-13",
      "M-14",
      "M-15",
      "M-16",
      "M-17",
    ]);
  });

  it("respects remaining budget across multiple planning calls", () => {
    const discovered = [market("A"), market("B"), market("C")];

    const first = buildPlannedExpansionImportQueue(discovered, new Set(), 2);
    expect(first.plannedQueue.map((entry) => entry.marketTicker)).toEqual(["A", "B"]);

    const second = buildPlannedExpansionImportQueue(
      discovered,
      new Set(["A", "B"]),
      0,
    );
    expect(second.plannedQueue).toHaveLength(0);
  });

  it("prefers likely supported and unknown markets before known unsupported", () => {
    const discovered = [
      unsupportedMarket("UNSUPPORTED-1"),
      unsupportedMarket("UNSUPPORTED-2"),
      market("SUPPORTED-1"),
      market("UNKNOWN-1"),
      unsupportedMarket("UNSUPPORTED-3"),
    ];
    const history = createHistory({
      successfullyImportedTickers: new Set(["SUPPORTED-1"]),
    });

    const plan = buildPlannedExpansionImportQueue(discovered, new Set(), 3, {
      sampleStrategy: "supported-first",
      planningHistory: history,
      selectionSeed: "job-1",
    });

    expect(plan.plannedQueue.map((entry) => entry.marketTicker)).toEqual([
      "SUPPORTED-1",
      "UNKNOWN-1",
      "UNSUPPORTED-1",
    ]);
    expect(plan.selection).toEqual({
      selectedSupportedMarkets: 1,
      selectedUnknownMarkets: 1,
      selectedUnsupportedMarkets: 1,
    });
  });

  it("selects unsupported markets only after supported and unknown candidates are exhausted", () => {
    const discovered = [
      unsupportedMarket("UNSUPPORTED-1"),
      unsupportedMarket("UNSUPPORTED-2"),
      market("UNKNOWN-1"),
      market("UNKNOWN-2"),
    ];

    const plan = buildPlannedExpansionImportQueue(discovered, new Set(), 3, {
      sampleStrategy: "supported-first",
      planningHistory: createHistory(),
      selectionSeed: "job-1",
    });

    expect(plan.plannedQueue.map((entry) => entry.marketTicker)).toEqual([
      "UNKNOWN-1",
      "UNKNOWN-2",
      "UNSUPPORTED-1",
    ]);
    expect(plan.selection.selectedUnsupportedMarkets).toBe(1);
  });

  it("deprioritizes markets previously confirmed unsupported in summary history", () => {
    const discovered = [
      market("HISTORY-UNSUPPORTED"),
      market("FRESH-UNKNOWN"),
    ];
    const history = createHistory({
      knownUnsupportedTickers: new Set(["HISTORY-UNSUPPORTED"]),
    });

    const plan = buildPlannedExpansionImportQueue(discovered, new Set(), 1, {
      sampleStrategy: "supported-first",
      planningHistory: history,
      selectionSeed: "job-1",
    });

    expect(plan.plannedQueue.map((entry) => entry.marketTicker)).toEqual([
      "FRESH-UNKNOWN",
    ]);
  });

  it("orders earliest markets deterministically within each category", () => {
    const discovered = [
      market("LATE", {
        openTime: "2026-01-15T13:00:00.000Z",
        closeTime: "2026-01-15T13:15:00.000Z",
      }),
      market("EARLY", {
        openTime: "2026-01-15T11:00:00.000Z",
        closeTime: "2026-01-15T11:15:00.000Z",
      }),
    ];

    const plan = buildPlannedExpansionImportQueue(discovered, new Set(), null, {
      sampleStrategy: "earliest",
      planningHistory: createHistory(),
      selectionSeed: "job-1",
    });

    expect(plan.plannedQueue.map((entry) => entry.marketTicker)).toEqual([
      "EARLY",
      "LATE",
    ]);
  });

  it("orders random sampling deterministically for the same seed", () => {
    const discovered = Array.from({ length: 6 }, (_, index) => market(`M-${index}`));

    const first = buildPlannedExpansionImportQueue(discovered, new Set(), 4, {
      sampleStrategy: "random",
      planningHistory: createHistory(),
      selectionSeed: "stable-seed",
    });
    const second = buildPlannedExpansionImportQueue(discovered, new Set(), 4, {
      sampleStrategy: "random",
      planningHistory: createHistory(),
      selectionSeed: "stable-seed",
    });

    expect(first.plannedQueue.map((entry) => entry.marketTicker)).toEqual(
      second.plannedQueue.map((entry) => entry.marketTicker),
    );
    expect(first.plannedQueue).toHaveLength(4);
  });
});
