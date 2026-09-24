export {
  SETTLEMENT_FRICTION_STUDY_ID,
  SETTLEMENT_FRICTION_ANALYSIS_VERSION,
  SETTLEMENT_FRICTION_DISCLAIMER,
  SETTLEMENT_FRICTION_HORIZONS_MS,
  SETTLEMENT_FRICTION_SAMPLE_CADENCE_MS,
  SETTLEMENT_FRICTION_RESPONSE_MATCH_TOLERANCE_MS,
  SETTLEMENT_FRICTION_MAX_QUOTE_AGE_MS,
  SETTLEMENT_FRICTION_MIN_DISPLAYED_SIZE,
  SETTLEMENT_FRICTION_ADAPTER_ID,
  SETTLEMENT_FRICTION_ADAPTER_IDENTITY,
  M16_ER_DAY_CLUSTERS_RELATIVE_PATH,
  CRYPTOSTRUCT_RESERVOIR_STATUS_RELATIVE_PATH,
  M16_ER_ACQUISITION_MANIFEST_RELATIVE_PATH,
  M16_ER_IDENTITIES_RELATIVE_PATH,
  SettlementFrictionCoverageError,
  bindSettlementFrictionFeeContractIdentity,
  buildSettlementFrictionConfig,
  assertSettlementFrictionFeeIdentity,
  assertSettlementFrictionAdapterIdentity,
  type SettlementFrictionConfig,
  type SettlementFrictionHorizonMs,
} from "./types";

export {
  loadEligibleCalendarAuthority,
  assertDayEligible,
  type EligibleCalendarAuthority,
} from "./eligibleCalendar";

export {
  computeOneContractStandardTakerFeeCents,
  computeEntryFriction,
  computeRoundTripFriction,
  type FrictionQuote,
  type EntryFriction,
  type RoundTripFriction,
} from "./costs";

export {
  cadenceBucket,
  sortQuotesChronologically,
  evaluateFrictionQuoteGates,
  selectCadenceSamples,
  matchResponseQuote,
  type ExclusionReason,
  type GateResult,
} from "./sampling";

export {
  classifySettlementLabel,
  indexSettlementLabels,
  summarizeSettlementLabelCoverage,
  type SettlementLabelRecord,
  type SettlementLabelFlags,
  type SettlementLabelCoverageSummary,
} from "./settlementJoin";

export {
  aggregateByUtcDay,
  equalDayAggregate,
  pooledSampleAggregate,
  type FrictionSampleRow,
  type DayFrictionSummary,
} from "./aggregate";

export {
  runSettlementFrictionCoverageStudy,
  type NormalizedQuoteEvent,
  type DayAvailability,
  type StudyRunInput,
  type StudyRunResult,
} from "./runStudy";

export {
  serializeSettlementFrictionArtifacts,
  type StudyArtifacts,
} from "./serialize";

export {
  assembleSettlementFrictionStudyFromSamples,
} from "./assembleFromSamples";
