import { describe, expect, it } from "vitest";

import { buildPlannedExpansionImportQueue } from "./buildPlannedExpansionImportQueue";
import type { ExpansionDiscoveredMarket } from "./expansionExecutorTypes";

function market(ticker: string): ExpansionDiscoveredMarket {
  return {
    marketTicker: ticker,
    seriesTicker: "KXBTC15M",
    eventTicker: "KXBTC15M-26JAN01",
    status: "finalized",
    openTime: "2026-01-15T12:00:00.000Z",
    closeTime: "2026-01-15T12:15:00.000Z",
    settlementTime: null,
    expirationValue: null,
    title: null,
    subtitle: null,
    provenance: {
      source: "kalshi-historical-api",
      fetchedAt: "2026-07-04T04:00:00.000Z",
      requestPath: "/historical/markets",
    },
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
    expect(plan.plannedQueue[0]?.marketTicker).toBe("M-0");
    expect(plan.plannedQueue[9]?.marketTicker).toBe("M-9");
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
});
