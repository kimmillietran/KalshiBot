import { stableStringify } from "@/lib/trading/config/hashConfig";

import type { ValidBookCoverageInvestigationReport } from "./validBookCoverageInvestigationTypes";

export function serializeValidBookCoverageInvestigationReport(
  report: ValidBookCoverageInvestigationReport,
): string {
  return stableStringify(report);
}
