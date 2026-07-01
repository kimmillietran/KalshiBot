import { stableStringify } from "@/lib/trading/config/hashConfig";

import type { StrategyLeaderboard } from "./strategyLeaderboardTypes";

/** Serializes a strategy leaderboard to stable JSON. */
export function serializeStrategyLeaderboard(
  leaderboard: StrategyLeaderboard,
): string {
  return stableStringify(leaderboard);
}
