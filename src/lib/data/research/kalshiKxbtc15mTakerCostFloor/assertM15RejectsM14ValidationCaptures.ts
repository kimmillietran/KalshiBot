/**
 * Fail closed when M14 validation-role captures are supplied to M15.
 */
import {
  M15_FORBIDDEN_M14_EXCLUDED_RUN_ID,
  M15_FORBIDDEN_M14_VALIDATION_RUN_IDS,
  M15CostFloorError,
  type M15CaptureDescriptor,
} from "./m15CostFloorTypes";

const FORBIDDEN = new Set<string>([
  ...M15_FORBIDDEN_M14_VALIDATION_RUN_IDS,
  M15_FORBIDDEN_M14_EXCLUDED_RUN_ID,
]);

export function assertM15CaptureNotM14ValidationRole(
  capture: M15CaptureDescriptor,
): void {
  if (FORBIDDEN.has(capture.runId)) {
    throw new M15CostFloorError(
      `M15 rejected known M14 validation/excluded capture runId=${capture.runId} `
        + `(contamination guard). Fresh M15 evidence required.`,
    );
  }
  const prior = capture.priorResearchRole?.trim().toLowerCase() ?? null;
  if (prior === "validation") {
    throw new M15CostFloorError(
      `M15 rejected capture marked priorResearchRole=validation `
        + `runId=${capture.runId} (contamination guard).`,
    );
  }
  if (capture.researchRole === "m15-cost-floor" || capture.researchRole === "untouched-candidate") {
    return;
  }
  if (capture.researchRole === "other") {
    // Explicit other is allowed only when runId is not a known M14 validation id.
    return;
  }
  throw new M15CostFloorError(
    `M15 rejected capture with unsupported researchRole=${String(capture.researchRole)}`,
  );
}

export function assertM15CaptureSetClean(
  captures: readonly M15CaptureDescriptor[],
): void {
  if (captures.length === 0) {
    throw new M15CostFloorError("M15 acceptedCaptures must be non-empty");
  }
  const seen = new Set<string>();
  const seenHash = new Set<string>();
  for (const capture of captures) {
    if (seen.has(capture.runId)) {
      throw new M15CostFloorError(`duplicate M15 run ID rejected: ${capture.runId}`);
    }
    seen.add(capture.runId);
    if (seenHash.has(capture.captureIdentityHash)) {
      throw new M15CostFloorError(
        `duplicate M15 capture identity rejected: ${capture.captureIdentityHash}`,
      );
    }
    seenHash.add(capture.captureIdentityHash);
    assertM15CaptureNotM14ValidationRole(capture);
  }
}
