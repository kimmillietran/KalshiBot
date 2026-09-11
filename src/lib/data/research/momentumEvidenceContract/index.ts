export {
  MOMENTUM_EVIDENCE_CONTRACT_ANALYSIS_VERSION,
  MOMENTUM_EVIDENCE_CONTRACT_DISCLAIMER,
  MOMENTUM_RESEARCH_SPLIT_VERSION,
  EXPECTED_MOMENTUM_FAMILY_ID,
  EXPECTED_MOMENTUM_SUBFAMILY_ID,
  EXPECTED_MOMENTUM_DISCOVERY_HYPOTHESIS_COUNT,
  MOMENTUM_MAX_SHORTLIST_K,
  MOMENTUM_DIRECTION,
  MOMENTUM_DEFAULT_ALPHA,
  MOMENTUM_DEFAULT_TARGET_POWER,
  MOMENTUM_RECOMMENDED_MATERIAL_EFFECT_CENTS,
  MOMENTUM_DEFAULT_OUTCOME_SD_CENTS,
  PRIOR_LEAD_LAG_TRAIN_RUN_ID,
  PRIOR_LEAD_LAG_VALIDATION_RUN_ID,
  PRIOR_LEAD_LAG_HOLDOUT_RUN_ID,
  PRIOR_MICROSTRUCTURE_TRAIN_RUN_ID,
  MomentumEvidenceContractError,
} from "./momentumEvidenceContractTypes";
export type {
  MomentumCandidateDefinition,
  MomentumContaminationClassification,
  MomentumEvidenceContractConfig,
  MomentumEvidenceDesignReport,
  MomentumFeeContractStatus,
  MomentumHoldoutVerdict,
  MomentumStoppingRule,
  MomentumValidationStatus,
} from "./momentumEvidenceContractTypes";

export {
  assertFamilyUniverseMatchesContract,
  createUnboundMomentumFamilyBindingSlot,
  rejectReversalDirectionMutation,
  requireExactFamilyDefinitionIdentityForOutcomeAccess,
} from "./familyDefinitionBinding";
export type { MomentumFamilyDefinitionBinding } from "./familyDefinitionBinding";

export {
  buildMomentumEvidenceDesignReport,
  MOMENTUM_CAPTURE_QUALITY_REQUIREMENTS,
  resolveMomentumEvidenceDesignOutputPaths,
} from "./buildMomentumEvidenceDesignReport";
export {
  assertInventoryDidNotComputeOutcomes,
  buildMetadataOnlyMomentumCaptureInventory,
  buildMomentumDataIsolationPolicy,
  buildMomentumSplitRequirements,
  SEALED_PRIOR_LINEAGE_CLASSIFICATIONS,
  trySealMomentumResearchSplit,
} from "./dataIsolation";
export {
  assertMeanCannotReplaceMedianPostHoc,
  buildMomentumDirectionConsistencyRule,
  classifyContinuationDirectionConsistency,
} from "./directionConsistency";
export {
  assertNetEdgeClaimFailsClosedWhenFeeUnbound,
  auditMomentumFeeContract,
  buildMomentumEstimandContract,
  coerceMissingResponseToZeroCents,
  midpointOnlyCannotAuthorizeEconomicSupport,
  rejectInventedFlatOneCentFee,
  rejectSilentZeroFeeDefault,
} from "./estimandsAndFee";
export {
  buildMomentumHoldoutSemantics,
  evaluateMomentumHoldout,
} from "./holdoutSemantics";
export {
  buildMomentumLockPolicy,
  lockHoldoutCandidateFromValidationSurvivors,
} from "./lockAndTieBreak";
export { buildMomentumMultiplicityDesign } from "./multiplicityDesign";
export { parseMomentumEvidenceContractArgv } from "./parseMomentumEvidenceContractArgv";
export {
  assertNoArbitraryNGate,
  buildMomentumPowerMethodology,
  deriveMomentumRequiredEffectiveN,
  rejectOptionalStoppingHeuristic,
  requireMaterialEffectThreshold,
  requireValidMomentumStoppingRule,
  validateMomentumStoppingRule,
} from "./powerAndStopping";
export {
  assertCandidateDefinitionImmutable,
  buildMomentumShortlistPolicy,
  computeStructuralSimplicityRank,
  rankAndShortlistTrainCandidates,
  shortlistRankingIgnoresEffectMagnitude,
} from "./shortlistPolicy";
export {
  assertRawCrossingsAreNotDirectEss,
  assertRawQuotesAreNotIndependentN,
  buildMomentumCountLadder,
  buildMomentumStatisticalUnitContract,
  computeMomentumEffectiveSampleSize,
} from "./statisticalUnit";
export {
  buildSyntheticDiscoveryUniverse,
  runSyntheticMomentumEvidencePipeline,
} from "./syntheticPipeline";
export {
  serializeMomentumEvidenceDesignHtml,
  serializeMomentumEvidenceDesignJson,
} from "./serializeMomentumEvidenceDesign";
export {
  buildMomentumValidationSemantics,
  evaluateMomentumValidationCandidate,
} from "./validationSemantics";
