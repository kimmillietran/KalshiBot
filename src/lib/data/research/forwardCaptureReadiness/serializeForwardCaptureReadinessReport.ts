import { stableStringify } from "@/lib/trading/config/hashConfig";

import type { ForwardCaptureReadinessReport } from "./forwardCaptureReadinessTypes";

/** Serializes the forward capture readiness report to stable JSON. */
export function serializeForwardCaptureReadinessReport(
  report: ForwardCaptureReadinessReport,
): string {
  return stableStringify(report);
}
