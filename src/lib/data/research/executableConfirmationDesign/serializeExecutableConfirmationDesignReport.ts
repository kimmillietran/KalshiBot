import { stableStringify } from "@/lib/trading/config/hashConfig";

import type { ExecutableConfirmationDesignReport } from "./executableConfirmationDesignTypes";

export function serializeExecutableConfirmationDesignReport(
  report: ExecutableConfirmationDesignReport,
): string {
  return stableStringify(report);
}
