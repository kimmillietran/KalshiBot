import { stableStringify } from "@/lib/trading/config/hashConfig";

import type { OrderbookSemanticsValidationReport } from "./orderbookSemanticsValidationTypes";

export function serializeOrderbookSemanticsValidationReport(
  report: OrderbookSemanticsValidationReport,
): string {
  return stableStringify(report);
}
