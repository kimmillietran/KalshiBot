import type {
  LeadLagCollectionProgressArtifact,
  LeadLagFixedNProgress,
} from "./leadLagProspectiveCohortTypes";
import { LeadLagProspectiveCohortError } from "./leadLagProspectiveCohortTypes";

/**
 * Fixed-N progress depends only on effective N.
 * Effect / p-value cannot trigger early stopping here.
 */
export function computeFixedNProgress(input: {
  requiredEffectiveN: number;
  currentEffectiveN: number;
}): LeadLagFixedNProgress {
  if (!Number.isFinite(input.requiredEffectiveN) || input.requiredEffectiveN < 2) {
    throw new LeadLagProspectiveCohortError(
      "requiredEffectiveN must be a finite number >= 2 (model-derived; not hardcoded authority)",
    );
  }
  const current = Math.max(0, input.currentEffectiveN);
  const remaining = Math.max(0, input.requiredEffectiveN - current);
  const fractionComplete = Math.min(1, current / input.requiredEffectiveN);
  return {
    stoppingKind: "fixed-n",
    requiredEffectiveN: input.requiredEffectiveN,
    currentEffectiveN: current,
    remainingEffectiveN: remaining,
    fractionComplete,
    completed: current >= input.requiredEffectiveN,
    effectPeekingForbidden: true,
    pValueStoppingForbidden: true,
  };
}

export function buildCollectionProgressArtifact(input: {
  cohortIdentityHash: string;
  memberRunIds: readonly string[];
  captureHoursCollected: number | null;
  eligibleIncidenceTotal: number;
  rawPerRunEssSum: number;
  deduplicatedCohortEss: number;
  duplicateOrDependentUnitsRemoved: number;
  requiredEffectiveN: number;
}): LeadLagCollectionProgressArtifact {
  const fixedNProgress = computeFixedNProgress({
    requiredEffectiveN: input.requiredEffectiveN,
    currentEffectiveN: input.deduplicatedCohortEss,
  });

  return {
    schemaVersion: "btc-kalshi-lead-lag-prospective-collection-progress-v1",
    cohortIdentityHash: input.cohortIdentityHash,
    memberRunIds: [...input.memberRunIds].sort((a, b) => a.localeCompare(b)),
    captureHoursCollected: input.captureHoursCollected,
    eligibleIncidenceTotal: input.eligibleIncidenceTotal,
    rawPerRunEssSum: input.rawPerRunEssSum,
    deduplicatedCohortEss: input.deduplicatedCohortEss,
    duplicateOrDependentUnitsRemoved: input.duplicateOrDependentUnitsRemoved,
    fixedNProgress,
    effectFieldsPresent: false,
    pValueFieldsPresent: false,
  };
}

/**
 * Guard: refuse to treat effect/p-value payloads as stopping signals.
 */
export function assertNoEffectDrivenEarlyStopping(input: {
  proposedStopReason?: string | null;
  effectCents?: number | null;
  pValue?: number | null;
}): void {
  if (input.proposedStopReason === "effect-looks-bad" || input.proposedStopReason === "effect-looks-great") {
    throw new LeadLagProspectiveCohortError(
      "p-value/effect cannot trigger early stopping under fixed-N cohort collection",
    );
  }
  if (input.proposedStopReason === "p-value-threshold") {
    throw new LeadLagProspectiveCohortError(
      "p-value/effect cannot trigger early stopping under fixed-N cohort collection",
    );
  }
  if (input.effectCents != null || input.pValue != null) {
    // Presence in a stopping decision path is forbidden; callers must not pass these.
    throw new LeadLagProspectiveCohortError(
      "p-value/effect cannot trigger early stopping under fixed-N cohort collection",
    );
  }
}
