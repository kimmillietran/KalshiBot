export {
  M17_SPENT_HTS_STUDY_ID,
  M17_SPENT_HTS_ANALYSIS_VERSION,
  M17_SPENT_HTS_DISCLAIMER,
  M17_SPENT_DATASET_PROVENANCE,
  M17_CITED_REGIME_FILTERS,
  type M17FrozenDecisionStatus,
  type M17FrozenDecisionItem,
  type M17EvalCompletionStatus,
  type M17FeatureAvailability,
  type M17PerformanceBlock,
  type M17SpentHoldToSettlementReport,
} from "./types";

export {
  buildM17FrozenDecisionInventory,
  listMissingFrozenDecisionsBlockingPnl,
} from "./frozenStrategyDefinition";

export {
  computeOneStandardTakerFeeCents,
  computeNoHoldToSettlementGrossReturnCents,
  computeNoHoldToSettlementFeeAdjustedReturnCents,
} from "./economics";

export {
  assertNoSettlementLabelLeakage,
  M17_LEAKAGE_CONTROL_STATEMENTS,
  type LeakageCheckInput,
  type LeakageCheckResult,
  type LeakageRejectionReason,
} from "./leakageGuards";

export {
  summarizeFeatureAvailability,
  rowHasYesMidpoint,
  rowHasVolatility,
  rowHasTimeRemaining,
  rowHasSettlementStatePath,
  rowHasRemainingAverageThreshold,
  type RetainedFrictionSampleRow,
} from "./featureCompleteness";

export { runM17SpentHoldToSettlementEval } from "./runEval";

export { serializeM17SpentHoldToSettlementMarkdown } from "./serialize";
