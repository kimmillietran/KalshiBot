import { RESEARCH_READY_CAPTURE_VERDICT } from "@/lib/data/research/selectedRunCaptureHealth";

import type { CrossRunRunSummary } from "./calibrationFadeCrossRunValidationTypes";

/**
 * A selected run is research-ready only when a verified capture-health source
 * carries an explicit capture-research-ready verdict. Native capture-health.json
 * with a null derived verdict is unverified quality, not research-ready.
 */
export function isSelectedRunResearchReady(
  run: Pick<CrossRunRunSummary, "captureHealthSource" | "captureVerdict">,
): boolean {
  return run.captureVerdict === RESEARCH_READY_CAPTURE_VERDICT;
}

/** Human-readable reason a run failed the research-ready gate, or null when it passed. */
export function describeSelectedRunHealthFailure(
  run: Pick<CrossRunRunSummary, "captureHealthSource" | "captureVerdict">,
): string | null {
  if (isSelectedRunResearchReady(run)) {
    return null;
  }
  if (run.captureVerdict === null) {
    return "No verified capture-research-ready health source; native capture health alone is unverified.";
  }
  return `Capture health verdict is ${run.captureVerdict}; ${RESEARCH_READY_CAPTURE_VERDICT} is required.`;
}
