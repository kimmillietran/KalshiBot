import type { VendorSampleRequest } from "./vendorOrderbookSufficiencyAuditTypes";

export function buildVendorSampleRequest(): VendorSampleRequest {
  const subject = "KalshiBot KXBTC15M / KXBTCD orderbook sample request";

  const body = [
    "Hello,",
    "",
    "KalshiBot is evaluating third-party Kalshi orderbook data for executable microstructure research (lead-lag, quote staleness, same-market parity).",
    "Before any backfill importer is built, we need a small sample to validate schema, timestamps, and executable quote fidelity.",
    "",
    "Please provide:",
    "",
    "1) KXBTC15M orderbook samples",
    "   - 3 markets from different trading days",
    "   - At least one full active trading window per market",
    "",
    "2) Timestamps",
    "   - Raw timestamps (millisecond preferred)",
    "   - Exchange timestamp if available",
    "   - Vendor receive timestamp if available",
    "",
    "3) Book fields",
    "   - YES bids and YES asks (native if available)",
    "   - NO bids and NO asks (native if available)",
    "   - Sizes/quantities at each level",
    "   - Snapshot vs delta semantics",
    "   - Sequence/update IDs if available",
    "",
    "4) Trades (if available)",
    "",
    "5) Market metadata",
    "   - market_ticker",
    "   - event_ticker",
    "   - series_ticker",
    "   - floor_strike",
    "",
    "6) Export details",
    "   - Export format",
    "   - Data dictionary / field definitions",
    "",
    "7) KXBTCD ladder sample (optional but valuable)",
    "   - One event with >=10 strikes if available",
    "   - Co-timestamped quotes across strikes",
    "",
    "We will use this sample only for a read-only sufficiency audit.",
    "Marketing claims are not treated as sufficient without sample proof.",
    "",
    "Thank you,",
    "KalshiBot research",
  ].join("\n");

  return { subject, body };
}
