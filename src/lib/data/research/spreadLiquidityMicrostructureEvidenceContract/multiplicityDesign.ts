import {
  EXPECTED_MICROSTRUCTURE_DISCOVERY_HYPOTHESIS_COUNT,
  MICROSTRUCTURE_MAX_SHORTLIST_K,
} from "./microstructureEvidenceContractTypes";

/**
 * Statistical lineage (staged; do not blindly apply 12-way correction at every stage):
 * 12 TRAIN discovery hypotheses
 * → up to K≤3 validation candidates
 * → one locked holdout candidate
 * → one untouched holdout evaluation
 *
 * Reuse OOS/FDR semantics at discovery→shortlist; holdout is single-test after lock.
 */
export function buildMicrostructureMultiplicityDesign(): {
  discoveryHypothesisCount: number;
  maxValidationShortlistK: number;
  lockedHoldoutCandidates: 1;
  untouchedHoldoutEvaluations: 1;
  lineage: string;
  whereCorrectionApplies: readonly { stage: string; policy: string }[];
  preserveLineageEvenIfOneLocked: true;
} {
  return {
    discoveryHypothesisCount: EXPECTED_MICROSTRUCTURE_DISCOVERY_HYPOTHESIS_COUNT,
    maxValidationShortlistK: MICROSTRUCTURE_MAX_SHORTLIST_K,
    lockedHoldoutCandidates: 1,
    untouchedHoldoutEvaluations: 1,
    lineage:
      "12 TRAIN discovery hypotheses → up to K≤3 validation candidates → one locked holdout "
      + "candidate → one untouched holdout evaluation",
    whereCorrectionApplies: [
      {
        stage: "TRAIN discovery / shortlist",
        policy:
          "Retain full 12-hypothesis multiplicity lineage. Shortlist selection is multiplicity-"
          + "aware governance (K≤3), not pretending a single hypothesis was ever considered. "
          + "Reuse repository OOS/FDR-style discipline for exploratory TRAIN claims.",
      },
      {
        stage: "Validation",
        policy:
          "Family size = |shortlist| ≤ 3. Validation is replication/narrowing on a frozen "
          + "shortlist; do not re-open the 12-cell grid.",
      },
      {
        stage: "Holdout",
        policy:
          "Single locked candidate → single confirmatory test. Do not apply a residual 12-way "
          + "correction after lock; the discovery lineage remains documented for promotion "
          + "governance (M12.7c-compatible).",
      },
    ],
    preserveLineageEvenIfOneLocked: true,
  };
}
