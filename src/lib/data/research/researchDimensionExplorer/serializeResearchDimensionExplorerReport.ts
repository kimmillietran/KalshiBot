import { stableStringify } from "@/lib/trading/config/hashConfig";

import type { ResearchDimensionExplorerReport } from "./researchDimensionExplorerTypes";

/** Serializes the dimension explorer report to stable JSON. */
export function serializeResearchDimensionExplorerReport(
  report: ResearchDimensionExplorerReport,
): string {
  return stableStringify(report);
}
