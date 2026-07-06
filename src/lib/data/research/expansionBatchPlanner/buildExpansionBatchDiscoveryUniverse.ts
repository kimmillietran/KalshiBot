import type {
  ExpansionBatchDiscoverySourcesByMonth,
  ExpansionBatchDiscoveryUniverseDiagnostics,
  ExpansionBatchUniverseExhaustionReason,
} from "./expansionBatchDiscoveryUniverseTypes";

function previousCalendarMonth(month: string): string | null {
  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthNumber = Number(monthText);
  if (!Number.isFinite(year) || !Number.isFinite(monthNumber)) {
    return null;
  }

  if (monthNumber === 1) {
    return `${year - 1}-12`;
  }

  return `${year}-${String(monthNumber - 1).padStart(2, "0")}`;
}

function nextCalendarMonth(month: string): string | null {
  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthNumber = Number(monthText);
  if (!Number.isFinite(year) || !Number.isFinite(monthNumber)) {
    return null;
  }

  if (monthNumber === 12) {
    return `${year + 1}-01`;
  }

  return `${year}-${String(monthNumber + 1).padStart(2, "0")}`;
}

function sortUnique(months: Iterable<string>): string[] {
  return [...new Set(months)].sort();
}

function computeDiscoveredMonths(
  discoverySources: ExpansionBatchDiscoverySourcesByMonth,
): string[] {
  return sortUnique(
    [...discoverySources.entries()]
      .filter(([, source]) => source.mergedDiscoveryCount > 0)
      .map(([month]) => month),
  );
}

function computeUndiscoveredCandidateMonths(
  candidateMonths: readonly string[],
  discoveredMonths: readonly string[],
): string[] {
  const discovered = new Set(discoveredMonths);
  return candidateMonths.filter((month) => !discovered.has(month));
}

function computeDiscoveryFrontierMonths(input: {
  knownCandidateMonths: readonly string[];
  expandedCandidateMonths: readonly string[];
  undiscoveredCandidateMonths: readonly string[];
  discoveredMonths: readonly string[];
}): string[] {
  const discovered = new Set(input.discoveredMonths);
  const known = new Set(input.knownCandidateMonths);
  const frontier = new Set<string>();

  for (const month of input.undiscoveredCandidateMonths) {
    const previous = previousCalendarMonth(month);
    const next = nextCalendarMonth(month);
    if ((previous && discovered.has(previous)) || (next && discovered.has(next))) {
      frontier.add(month);
    }

    if (!known.has(month)) {
      frontier.add(month);
    }
  }

  return sortUnique(frontier);
}

function computeStaleDiscoveryMonths(input: {
  candidateMonths: readonly string[];
  discoverySources: ExpansionBatchDiscoverySourcesByMonth;
  discoveryResultPresent: boolean;
}): string[] {
  const stale: string[] = [];

  for (const month of input.candidateMonths) {
    const source = input.discoverySources.get(month);
    if (!source) {
      if (input.discoveryResultPresent) {
        stale.push(month);
      }
      continue;
    }

    if (source.cacheSegmentStale) {
      stale.push(month);
      continue;
    }

    if (
      source.discoveryResultCount > 0
      && source.cacheSegmentPresent
      && source.discoveryCacheCount < source.discoveryResultCount
    ) {
      stale.push(month);
    }
  }

  return sortUnique(stale);
}

function classifyExhaustionReason(input: {
  plannerExhausted: boolean;
  knownCandidateMonthCount: number;
  universeIncomplete: boolean;
  rejectedCandidateCount: number;
}): ExpansionBatchUniverseExhaustionReason {
  if (!input.plannerExhausted) {
    return "none";
  }

  if (input.knownCandidateMonthCount === 0) {
    return "coverage-exhausted";
  }

  if (input.universeIncomplete) {
    return "discovery-incomplete";
  }

  if (input.rejectedCandidateCount > 0) {
    return "importability-exhausted";
  }

  return "importability-exhausted";
}

