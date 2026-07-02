import { describe, expect, it } from "vitest";

import { KalshiHistoricalBidAskAuditFinding } from "./kalshiHistoricalBidAskAudit";

describe("KalshiHistoricalBidAskAuditFinding", () => {
  it("documents that historical candlesticks lack separate bid/ask OHLC", () => {
    expect(KalshiHistoricalBidAskAuditFinding.HAS_YES_BID_OHLC).toBe(false);
    expect(KalshiHistoricalBidAskAuditFinding.HAS_YES_ASK_OHLC).toBe(false);
    expect(KalshiHistoricalBidAskAuditFinding.HAS_NO_BID_OHLC).toBe(false);
    expect(KalshiHistoricalBidAskAuditFinding.HAS_NO_ASK_OHLC).toBe(false);
    expect(KalshiHistoricalBidAskAuditFinding.HAS_HISTORICAL_ORDERBOOK).toBe(false);
    expect(KalshiHistoricalBidAskAuditFinding.TRADE_PRICE_FIELD).toBe("price.close");
  });
});
