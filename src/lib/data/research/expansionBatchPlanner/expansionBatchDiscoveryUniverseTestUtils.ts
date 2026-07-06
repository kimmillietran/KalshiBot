import type { ExpansionBatchDiscoveryUniverseDiagnostics } from "./expansionBatchDiscoveryUniverseTypes";

export function createEmptyDiscoveryUniverseFixture(
  overrides: Partial<ExpansionBatchDiscoveryUniverseDiagnostics> = {},
): ExpansionBatchDiscoveryUniverseDiagnostics {
  return {
    knownCandidateMonths: [],
    expandedCandidateMonths: [],
    discoveredMonths: [],
    discoveredEmptyMonths: [],
    discoveredNonEmptyMonths: [],
    emptyDiscoveryCount: 0,
    undiscoveredCandidateMonths: [],
    discoveryFrontierMonths: [],
    staleDiscoveryMonths: [],
    plannerExhausted: true,
    universeComplete: true,
    universeIncomplete: false,
    exhaustionReason: "importability-exhausted",
    ...overrides,
  };
}
