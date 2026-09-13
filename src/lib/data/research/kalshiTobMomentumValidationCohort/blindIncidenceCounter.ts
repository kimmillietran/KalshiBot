import {
  computeMomentumEffectiveSampleSize as computeFamilyMomentumEss,
  utcTradingDayFromTimestampMs,
} from "../kalshiTobMomentumFamily";
import { computeMomentumEffectiveSampleSize as computeKeyMomentumEss } from "../momentumEvidenceContract";

import {
  FORBIDDEN_MOMENTUM_VALIDATION_OUTCOME_FIELD_NAMES,
  LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID,
  MomentumValidationCohortError,
  type MomentumValidationBlindIncidence,
  type MomentumValidationIndependentUnitRecord,
} from "./momentumValidationCohortTypes";

export function buildMomentumIndependentUnitKey(input: {
  marketTicker: string;
  tradingDayUtc: string;
  candidateId?: string;
}): string {
  const candidateId = input.candidateId ?? LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID;
  return `${input.marketTicker}:${input.tradingDayUtc}:${candidateId}`;
}

export function parseMomentumIndependentUnitKey(unitId: string): {
  marketTicker: string;
  tradingDayUtc: string;
  candidateId: string;
} {
  const parts = unitId.split(":");
  if (parts.length < 3) {
    throw new MomentumValidationCohortError(`invalid independent unit key: ${unitId}`);
  }
  const candidateId = parts.slice(2).join(":");
  return {
    marketTicker: parts[0]!,
    tradingDayUtc: parts[1]!,
    candidateId,
  };
}

export function assertBlindIncidenceHasNoOutcomeFields(
  value: unknown,
): asserts value is MomentumValidationBlindIncidence {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new MomentumValidationCohortError("blind incidence must be an object");
  }
  const record = value as Record<string, unknown>;
  for (const field of FORBIDDEN_MOMENTUM_VALIDATION_OUTCOME_FIELD_NAMES) {
    if (Object.prototype.hasOwnProperty.call(record, field)) {
      throw new MomentumValidationCohortError(
        `blind incidence must not include outcome field: ${field}`,
      );
    }
  }
  for (const key of Object.keys(record)) {
    const lower = key.toLowerCase();
    if (
      lower.includes("pnl")
      || lower.includes("midpoint")
      || lower.includes("pvalue")
      || lower.includes("directionconsist")
      || lower.includes("signed")
      || lower.includes("continuation")
    ) {
      throw new MomentumValidationCohortError(
        `blind incidence must not include outcome-like field: ${key}`,
      );
    }
  }
  if (record.outcomesOpened !== false) {
    throw new MomentumValidationCohortError("outcomesOpened must be false");
  }
}

export type BlindEpisodeUnitInput = {
  unitId: string;
  /** First qualifying episode for this market-day-cell within the segment. */
  countsTowardIndependentN: boolean;
  responseObservable: boolean;
  executableObservable: boolean;
};

/**
 * Pure outcome-blind incidence from synthetic unit keys / observability flags.
 * MUST NOT accept or emit prices, P&L, signs, or continuation magnitudes.
 */
export function buildBlindIncidenceFromUnitKeys(input: {
  segmentRunId: string;
  episodes: readonly BlindEpisodeUnitInput[];
}): MomentumValidationBlindIncidence {
  const independent = input.episodes.filter((row) => row.countsTowardIndependentN);
  const markets = new Set<string>();
  const marketDays = new Set<string>();
  for (const row of independent) {
    const parsed = parseMomentumIndependentUnitKey(row.unitId);
    markets.add(parsed.marketTicker);
    marketDays.add(`${parsed.marketTicker}:${parsed.tradingDayUtc}`);
  }

  const independentEss = computeKeyMomentumEss(
    independent.map((row) => {
      const parsed = parseMomentumIndependentUnitKey(row.unitId);
      return {
        marketTicker: parsed.marketTicker,
        calendarDay: parsed.tradingDayUtc,
        structuralCellId: parsed.candidateId,
        usable: true,
      };
    }),
  );

  // Cross-check family ESS helper on the same independent observations.
  const familyEss = computeFamilyMomentumEss({
    independentObservations: independent.map((row) => {
      const parsed = parseMomentumIndependentUnitKey(row.unitId);
      return {
        marketTicker: parsed.marketTicker,
        tradingDayUtc: parsed.tradingDayUtc,
        eventTimestampMs: 0,
        structuralCellId: parsed.candidateId,
        countsTowardIndependentN: true,
      };
    }),
  });
  if (
    independent.length > 0
    && familyEss.effectiveSampleSize > independentEss
  ) {
    throw new MomentumValidationCohortError(
      "family ESS cannot exceed key-count ESS under market-day/cell capping",
    );
  }

  const incidence: MomentumValidationBlindIncidence = {
    segmentRunId: input.segmentRunId,
    independentEss,
    qualifyingEpisodeCount: independent.length,
    responseObservableCount: input.episodes.filter((row) => row.responseObservable).length,
    executableObservableCount: input.episodes.filter((row) => row.executableObservable)
      .length,
    distinctMarkets: markets.size,
    distinctMarketDays: marketDays.size,
    outcomesOpened: false,
  };
  assertBlindIncidenceHasNoOutcomeFields(incidence);
  return incidence;
}

