import { stableStringify } from "@/lib/trading/config/hashConfig";

import type { PerformanceAuditReport } from "./performanceAuditTypes";

/** Serializes the performance audit report as JSON. */
export function serializeResearchPerformanceAudit(report: PerformanceAuditReport): string {
  return stableStringify(report);
}
