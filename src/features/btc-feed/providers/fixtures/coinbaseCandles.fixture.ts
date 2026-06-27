/**
 * Real-shaped Coinbase Exchange candle rows (numeric OHLCV).
 * Copied from production API shape: [time, low, high, open, close, volume].
 */
export const coinbaseCandlesFixture = [
  [1719421200, 64170.12, 64200.55, 64180.0, 64190.25, 12.5436789],
  [1719421260, 64190.25, 64260.8, 64190.25, 64250.32, 8.21],
  [1719421320, 64250.32, 64310.15, 64250.32, 64295.5, 5.8721],
] as const;

/** Single row from the fixture for row-level regression tests. */
export const coinbaseCandleRowFixture = coinbaseCandlesFixture[0];
