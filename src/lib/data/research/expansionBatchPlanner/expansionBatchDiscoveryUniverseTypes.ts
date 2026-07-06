export type ExpansionBatchUniverseExhaustionReason =
  | "none"
  | "coverage-exhausted"
  | "discovery-incomplete"
  | "importability-exhausted";

export type ExpansionBatchDiscoveryUniverseDiagnostics = {
  knownCandidateMonths: readonly string[];
  expandedCandidateMonths: readonly string[];
  discoveredMonths: readonly string[];
  undiscoveredCandidateMonths: readonly string[];
  discoveryFrontierMonths: readonly string[];
  staleDiscoveryMonths: readonly string[];
  plannerExhausted: boolean;
  universeComplete: boolean;
  universeIncomplete: boolean;
  exhaustionReason: ExpansionBatchUniverseExhaustionReason;
};

export type ExpansionBatchDiscoveryMonthSource = {
  discoveryResultCount: number;
  discoveryCacheCount: number;
  mergedDiscoveryCount: number;
  cacheSegmentPresent: boolean;
  cacheSegmentStale: boolean;
};

export type ExpansionBatchDiscoverySourcesByMonth = ReadonlyMap<
  string,
  ExpansionBatchDiscoveryMonthSource
>;
