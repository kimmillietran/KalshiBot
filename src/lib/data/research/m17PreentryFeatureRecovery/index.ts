export {
  M17_PREENTRY_FEATURE_RECOVERY_STUDY_ID,
  M17_PREENTRY_FEATURE_RECOVERY_ANALYSIS_VERSION,
  M17_PREENTRY_FEATURE_RECOVERY_DISCLAIMER,
  M17_PREENTRY_VOLATILITY_CONTRACT,
  M17_PREENTRY_COINBASE_PUBLIC_SOURCE,
  type BookFeatureStatus,
  type VolatilityFeatureStatus,
  type PreentryBookFeatureRow,
  type PreentryFeatureRow,
  type CandleDayCoverage,
  type FeatureCoverageCounts,
  type M17PreentryFeatureRecoveryReport,
} from "./types";

export {
  computePreentryRealizedVolatility,
  volatilityWindowLeaksFuture,
  type CompletedMinuteBar,
  type PreentryVolatilityResult,
} from "./preentryVolatility";

export {
  assertPreentryFeaturesAreCausal,
  type PreentryFeatureSource,
  type PreentryLeakageReason,
  type PreentryLeakageResult,
} from "./leakageGuards";

export {
  enrichBookRowWithVolatility,
  summarizeFeatureCoverage,
  buildM17PreentryFeatureRecoveryReport,
  type BuildM17PreentryFeatureRecoveryReportInput,
} from "./buildReport";

export { serializeM17PreentryFeatureRecoveryMarkdown } from "./serialize";

export {
  classifyHalfSpreadMismatchRow,
  summarizeHalfSpreadMismatchClasses,
  regeneratedHalfSpreadFromYesBbo,
  regeneratedExecutableNoAskCents,
  type HalfSpreadMismatchRow,
  type HalfSpreadMismatchClass,
  type ClassifiedHalfSpreadMismatch,
  type HalfSpreadMismatchClassificationSummary,
} from "./classifyHalfSpreadMismatches";
