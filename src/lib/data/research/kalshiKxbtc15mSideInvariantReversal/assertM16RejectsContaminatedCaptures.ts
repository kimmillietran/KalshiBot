/**
 * Fail closed when M14/M15 contaminated captures are supplied to M16 incidence.
 */
import {
  M16_FORBIDDEN_M14_EXCLUDED_RUN_ID,
  M16_FORBIDDEN_M14_VALIDATION_RUN_IDS,
  M16_FORBIDDEN_M15_COST_FLOOR_RUN_ID,
  M16ReversalError,
  type M16CaptureDescriptor,
} from "./m16Types";

const FORBIDDEN = new Set<string>([
  ...M16_FORBIDDEN_M14_VALIDATION_RUN_IDS,
  M16_FORBIDDEN_M14_EXCLUDED_RUN_ID,
  M16_FORBIDDEN_M15_COST_FLOOR_RUN_ID,
]);

export function assertM16CaptureNotContaminated(
  capture: M16CaptureDescriptor,
): void {
  if (FORBIDDEN.has(capture.runId)) {
    throw new M16ReversalError(
      `M16 rejected forbidden capture runId=${capture.runId} `
        + `(M14 validation/excluded or M15 cost-floor).`,
    );
  }
  const prior = capture.priorResearchRole?.trim().toLowerCase() ?? null;
  if (prior === "validation" || prior === "holdout" || prior === "train") {
    throw new M16ReversalError(
      `M16 rejected capture priorResearchRole=${prior} runId=${capture.runId}`,
    );
  }
  if (
    capture.researchRole !== "m16-blind-incidence"
    && capture.researchRole !== "m16-prospective-validation"
    && capture.researchRole !== "untouched-candidate"
    && capture.researchRole !== "other"
  ) {
    throw new M16ReversalError(
      `M16 unsupported researchRole=${String(capture.researchRole)}`,
    );
  }
}

export function assertM16CaptureSetClean(
  captures: readonly M16CaptureDescriptor[],
): void {
  if (captures.length === 0) {
    throw new M16ReversalError("M16 captures must be non-empty");
  }
  const seen = new Set<string>();
  const seenHash = new Set<string>();
  for (const capture of captures) {
    if (seen.has(capture.runId)) {
      throw new M16ReversalError(`duplicate M16 run ID rejected: ${capture.runId}`);
    }
    seen.add(capture.runId);
    if (seenHash.has(capture.captureIdentityHash)) {
      throw new M16ReversalError(
        `duplicate M16 capture identity rejected: ${capture.captureIdentityHash}`,
      );
    }
    seenHash.add(capture.captureIdentityHash);
    assertM16CaptureNotContaminated(capture);
  }
}
