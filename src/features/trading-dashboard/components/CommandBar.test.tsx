import { screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { liveMarket } from "@/test/test-utils";
import { renderWithDashboard } from "@/test/test-utils";

import { CommandBar } from "./CommandBar";

describe("CommandBar", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("does not render the raw Kalshi ticker prominently", async () => {
    renderWithDashboard(<CommandBar />);

    await waitFor(() => {
      expect(screen.getByText(/BTC 15m · Live Kalshi contract/i)).toBeInTheDocument();
    });

    expect(screen.queryByText(liveMarket.ticker)).not.toBeInTheDocument();
    expect(screen.queryByText(/KXBTC15M-/i)).not.toBeInTheDocument();
  });
});
