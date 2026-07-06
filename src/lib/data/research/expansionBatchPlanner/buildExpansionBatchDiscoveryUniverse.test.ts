import { describe, expect, it } from "vitest";

import {
  buildExpansionBatchDiscoveryUniverse,
  formatDiscoveryUniversePlannerNotes,
} from "./buildExpansionBatchDiscoveryUniverse";
import { mergeExpansionBatchDiscoverySourcesByMonth } from "./loadExpansionBatchDiscoveryCache";

describe("buildExpansionBatchDiscoveryUniverse", () => {
  const discoverySources = mergeExpansionBatchDiscoverySourcesByMonth({
    discoveryResultByMonth: new Map([["2026-05", 479]]),
    discoveryCacheByMonth: new Map(),
    staleCacheMonths: [],
  });

  it("marks importability exhaustion when discovered months have no importable allocations", () => {
    const diagnostics = buildExpansionBatchDiscoveryUniverse({
      knownCandidateMonths: ["2026-05"],
      expandedCandidateMonths: ["2026-05"],
      discoverySources,
      discoveryResultPresent: true,
      allocationCount: 0,
      rejectedCandidateCount: 1,
    });

    expect(diagnostics.plannerExhausted).toBe(true);
    expect(diagnostics.universeComplete).toBe(true);
    expect(diagnostics.universeIncomplete).toBe(false);
    expect(diagnostics.exhaustionReason).toBe("importability-exhausted");
    expect(diagnostics.undiscoveredCandidateMonths).toEqual([]);
  });

  it("marks discovery universe incomplete when expanded months lack discovery data", () => {
    const diagnostics = buildExpansionBatchDiscoveryUniverse({
      knownCandidateMonths: ["2026-05"],
      expandedCandidateMonths: ["2026-05", "2026-06"],
      discoverySources,
      discoveryResultPresent: true,
      allocationCount: 0,
      rejectedCandidateCount: 1,
    });

    expect(diagnostics.universeIncomplete).toBe(true);
    expect(diagnostics.universeComplete).toBe(false);
    expect(diagnostics.exhaustionReason).toBe("discovery-incomplete");
    expect(diagnostics.undiscoveredCandidateMonths).toEqual(["2026-06"]);
    expect(diagnostics.discoveryFrontierMonths).toContain("2026-06");
  });

  it("adds planner notes that distinguish exhausted vs incomplete universes", () => {
    const exhausted = formatDiscoveryUniversePlannerNotes(
      buildExpansionBatchDiscoveryUniverse({
        knownCandidateMonths: ["2026-05"],
        expandedCandidateMonths: ["2026-05"],
        discoverySources,
        discoveryResultPresent: true,
        allocationCount: 0,
        rejectedCandidateCount: 1,
      }),
    );

    expect(exhausted.some((note) => note.includes("Known discovery universe exhausted"))).toBe(
      true,
    );

    const incomplete = formatDiscoveryUniversePlannerNotes(
      buildExpansionBatchDiscoveryUniverse({
        knownCandidateMonths: ["2026-05"],
        expandedCandidateMonths: ["2026-05", "2026-06"],
        discoverySources,
        discoveryResultPresent: true,
        allocationCount: 0,
        rejectedCandidateCount: 1,
      }),
    );

    expect(incomplete.some((note) => note.includes("Discovery universe incomplete"))).toBe(true);
    expect(incomplete.some((note) => note.includes("2026-06"))).toBe(true);
  });
});
