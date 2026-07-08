import { stableStringify } from "@/lib/trading/config/hashConfig";

import type { CalibrationFadeFamilyVerdictReport } from "./calibrationFadeFamilyVerdictTypes";

/** Serializes the family verdict report to stable JSON. */
export function serializeCalibrationFadeFamilyVerdictReport(
  report: CalibrationFadeFamilyVerdictReport,
): string {
  return stableStringify(report);
}
