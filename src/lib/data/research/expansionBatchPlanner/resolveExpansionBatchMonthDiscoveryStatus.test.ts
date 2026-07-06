import { describe, expect, it } from "vitest";

import { resolveExpansionBatchMonthDiscoveryStatus } from "./resolveExpansionBatchMonthDiscoveryStatus";

describe("resolveExpansionBatchMonthDiscoveryStatus", () => {
  it("classifies cache segments with zero markets as discovered-empty", () => {
    expect(
      resolveExpansionBatchMonthDiscoveryStatus({
        discoveryResultCount: 0,
        discoveryCacheCount: 0,
        cacheSegmentPresent: true,
        cacheSegmentStale: false,
      }),
    ).toBe("discovered-empty");
  });

  it("classifies months with no discovery artifacts as unknown", () => {
    expect(
      resolveExpansionBatchMonthDiscoveryStatus({
        discoveryResultCount: 0,
        discoveryCacheCount: 0,
        cacheSegmentPresent: false,
        cacheSegmentStale: false,
      }),
    ).toBe("unknown");
  });
});
