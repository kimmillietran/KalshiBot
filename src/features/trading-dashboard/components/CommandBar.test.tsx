import { screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { liveMarket } from "@/test/test-utils";
import { renderWithDashboard } from "@/test/test-utils";

import { findRawTickerLeaksInContainer } from "../tickerVisibility";

import { CommandBar } from "./CommandBar";

describe("CommandBar", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("never renders raw Kalshi ticker in visible text after live market loads", async () => {
    const { container } = renderWithDashboard(<CommandBar />);

    await waitFor(() => {
      expect(screen.getAllByText(/\$59,990\.31/).length).toBeGreaterThan(0);
    });

    expect(screen.getByText(/BTC 15m · Live Kalshi contract/i)).toBeInTheDocument();
    expect(screen.queryByText(liveMarket.ticker)).not.toBeInTheDocument();
    expect(findRawTickerLeaksInContainer(container)).toEqual([]);
  });

  it("keeps contract ID in tooltip only, not visible copy", async () => {
    renderWithDashboard(<CommandBar />);

    await waitFor(() => {
      expect(screen.getAllByText(/\$59,990\.31/).length).toBeGreaterThan(0);
    });

    const subtitle = screen.getByText(/BTC 15m · Live Kalshi contract/i);
    expect(subtitle).toHaveAttribute("title", `Contract ID: ${liveMarket.ticker}`);
  });
});
