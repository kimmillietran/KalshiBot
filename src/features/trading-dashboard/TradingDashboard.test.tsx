import { screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TradingDashboard } from "@/features/trading-dashboard";
import {
  DECISION_ENGINE_PENDING_MESSAGE,
  MODEL_NOT_LIVE_LABEL,
} from "@/features/trading-dashboard/constants";
import { renderWithDashboard } from "@/test/test-utils";

describe("TradingDashboard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders live panels and placeholder engine state", async () => {
    renderWithDashboard(<TradingDashboard />);

    expect(screen.queryByText("BUY UP")).not.toBeInTheDocument();
    expect(screen.getAllByText(MODEL_NOT_LIVE_LABEL).length).toBeGreaterThan(0);
    expect(screen.getAllByText(DECISION_ENGINE_PENDING_MESSAGE).length).toBeGreaterThan(0);
    expect(screen.getByText("Kalshi Market Odds")).toBeInTheDocument();
    expect(screen.getByText("Probability & Edge")).toBeInTheDocument();
    expect(screen.getByText("BTC Price")).toBeInTheDocument();
    expect(screen.getByText("Trade Management")).toBeInTheDocument();
    expect(screen.getByText("AI Reasoning & Playbook")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/Will BTC settle above \$59,990\.31 at/i)).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getAllByText(/LIVE|FALLBACK|Loading BTC|ACTIVE|KALSHI|Above target|Below target/i).length).toBeGreaterThan(0);
    });
  });
});
