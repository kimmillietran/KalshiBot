import { RESEARCH_READY_CAPTURE_VERDICT } from "@/lib/data/research/selectedRunCaptureHealth";

import type { CrossRunRunSummary } from "./calibrationFadeCrossRunValidationTypes";

/**
 * Native capture-health.json alone does not invent a derived capture-research-ready verdict.
 * When native health is enriched by a matching audit, that audit verdict is enforced.
 * Derived audits must always carry an explicit research-ready verdict.
 */
export function isSelectedRunResearchReady(
  run: Pick<CrossRunRunSummary, "captureHealthSource" | "captureVerdict">,
): boolean {
  const verdictReady =
    run.captureVerdict === RESEARCH_READY_CAPTURE_VERDICT
    || run.captureVerdict === "capture-research-ready";

  if (run.captureHealthSource === "native-capture-health") {
    return run.captureVerdict === null || verdictReady;
  }

  return verdictReady;
}
