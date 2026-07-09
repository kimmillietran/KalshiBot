import { stableStringify } from "@/lib/trading/config/hashConfig";

import type { StaticParityScanReport } from "./staticParityScanTypes";

export function serializeStaticParityScanReport(
  report: StaticParityScanReport,
): string {
  return stableStringify(report);
}