/**
 * Cap at most one independent unit per market-day-candidate within a segment,
 * then build blind incidence. Extra same-key episodes are diagnostic-only.
 */
export function buildBlindIncidenceWithMarketDayCap(input: {
  segmentRunId: string;
  episodeKeys: readonly {
    unitId: string;
    responseObservable?: boolean;
    executableObservable?: boolean;
  }[];
}): {
  incidence: MomentumValidationBlindIncidence;
  independentUnitIds: readonly string[];
  diagnosticOnlyCount: number;
} {
  const seen = new Set<string>();
  const episodes: BlindEpisodeUnitInput[] = [];
  let diagnosticOnlyCount = 0;
  for (const row of input.episodeKeys) {
    const countsTowardIndependentN = !seen.has(row.unitId);
    if (countsTowardIndependentN) {
      seen.add(row.unitId);
    } else {
      diagnosticOnlyCount += 1;
    }
    episodes.push({
      unitId: row.unitId,
      countsTowardIndependentN,
      responseObservable: row.responseObservable ?? true,
      executableObservable: row.executableObservable ?? true,
    });
  }
  const incidence = buildBlindIncidenceFromUnitKeys({
    segmentRunId: input.segmentRunId,
    episodes,
  });
  return {
    incidence,
    independentUnitIds: [...seen].sort((a, b) => a.localeCompare(b)),
    diagnosticOnlyCount,
  };
}

export type StreamingBlindEpisodeFlags = {
  marketTicker: string;
  eventTimestampMs: number;
  candidateId?: string;
  /** Crossing / refractory already applied by caller; this is a qualifying episode. */
  qualifyingEpisode: true;
  /** Response quote existence in [t+H, t+H+tol] — boolean only, no prices. */
  responseObservable: boolean;
  /** Executable sizes present at response — boolean only, no prices/P&L. */
  executableObservable: boolean;
};

/**
 * Streaming helper: build unit keys + observability flags without calling
 * computeGrossExecutableOneContractPnlCents or diagnosticSignedMidpointContinuationCents.
 */
export function accumulateStreamingBlindEpisodes(input: {
  segmentRunId: string;
  episodes: readonly StreamingBlindEpisodeFlags[];
}): {
  incidence: MomentumValidationBlindIncidence;
  independentUnitIds: readonly string[];
  records: readonly MomentumValidationIndependentUnitRecord[];
} {
  const records: MomentumValidationIndependentUnitRecord[] = [];
  const episodeKeys: {
    unitId: string;
    responseObservable: boolean;
    executableObservable: boolean;
  }[] = [];

  for (const episode of input.episodes) {
    const tradingDayUtc = utcTradingDayFromTimestampMs(episode.eventTimestampMs);
    const candidateId = episode.candidateId ?? LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID;
    const unitId = buildMomentumIndependentUnitKey({
      marketTicker: episode.marketTicker,
      tradingDayUtc,
      candidateId,
    });
    episodeKeys.push({
      unitId,
      responseObservable: episode.responseObservable,
      executableObservable: episode.executableObservable,
    });
    records.push({
      unitId,
      marketTicker: episode.marketTicker,
      tradingDayUtc,
      candidateId,
      observedInRunId: input.segmentRunId,
      responseObservable: episode.responseObservable,
      executableObservable: episode.executableObservable,
    });
  }

  const capped = buildBlindIncidenceWithMarketDayCap({
    segmentRunId: input.segmentRunId,
    episodeKeys,
  });
  return {
    incidence: capped.incidence,
    independentUnitIds: capped.independentUnitIds,
    records,
  };
}
