import { stableStringify } from "@/lib/trading/config/hashConfig";

import type { ResearchWorkflowReport } from "./researchWorkflowTypes";

/** Serializes the research workflow report to stable JSON. */
export function serializeResearchWorkflowReport(report: ResearchWorkflowReport): string {
  return stableStringify(report);
}
