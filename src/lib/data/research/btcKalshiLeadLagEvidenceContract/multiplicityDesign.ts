import {
  LEAD_LAG_DISCOVERY_HYPOTHESIS_HISTORY_COUNT,
  LEAD_LAG_VALIDATION_SHORTLIST_SIZE,
  type LeadLagMultiplicityDesign,
} from "./leadLagEvidenceContractTypes";

export function buildLeadLagMultiplicityDesign(): LeadLagMultiplicityDesign {
  return {
    discoveryHypothesisCount: LEAD_LAG_DISCOVERY_HYPOTHESIS_HISTORY_COUNT,
    validationShortlistSize: LEAD_LAG_VALIDATION_SHORTLIST_SIZE,
    intendedLockedCandidateCount: 1,
    holdoutTestingFamily: "single-locked-candidate-after-validation",
    holdoutTestingFamilyRationale:
      "After train-only discovery (9600 hypotheses) and predeclared validation narrowing to one locked "
      + "candidate, untouched holdout inference tests that single pre-registered hypothesis. "
      + "This does NOT claim only one hypothesis ever existed — discovery and validation multiplicity "
      + "remain recorded in lineage. Mechanical BY correction over all 9600 is not required for the "
      + "final locked holdout test when the lock is proven to precede holdout access (M12.7c-compatible "
      + "declared testing family).",
    multiplicityHistoryErasable: false,
    mechanicalCorrectionOverFullDiscoveryGridRequired: false,
    mechanicalCorrectionNote:
      "Contract requirement: validation lock identity + discoveryIdentity + splitManifestHash must be "
      + "bound before holdout evaluation. Erasing discoveryHypothesisCount or shortlist size invalidates "
      + "the design.",
  };
}
