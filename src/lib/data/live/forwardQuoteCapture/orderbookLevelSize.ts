/** Sizes at or below this threshold are treated as zero / removed from ladders. */
export const ORDERBOOK_LEVEL_SIZE_EPSILON = 1e-6;

/** Minimum contracts required for bid-only parity depth gates (M12.7). */
export const MIN_EXECUTABLE_BID_SIZE_CONTRACTS = 1;

export function isMeaningfulOrderbookLevelSize(size: number): boolean {
  return Number.isFinite(size) && size >= ORDERBOOK_LEVEL_SIZE_EPSILON;
}

export function shouldRemoveOrderbookLevelSize(size: number): boolean {
  return !Number.isFinite(size) || size < ORDERBOOK_LEVEL_SIZE_EPSILON;
}

export function hasExecutableBidPairSize(
  yesBestBidSize: number | null,
  noBestBidSize: number | null,
): boolean {
  return (
    yesBestBidSize !== null
    && noBestBidSize !== null
    && yesBestBidSize >= MIN_EXECUTABLE_BID_SIZE_CONTRACTS
    && noBestBidSize >= MIN_EXECUTABLE_BID_SIZE_CONTRACTS
  );
}

export function hasBidSizeFieldPresent(size: number | null | undefined): boolean {
  return size !== null && size !== undefined && Number.isFinite(size);
}
