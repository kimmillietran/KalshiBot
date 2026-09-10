import {
  EXPECTED_MICROSTRUCTURE_DISCOVERY_HYPOTHESIS_COUNT,
  MICROSTRUCTURE_MAX_SHORTLIST_K,
  type MicrostructureCandidateDefinition,
} from "./microstructureEvidenceContractTypes";
import { evaluateMicrostructureHoldout } from "./holdoutSemantics";
import {
  lockHoldoutCandidateFromValidationSurvivors,
  type MicrostructureLockInputSurvivor,
} from "./lockAndTieBreak";
import {
  rankAndShortlistTrainCandidates,
  type MicrostructureShortlistScoreInput,
} from "./shortlistPolicy";
import { evaluateMicrostructureValidationCandidate } from "./validationSemantics";
import { deriveMicrostructureRequiredEffectiveN } from "./powerAndStopping";

const THRESHOLDS = [0.4, 0.6] as const;
const HORIZONS_MS = [1_000, 5_000, 15_000] as const;
const TIME_BINS = ["lt-5m", "5-to-15m"] as const;

/**
 * Synthetic 12-cell universe matching expected M13.0a axes.
 * Synthetic outcomes only — no real capture reads.
 */
export function buildSyntheticDiscoveryUniverse(): MicrostructureCandidateDefinition[] {
  const out: MicrostructureCandidateDefinition[] = [];
  let rank = 0;
  for (const imbalanceThreshold of THRESHOLDS) {
    for (const responseHorizonMs of HORIZONS_MS) {
      for (const timeRemainingBin of TIME_BINS) {
        const hypothesisId =
          `tob-imb-${imbalanceThreshold}|h${responseHorizonMs}|${timeRemainingBin}|same-direction`;
        out.push({
          candidateId: hypothesisId,
          hypothesisId,
          discoveryRank: rank,
          imbalanceThreshold,
          responseHorizonMs,
          timeRemainingBin,
          direction: "same-direction",
        });
        rank += 1;
      }
    }
  }
  if (out.length !== EXPECTED_MICROSTRUCTURE_DISCOVERY_HYPOTHESIS_COUNT) {
    throw new Error(`Expected 12 synthetic cells; got ${out.length}`);
  }
  return out;
}

function syntheticScore(
  candidate: MicrostructureCandidateDefinition,
  index: number,
): MicrostructureShortlistScoreInput {
  // Deterministic synthetic scores — not real outcomes.
  const base = 12 - index;
  return {
    candidate,
    independentTrainIncidence: Math.max(1, base),
    directionConsistentWithFamily: true,
    executableObservabilityShare: 0.5 + (index % 5) * 0.1,
    executableEffectAvailable: true,
    independentMarketsTouched: Math.max(1, Math.floor(base / 2)),
    independentMarketDaysTouched: Math.max(1, base),
    structuralSimplicityRank: index,
  };
}

/**
 * Prove contract mechanics: 12 → shortlist ≤3 → validation → 0-or-1 lock → one holdout.
 */
export function runSyntheticMicrostructureEvidencePipeline(input?: {
  materialEffectThresholdCents?: number;
  forceZeroValidationSurvivors?: boolean;
}): {
  discoveryCount: number;
  shortlistCount: number;
  shortlistIds: string[];
  validationStatuses: string[];
  lockedCandidateId: string | null;
  holdoutVerdict: string | null;
} {
  const universe = buildSyntheticDiscoveryUniverse();
  const scored = universe.map((candidate, index) => syntheticScore(candidate, index));
  const { shortlist } = rankAndShortlistTrainCandidates({
    discoveryHypothesisCount: universe.length,
    candidates: scored,
    maxK: MICROSTRUCTURE_MAX_SHORTLIST_K,
  });

  const materialEffectThresholdCents = input?.materialEffectThresholdCents ?? 2;
  const required = deriveMicrostructureRequiredEffectiveN({
    alpha: 0.05,
    targetPower: 0.8,
    materialEffectCents: materialEffectThresholdCents,
    outcomeStandardDeviationCents: 10,
  });

  const validationResults: MicrostructureLockInputSurvivor[] = shortlist.map((row, index) => {
    const statusResult = evaluateMicrostructureValidationCandidate({
      candidate: row.candidate,
      trainDefinition: row.candidate,
      onTrainShortlist: true,
      independentValidationEss: input?.forceZeroValidationSurvivors ? 2 : 40,
      minEssForValidation: 10,
      directionalConsistency: input?.forceZeroValidationSurvivors
        ? "opposite-sign"
        : "same-sign",
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
    const holdout = evaluateMicrostructureHoldout({
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
    validationStatuses: validationResults.map((row) => row.status),
    lockedCandidateId: locked?.candidate.candidateId ?? null,
    holdoutVerdict,
  };
}
