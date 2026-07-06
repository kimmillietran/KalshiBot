import type { ExpansionBatchDiscoveryUniverseDiagnostics } from "./expansionBatchDiscoveryUniverseTypes";

export function createEmptyDiscoveryUniverseFixture(
  overrides: Partial<ExpansionBatchDiscoveryUniverseDiagnostics> = {},
): ExpansionBatchDiscoveryUniverseDiagnostics {
  return {
    knownCandidateMonths: [],
    expandedCandidateMonths: [],
    discoveredMonths: [],
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
