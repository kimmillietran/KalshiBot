export {
  LEAD_LAG_EVIDENCE_CONTRACT_ANALYSIS_VERSION,
  LEAD_LAG_EVIDENCE_CONTRACT_DISCLAIMER,
  LEAD_LAG_EVIDENCE_DESIGN_JSON_ROOT,
  LEAD_LAG_EVIDENCE_DESIGN_HTML_ROOT,
  KNOWN_M128A_DISCOVERY_IDENTITY,
  KNOWN_M128A_SPLIT_MANIFEST_HASH,
  KNOWN_LEAD_LAG_TRAIN_RUN_ID,
  KNOWN_LEAD_LAG_VALIDATION_RUN_ID,
  KNOWN_LEAD_LAG_HOLDOUT_RUN_ID,
  LEAD_LAG_DISCOVERY_HYPOTHESIS_HISTORY_COUNT,
  LEAD_LAG_VALIDATION_SHORTLIST_SIZE,
  LeadLagEvidenceContractError,
} from "./leadLagEvidenceContractTypes";
export type {
  LeadLagEvidenceContractConfig,
  LeadLagEvidenceDesignReport,
  LeadLagExecutionSemantics,
  LeadLagHoldoutEvidenceContract,
  LeadLagProspectiveEvidenceContract,
  LeadLagStoppingRule,
  LeadLagStatisticalUnitContract,
} from "./leadLagEvidenceContractTypes";

export {
  buildLeadLagEvidenceDesignReport,
  buildDefaultLeadLagEvidenceContractConfig,
  resolveLeadLagEvidenceDesignOutputPaths,
} from "./buildLeadLagEvidenceDesignReport";
export {
  assertAnalyzerNotInvokedOnValidationOrHoldout,
  assertLeadLagOutcomePathAllowed,
  createOutcomeQuarantinedEvidenceIo,
  isForbiddenLeadLagOutcomePath,
} from "./guardValidationHoldoutAccess";
export {
  assessExecutableObservability,
  buildLeadLagEstimandContract,
  buildLeadLagExecutionSemantics,
  DEFAULT_LEAD_LAG_QUOTE_STALENESS_BOUND_MS,
} from "./executionSemantics";
export {
  assertHoldoutCandidateMatchesValidationLock,
  assertParameterBindingUnchanged,
  buildLeadLagHoldoutEvidenceContract,
  hashCandidateDefinition,
} from "./holdoutContract";
export { buildLeadLagMultiplicityDesign } from "./multiplicityDesign";
export {
  assertNoHardcodedSampleSizeAuthority,
  buildLeadLagMaterialEffectPolicy,
  buildLeadLagPowerSensitivityTable,
  DEFAULT_LEAD_LAG_MATERIAL_EFFECT_CENTS,
  DEFAULT_LEAD_LAG_OUTCOME_SD_CENTS,
  deriveRequiredEffectiveEvidence,
} from "./powerModel";
export { buildLeadLagProspectiveEvidenceContract } from "./prospectiveContract";
export { parseLeadLagEvidenceContractArgv } from "./parseLeadLagEvidenceContractArgv";
export {
  serializeLeadLagEvidenceDesignHtml,
  serializeLeadLagEvidenceDesignJson,
} from "./serializeLeadLagEvidenceDesign";
export {
  buildLeadLagStatisticalUnitContract,
  computeLeadLagEffectiveSampleSize,
  countIndependentLockedWindowObservations,
} from "./statisticalUnit";
export {
  rejectOptionalStoppingWithoutSequentialDesign,
  requireValidLeadLagStoppingRule,
  validateLeadLagStoppingRule,
} from "./stoppingRules";
