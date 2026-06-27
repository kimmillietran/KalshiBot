import { screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TradingDashboard } from "@/features/trading-dashboard";
import {
  findVisibleRawTickerMatch,
  VISIBLE_RAW_TICKER_PATTERN,
} from "@/features/trading-dashboard/tickerVisibility";
import { liveMarket } from "@/test/test-utils";
import { renderWithDashboard } from "@/test/test-utils";

/**
 * Global dashboard regression — fails if any visible text contains a raw Kalshi ticker.
 * Uses textContent only (tooltips/title attributes are excluded).
 */
describe("dashboard raw ticker regression", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("never shows raw Kalshi ticker in visible dashboard text after live market loads", async () => {
    const { container } = renderWithDashboard(<TradingDashboard />);

    await waitFor(() => {
      expect(screen.getAllByText(/\$59,990\.31/).length).toBeGreaterThan(0);
    });

    const visibleText = container.textContent ?? "";

    expect(visibleText).toMatch(/Will BTC settle above/i);
    expect(visibleText).not.toMatch(VISIBLE_RAW_TICKER_PATTERN);
    expect(findVisibleRawTickerMatch(visibleText)).toBeNull();
    expect(screen.queryByText(liveMarket.ticker)).not.toBeInTheDocument();
    expect(screen.getByText(/BTC 15m · Live Kalshi contract/i)).toBeInTheDocument();
  });

  it("rejects the reported production leak pattern in visible text", () => {
    const leaked = "Will BTC settle above $64,225? KXBTC15M-26JUN270115-15";
    expect(leaked).toMatch(VISIBLE_RAW_TICKER_PATTERN);
    expect(findVisibleRawTickerMatch(leaked)).toBe("KXBTC15M-26JUN270115-15");
  });
});
