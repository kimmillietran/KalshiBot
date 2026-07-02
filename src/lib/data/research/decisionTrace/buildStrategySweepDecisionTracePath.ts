import { posix } from "node:path";

import { STRATEGY_DECISION_TRACE_FILENAME } from "./strategyDecisionTraceTypes";

/** Maps a sweep research output path to its sibling decision-trace.json path. */
export function buildStrategySweepDecisionTracePath(researchOutputPath: string): string {
  return posix.join(posix.dirname(researchOutputPath), STRATEGY_DECISION_TRACE_FILENAME);
}
