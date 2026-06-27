/** Optional bankroll supplied by caller — never defaulted by the engine. */
export type BankrollConfig = {
  bankrollDollars?: number | null;
};

/**
 * Validated bankroll for Kelly dollar sizing.
 * `bankrollDollars` is null when no valid bankroll was configured.
 */
export type ResolvedBankroll = {
  bankrollDollars: number | null;
  configured: boolean;
  reasoning: readonly string[];
  modelVersion: string;
};
