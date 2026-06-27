import { screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TradingDashboard } from "@/features/trading-dashboard";
import { DECISION_ENGINE_CONNECTED_MESSAGE } from "@/features/trading-dashboard/constants";
import { findRawTickerLeaksInContainer } from "@/features/trading-dashboard/tickerVisibility";
import { liveMarket } from "@/test/test-utils";
import { renderWithDashboard } from "@/test/test-utils";

describe("TradingDashboard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders engine-connected NO TRADE state with live odds", async () => {
    renderWithDashboard(<TradingDashboard />);

    expect(screen.queryByText("BUY UP")).not.toBeInTheDocument();
    expect(screen.queryByText("Best Edge Side")).not.toBeInTheDocument();
    expect(screen.queryByText(/63¢ vs 74¢ fair/i)).not.toBeInTheDocument();
    expect(screen.queryByText(liveMarket.ticker)).not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getAllByText("NO TRADE").length).toBeGreaterThan(0);
    });

    expect(
      screen.getAllByText(DECISION_ENGINE_CONNECTED_MESSAGE).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("Kalshi Market Odds")).toBeInTheDocument();
    expect(screen.getByText("Probability & Edge")).toBeInTheDocument();
    expect(screen.getByText("BTC Price")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/Will BTC settle above \$59,990\.31 at/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/BTC 15m · Live Kalshi contract/i)).toBeInTheDocument();
    expect(findRawTickerLeaksInContainer(document.body)).toEqual([]);

    await waitFor(() => {
      expect(screen.getAllByText("16¢").length).toBeGreaterThan(0);
    });

    await waitFor(() => {
      expect(
        screen.getAllByText(/LIVE|FALLBACK|Loading BTC|ACTIVE|KALSHI|Above target|Below target/i)
          .length,
      ).toBeGreaterThan(0);
    });
  });
});
