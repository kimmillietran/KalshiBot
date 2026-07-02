import { stableStringify } from "@/lib/trading/config/hashConfig";

import type {
  WalkForwardFold,
  WalkForwardSplitSummary,
} from "./walkForwardSplitTypes";

export function serializeWalkForwardFold(fold: WalkForwardFold): string {
  return stableStringify(fold);
}

export function serializeWalkForwardSplitSummary(
  summary: WalkForwardSplitSummary,
): string {
  return stableStringify(summary);
}
