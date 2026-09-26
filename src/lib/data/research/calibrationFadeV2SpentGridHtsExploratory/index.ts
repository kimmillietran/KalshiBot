export {
  CF_V2_SPENT_GRID_HTS_STUDY_ID,
  CF_V2_SPENT_GRID_HTS_ANALYSIS_VERSION,
  CF_V2_SPENT_GRID_HTS_DISCLAIMER,
  CF_V2_HYPOTHESIS_PATH,
  CF_V2_SPENT_GRID_ELIGIBILITY,
  type PreentryFeatureRow,
  type SettlementLabelRow,
  type SelectedEntry,
  type EvaluableTrade,
  type CfV2SpentGridHtsReport,
} from "./types";

export {
  CF_V2_SPENT_GRID_EXPECTED_INPUTS,
  buildFrozenStudyManifest,
} from "./manifest";

export { evaluatePreentryEligibility } from "./eligibility";
export {
  isClassBReconstructionUncertain,
  retainedHalfReproducibleFromRegenCents,
} from "./classBProxy";
export { selectEarliestEligibleEntries } from "./selectEntries";
export {
  computeEntryTakerFeeCents,
  computeHoldToSettlementPnl,
  joinSettlementOutcomes,
} from "./payoff";
export {
  studentTCriticalTwoSided95,
  computeCr2TwoSidedMeanInference,
  leaveOneDayOutMeans,
  medianOf,
} from "./inference";
export { interpretExploratoryResult } from "./interpret";
export {
  runCalibrationFadeV2SpentGridHtsStudy,
  type RunStudyInput,
  type RunStudyOutput,
} from "./runStudy";
export { serializeCfV2SpentGridHtsMarkdown } from "./serialize";
