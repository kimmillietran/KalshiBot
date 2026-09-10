export {
  MICROSTRUCTURE_EVIDENCE_CONTRACT_ANALYSIS_VERSION,
  MICROSTRUCTURE_EVIDENCE_CONTRACT_DISCLAIMER,
  EXPECTED_MICROSTRUCTURE_FAMILY_ID,
  EXPECTED_MICROSTRUCTURE_SUBFAMILY_ID,
  EXPECTED_MICROSTRUCTURE_DISCOVERY_HYPOTHESIS_COUNT,
  MICROSTRUCTURE_MAX_SHORTLIST_K,
  MICROSTRUCTURE_DEFAULT_ALPHA,
  MICROSTRUCTURE_DEFAULT_TARGET_POWER,
  MICROSTRUCTURE_RECOMMENDED_MATERIAL_EFFECT_CENTS,
  MicrostructureEvidenceContractError,
} from "./microstructureEvidenceContractTypes";
export type {
  MicrostructureCandidateDefinition,
  MicrostructureEvidenceContractConfig,
  MicrostructureEvidenceDesignReport,
  MicrostructureHoldoutVerdict,
  MicrostructureStoppingRule,
  MicrostructureValidationStatus,
} from "./microstructureEvidenceContractTypes";

export {
  buildMicrostructureEvidenceDesignReport,
  resolveMicrostructureEvidenceDesignOutputPaths,
  assertCaptureQualityOrInvalidate,
  MICROSTRUCTURE_CAPTURE_QUALITY_REQUIREMENTS,
} from "./buildMicrostructureEvidenceDesignReport";
export { parseMicrostructureEvidenceContractArgv } from "./parseMicrostructureEvidenceContractArgv";
export {
  serializeMicrostructureEvidenceDesignJson,
  serializeMicrostructureEvidenceDesignHtml,
} from "./serializeMicrostructureEvidenceDesign";

export {
  buildMicrostructureStatisticalUnitContract,
  computeMicrostructureEffectiveSampleSize,
  buildCountLadder,
  assertRawQuotesAreNotIndependentN,
} from "./statisticalUnit";
export {
  buildMicrostructureEpisodeSemantics,
  deduplicateCrossingsToEpisodes,
  refractoryMsForHorizon,
  assertAtMostOneIndependentContributionPerMarketDayCell,
} from "./episodeSemantics";
export {
  buildMicrostructureEstimandContract,
  buildMicrostructureExecutionSemantics,
  classifyResponseObservability,
  coerceMissingResponseToZeroCents,
  midpointOnlyCannotAuthorizeEconomicSupport,
} from "./estimandsAndExecution";
export {
  buildMicrostructureShortlistPolicy,
  rankAndShortlistTrainCandidates,
  assertCandidateDefinitionImmutable,
  assertDirectionCannotFlip,
} from "./shortlistPolicy";
export {
  buildMicrostructureValidationSemantics,
  evaluateMicrostructureValidationCandidate,
} from "./validationSemantics";
export {
  buildMicrostructureLockPolicy,
  lockHoldoutCandidateFromValidationSurvivors,
} from "./lockAndTieBreak";
export {
  buildMicrostructureHoldoutSemantics,
  evaluateMicrostructureHoldout,
} from "./holdoutSemantics";
export { buildMicrostructureMultiplicityDesign } from "./multiplicityDesign";
export {
  buildMicrostructurePowerMethodology,
  deriveMicrostructureRequiredEffectiveN,
  requireMaterialEffectThreshold,
  assertNoArbitraryNGate,
  insufficientPowerCannotSupportPromotion,
  validateMicrostructureStoppingRule,
  requireValidMicrostructureStoppingRule,
  rejectOptionalStoppingHeuristic,
} from "./powerAndStopping";
export {
  buildMicrostructureExplicitExclusions,
  assertMicrostructureFeatureAllowed,
  rejectBtcConditionedCandidate,
  rejectUnsupportedDepthOrCancelFeatures,
} from "./exclusions";
export {
  buildSyntheticDiscoveryUniverse,
  runSyntheticMicrostructureEvidencePipeline,
} from "./syntheticPipeline";
