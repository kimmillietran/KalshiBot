import { stableStringify } from "@/lib/trading/config/hashConfig";

import type { ExpansionImportPerformanceAuditReport } from "./expansionImportPerformanceAuditTypes";

/** Serializes the expansion import performance audit report as JSON. */
export function serializeExpansionImportPerformanceAudit(
  report: ExpansionImportPerformanceAuditReport,
): string {
  return stableStringify(report);
}
