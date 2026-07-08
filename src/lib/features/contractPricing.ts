/**
 * Kalshi contract pricing helpers shared by trading features and research parsers.
 * Formula: midpoint implied probability from YES bid/ask cents.
 */
export function midProbabilityFromCents(
  yesBidCents: number,
  yesAskCents: number,
): number {
  return (yesBidCents + yesAskCents) / 2 / 100;
}

/**
 * One-sided spread as a percent of the ask (0–100 scale).
 * Returns null when bid/ask are missing or ask is non-positive.
 */
export function spreadSidePercent(
  bidCents: number | null,
  askCents: number | null,
): number | null {
  if (bidCents == null || askCents == null || askCents <= 0) {
    return null;
  }

  return (Math.max(askCents - bidCents, 0) / askCents) * 100;
}

/** Max YES/NO spread-side percent for available contract quotes. */
export function maxSpreadSidePercent(input: {
  yesBidCents?: number | null;
  yesAskCents?: number | null;
  noBidCents?: number | null;
  noAskCents?: number | null;
}): number | null {
  const spreads = [
    spreadSidePercent(input.yesBidCents ?? null, input.yesAskCents ?? null),
    spreadSidePercent(input.noBidCents ?? null, input.noAskCents ?? null),
  ].filter((value): value is number => value !== null);

  return spreads.length === 0 ? null : Math.max(...spreads);
}
