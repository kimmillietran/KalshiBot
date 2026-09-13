import { median } from "../kalshiTobMomentumDiscovery/streamTrainMomentumDiscovery";
import { computeMomentumEffectiveSampleSize } from "../momentumEvidenceContract";
import {
  LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID,
  buildMomentumIndependentUnitKey,
} from "../kalshiTobMomentumValidationCohort";
import {
  computeGrossExecutableOneContractPnlCents,
  diagnosticSignedMidpointContinuationCents,
} from "../kalshiTobMomentumFamily";

import {
  MomentumValidationError,
  type MomentumValidationOutcomeMetrics,
  type SyntheticValidationEpisode,
} from "./momentumValidationTypes";

function mean(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * Pure synthetic episode → validation metrics.
 * Dedups by marketTicker × tradingDayUtc × candidateId (first occurrence wins).
 * Null executable P&L is unobservable — never coerced to zero.
 */
export function computeValidationOutcomesFromEpisodes(
  episodes: readonly SyntheticValidationEpisode[],
  options?: {
    candidateId?: string;
  },
): MomentumValidationOutcomeMetrics {
  const candidateId = options?.candidateId ?? LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID;
  const seen = new Set<string>();
  const retained: SyntheticValidationEpisode[] = [];
  let duplicateUnitsRemoved = 0;

  for (const episode of episodes) {
    const episodeCandidateId = episode.candidateId ?? candidateId;
    if (episodeCandidateId !== candidateId) {
      // Non-locked cells are ignored for locked-candidate evaluation.
      continue;
    }
    const unitId = buildMomentumIndependentUnitKey({
      marketTicker: episode.marketTicker,
      tradingDayUtc: episode.tradingDayUtc,
      candidateId: episodeCandidateId,
    });
    if (seen.has(unitId)) {
      duplicateUnitsRemoved += 1;
      continue;
    }
    seen.add(unitId);
    retained.push({ ...episode, candidateId: episodeCandidateId });
  }

  const independentEss = computeMomentumEffectiveSampleSize(
    retained.map((episode) => ({
      marketTicker: episode.marketTicker,
      calendarDay: episode.tradingDayUtc,
      structuralCellId: episode.candidateId ?? candidateId,
      usable: true,
    })),
  );

  const execValues: number[] = [];
  const midValues: number[] = [];
  let responseObservableCount = 0;
  let executableObservableCount = 0;
  const markets = new Set<string>();
  const marketDays = new Set<string>();

  for (const episode of retained) {
    markets.add(episode.marketTicker);
    marketDays.add(`${episode.marketTicker}:${episode.tradingDayUtc}`);

    if (episode.responseObservable) {
      responseObservableCount += 1;
    }
    if (episode.executableObservable) {
      executableObservableCount += 1;
    }

    if (episode.signedExecutablePnlCents != null) {
      if (!episode.executableObservable) {
        throw new MomentumValidationError(
          "signedExecutablePnlCents present while executableObservable=false",
        );
      }
      execValues.push(episode.signedExecutablePnlCents);
    } else if (episode.executableObservable) {
      throw new MomentumValidationError(
        "executableObservable=true requires signedExecutablePnlCents "
          + "(missing response is unobservable, not zero)",
      );
    }

    if (episode.signedMidpointContinuationCents != null && episode.responseObservable) {
      midValues.push(episode.signedMidpointContinuationCents);
    }
  }

  const executableObservabilityShare =
    retained.length === 0 ? 0 : executableObservableCount / retained.length;
  const responseObservableShare =
    retained.length === 0 ? 0 : responseObservableCount / retained.length;

  const signedExecutableMedianCents = median(execValues);
  const signedExecutableMeanCents = mean(execValues);
  const signedMidpointMedianCents = median(midValues);
  const signedMidpointMeanCents = mean(midValues);

  const midpointOnly =
    execValues.length === 0
    && midValues.length > 0
    && executableObservableCount === 0;

  return {
    independentValidationEss: independentEss,
    signedExecutableMedianCents,
    signedExecutableMeanCents,
    signedMidpointMedianCents,
    signedMidpointMeanCents,
    executableObservabilityShare,
    responseObservableShare,
    distinctMarkets: markets.size,
    distinctMarketDays: marketDays.size,
    retainedUnitCount: retained.length,
    duplicateUnitsRemoved,
    midpointOnly,
  };
}

/**
 * Exact family helper wrappers for tests — keep arithmetic authority in family module.
 */
export function computeExecutablePnlViaFamilyHelper(input: {
  continuationSign: -1 | 1;
  entryYesBestBidCents: number;
  entryNoBestBidCents: number;
  exitYesBestBidCents: number;
  exitNoBestBidCents: number;
}): number {
  return computeGrossExecutableOneContractPnlCents(input);
}

export function computeDiagnosticMidViaFamilyHelper(input: {
  continuationSign: -1 | 1;
  eventMidCents: number;
  responseMidCents: number;
}): number {
  return diagnosticSignedMidpointContinuationCents(input);
}
