import { stableStringify } from "@/lib/trading/config/hashConfig";

import type { HypothesisTradeReplayReport } from "./hypothesisTradeReplayTypes";

export { buildHypothesisTradeReplayReport } from "./buildHypothesisTradeReplayReport";
export { deriveHypothesisTradeRule } from "./deriveHypothesisTradeRule";
export {
  collectReplayableObservations,
  loadRegimeVolatilityByMarket,
} from "./collectReplayableObservations";
export {
  assertHypothesisTradeReplayInputFiles,
  buildDefaultHypothesisTradeReplayInputPaths,
  loadHypothesisTradeReplayInputs,
  resolveHypothesisTradeReplayInputStatus,
} from "./loadHypothesisTradeReplayInputs";
export {
  computeHypothesisReplayMetrics,
  replayObservationTrade,
} from "./replayHypothesisTrades";
export { readResearchOutputStepQuotes } from "./readResearchOutputStepQuotes";
export { serializeHypothesisTradeReplayHtml } from "./serializeHypothesisTradeReplayHtml";
export {
  DEFAULT_COST_AWARE_ATLAS_INPUT_PATH,
  DEFAULT_HYPOTHESIS_TRADE_REPLAY_HTML_PATH,
  DEFAULT_HYPOTHESIS_TRADE_REPLAY_MAX_SPREAD_CENTS,
  DEFAULT_HYPOTHESIS_TRADE_REPLAY_MIN_NET_EDGE_CENTS,
  DEFAULT_HYPOTHESIS_TRADE_REPLAY_OUTPUT_PATH,
  DEFAULT_HYPOTHESIS_TRADE_REPLAY_SLIPPAGE_BUFFER_CENTS,
  HypothesisTradeReplayError,
} from "./hypothesisTradeReplayTypes";
export type {
  BuildHypothesisTradeReplayReportInput,
  HypothesisTradeReplayConfig,
  HypothesisTradeReplayEntry,
  HypothesisTradeReplayIo,
  HypothesisTradeReplayReport,
  HypothesisTradeRule,
  ReplayableObservation,
  ReplayTradeAttempt,
} from "./hypothesisTradeReplayTypes";

export function serializeHypothesisTradeReplayReport(
  report: HypothesisTradeReplayReport,
): string {
  return stableStringify(report);
}
