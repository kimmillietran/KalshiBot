import {
  isVerifiedResearchReady,
  RESEARCH_READY_CAPTURE_VERDICT,
} from "@/lib/data/research/selectedRunCaptureHealth";

import type { CrossRunRunSummary } from "./calibrationFadeCrossRunValidationTypes";

/**
 * A selected run is research-ready only when a verified capture-health source
 * carries an explicit capture-research-ready verdict AND the verdict's
 * provenance was verified (matching identity, valid audit schema, and fresh
 * fingerprints). A bare verdict string is never sufficient, and native
 * capture-health.json with a null derived verdict is unverified quality.
 * Shares one policy helper with M13.2 forward validation.
 */
export function isSelectedRunResearchReady(
  run: Pick<CrossRunRunSummary, "captureHealthSource" | "captureVerdict" | "researchReadyVerified">,
): boolean {
  return isVerifiedResearchReady(run);
}

/** Human-readable reason a run failed the research-ready gate, or null when it passed. */
export function describeSelectedRunHealthFailure(
  run: Pick<CrossRunRunSummary, "captureHealthSource" | "captureVerdict" | "researchReadyVerified">,
): string | null {
  if (isSelectedRunResearchReady(run)) {
    return null;
  }
  if (run.captureVerdict === null) {
    return "No verified capture-research-ready health source; native capture health alone is unverified.";
  }
  if (run.captureVerdict === RESEARCH_READY_CAPTURE_VERDICT && !run.researchReadyVerified) {
    return "Capture health verdict is capture-research-ready but its audit provenance or freshness could not be verified.";
  }
  return `Capture health verdict is ${run.captureVerdict}; ${RESEARCH_READY_CAPTURE_VERDICT} is required.`;
}
