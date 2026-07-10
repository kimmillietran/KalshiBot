import { stableStringify } from "@/lib/trading/config/hashConfig";

import type { OrderbookReconstructionAuditReport } from "./orderbookReconstructionAuditTypes";

export function serializeOrderbookReconstructionAuditReport(
  report: OrderbookReconstructionAuditReport,
): string {
  return stableStringify(report);
}
