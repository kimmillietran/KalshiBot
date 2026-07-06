import { describe, expect, it } from "vitest";

import {
  loadExpansionBatchDiscoveryCacheByMonth,
  mergeExpansionBatchDiscoverySourcesByMonth,
  mergedDiscoveryCountsByMonth,
} from "./loadExpansionBatchDiscoveryCache";
import {
  buildExpansionDiscoveryCacheSegmentDocument,
  calendarMonthToDiscoverySamplingWindow,
  serializeExpansionDiscoveryCacheSegment,
} from "@/lib/data/importJobs/expansionExecutor/expansionDiscoveryCache";

const GENERATED_AT = "2026-07-06T00:00:00.000Z";

describe("loadExpansionBatchDiscoveryCache empty segments", () => {
  it("loads zero-market cache segments for planner consumption", () => {
    const segment = serializeExpansionDiscoveryCacheSegment(
      buildExpansionDiscoveryCacheSegmentDocument({
        seriesTicker: "KXBTC15M",
        calendarMonth: "2025-01",
        generatedAt: GENERATED_AT,
        sampling: calendarMonthToDiscoverySamplingWindow("2025-01"),
        markets: [],
      }),
    );

    const io = {
      readFile: () => segment,
      fileExists: (path: string) =>
        path === "data/research-results/discovery-cache"
        || path === "data/research-results/discovery-cache/KXBTC15M"
        || path.endsWith("2025-01.json"),
      listDir: (path: string) =>
        path.endsWith("discovery-cache") ? ["KXBTC15M"] : ["2025-01.json"],
    };

    const loaded = loadExpansionBatchDiscoveryCacheByMonth(
      io,
      "data/research-results/discovery-cache",
      { nowMs: Date.parse(GENERATED_AT) },
    );

    expect(loaded.countsByMonth.get("2025-01")).toBe(0);

    const merged = mergeExpansionBatchDiscoverySourcesByMonth({
      discoveryResultByMonth: new Map(),
      discoveryCacheByMonth: loaded.countsByMonth,
      staleCacheMonths: loaded.staleMonths,
    });

    expect(merged.get("2025-01")?.discoveryStatus).toBe("discovered-empty");
    expect(mergedDiscoveryCountsByMonth(merged).get("2025-01")).toBe(0);
  });
});
