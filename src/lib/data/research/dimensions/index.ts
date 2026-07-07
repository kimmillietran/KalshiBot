export type {
  NumericBucketDefinition,
  ObservationDimensionContext,
  ResearchAxisGroup,
  ResearchAxisGroupAtlasSource,
  ResearchDimension,
  ResearchDimensionId,
  ResearchMatcherAxisId,
} from "./types";

export {
  buildCoarseProbabilityAxisDefinitions,
  buildCoarseProbabilityBucketDefinitions,
  buildProbabilityBucketDefinitions,
  COARSE_PROBABILITY_AXIS_BIN_COUNT,
  COARSE_PROBABILITY_ONLY_BIN_COUNT,
  COARSE_TIME_REMAINING_AXIS_DEFINITIONS,
  COARSE_VOLATILITY_REGIME_DEFINITIONS,
  MONEYNESS_BUCKET_DEFINITIONS,
  probabilityFitsBucket,
  PROBABILITY_BUCKET_COUNT,
  TIME_REMAINING_BUCKET_DEFINITIONS,
  valueFitsBucket,
  VOLATILITY_BUCKET_DEFINITIONS,
} from "./bucketDefinitions";

export { extractDimensionValue, integerFitsBucket } from "./extractors";

export {
  DAY_OF_WEEK_UTC_BUCKET_DEFINITIONS,
  extractDayOfWeekUtc,
  extractHourUtc,
  extractSessionBucketCode,
  extractWeekendFlag,
  HOUR_UTC_BUCKET_DEFINITIONS,
  SESSION_BUCKET_DEFINITIONS,
  WEEKEND_FLAG_BUCKET_DEFINITIONS,
} from "./temporalBucketDefinitions";

export {
  createAccumulatorsForAxisGroup,
  dimensionIdsForGroup,
  ingestObservationForAxisGroup,
  listRegistryAxisGroupsForAtlas,
  resolveAxisGroupByStateKey,
} from "./registryAtlasIntegration";

export {
  computeResearchObservationMomentumPercent,
} from "./momentum/computeResearchObservationMomentumPercent";
export {
  MOMENTUM_BUCKET_DEFINITIONS,
} from "./momentum/momentumBucketDefinitions";
export {
  DEFAULT_RESEARCH_MOMENTUM_LOOKBACK_BARS,
  MOMENTUM_MODERATE_THRESHOLD_PERCENT,
  MOMENTUM_STRONG_THRESHOLD_PERCENT,
} from "./momentum/momentumResearchTypes";

export {
  buildCompositeBucketIdentity,
  observationMatchesDimensionBuckets,
  observationMatchesMultiAxisBucket,
  observationMatchesSingleDimensionBucket,
  parseMultiAxisBucketId,
  type ParsedMultiAxisBucketParts,
} from "./matchers";

export {
  assertResearchAxisGroupRegistryMatchesHypothesisGroups,
  buildCompositeBucketTemplates,
  collectAtlasBucketGroupsFromNormalizedAtlas,
  findCompositeBucketTemplate,
  getResearchAxisGroup,
  getResearchDimension,
  listResearchAxisGroups,
  MATCHER_AXIS_TO_DIMENSION_ID,
  observationMatchesCompositeTemplate,
  observationMatchesResearchAxisGroupBucket,
  RESEARCH_AXIS_GROUPS,
  RESEARCH_DIMENSIONS,
  resolveAxisGroupSampleThreshold,
  type CompositeBucketTemplate,
} from "./registry";
