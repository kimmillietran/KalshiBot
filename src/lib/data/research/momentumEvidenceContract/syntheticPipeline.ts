import {
  EXPECTED_MOMENTUM_DISCOVERY_HYPOTHESIS_COUNT,
  EXPECTED_MOMENTUM_LOOKBACK_WINDOWS_MS,
  EXPECTED_MOMENTUM_RESPONSE_HORIZONS_MS,
  EXPECTED_MOMENTUM_THRESHOLDS_CENTS,
  MOMENTUM_DIRECTION,
  MOMENTUM_MAX_SHORTLIST_K,
  type MomentumCandidateDefinition,
} from "./momentumEvidenceContractTypes";
import { evaluateMomentumHoldout } from "./holdoutSemantics";
import {
  lockHoldoutCandidateFromValidationSurvivors,
  type MomentumLockInputSurvivor,
} from "./lockAndTieBreak";
import { deriveMomentumRequiredEffectiveN } from "./powerAndStopping";
import {
  computeStructuralSimplicityRank,
  rankAndShortlistTrainCandidates,
  type MomentumShortlistScoreInput,
} from "./shortlistPolicy";
import { evaluateMomentumValidationCandidate } from "./validationSemantics";

/**
 * Synthetic 12-cell universe matching expected M14.0a axes.
 * Synthetic outcomes only — no real capture reads.
 */
export function buildSyntheticDiscoveryUniverse(): MomentumCandidateDefinition[] {
  const out: MomentumCandidateDefinition[] = [];
  let rank = 0;
  for (const lookbackWindowMs of EXPECTED_MOMENTUM_LOOKBACK_WINDOWS_MS) {
    for (const thresholdCents of EXPECTED_MOMENTUM_THRESHOLDS_CENTS) {
      for (const responseHorizonMs of EXPECTED_MOMENTUM_RESPONSE_HORIZONS_MS) {
        const hypothesisId =
          `mom-w${lookbackWindowMs}|x${thresholdCents}|h${responseHorizonMs}|continuation`;
        const candidate: MomentumCandidateDefinition = {
          candidateId: hypothesisId,
          hypothesisId,
          discoveryRank: rank,
          lookbackWindowMs,
          thresholdCents,
          responseHorizonMs,
          direction: MOMENTUM_DIRECTION,
        };
        out.push(candidate);
        rank += 1;
      }
    }
  }
  if (out.length !== EXPECTED_MOMENTUM_DISCOVERY_HYPOTHESIS_COUNT) {
    throw new Error(`Expected 12 synthetic cells; got ${out.length}`);
  }
  return out;
}

function syntheticScore(
  candidate: MomentumCandidateDefinition,
  index: number,
): MomentumShortlistScoreInput {
  const base = 12 - index;
  return {
    candidate,
    independentTrainIncidence: Math.max(1, base),
    directionConsistentWithFamily: true,
    executableObservabilityShare: 0.5 + (index % 5) * 0.1,
    executableEffectAvailable: true,
    independentMarketsTouched: Math.max(1, Math.floor(base / 2)),
    independentMarketDaysTouched: Math.max(1, base),
    structuralSimplicityRank: computeStructuralSimplicityRank(candidate),
  };
}

/**
 * Prove contract mechanics: 12 → shortlist ≤3 → validation → 0-or-1 lock → one holdout.
 */
export function runSyntheticMomentumEvidencePipeline(input?: {
  materialEffectThresholdCents?: number;
  forceZeroValidationSurvivors?: boolean;
}): {
  discoveryCount: number;
  shortlistCount: number;
  shortlistIds: string[];
  retainedLineageCount: number;
  validationStatuses: string[];
  lockedCandidateId: string | null;
  holdoutVerdict: string | null;
} {
  const universe = buildSyntheticDiscoveryUniverse();
  const scored = universe.map((candidate, index) => syntheticScore(candidate, index));
  const { shortlist, retainedLineageCount } = rankAndShortlistTrainCandidates({
    discoveryHypothesisCount: universe.length,
    candidates: scored,
    maxK: MOMENTUM_MAX_SHORTLIST_K,
  });

  const materialEffectThresholdCents = input?.materialEffectThresholdCents ?? 2;
  const required = deriveMomentumRequiredEffectiveN({
    alpha: 0.05,
    targetPower: 0.8,
    materialEffectCents: materialEffectThresholdCents,
    outcomeStandardDeviationCents: 10,
  });

  const validationResults: MomentumLockInputSurvivor[] = shortlist.map((row, index) => {
    const statusResult = evaluateMomentumValidationCandidate({
      candidate: row.candidate,
      trainDefinition: row.candidate,
      onTrainShortlist: true,
      independentValidationEss: input?.forceZeroValidationSurvivors ? 2 : 40,
      minEssForValidation: 10,
      directionalConsistency: input?.forceZeroValidationSurvivors
        ? "not-continuation-consistent"
        : "continuation-consistent",
      executableObservabilityShare: 0.8,
      minExecutableObservabilityShare: 0.5,
      captureQualityValid: true,
      midpointOnly: false,
      evidenceInvalidReason: null,
    });
    return {
      ...statusResult,
      independentEvidenceSupport: 40 - index,
      directionalReplicationShare: 0.7 - index * 0.05,
      executableObservabilityShare: 0.8,
      effectClearsMaterialFloor: true,
      structuralSimplicityRank: row.structuralSimplicityRank,
    };
  });

  const locked = lockHoldoutCandidateFromValidationSurvivors({
    survivors: validationResults,
  });

  let holdoutVerdict: string | null = null;
  if (locked) {
    const holdout = evaluateMomentumHoldout({
      locked,
      evaluatedCandidate: locked.candidate,
      independentEss: required.requiredEffectiveN,
      requiredEffectiveN: required.requiredEffectiveN,
      captureQualityValid: true,
      executableObservableShare: 0.9,
      minExecutableObservableShare: 0.5,
      pointEstimateFavorable: true,
      evidenceInvalidReason: null,
      materialEffectThresholdCents,
      observedAbsExecutableEffectCents: materialEffectThresholdCents + 1,
    });
    holdoutVerdict = holdout.verdict;
  }

  return {
    discoveryCount: universe.length,
    shortlistCount: shortlist.length,
    shortlistIds: shortlist.map((row) => row.candidate.candidateId),
    retainedLineageCount,
    validationStatuses: validationResults.map((row) => row.status),
    lockedCandidateId: locked?.candidate.candidateId ?? null,
    holdoutVerdict,
  };
}
