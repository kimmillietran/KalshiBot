import { screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { renderWithDashboard } from "@/test/test-utils";

import { MarketOddsPanel } from "./MarketOddsPanel";

describe("MarketOddsPanel", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders live contract odds from the BFF", async () => {
    renderWithDashboard(<MarketOddsPanel />);

    await waitFor(() => {
      expect(screen.getAllByText("16¢").length).toBeGreaterThan(0);
    });

    expect(screen.getAllByText("85¢").length).toBeGreaterThan(0);
    expect(screen.getByText(/Liquidity: Good/i)).toBeInTheDocument();
    expect(screen.queryByText("Best Edge Side")).not.toBeInTheDocument();
    expect(screen.queryByText(/63¢ vs 74¢ fair/i)).not.toBeInTheDocument();
  });

  it("falls back to static odds when Kalshi is unavailable", async () => {
    renderWithDashboard(<MarketOddsPanel />, { kalshiFails: true });

    await waitFor(() => {
      expect(screen.getByText(/FALLBACK/i)).toBeInTheDocument();
    });

    expect(screen.getAllByText("63¢").length).toBeGreaterThan(0);
    expect(screen.getAllByText("38¢").length).toBeGreaterThan(0);
  });
});
