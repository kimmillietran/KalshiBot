import { parseOfficialNumericString } from "@/lib/data/research/kalshiBrtiAccessProbe";

import type { AverageFieldKind, MappingStatus, TimedObservation } from "./types";

export type VenueAverageUpdate = {
  fieldName: string;
  fieldKind: AverageFieldKind;
  valueRaw: string | null;
  count: number | null;
  sumRaw: string | null;
  windowStartTsMs: number | null;
  windowEndTsExclusive: number | null;
  providerTimestampMs: number | null;
  localReceivedAtMs: number;
  localReceivedAtMonoMs: number;
};

export type ImpliedSampleInference = {
  mappingStatus: MappingStatus;
  documented: boolean;
  consistentWithObservations: boolean;
  uniquelyIdentified: boolean;
  impliedValue: number | null;
  impliedValueRaw: string | null;
  matchingObservationValueRaws: string[];
  reason: string;
  deltaCount: number | null;
  previousCount: number | null;
  nextCount: number | null;
};

export function classifyAverageField(fieldName: string): AverageFieldKind {
  if (fieldName === "last_60s_windowed_average_15min") {
    return "settlement-window";
  }
  if (fieldName === "avg_60s_data") {
    return "trailing-60s";
  }
  return "unknown";
}

export function isSettlementWindowAverage(fieldName: string): boolean {
  return classifyAverageField(fieldName) === "settlement-window";
}

export function isTrailingAverage(fieldName: string): boolean {
  return classifyAverageField(fieldName) === "trailing-60s";
}

/**
 * Infer a newly included sample from a count/average change only when
 * count increases by exactly one and both averages parse. Rounding can
 * produce multiple raw-tick matches; that is not treated as unique identity.
 */
export function inferAddedSampleFromCountAverage(input: {
  previous: Pick<VenueAverageUpdate, "valueRaw" | "count"> | null;
  next: Pick<VenueAverageUpdate, "valueRaw" | "count">;
  candidateObservations?: readonly TimedObservation[];
}): ImpliedSampleInference {
  const previousCount = input.previous?.count ?? null;
  const nextCount = input.next.count;
  if (nextCount == null || previousCount == null) {
    return {
      mappingStatus: "unresolved",
      documented: false,
      consistentWithObservations: false,
      uniquelyIdentified: false,
      impliedValue: null,
      impliedValueRaw: null,
      matchingObservationValueRaws: [],
      reason: "count-field-missing-or-not-numeric",
      deltaCount: nextCount == null || previousCount == null ? null : nextCount - previousCount,
      previousCount,
      nextCount,
    };
  }
  const deltaCount = nextCount - previousCount;
  if (deltaCount !== 1) {
    return {
      mappingStatus: "unresolved",
      documented: false,
      consistentWithObservations: false,
      uniquelyIdentified: false,
      impliedValue: null,
      impliedValueRaw: null,
      matchingObservationValueRaws: [],
      reason: deltaCount === 0
        ? "count-unchanged-cannot-infer-added-sample"
        : "count-delta-is-not-exactly-one",
      deltaCount,
      previousCount,
      nextCount,
    };
  }
  const previousAvg = parseOfficialNumericString(input.previous?.valueRaw);
  const nextAvg = parseOfficialNumericString(input.next.valueRaw);
  if (previousAvg.kind !== "ok" || nextAvg.kind !== "ok") {
    return {
      mappingStatus: "unresolved",
      documented: false,
      consistentWithObservations: false,
      uniquelyIdentified: false,
      impliedValue: null,
      impliedValueRaw: null,
      matchingObservationValueRaws: [],
      reason: "average-unparseable",
      deltaCount,
      previousCount,
      nextCount,
    };
  }
  const impliedValue = nextAvg.value * nextCount - previousAvg.value * previousCount;
  const impliedValueRaw = String(impliedValue);
  const matches = (input.candidateObservations ?? [])
    .filter((observation) => {
      if (observation.value == null) {
        return false;
      }
      return Math.abs(observation.value - impliedValue) <= 0.005
        || observation.valueRaw === impliedValueRaw;
    })
    .map((observation) => observation.valueRaw)
    .filter((value): value is string => value != null);
  const uniqueMatches = [...new Set(matches)];
  const uniquelyIdentified = uniqueMatches.length === 1;
  const consistentWithObservations = uniqueMatches.length >= 1;
  return {
    mappingStatus: uniquelyIdentified
      ? "uniquely-identified"
      : consistentWithObservations
        ? "consistent-with-observations"
        : "unresolved",
    documented: false,
    consistentWithObservations,
    uniquelyIdentified,
    impliedValue,
    impliedValueRaw,
    matchingObservationValueRaws: uniqueMatches,
    reason: uniquelyIdentified
      ? "count-increased-by-one-and-exactly-one-raw-tick-matches-implied-sample"
      : consistentWithObservations
        ? "count-increased-by-one-but-multiple-or-rounded-raw-ticks-match"
        : "count-increased-by-one-but-no-raw-tick-matches-implied-sample",
    deltaCount,
    previousCount,
    nextCount,
  };
}

export function documentAverageFieldMapping(fieldName: string): {
  mappingStatus: MappingStatus;
  documentedMeaning: string;
} {
  const kind = classifyAverageField(fieldName);
  if (kind === "settlement-window") {
    return {
      mappingStatus: "documented",
      documentedMeaning: "final-minute settlement-window accumulation; not a trailing 60s average",
    };
  }
  if (kind === "trailing-60s") {
    return {
      mappingStatus: "documented",
      documentedMeaning: "trailing [source−60s, source) average; not the quarter-hour settlement average",
    };
  }
  return {
    mappingStatus: "unresolved",
    documentedMeaning: "field is not a documented settlement or trailing-average payload",
  };
}
