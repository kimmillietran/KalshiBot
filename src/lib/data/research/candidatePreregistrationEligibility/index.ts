export {
  ACCEPTED_PREREGISTRATION_PROMOTION_DECISIONS,
  CANDIDATE_PREREGISTRATION_ELIGIBILITY_ANALYSIS_VERSION,
  CANDIDATE_PROMOTION_EVIDENCE_ANALYSIS_VERSION,
  CandidatePreregistrationEligibilityError,
  DEFAULT_PROMOTION_ARTIFACT_PATH_FOR_ELIGIBILITY,
  DEFAULT_PREREGISTRATION_ELIGIBILITY_REPORT_PATH,
  HYPOTHESIS_CONFIG_ROOT,
} from "./candidatePreregistrationEligibilityTypes";
export type {
  AcceptedPreregistrationPromotionDecision,
  CandidatePreregistrationEligibilityIo,
  CandidatePreregistrationEligibilityReasonCode,
  CandidatePreregistrationEligibilityResult,
  CandidatePreregistrationEligibilityStatus,
  LegacyGrandfatheredFrozenHypothesis,
  VerifyPreregistrationEligibilityReport,
} from "./candidatePreregistrationEligibilityTypes";

export {
  LEGACY_GRANDFATHERED_FROZEN_HYPOTHESES,
  findLegacyGrandfatheredFrozenHypothesis,
  isLegacyGrandfatheredFrozenHypothesis,
  normalizeRepoPath,
} from "./legacyGrandfatheredFrozenHypotheses";

export {
  computePromotionAccepted,
  hashArtifactContent,
  hashCandidateDefinitionContent,
  hashValidationEntryContent,
  isAcceptedPromotionDecision,
  selectPromotionEntryForHypothesis,
} from "./promotionEvidenceIdentity";

export {
  buildOosPromotionStatisticalGates,
  hashOosPromotionEntryContent,
  statisticalGatesAuthorizePromotion,
} from "./oosPromotionStatisticalGates";
export type {
  OosDiscoveryIsolationStatus,
  OosPromotionStatisticalGates,
} from "./oosPromotionStatisticalGates";

export {
  PROSPECTIVE_STATISTICAL_PROMOTION_CONTRACT_VERSION,
  buildValidProspectiveStatisticalPromotionContract,
  hashProspectiveDesignContent,
  validateProspectiveStatisticalPromotionContract,
} from "./prospectiveStatisticalPromotionContract";
export type {
  ProspectiveEvidenceStoppingRule,
  ProspectiveStatisticalPromotionContract,
} from "./prospectiveStatisticalPromotionContract";

export {
  evaluateCandidateEligibleForPreregistration,
  loadArtifactContentOrNull,
  requireCandidateEligibleForPreregistration,
} from "./requireCandidateEligibleForPreregistration";

export {
  assertPreregistrationEligibilityReportPass,
  enforceFrozenHypothesisPromotionGovernance,
  listHypothesisConfigPaths,
  verifyPreregistrationEligibilityForHypothesisConfigs,
} from "./enforceFrozenHypothesisPromotionGovernance";