/** Builds discovery-universe diagnostics for the expansion batch planner. */
export function buildExpansionBatchDiscoveryUniverse(input: {
  knownCandidateMonths: readonly string[];
  expandedCandidateMonths: readonly string[];
  discoverySources: ExpansionBatchDiscoverySourcesByMonth;
  discoveryResultPresent: boolean;
  allocationCount: number;
  rejectedCandidateCount: number;
}): ExpansionBatchDiscoveryUniverseDiagnostics {
  const discoveredMonths = computeDiscoveredMonths(input.discoverySources);
  const undiscoveredCandidateMonths = computeUndiscoveredCandidateMonths(
    input.expandedCandidateMonths,
    discoveredMonths,
  );
  const discoveryFrontierMonths = computeDiscoveryFrontierMonths({
    knownCandidateMonths: input.knownCandidateMonths,
    expandedCandidateMonths: input.expandedCandidateMonths,
    undiscoveredCandidateMonths,
    discoveredMonths,
  });
  const staleDiscoveryMonths = computeStaleDiscoveryMonths({
    candidateMonths: input.expandedCandidateMonths,
    discoverySources: input.discoverySources,
    discoveryResultPresent: input.discoveryResultPresent,
  });

  const plannerExhausted = input.allocationCount === 0;
  const universeIncomplete =
    undiscoveredCandidateMonths.length > 0
    || staleDiscoveryMonths.length > 0
    || discoveryFrontierMonths.length > 0;
  const universeComplete = plannerExhausted && !universeIncomplete;

  return {
    knownCandidateMonths: input.knownCandidateMonths,
    expandedCandidateMonths: input.expandedCandidateMonths,
    discoveredMonths,
    undiscoveredCandidateMonths,
    discoveryFrontierMonths,
    staleDiscoveryMonths,
    plannerExhausted,
    universeComplete,
    universeIncomplete,
    exhaustionReason: classifyExhaustionReason({
      plannerExhausted,
      knownCandidateMonthCount: input.knownCandidateMonths.length,
      universeIncomplete,
      rejectedCandidateCount: input.rejectedCandidateCount,
    }),
  };
}

export function formatDiscoveryUniversePlannerNotes(
  diagnostics: ExpansionBatchDiscoveryUniverseDiagnostics,
): string[] {
  const notes: string[] = [];

  if (diagnostics.expandedCandidateMonths.length > diagnostics.knownCandidateMonths.length) {
  const added = diagnostics.expandedCandidateMonths.filter(
    (month) => !diagnostics.knownCandidateMonths.includes(month),
  );
    notes.push(
      `Expanded candidate universe by ${added.length} month(s) from recommendation windows and scheduled expansion jobs.`,
    );
  }

  if (diagnostics.undiscoveredCandidateMonths.length > 0) {
    notes.push(
      `Discovery universe incomplete: ${diagnostics.undiscoveredCandidateMonths.length} candidate month(s) lack discovery data (${diagnostics.undiscoveredCandidateMonths.join(", ")}).`,
    );
  }

  if (diagnostics.staleDiscoveryMonths.length > 0) {
    notes.push(
      `Stale discovery for ${diagnostics.staleDiscoveryMonths.length} month(s): ${diagnostics.staleDiscoveryMonths.join(", ")}. Refresh discovery before re-planning.`,
    );
  }

  if (diagnostics.discoveryFrontierMonths.length > 0) {
    notes.push(
      `Discovery frontier months: ${diagnostics.discoveryFrontierMonths.join(", ")}.`,
    );
  }

  if (diagnostics.plannerExhausted && diagnostics.universeComplete) {
    notes.push(
      "Known discovery universe exhausted. No additional importable work remains in discovered candidate months.",
    );
  }

  if (diagnostics.plannerExhausted && diagnostics.universeIncomplete) {
    notes.push(
      "Planner exhausted for the current discovery universe. Additional discovery refresh may surface importable opportunities.",
    );
  }

  return notes;
}
