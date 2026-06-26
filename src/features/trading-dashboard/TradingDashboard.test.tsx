import { screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TradingDashboard } from "@/features/trading-dashboard";
import { renderWithDashboard } from "@/test/test-utils";

describe("TradingDashboard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders key dashboard panel labels", async () => {
    renderWithDashboard(<TradingDashboard />);

    expect(screen.getByText("BUY UP")).toBeInTheDocument();
    expect(screen.getByText("Kalshi Market Odds")).toBeInTheDocument();
    expect(screen.getByText("Probability & Edge")).toBeInTheDocument();
    expect(screen.getByText("BTC Price")).toBeInTheDocument();
    expect(screen.getByText("Trade Management")).toBeInTheDocument();
    expect(screen.getByText("AI Reasoning & Playbook")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getAllByText(/LIVE|FALLBACK|Loading BTC|ACTIVE|KALSHI/i).length).toBeGreaterThan(0);
    });
  });
});
